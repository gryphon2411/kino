import { NextResponse } from 'next/server.js';
import { getBffConfig } from './config.js';
import { SESSION_COOKIE, sessionCookieOptions } from './http.js';
import { accessTokenFor, getSession, SessionRefreshError } from './sessions.js';
import { viewingPlanBearerError } from './viewing-plan-auth.mjs';
import { RequestBodyTooLargeError } from './request-body.mjs';

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };

export class InvalidViewingPlanBodyError extends Error {}

function json(body, status) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function expiredSessionResponse() {
  const response = json({ code: 'authentication_required' }, 401);
  response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}

function proxyResponse(upstream) {
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
      ...NO_STORE_HEADERS,
    },
  });
}

const defaultDependencies = {
  accessTokenFor,
  fetch: globalThis.fetch,
  getBffConfig,
  getSession,
};

function enabled(config) {
  return config.viewingPlanServiceEnabled === true;
}

function disabledResponse() {
  return json({
    code: 'viewing_plan_service_disabled',
    error: 'Viewing plans are not enabled in this environment.',
  }, 404);
}

async function accessToken(request, dependencies) {
  const config = dependencies.getBffConfig();
  if (!enabled(config)) {
    return { response: disabledResponse() };
  }
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await dependencies.getSession(sessionId);
  if (!session) {
    return { response: expiredSessionResponse() };
  }
  return {
    config,
    sessionId,
    token: await dependencies.accessTokenFor(sessionId, session),
  };
}

function authResponse(upstream) {
  const error = viewingPlanBearerError(upstream.status, upstream.headers.get('www-authenticate'));
  if (error === 'insufficient_scope') {
    return json({
      code: 'insufficient_scope',
      error: 'Viewing plan permission is required.',
    }, 403);
  }
  if (error === 'invalid_token') {
    return json({
      code: 'viewing_plan_reauthentication_required',
      error: 'Viewing plan authorization must be renewed.',
    }, 401);
  }
  if (upstream.status === 401 || upstream.status === 403) {
    return json({
      code: 'viewing_plan_upstream_auth_failure',
      error: 'Viewing plan authorization is temporarily unavailable.',
    }, 502);
  }
  return undefined;
}

function timeoutSignal(deadline) {
  return AbortSignal.timeout(Math.max(1, deadline - Date.now()));
}

async function fetchPlanner(config, token, path, init, dependencies, deadline) {
  return dependencies.fetch(new URL(path, config.viewingPlanServiceUrl), {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
    signal: deadline ? timeoutSignal(deadline) : AbortSignal.timeout(config.viewingPlanServiceTimeoutMs),
  });
}

export async function viewingPlanProxy(request, path, init = {}, dependencies = defaultDependencies) {
  try {
    const prepared = await accessToken(request, dependencies);
    if (prepared.response) {
      return prepared.response;
    }
    const body = typeof init.body === 'function' ? await init.body() : init.body;
    const deadline = Date.now() + prepared.config.viewingPlanServiceTimeoutMs;
    const upstream = await fetchPlanner(prepared.config, prepared.token, path, {
      ...init,
      ...(body === undefined ? {} : { body }),
    }, dependencies, deadline);
    if (upstream.status === 408) {
      return json({
        code: 'viewing_plan_unavailable',
        error: 'Viewing plans are temporarily unavailable.',
      }, 503);
    }
    const auth = authResponse(upstream);
    return auth || proxyResponse(upstream);
  } catch (error) {
    if (error instanceof InvalidViewingPlanBodyError) {
      return json({ error: 'Invalid request.' }, 400);
    }
    if (error instanceof RequestBodyTooLargeError) {
      return json({ error: 'request_too_large' }, 413);
    }
    if (error instanceof SessionRefreshError) {
      return expiredSessionResponse();
    }
    return json({
      code: 'viewing_plan_unavailable',
      error: 'Viewing plans are temporarily unavailable.',
    }, 503);
  }
}

function parseListQuery(request) {
  const query = new URL(request.url).searchParams;
  const known = new Set(['status', 'page']);
  for (const key of query.keys()) {
    if (!known.has(key) || query.getAll(key).length !== 1) {
      return undefined;
    }
  }
  const status = query.get('status');
  if (status !== 'OPEN' && status !== 'DONE') {
    return undefined;
  }
  const rawPage = query.get('page') || '0';
  if (!/^\d+$/.test(rawPage)) {
    return undefined;
  }
  const page = Number(rawPage);
  if (!Number.isSafeInteger(page) || page > 10000) {
    return undefined;
  }
  return { status, page };
}

function validPlan(plan, status) {
  return plan
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(plan.id)
    && /^tt\d{1,30}$/.test(plan.titleId)
    && (plan.kind === 'WATCH' || plan.kind === 'REWATCH')
    && plan.status === status
    && typeof plan.createdAt === 'string'
    && typeof plan.updatedAt === 'string'
    && (plan.completedAt === null || typeof plan.completedAt === 'string');
}

async function responseJson(response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function hydrateTitle(config, token, titleId, dependencies, deadline) {
  try {
    const upstream = await dependencies.fetch(
      new URL(`titles/${encodeURIComponent(titleId)}`, config.dataServiceUrl),
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: timeoutSignal(deadline),
      }
    );
    if (upstream.status === 404) {
      return { title: null, titleResolution: 'not_found' };
    }
    const title = await responseJson(upstream);
    if (!upstream.ok || !title || title.id !== titleId) {
      return { title: null, titleResolution: 'unavailable' };
    }
    return { title, titleResolution: 'resolved' };
  } catch {
    return { title: null, titleResolution: 'unavailable' };
  }
}

async function hydrateTitles(config, token, titleIds, dependencies, deadline) {
  const titles = new Map();
  const queue = [...titleIds];
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length > 0) {
      const titleId = queue.shift();
      titles.set(titleId, await hydrateTitle(config, token, titleId, dependencies, deadline));
    }
  });
  await Promise.all(workers);
  return titles;
}

export async function viewingPlanList(request, dependencies = defaultDependencies) {
  const query = parseListQuery(request);
  if (!query) {
    return json({ error: 'Invalid request.' }, 400);
  }
  try {
    const prepared = await accessToken(request, dependencies);
    if (prepared.response) {
      return prepared.response;
    }
    const deadline = Date.now() + prepared.config.viewingPlanServiceTimeoutMs;
    const upstream = await fetchPlanner(
      prepared.config,
      prepared.token,
      `v1/viewing-plans?status=${query.status}&page=${query.page}&size=20`,
      {},
      dependencies,
      deadline
    );
    const auth = authResponse(upstream);
    if (auth) {
      return auth;
    }
    if (upstream.status === 408) {
      return json({
        code: 'viewing_plan_unavailable',
        error: 'Viewing plans are temporarily unavailable.',
      }, 503);
    }
    if (!upstream.ok) {
      return proxyResponse(upstream);
    }
    const list = await responseJson(upstream);
    if (!list || !Array.isArray(list.items) || !Number.isInteger(list.page)
      || list.page !== query.page || list.size !== 20 || typeof list.hasNext !== 'boolean'
      || !list.items.every((plan) => validPlan(plan, query.status))) {
      return json({
        code: 'viewing_plan_upstream_invalid_response',
        error: 'Viewing plans returned an invalid response.',
      }, 502);
    }
    const titles = await hydrateTitles(
      prepared.config,
      prepared.token,
      new Set(list.items.map((plan) => plan.titleId)),
      dependencies,
      deadline
    );
    return json({
      items: list.items.map((plan) => ({ plan, ...(titles.get(plan.titleId) || { title: null, titleResolution: 'unavailable' }) })),
      page: list.page,
      size: list.size,
      hasNext: list.hasNext,
    }, 200);
  } catch (error) {
    if (error instanceof SessionRefreshError) {
      return expiredSessionResponse();
    }
    return json({
      code: 'viewing_plan_unavailable',
      error: 'Viewing plans are temporarily unavailable.',
    }, 503);
  }
}

export function viewingPlanNoStoreJson(body, status) {
  return json(body, status);
}

export function viewingPlanServiceEnabled() {
  return getBffConfig().viewingPlanServiceEnabled;
}

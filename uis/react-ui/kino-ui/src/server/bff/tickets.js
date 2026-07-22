import { NextResponse } from 'next/server.js';
import { getBffConfig } from './config.js';
import {
  SESSION_COOKIE,
  sessionCookieOptions,
} from './http.js';
import {
  accessTokenFor,
  getSession,
  SessionRefreshError,
} from './sessions.js';
import { ticketBearerError } from './ticket-auth.mjs';
import { RequestBodyTooLargeError } from './request-body.mjs';

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store',
};

function ticketJson(body, status) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function expiredTicketSessionResponse() {
  const response = ticketJson({ code: 'authentication_required' }, 401);
  response.cookies.set(SESSION_COOKIE, '', {
    ...sessionCookieOptions(),
    maxAge: 0,
  });
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

async function resolvedRequestBody(body) {
  return typeof body === 'function' ? body() : body;
}

const defaultDependencies = {
  accessTokenFor,
  fetch: globalThis.fetch,
  getBffConfig,
  getSession,
};

export async function ticketProxy(request, path, init = {}, dependencies = defaultDependencies) {
  try {
    const config = dependencies.getBffConfig();
    if (!config.ticketServiceEnabled) {
      return ticketJson({
        code: 'ticket_service_disabled',
        error: 'Ticket allocation is not enabled in this environment.',
      }, 404);
    }
    const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
    const session = await dependencies.getSession(sessionId);
    if (!session) {
      return ticketJson({ code: 'authentication_required' }, 401);
    }
    const upstreamUrl = new URL(path, config.ticketServiceUrl);
    const accessToken = await dependencies.accessTokenFor(sessionId, session);
    const body = await resolvedRequestBody(init.body);
    const { body: _requestBody, ...upstreamInit } = init;
    const upstream = await dependencies.fetch(upstreamUrl, {
      ...upstreamInit,
      ...(body === undefined ? {} : { body }),
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(config.ticketServiceTimeoutMs),
    });
    const bearerError = ticketBearerError(
      upstream.status,
      upstream.headers.get('www-authenticate')
    );
    if (bearerError === 'insufficient_scope') {
      return ticketJson({
        code: 'insufficient_scope',
        error: 'Ticket permission is required.',
      }, 403);
    }
    if (bearerError === 'invalid_token') {
      return ticketJson({
        code: 'ticket_reauthentication_required',
        error: 'Ticket authorization must be renewed.',
      }, 401);
    }
    if (upstream.status === 401 || upstream.status === 403) {
      return ticketJson({
        code: 'ticket_upstream_auth_failure',
        error: 'Ticket authorization is temporarily unavailable.',
      }, 502);
    }
    return proxyResponse(upstream);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return ticketJson({ error: 'request_too_large' }, 413);
    }
    if (error instanceof SessionRefreshError) {
      return expiredTicketSessionResponse();
    }
    return ticketJson({
      code: 'ticket_unavailable',
      error: 'Ticket allocation is temporarily unavailable.',
    }, 503);
  }
}

export function ticketNoStoreJson(body, status) {
  return ticketJson(body, status);
}

export function ticketServiceEnabled() {
  return getBffConfig().ticketServiceEnabled;
}

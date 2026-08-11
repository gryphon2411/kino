import express from 'express';
import { createViewingPlanAuthenticator } from './auth.js';
import { isRetryableDatabaseError } from './database.js';
import {
  InsufficientScopeError,
  InvalidRequestError,
  InvalidTokenError,
  ViewingPlanError,
} from './errors.js';
import {
  isTitleId,
  isUuid,
  VIEWING_PLAN_READ_SCOPE,
  VIEWING_PLAN_WRITE_SCOPE,
} from './viewing-plan-service.js';

const NO_STORE = 'private, no-store';

function noStore(_request, response, next) {
  response.set('Cache-Control', NO_STORE);
  next();
}

function parseListQuery(request) {
  const search = new URL(request.originalUrl, 'http://planner.invalid').searchParams;
  const known = new Set(['status', 'page', 'size']);
  for (const key of search.keys()) {
    if (!known.has(key) || search.getAll(key).length !== 1) {
      throw new InvalidRequestError();
    }
  }
  const status = search.get('status');
  if (status !== 'OPEN' && status !== 'DONE') {
    throw new InvalidRequestError();
  }
  const page = parseBoundedInteger(search.get('page') ?? '0', 0, 10000);
  const size = parseBoundedInteger(search.get('size') ?? '20', 1, 20);
  return { status, page, size };
}

function parseBoundedInteger(raw, minimum, maximum) {
  if (!/^\d+$/.test(raw)) {
    throw new InvalidRequestError();
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new InvalidRequestError();
  }
  return value;
}

function requireJson(request, _response, next) {
  const type = request.get('content-type');
  if (!type || !/^application\/json(?:\s*;\s*charset=[^;\s]+)?$/i.test(type)) {
    next(new ViewingPlanError(415, 'unsupported_media_type'));
    return;
  }
  next();
}

function rejectBody(request, _response, next) {
  const contentLength = request.get('content-length');
  if (request.get('transfer-encoding')
    || (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > 0))) {
    next(new InvalidRequestError());
    return;
  }
  next();
}

function validateInput(request, _response, next) {
  if (!request.body || Object.keys(request.body).length !== 1 || !Object.hasOwn(request.body, 'kind')) {
    next(new InvalidRequestError());
    return;
  }
  next();
}

function authenticated(authenticate, scope) {
  return async function authenticateRequest(request, _response, next) {
    try {
      request.viewingPlanUser = await authenticate(request, scope);
      next();
    } catch (error) {
      next(error);
    }
  };
}

function titleId(request) {
  if (!isTitleId(request.params.titleId)) {
    throw new InvalidRequestError();
  }
  return request.params.titleId;
}

function planId(request) {
  if (!isUuid(request.params.id)) {
    throw new InvalidRequestError();
  }
  return request.params.id;
}

export function createApp({ config, tokenVerifier, viewingPlanService, logger = console, ready = async () => undefined }) {
  const app = express();
  const authenticate = tokenVerifier || createViewingPlanAuthenticator(config);
  app.disable('x-powered-by');
  app.use(noStore);

  app.get('/healthz', (_request, response) => response.json({ status: 'ok' }));
  app.get('/readyz', async (_request, response) => {
    try {
      await ready();
      response.json({ status: 'ok' });
    } catch {
      response.status(503).json({ status: 'unavailable' });
    }
  });

  app.get('/v1/viewing-plans', authenticated(authenticate, VIEWING_PLAN_READ_SCOPE), async (request, response) => {
    const { status, page, size } = parseListQuery(request);
    response.json(await viewingPlanService.list(request.viewingPlanUser.subject, status, page, size));
  });

  app.get('/v1/viewing-plans/titles/:titleId', authenticated(authenticate, VIEWING_PLAN_READ_SCOPE), async (request, response) => {
    response.json({ plan: await viewingPlanService.openForTitle(request.viewingPlanUser.subject, titleId(request)) });
  });

  app.put(
    '/v1/viewing-plans/titles/:titleId',
    authenticated(authenticate, VIEWING_PLAN_WRITE_SCOPE),
    requireJson,
    express.json({ limit: '1kb', strict: true }),
    validateInput,
    async (request, response) => {
      response.json({ plan: await viewingPlanService.upsert(request.viewingPlanUser.subject, titleId(request), request.body) });
    }
  );

  app.post('/v1/viewing-plans/:id/complete', authenticated(authenticate, VIEWING_PLAN_WRITE_SCOPE), rejectBody, async (request, response) => {
    response.json({ plan: await viewingPlanService.complete(request.viewingPlanUser.subject, planId(request)) });
  });
  app.post('/v1/viewing-plans/:id/reopen', authenticated(authenticate, VIEWING_PLAN_WRITE_SCOPE), rejectBody, async (request, response) => {
    response.json({ plan: await viewingPlanService.reopen(request.viewingPlanUser.subject, planId(request)) });
  });
  app.delete('/v1/viewing-plans/:id', authenticated(authenticate, VIEWING_PLAN_WRITE_SCOPE), rejectBody, async (request, response) => {
    await viewingPlanService.delete(request.viewingPlanUser.subject, planId(request));
    response.status(204).end();
  });

  app.use((_request, response) => response.status(404).json({ error: 'not_found' }));
  app.use((error, _request, response, _next) => {
    if (error?.type === 'entity.too.large') {
      return response.status(413).json({ error: 'request_too_large' });
    }
    if (error?.type === 'entity.parse.failed' || error instanceof SyntaxError) {
      return response.status(400).json({ error: 'invalid_request' });
    }
    if (error instanceof InvalidTokenError) {
      response.set('WWW-Authenticate', 'Bearer error="invalid_token"');
      return response.status(401).json({ error: error.code });
    }
    if (error instanceof InsufficientScopeError) {
      response.set('WWW-Authenticate', `Bearer error="insufficient_scope", scope="${error.scope}"`);
      return response.status(403).json({ error: error.code });
    }
    if (error instanceof ViewingPlanError) {
      return response.status(error.status).json({ error: error.code });
    }
    if (isRetryableDatabaseError(error)) {
      logger.warn?.({ sqlState: error?.code }, 'viewing plan database retryable failure');
      return response.status(503).json({ error: 'temporarily_unavailable' });
    }
    logger.error?.(error, 'viewing plan request failed');
    return response.status(500).json({ error: 'internal_error' });
  });
  return app;
}

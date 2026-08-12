import express from 'express';
import { InvalidRequestError, ViewingPlanError } from '../errors.js';
import {
  isTitleId,
  isUuid,
  VIEWING_PLAN_READ_SCOPE,
  VIEWING_PLAN_WRITE_SCOPE,
} from './viewing-plan-service.js';

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

export function createViewingPlanRouter({ authenticate, viewingPlanService }) {
  const router = express.Router();

  router.get('/', authenticated(authenticate, VIEWING_PLAN_READ_SCOPE), async (request, response) => {
    const { status, page, size } = parseListQuery(request);
    response.json(await viewingPlanService.list(request.viewingPlanUser.subject, status, page, size));
  });

  router.get('/titles/:titleId', authenticated(authenticate, VIEWING_PLAN_READ_SCOPE), async (request, response) => {
    response.json({ plan: await viewingPlanService.openForTitle(request.viewingPlanUser.subject, titleId(request)) });
  });

  router.put(
    '/titles/:titleId',
    authenticated(authenticate, VIEWING_PLAN_WRITE_SCOPE),
    requireJson,
    express.json({ limit: '1kb', strict: true }),
    validateInput,
    async (request, response) => {
      response.json({
        plan: await viewingPlanService.upsert(
          request.viewingPlanUser.subject,
          titleId(request),
          request.body
        ),
      });
    }
  );

  router.post('/:id/complete', authenticated(authenticate, VIEWING_PLAN_WRITE_SCOPE), rejectBody, async (request, response) => {
    response.json({ plan: await viewingPlanService.complete(request.viewingPlanUser.subject, planId(request)) });
  });
  router.post('/:id/reopen', authenticated(authenticate, VIEWING_PLAN_WRITE_SCOPE), rejectBody, async (request, response) => {
    response.json({ plan: await viewingPlanService.reopen(request.viewingPlanUser.subject, planId(request)) });
  });
  router.delete('/:id', authenticated(authenticate, VIEWING_PLAN_WRITE_SCOPE), rejectBody, async (request, response) => {
    await viewingPlanService.delete(request.viewingPlanUser.subject, planId(request));
    response.status(204).end();
  });

  return router;
}

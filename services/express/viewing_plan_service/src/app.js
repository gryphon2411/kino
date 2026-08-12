import express from 'express';
import { createViewingPlanAuthenticator } from './auth.js';
import { isRetryableDatabaseError } from './database.js';
import {
  InsufficientScopeError,
  InvalidTokenError,
  ViewingPlanError,
} from './errors.js';
import { createViewingPlanRouter } from './viewing-plans/viewing-plan-routes.js';

const NO_STORE = 'private, no-store';

function noStore(_request, response, next) {
  response.set('Cache-Control', NO_STORE);
  next();
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

  app.use('/v1/viewing-plans', createViewingPlanRouter({ authenticate, viewingPlanService }));

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

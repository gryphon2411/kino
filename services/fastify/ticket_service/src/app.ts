import Fastify, { type FastifyInstance } from 'fastify';
import type { DatabaseError } from 'pg';
import { createTicketAuthenticator } from './auth.js';
import type { TicketConfig } from './config.js';
import type { TicketDatabase } from './database.js';
import {
  InsufficientScopeError,
  InvalidTokenError,
  ServiceUnavailableError,
  TicketError,
} from './errors.js';
import { requestWasAborted } from './request-abort.js';
import type {
  SeatPresetOperations,
  SeatPresetReadiness,
} from './seat-presets.js';
import { TicketService } from './tickets.js';
import { ticketRoutes } from './ticket-routes.js';

function isRetryableDatabaseError(error: unknown): boolean {
  const code = (error as DatabaseError | undefined)?.code;
  return code === '55P03'
    || code === '40P01'
    || code === '57014'
    || code === '57P01'
    || code === '40001'
    || code === 'ECONNREFUSED'
    || code === 'ECONNRESET'
    || code === 'ETIMEDOUT'
    || code === 'EHOSTUNREACH'
    || code === 'ENETUNREACH'
    || code === 'ENOTFOUND'
    || (error instanceof Error && (
      error.message === 'Query read timeout'
      || error.message === 'timeout exceeded when trying to connect'
      || error.message === 'Connection terminated unexpectedly'
    ));
}

export function buildApp(
  config: TicketConfig,
  database: TicketDatabase,
  seatPresets: SeatPresetOperations & SeatPresetReadiness
): FastifyInstance {
  const app = Fastify({
    logger: true,
    requestTimeout: config.requestTimeoutMs,
    handlerTimeout: config.handlerTimeoutMs,
    // Fastify applies requestTimeout after server creation. Passing the Node
    // options here makes the complete-request and header timers start with
    // the server, while the short check interval keeps them effective.
    http: {
      requestTimeout: config.requestTimeoutMs,
      headersTimeout: config.requestTimeoutMs,
      connectionsCheckingInterval: Math.min(config.requestTimeoutMs, 1000),
    },
  });
  const tickets = new TicketService(database, config);
  const authenticate = createTicketAuthenticator(config);

  app.setErrorHandler((error, request, reply) => {
    const validationError = error as { validation?: unknown };
    const errorCode = (error as { code?: string }).code;
    if (errorCode === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.status(413).send({ error: 'request_too_large' });
    }
    if (errorCode === 'FST_ERR_HANDLER_TIMEOUT') {
      const unavailable = new ServiceUnavailableError();
      return reply.status(unavailable.statusCode).send({ error: unavailable.code });
    }
    if (validationError.validation) {
      return reply.status(400).send({ error: 'invalid_request' });
    }
    if (error instanceof InvalidTokenError) {
      reply.header('WWW-Authenticate', 'Bearer error="invalid_token"');
      return reply.status(error.statusCode).send({ error: error.code });
    }
    if (error instanceof InsufficientScopeError) {
      reply.header(
        'WWW-Authenticate',
        `Bearer error="insufficient_scope", scope="${error.scope}"`
      );
      return reply.status(error.statusCode).send({ error: error.code });
    }
    if (error instanceof TicketError) {
      return reply.status(error.statusCode).send({ error: error.code });
    }
    if (isRetryableDatabaseError(error)) {
      request.log.warn({ sqlState: (error as DatabaseError).code }, 'ticket database retryable failure');
      const unavailable = new ServiceUnavailableError();
      return reply.status(unavailable.statusCode).send({ error: unavailable.code });
    }
    request.log.error(error, 'ticket request failed');
    return reply.status(500).send({ error: 'internal_error' });
  });

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async (request, reply) => {
    try {
      await database.query('SELECT 1');
      await seatPresets.ready();
      if (requestWasAborted(request)) {
        return;
      }
      return { status: 'ok' };
    } catch {
      if (requestWasAborted(request)) {
        return;
      }
      return reply.status(503).send({ status: 'unavailable' });
    }
  });

  app.register(ticketRoutes, { tickets, authenticate, seatPresets });

  return app;
}

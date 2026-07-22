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
import { TicketService } from './tickets.js';

const seatCodeSchema = { type: 'string', pattern: '^[A-C][1-5]$' };
const holdRequestBodyLimitBytes = 1024;
const errorSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['error'],
  properties: { error: { type: 'string' } },
};
const screeningSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'titleId', 'label', 'startsAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    titleId: { type: 'string' },
    label: { type: 'string' },
    startsAt: { type: 'string', format: 'date-time' },
  },
};
const reservationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'state', 'expiresAt', 'seatCodes'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    state: { type: 'string', enum: ['HELD', 'CONFIRMED'] },
    expiresAt: { type: 'string', format: 'date-time' },
    confirmedAt: { type: 'string', format: 'date-time' },
    seatCodes: { type: 'array', items: seatCodeSchema },
  },
};
const ticketErrorResponses = {
  400: errorSchema,
  401: errorSchema,
  403: errorSchema,
  404: errorSchema,
  409: errorSchema,
  413: errorSchema,
  500: errorSchema,
  503: errorSchema,
};

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

export function buildApp(config: TicketConfig, database: TicketDatabase): FastifyInstance {
  const app = Fastify({
    logger: true,
    requestTimeout: config.requestTimeoutMs,
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
    if ((error as { code?: string }).code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.status(413).send({ error: 'request_too_large' });
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
  app.get('/readyz', async (_request, reply) => {
    try {
      await database.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      return reply.status(503).send({ status: 'unavailable' });
    }
  });

  app.get('/v1/screenings', {
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        required: ['titleId'],
        properties: { titleId: { type: 'string', minLength: 1 } },
      },
      response: {
        200: {
          type: 'object',
          additionalProperties: false,
          required: ['screenings'],
          properties: {
            screenings: { type: 'array', items: screeningSchema },
          },
        },
        ...ticketErrorResponses,
      },
    },
  }, async (request) => {
    await authenticate(request, 'kino.ticket.read');
    const { titleId } = request.query as { titleId: string };
    return { screenings: await tickets.screenings(titleId) };
  });

  app.get('/v1/screenings/:screeningId/seats', {
    schema: {
      params: {
        type: 'object',
        additionalProperties: false,
        required: ['screeningId'],
        properties: { screeningId: { type: 'string', format: 'uuid' } },
      },
      response: {
        200: {
          type: 'object',
          additionalProperties: false,
          required: ['screening', 'seats'],
          properties: {
            screening: screeningSchema,
            seats: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['code', 'status'],
                properties: {
                  code: seatCodeSchema,
                  status: {
                    type: 'string',
                    enum: ['AVAILABLE', 'HELD', 'HELD_BY_YOU', 'SOLD'],
                  },
                  reservationId: { type: 'string', format: 'uuid' },
                  expiresAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        ...ticketErrorResponses,
      },
    },
  }, async (request, reply) => {
    await authenticate(request, 'kino.ticket.read');
    const { screeningId } = request.params as { screeningId: string };
    reply.header('Cache-Control', 'private, no-store');
    return tickets.seats(screeningId, request.ticketUser!.subject);
  });

  app.post('/v1/screenings/:screeningId/holds', {
    bodyLimit: holdRequestBodyLimitBytes,
    schema: {
      params: {
        type: 'object',
        additionalProperties: false,
        required: ['screeningId'],
        properties: { screeningId: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['seatCodes'],
        properties: {
          seatCodes: {
            type: 'array',
            minItems: 1,
            maxItems: 8,
            uniqueItems: true,
            items: seatCodeSchema,
          },
        },
      },
      response: {
        200: reservationSchema,
        ...ticketErrorResponses,
      },
    },
  }, async (request, reply) => {
    await authenticate(request, 'kino.ticket.write');
    const { screeningId } = request.params as { screeningId: string };
    const { seatCodes } = request.body as { seatCodes: string[] };
    reply.header('Cache-Control', 'private, no-store');
    return tickets.hold(screeningId, request.ticketUser!.subject, seatCodes);
  });

  app.post('/v1/reservations/:reservationId/confirm', {
    schema: {
      params: {
        type: 'object',
        additionalProperties: false,
        required: ['reservationId'],
        properties: { reservationId: { type: 'string', format: 'uuid' } },
      },
      response: {
        200: reservationSchema,
        ...ticketErrorResponses,
      },
    },
  }, async (request, reply) => {
    await authenticate(request, 'kino.ticket.write');
    const { reservationId } = request.params as { reservationId: string };
    reply.header('Cache-Control', 'private, no-store');
    return tickets.confirm(reservationId, request.ticketUser!.subject);
  });

  return app;
}

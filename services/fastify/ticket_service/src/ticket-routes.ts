import type { FastifyPluginAsync } from 'fastify';
import type { TicketAuthenticator } from './auth.js';
import { requestWasAborted } from './request-abort.js';
import { reservationStates, type TicketService } from './tickets.js';

// Kino's seeded maps currently use rows A-D and seats 1-5. The database still
// determines whether a syntactically valid seat belongs to a screening.
const seatCodeSchema = { type: 'string', pattern: '^[A-D][1-5]$' };
const holdRequestBodyLimitBytes = 1024;
type ScreeningQuerystring = { titleId: string };
type ScreeningParams = { screeningId: string };
type HoldBody = { seatCodes: string[] };
type ReservationParams = { reservationId: string };
type TicketRoutesOptions = {
  tickets: TicketService;
  authenticate: TicketAuthenticator;
};
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
    state: { type: 'string', enum: reservationStates },
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

export const ticketRoutes: FastifyPluginAsync<TicketRoutesOptions> = async (
  app,
  { tickets, authenticate }
) => {
  app.get<{ Querystring: ScreeningQuerystring }>('/v1/screenings', {
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
    if (requestWasAborted(request)) {
      return;
    }
    const { titleId } = request.query;
    const screenings = await tickets.screenings(titleId);
    if (requestWasAborted(request)) {
      return;
    }
    return { screenings };
  });

  app.get<{ Params: ScreeningParams }>('/v1/screenings/:screeningId/seats', {
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
    const ticketUser = await authenticate(request, 'kino.ticket.read');
    if (requestWasAborted(request)) {
      return;
    }
    const { screeningId } = request.params;
    reply.header('Cache-Control', 'private, no-store');
    const seats = await tickets.seats(screeningId, ticketUser.subject);
    if (requestWasAborted(request)) {
      return;
    }
    return seats;
  });

  app.post<{ Params: ScreeningParams; Body: HoldBody }>('/v1/screenings/:screeningId/holds', {
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
    const ticketUser = await authenticate(request, 'kino.ticket.write');
    if (requestWasAborted(request)) {
      return;
    }
    const { screeningId } = request.params;
    const { seatCodes } = request.body;
    reply.header('Cache-Control', 'private, no-store');
    return tickets.hold(screeningId, ticketUser.subject, seatCodes);
  });

  app.post<{ Params: ReservationParams }>('/v1/reservations/:reservationId/confirm', {
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
    const ticketUser = await authenticate(request, 'kino.ticket.write');
    if (requestWasAborted(request)) {
      return;
    }
    const { reservationId } = request.params;
    reply.header('Cache-Control', 'private, no-store');
    return tickets.confirm(reservationId, ticketUser.subject);
  });
};

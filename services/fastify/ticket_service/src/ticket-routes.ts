import type { FastifyPluginAsync } from 'fastify';
import type { TicketAuthenticator } from './auth.js';
import { requestWasAborted } from './request-abort.js';
import { seatPresetRoutes } from './seat-presets/seat-preset-routes.js';
import type { SeatPresetOperations } from './seat-presets/seat-preset-service.js';
import { seatCodeSchema, ticketErrorResponses } from './ticket-route-schemas.js';
import { reservationStates, type TicketAllocationService } from './allocation/allocation-service.js';

const holdRequestBodyLimitBytes = 1024;
type ScreeningQuerystring = { titleId: string };
type ScreeningParams = { screeningId: string };
type HoldBody = { seatCodes: string[] };
type ReservationParams = { reservationId: string };
type TicketRoutesOptions = {
  ticketAllocation: TicketAllocationService;
  authenticate: TicketAuthenticator;
  seatPresets: SeatPresetOperations;
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
export const ticketRoutes: FastifyPluginAsync<TicketRoutesOptions> = async (
  app,
  { ticketAllocation, authenticate, seatPresets }
) => {
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('Cache-Control', 'private, no-store');
    return payload;
  });

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
    const screenings = await ticketAllocation.screenings(titleId);
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
  }, async (request) => {
    const ticketUser = await authenticate(request, 'kino.ticket.read');
    if (requestWasAborted(request)) {
      return;
    }
    const { screeningId } = request.params;
    const seats = await ticketAllocation.seats(screeningId, ticketUser.subject);
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
  }, async (request) => {
    const ticketUser = await authenticate(request, 'kino.ticket.write');
    if (requestWasAborted(request)) {
      return;
    }
    const { screeningId } = request.params;
    const { seatCodes } = request.body;
    return ticketAllocation.hold(screeningId, ticketUser.subject, seatCodes);
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
  }, async (request) => {
    const ticketUser = await authenticate(request, 'kino.ticket.write');
    if (requestWasAborted(request)) {
      return;
    }
    const { reservationId } = request.params;
    return ticketAllocation.confirm(reservationId, ticketUser.subject);
  });

  await app.register(seatPresetRoutes, { authenticate, seatPresets });
};

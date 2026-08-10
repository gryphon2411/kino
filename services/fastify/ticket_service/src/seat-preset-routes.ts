import type { FastifyPluginAsync } from 'fastify';
import type { TicketAuthenticator } from './auth.js';
import { requestWasAborted } from './request-abort.js';
import type { SeatPresetOperations } from './seat-presets.js';
import { seatCodeSchema, ticketErrorResponses } from './ticket-route-schemas.js';

const seatPresetRequestBodyLimitBytes = 1024;

type CreateSeatPresetBody = {
  name: string;
  seatCodes: string[];
};

type SeatPresetParams = {
  presetId: string;
};

type SeatPresetRoutesOptions = {
  authenticate: TicketAuthenticator;
  seatPresets: SeatPresetOperations;
};

const seatPresetSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'seatCodes'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    seatCodes: {
      type: 'array',
      items: seatCodeSchema,
    },
  },
};

export const seatPresetRoutes: FastifyPluginAsync<SeatPresetRoutesOptions> = async (
  app,
  { authenticate, seatPresets }
) => {
  app.get('/v1/seat-presets', {
    schema: {
      response: {
        200: {
          type: 'object',
          additionalProperties: false,
          required: ['seatPresets'],
          properties: {
            seatPresets: { type: 'array', items: seatPresetSchema },
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
    return { seatPresets: await seatPresets.list(ticketUser.subject) };
  });

  app.post<{ Body: CreateSeatPresetBody }>('/v1/seat-presets', {
    bodyLimit: seatPresetRequestBodyLimitBytes,
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'seatCodes'],
        properties: {
          name: { type: 'string' },
          seatCodes: {
            type: 'array',
            items: seatCodeSchema,
          },
        },
      },
      response: {
        201: seatPresetSchema,
        ...ticketErrorResponses,
      },
    },
  }, async (request, reply) => {
    const ticketUser = await authenticate(request, 'kino.ticket.write');
    if (requestWasAborted(request)) {
      return;
    }
    const preset = await seatPresets.create(ticketUser.subject, request.body);
    return reply.code(201).send(preset);
  });

  app.delete<{ Params: SeatPresetParams }>('/v1/seat-presets/:presetId', {
    schema: {
      params: {
        type: 'object',
        additionalProperties: false,
        required: ['presetId'],
        properties: { presetId: { type: 'string', format: 'uuid' } },
      },
      response: {
        204: { type: 'null' },
        ...ticketErrorResponses,
      },
    },
  }, async (request, reply) => {
    const ticketUser = await authenticate(request, 'kino.ticket.write');
    if (requestWasAborted(request)) {
      return;
    }
    await seatPresets.delete(ticketUser.subject, request.params.presetId);
    return reply.code(204).send();
  });
};

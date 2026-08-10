import { seatCodePattern } from './seat-code.js';

export const seatCodeSchema = { type: 'string', pattern: seatCodePattern };

const errorSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['error'],
  properties: { error: { type: 'string' } },
};

export const ticketErrorResponses = {
  400: errorSchema,
  401: errorSchema,
  403: errorSchema,
  404: errorSchema,
  409: errorSchema,
  413: errorSchema,
  500: errorSchema,
  503: errorSchema,
};

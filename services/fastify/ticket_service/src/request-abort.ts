import type { FastifyRequest } from 'fastify';

export function requestWasAborted(request: FastifyRequest): boolean {
  // In Fastify 5, request.signal is aborted when IncomingMessage emits
  // "close", including a normal completed request body. A destroyed but
  // incomplete message is an actual interrupted incoming request.
  return request.raw.destroyed && !request.raw.complete;
}

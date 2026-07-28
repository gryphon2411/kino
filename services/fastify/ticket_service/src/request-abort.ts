import type { FastifyRequest } from 'fastify';

export function requestWasAborted(request: FastifyRequest): boolean {
  // In Fastify 5, request.signal is aborted when IncomingMessage emits
  // "close", including a normal completed request body. `aborted` tracks an
  // actual interrupted incoming request, so it is safe to use for reads.
  return request.raw.aborted;
}

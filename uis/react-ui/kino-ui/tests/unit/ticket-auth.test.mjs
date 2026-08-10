import assert from 'node:assert/strict';
import test from 'node:test';
import { ticketBearerError } from '../../src/server/bff/ticket-auth.mjs';

test('only trusted Fastify bearer challenges request ticket reauthorization', () => {
  assert.equal(
    ticketBearerError(403, 'Bearer error="insufficient_scope", scope="kino.ticket.read"'),
    'insufficient_scope'
  );
  assert.equal(
    ticketBearerError(401, 'Bearer error="invalid_token"'),
    'invalid_token'
  );
  assert.equal(ticketBearerError(403, 'Bearer error="invalid_token"'), undefined);
  assert.equal(ticketBearerError(401, 'Bearer error="insufficient_scope"'), undefined);
  assert.equal(ticketBearerError(503, 'Bearer error="invalid_token"'), undefined);
  assert.equal(ticketBearerError(401, 'Basic realm="unexpected"'), undefined);
});

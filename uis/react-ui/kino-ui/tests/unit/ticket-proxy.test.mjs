import assert from 'node:assert/strict';
import test from 'node:test';

process.env.WEB_BFF_CLIENT_SECRET = 'unit-test-client-secret';
process.env.BFF_REDIS_PASSWORD = 'unit-test-redis-password';

const { readTextWithinLimit } = await import('../../src/server/bff/request-body.mjs');
const { SessionRefreshError } = await import('../../src/server/bff/sessions.js');
const { ticketProxy } = await import('../../src/server/bff/tickets.js');

const ticketConfig = {
  ticketServiceEnabled: true,
  ticketServiceUrl: new URL('http://ticket-service:8085/'),
  ticketServiceTimeoutMs: 5000,
};
const sessionRequest = {
  cookies: { get: () => ({ value: 'unit-test-session' }) },
};

function dependencies(overrides = {}) {
  return {
    getBffConfig: () => ticketConfig,
    getSession: async () => ({ accessToken: 'server-held-token' }),
    accessTokenFor: async () => 'server-held-token',
    fetch: async () => new Response('{}', { status: 200 }),
    ...overrides,
  };
}

test('ticket proxy rejects an oversized chunked saved-seat-group body after session lookup', async () => {
  const steps = [];
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('1234'));
      controller.enqueue(new TextEncoder().encode('5678'));
      controller.close();
    },
  });
  const response = await ticketProxy(sessionRequest, 'v1/seat-presets', {
    body: () => {
      steps.push('body');
      return readTextWithinLimit(body, null, 4);
    },
    method: 'POST',
  }, dependencies({
    getSession: async () => {
      steps.push('session');
      return { accessToken: 'server-held-token' };
    },
    accessTokenFor: async () => {
      steps.push('token');
      return 'server-held-token';
    },
    fetch: async () => {
      steps.push('fetch');
      return new Response('{}', { status: 200 });
    },
  }));

  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: 'request_too_large' });
  assert.deepEqual(steps, ['session', 'token', 'body']);
});

test('ticket proxy keeps disabled, upstream, and refresh failures distinct', async () => {
  const disabled = await ticketProxy(sessionRequest, 'v1/screenings', {}, dependencies({
    getBffConfig: () => ({ ...ticketConfig, ticketServiceEnabled: false }),
    getSession: async () => {
      throw new Error('disabled ticket proxy must not load a session');
    },
  }));
  assert.equal(disabled.status, 404);

  const unavailable = await ticketProxy(sessionRequest, 'v1/screenings', {}, dependencies({
    fetch: async () => {
      throw new DOMException('Timed out', 'TimeoutError');
    },
  }));
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), {
    code: 'ticket_unavailable',
    error: 'Ticket allocation is temporarily unavailable.',
  });

  const refreshFailure = await ticketProxy(sessionRequest, 'v1/screenings', {}, dependencies({
    getSession: async () => {
      throw new SessionRefreshError('refresh rejected');
    },
  }));
  assert.equal(refreshFailure.status, 401);
  assert.match(refreshFailure.headers.get('set-cookie'), /kino_bff_session=/);
});

import assert from 'node:assert/strict';
import test from 'node:test';

process.env.WEB_BFF_CLIENT_SECRET = 'unit-test-client-secret';
process.env.BFF_REDIS_PASSWORD = 'unit-test-redis-password';

const { viewingPlanList, viewingPlanProxy } = await import('../../src/server/bff/viewing-plans.js');

const config = {
  viewingPlanServiceEnabled: true,
  viewingPlanServiceUrl: new URL('http://viewing-plan-service:8085/'),
  viewingPlanServiceTimeoutMs: 5000,
  dataServiceUrl: new URL('http://data-service:8082/api/v1/data/'),
};
const request = {
  cookies: { get: () => ({ value: 'unit-test-session' }) },
  url: 'http://local.kino.com/api/viewing-plans?status=OPEN&page=0',
};

function dependencies(overrides = {}) {
  return {
    getBffConfig: () => config,
    getSession: async () => ({ accessToken: 'server-held-token' }),
    accessTokenFor: async () => 'server-held-token',
    fetch: async () => new Response('{}', { status: 200 }),
    ...overrides,
  };
}

test('viewing plans keeps disabled, session, and trusted bearer failures distinct', async () => {
  const disabled = await viewingPlanProxy(request, 'v1/viewing-plans', {}, dependencies({
    getBffConfig: () => ({ ...config, viewingPlanServiceEnabled: false }),
  }));
  assert.equal(disabled.status, 404);
  assert.equal((await disabled.json()).code, 'viewing_plan_service_disabled');

  const missingSession = await viewingPlanProxy(request, 'v1/viewing-plans', {}, dependencies({
    getSession: async () => null,
  }));
  assert.equal(missingSession.status, 401);
  assert.equal((await missingSession.json()).code, 'authentication_required');
  assert.match(missingSession.headers.get('set-cookie'), /kino_bff_session=/);

  const invalidToken = await viewingPlanProxy(request, 'v1/viewing-plans', {}, dependencies({
    fetch: async () => new Response('{}', {
      status: 401,
      headers: { 'www-authenticate': 'Bearer error="invalid_token"' },
    }),
  }));
  assert.equal(invalidToken.status, 401);
  assert.equal((await invalidToken.json()).code, 'viewing_plan_reauthentication_required');

  const timeout = await viewingPlanProxy(request, 'v1/viewing-plans', {}, dependencies({
    fetch: async () => new Response('{}', { status: 408 }),
  }));
  assert.equal(timeout.status, 503);
  assert.equal((await timeout.json()).code, 'viewing_plan_unavailable');
});

test('viewing plans enriches a bounded list and preserves unavailable titles', async () => {
  const calls = [];
  const response = await viewingPlanList(request, dependencies({
    fetch: async (url) => {
      calls.push(url.pathname);
      if (url.pathname.endsWith('/v1/viewing-plans')) {
        return new Response(JSON.stringify({
          items: [{
            id: '00000000-0000-4000-8000-000000000001',
            titleId: 'tt0000001',
            kind: 'WATCH',
            status: 'OPEN',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            completedAt: null,
          }],
          page: 0, size: 20, hasNext: false,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } });
    },
  }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.items[0].titleResolution, 'unavailable');
  assert.deepEqual(calls, ['/v1/viewing-plans', '/api/v1/data/titles/tt0000001']);
});

test('viewing plans rejects malformed successful Planner responses', async () => {
  const response = await viewingPlanList(request, dependencies({
    fetch: async () => new Response(JSON.stringify({
      items: [],
      page: 1,
      size: 20,
      hasNext: false,
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
  }));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, 'viewing_plan_upstream_invalid_response');
});

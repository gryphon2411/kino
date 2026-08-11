import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { getViewingPlanConfig } from '../src/config.js';

const config = getViewingPlanConfig({
  VIEWING_PLAN_DATABASE_URL: 'postgresql://runtime:secret@postgres/kino_viewing_plan',
  AUTH_SERVER_ISSUER_URI: 'http://local.kino.com',
  AUTH_SERVER_JWK_SET_URI: 'http://auth-service:8081/api/v1/auth/oauth2/jwks',
});

function plan() {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    titleId: 'tt0000001',
    kind: 'WATCH',
    status: 'OPEN',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    completedAt: null,
  };
}

async function withApp(callback) {
  const service = {
    list: async () => ({ items: [plan()], page: 0, size: 20, hasNext: false }),
    openForTitle: async () => null,
    upsert: async () => plan(),
    complete: async () => ({ ...plan(), status: 'DONE', completedAt: '2026-01-01T01:00:00.000Z' }),
    reopen: async () => plan(),
    delete: async () => undefined,
  };
  const app = createApp({
    config,
    viewingPlanService: service,
    tokenVerifier: async () => ({ subject: 'unit-subject' }),
  });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('configuration leaves room for an idempotent lifecycle fallback', () => {
  assert.throws(() => getViewingPlanConfig({
    VIEWING_PLAN_DATABASE_URL: 'postgresql://runtime:secret@postgres/kino_viewing_plan',
    AUTH_SERVER_ISSUER_URI: 'http://local.kino.com',
    AUTH_SERVER_JWK_SET_URI: 'http://auth-service:8081/api/v1/auth/oauth2/jwks',
    VIEWING_PLAN_DB_STATEMENT_TIMEOUT_MS: '2000',
  }), /must fit within the BFF deadline/);
});

test('private routes validate requests and preserve no-store responses', async () => {
  await withApp(async (origin) => {
    const health = await fetch(`${origin}/healthz`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('cache-control'), 'private, no-store');

    const list = await fetch(`${origin}/v1/viewing-plans?status=OPEN&page=0&size=20`, {
      headers: { authorization: 'Bearer test' },
    });
    assert.equal(list.status, 200);
    assert.equal((await list.json()).items.length, 1);

    const invalid = await fetch(`${origin}/v1/viewing-plans?status=OPEN&status=DONE`, {
      headers: { authorization: 'Bearer test' },
    });
    assert.equal(invalid.status, 400);

    const unsupported = await fetch(`${origin}/v1/viewing-plans/titles/tt0000001`, {
      method: 'PUT',
      headers: { authorization: 'Bearer test', 'content-type': 'text/plain' },
      body: 'WATCH',
    });
    assert.equal(unsupported.status, 415);

    const upsert = await fetch(`${origin}/v1/viewing-plans/titles/tt0000001`, {
      method: 'PUT',
      headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'WATCH' }),
    });
    assert.equal(upsert.status, 200);

    const commandWithBody = await fetch(`${origin}/v1/viewing-plans/00000000-0000-4000-8000-000000000001/complete`, {
      method: 'POST',
      headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(commandWithBody.status, 400);
  });
});

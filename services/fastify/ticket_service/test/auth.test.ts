import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import test from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { buildApp } from '../src/app.js';
import type { TicketConfig } from '../src/config.js';
import type { TicketDatabase } from '../src/database.js';

const issuer = 'http://local.kino.com';
const audience = 'kino-ticket-api';

type TokenOptions = {
  audience?: string | string[];
  issuer?: string;
  expiration?: string;
};

const database = {
  query: async () => ({ rows: [], rowCount: 0 }),
  connect: async () => {
    throw new Error('The auth route tests must not open a database connection.');
  },
  end: async () => undefined,
} as unknown as TicketDatabase;

async function withJwks(
  run: (config: TicketConfig, sign: (scope?: string, options?: TokenOptions) => Promise<string>) => Promise<void>,
  options: { responseStatus?: number } = {}
) {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'ticket-test-key';
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  const server = createServer((_request, response) => {
    response.statusCode = options.responseStatus || 200;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Test JWKS server did not bind a TCP port.');
  }

  const config: TicketConfig = {
    environment: 'local',
    host: '127.0.0.1',
    port: 8080,
    databaseUrl: 'postgresql://unused',
    authIssuer: issuer,
    authJwkSetUri: `http://127.0.0.1:${address.port}/jwks`,
    audience,
    holdDurationSeconds: 120,
    databaseConnectionTimeoutMs: 2000,
    lockTimeoutMs: 1000,
    statementTimeoutMs: 3000,
    transactionTimeoutMs: 3500,
    requestTimeoutMs: 5000,
  };
  const sign = async (scope?: string, tokenOptions: TokenOptions = {}) => new SignJWT(
    scope === undefined ? {} : { scope }
  )
    .setProtectedHeader({ alg: 'RS256', kid: 'ticket-test-key' })
    .setIssuer(tokenOptions.issuer || issuer)
    .setAudience(tokenOptions.audience || audience)
    .setSubject('opaque-ticket-user')
    .setIssuedAt()
    .setExpirationTime(tokenOptions.expiration || '5m')
    .sign(privateKey);

  try {
    await run(config, sign);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('Fastify validates issuer, audience, expiry, and scopes through its configured JWKS', async () => {
  await withJwks(async (config, sign) => {
    const app = buildApp(config, database);
    try {
      const valid = await app.inject({
        method: 'GET',
        url: '/v1/screenings?titleId=tt0000001',
        headers: { authorization: `Bearer ${await sign('kino.ticket.read')}` },
      });
      assert.equal(valid.statusCode, 200);

      const insufficientScope = await app.inject({
        method: 'GET',
        url: '/v1/screenings?titleId=tt0000001',
        headers: { authorization: `Bearer ${await sign('kino.ticket.write')}` },
      });
      assert.equal(insufficientScope.statusCode, 403);
      assert.match(insufficientScope.headers['www-authenticate'], /insufficient_scope/);

      const wrongAudience = await app.inject({
        method: 'GET',
        url: '/v1/screenings?titleId=tt0000001',
        headers: { authorization: `Bearer ${await sign('kino.ticket.read', { audience: 'wrong-audience' })}` },
      });
      assert.equal(wrongAudience.statusCode, 401);
      assert.match(wrongAudience.headers['www-authenticate'], /invalid_token/);

      const wrongIssuer = await app.inject({
        method: 'GET',
        url: '/v1/screenings?titleId=tt0000001',
        headers: {
          authorization: `Bearer ${await sign('kino.ticket.read', { issuer: 'http://wrong.kino.com' })}`,
        },
      });
      assert.equal(wrongIssuer.statusCode, 401);
      assert.match(wrongIssuer.headers['www-authenticate'], /invalid_token/);

      const missingScope = await app.inject({
        method: 'GET',
        url: '/v1/screenings?titleId=tt0000001',
        headers: { authorization: `Bearer ${await sign()}` },
      });
      assert.equal(missingScope.statusCode, 403);
      assert.match(missingScope.headers['www-authenticate'], /insufficient_scope/);

      const bffAudienceSet = await app.inject({
        method: 'GET',
        url: '/v1/screenings?titleId=tt0000001',
        headers: {
          authorization: `Bearer ${await sign('kino.ticket.read', {
            audience: ['kino-data-api', audience],
          })}`,
        },
      });
      assert.equal(bffAudienceSet.statusCode, 200);

      const expired = await app.inject({
        method: 'GET',
        url: '/v1/screenings?titleId=tt0000001',
        headers: { authorization: `Bearer ${await sign('kino.ticket.read', { expiration: '-10s' })}` },
      });
      assert.equal(expired.statusCode, 401);
    } finally {
      await app.close();
    }
  });
});

test('Fastify reports a configured JWKS endpoint outage without requesting reauthentication', async () => {
  await withJwks(async (config, sign) => {
    const app = buildApp(config, database);
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/screenings?titleId=tt0000001',
        headers: { authorization: `Bearer ${await sign('kino.ticket.read')}` },
      });
      assert.equal(response.statusCode, 503);
      assert.deepEqual(response.json(), { error: 'temporarily_unavailable' });
      assert.equal(response.headers['www-authenticate'], undefined);
    } finally {
      await app.close();
    }
  }, { responseStatus: 503 });
});

test('Fastify closes a slow, incomplete hold request at its request deadline', async () => {
  await withJwks(async (config) => {
    const app = buildApp({ ...config, requestTimeoutMs: 100 }, database);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Test ticket server did not bind a TCP port.');
    }
    try {
      const response = await new Promise<string>((resolve, reject) => {
        const socket = createConnection({ host: '127.0.0.1', port: address.port });
        const chunks: Buffer[] = [];
        socket.setTimeout(2000, () => {
          socket.destroy();
          reject(new Error('Ticket request deadline did not fire.'));
        });
        socket.on('connect', () => {
          socket.write(
            'POST /v1/screenings/00000000-0000-0000-0000-000000000001/holds HTTP/1.1\r\n'
            + 'Host: 127.0.0.1\r\n'
            + 'Content-Type: application/json\r\n'
            + 'Content-Length: 32\r\n\r\n'
            + '{'
          );
        });
        socket.on('data', (chunk) => chunks.push(chunk));
        socket.on('error', reject);
        socket.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      });
      assert.match(response, /408 Request Timeout/);
    } finally {
      await app.close();
    }
  });
});

test('Fastify maps a PostgreSQL connection failure to a retryable response', async () => {
  await withJwks(async (config, sign) => {
    const unavailableDatabase = {
      query: async () => {
        const error = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
        throw error;
      },
      connect: async () => {
        throw new Error('The connection-failure test must not start a transaction.');
      },
      end: async () => undefined,
    } as unknown as TicketDatabase;
    const app = buildApp(config, unavailableDatabase);
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/screenings?titleId=tt0000001',
        headers: { authorization: `Bearer ${await sign('kino.ticket.read')}` },
      });
      assert.equal(response.statusCode, 503);
      assert.deepEqual(response.json(), { error: 'temporarily_unavailable' });
    } finally {
      await app.close();
    }
  });
});

test('Fastify maps a terminated PostgreSQL transaction to a retryable response', async () => {
  await withJwks(async (config, sign) => {
    const unavailableDatabase = {
      query: async () => {
        throw new Error('Connection terminated unexpectedly');
      },
      connect: async () => {
        throw new Error('The terminated-transaction test must not start a transaction.');
      },
      end: async () => undefined,
    } as unknown as TicketDatabase;
    const app = buildApp(config, unavailableDatabase);
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/screenings?titleId=tt0000001',
        headers: { authorization: `Bearer ${await sign('kino.ticket.read')}` },
      });
      assert.equal(response.statusCode, 503);
      assert.deepEqual(response.json(), { error: 'temporarily_unavailable' });
    } finally {
      await app.close();
    }
  });
});

test('Fastify normalizes invalid hold input without invoking allocation', async () => {
  await withJwks(async (config) => {
    const app = buildApp(config, database);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/screenings/00000000-0000-0000-0000-000000000001/holds',
        payload: { seatCodes: ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4'] },
      });
      assert.equal(response.statusCode, 400);
      assert.deepEqual(response.json(), { error: 'invalid_request' });
    } finally {
      await app.close();
    }
  });
});

test('Fastify rejects an oversized direct hold body before allocation', async () => {
  await withJwks(async (config, sign) => {
    const app = buildApp(config, database);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/screenings/00000000-0000-0000-0000-000000000001/holds',
        headers: {
          authorization: `Bearer ${await sign('kino.ticket.write')}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          seatCodes: ['A1'],
          padding: 'x'.repeat(1024),
        }),
      });
      assert.equal(response.statusCode, 413);
      assert.deepEqual(response.json(), { error: 'request_too_large' });
    } finally {
      await app.close();
    }
  });
});

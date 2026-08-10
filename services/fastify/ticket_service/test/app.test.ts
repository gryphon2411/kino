import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import test from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { buildApp } from '../src/app.js';
import type { TicketConfig } from '../src/config.js';
import type { TicketDatabase } from '../src/database.js';
import type {
  SeatPresetOperations,
  SeatPresetRepository,
  SeatPresetReadiness,
} from '../src/seat-presets.js';
import { SeatPresetService } from '../src/seat-presets.js';
import { ServiceUnavailableError } from '../src/errors.js';
import { ticketTestConfig } from './support/config.js';

const issuer = 'http://local.kino.com';
const audience = 'kino-ticket-api';

type TokenOptions = {
  audience?: string | string[];
  issuer?: string;
  expiration?: string;
  type?: string;
};

const database = {
  query: async () => ({ rows: [], rowCount: 0 }),
  connect: async () => {
    throw new Error('The auth route tests must not open a database connection.');
  },
  end: async () => undefined,
} as unknown as TicketDatabase;

const emptySeatPresets: SeatPresetOperations & SeatPresetReadiness = {
  list: async () => [],
  create: async () => ({
    id: '00000000-0000-0000-0000-000000000098',
    name: 'unused',
    seatCodes: ['A1'],
  }),
  delete: async () => undefined,
  ready: async () => undefined,
};

function seatPresetService(overrides: Partial<SeatPresetRepository> = {}) {
  const repository: SeatPresetRepository = {
    list: async () => [],
    create: async (_subject, request) => ({
      id: '00000000-0000-0000-0000-000000000098',
      ...request,
    }),
    delete: async () => true,
    ready: async () => undefined,
    ...overrides,
  };
  return new SeatPresetService(repository);
}

function allocationDatabase() {
  const queries: string[] = [];
  const client = {
    on: () => client,
    off: () => client,
    release: () => undefined,
    query: async (query: string) => {
      queries.push(query);
      if (
        query === 'BEGIN'
        || query === 'COMMIT'
        || query === 'ROLLBACK'
        || query.startsWith('SET LOCAL ')
      ) {
        return { rows: [], rowCount: 0 };
      }
      if (query.includes('FROM kino_ticket.screenings')) {
        return {
          rows: [{
            id: '00000000-0000-0000-0000-000000000001',
            title_id: 'tt0000001',
            label: 'Kino allocation',
            starts_at: new Date('2030-01-01T20:00:00Z'),
          }],
          rowCount: 1,
        };
      }
      if (query.includes('FOR UPDATE OF s')) {
        return { rows: [{ seat_code: 'D1' }], rowCount: 1 };
      }
      if (query.includes('AS active_allocation')) {
        return { rows: [{ active_allocation: false }], rowCount: 1 };
      }
      if (query.includes('INSERT INTO kino_ticket.reservations')) {
        // Let the ordinary request-body close event occur before COMMIT.
        await new Promise((resolve) => setTimeout(resolve, 25));
        return {
          rows: [{
            id: '00000000-0000-0000-0000-000000000099',
            state: 'HELD',
            hold_expires_at: new Date('2030-01-01T20:02:00Z'),
            confirmed_at: null,
          }],
          rowCount: 1,
        };
      }
      if (query.includes('UPDATE kino_ticket.screening_seats')) {
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected allocation query: ${query}`);
    },
  };
  return {
    database: {
      query: async () => ({ rows: [], rowCount: 0 }),
      connect: async () => client,
      end: async () => undefined,
    } as unknown as TicketDatabase,
    queries,
  };
}

async function withJwks(
  run: (config: TicketConfig, sign: (scope?: string, options?: TokenOptions) => Promise<string>) => Promise<void>,
  options: { responseStatus?: number; responseDelayMs?: number } = {}
) {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'ticket-test-key';
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  const pendingResponseTimers = new Set<ReturnType<typeof setTimeout>>();
  const server = createServer((_request, response) => {
    response.statusCode = options.responseStatus || 200;
    response.setHeader('Content-Type', 'application/json');
    const writeResponse = () => response.end(JSON.stringify({ keys: [jwk] }));
    if (options.responseDelayMs) {
      const timer = setTimeout(() => {
        pendingResponseTimers.delete(timer);
        if (!response.destroyed) {
          writeResponse();
        }
      }, options.responseDelayMs);
      pendingResponseTimers.add(timer);
      response.once('close', () => {
        clearTimeout(timer);
        pendingResponseTimers.delete(timer);
      });
      return;
    }
    writeResponse();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Test JWKS server did not bind a TCP port.');
  }

  const config = ticketTestConfig({
    databaseUrl: 'postgresql://unused',
    authIssuer: issuer,
    authJwkSetUri: `http://127.0.0.1:${address.port}/jwks`,
    audience,
  });
  const sign = async (scope?: string, tokenOptions: TokenOptions = {}) => new SignJWT(
    scope === undefined ? {} : { scope }
  )
    .setProtectedHeader({ alg: 'RS256', kid: 'ticket-test-key', typ: tokenOptions.type || 'at+jwt' })
    .setIssuer(tokenOptions.issuer || issuer)
    .setAudience(tokenOptions.audience || audience)
    .setSubject('opaque-ticket-user')
    .setIssuedAt()
    .setExpirationTime(tokenOptions.expiration || '5m')
    .sign(privateKey);

  try {
    await run(config, sign);
  } finally {
    for (const timer of pendingResponseTimers) {
      clearTimeout(timer);
    }
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('Fastify application validates issuer, audience, expiry, and scopes through its configured JWKS', async () => {
  await withJwks(async (config, sign) => {
    const app = buildApp(config, database, emptySeatPresets);
    try {
      const valid = await app.inject({
        method: 'GET',
        url: '/v1/screenings?titleId=tt0000001',
        headers: { authorization: `Bearer ${await sign('kino.ticket.read')}` },
      });
      assert.equal(valid.statusCode, 200);
      assert.equal(valid.headers['cache-control'], 'private, no-store');

      const caseInsensitiveBearer = await app.inject({
        method: 'GET',
        url: '/v1/screenings?titleId=tt0000001',
        headers: { authorization: `bearer ${await sign('kino.ticket.read')}` },
      });
      assert.equal(caseInsensitiveBearer.statusCode, 200);

      const insufficientScope = await app.inject({
        method: 'GET',
        url: '/v1/screenings?titleId=tt0000001',
        headers: { authorization: `Bearer ${await sign('kino.ticket.write')}` },
      });
      assert.equal(insufficientScope.statusCode, 403);
      assert.equal(insufficientScope.headers['cache-control'], 'private, no-store');
      assert.match(String(insufficientScope.headers['www-authenticate'] ?? ''), /insufficient_scope/);

      const wrongAudience = await app.inject({
        method: 'GET',
        url: '/v1/screenings?titleId=tt0000001',
        headers: { authorization: `Bearer ${await sign('kino.ticket.read', { audience: 'wrong-audience' })}` },
      });
      assert.equal(wrongAudience.statusCode, 401);
      assert.equal(wrongAudience.headers['cache-control'], 'private, no-store');
      assert.match(String(wrongAudience.headers['www-authenticate'] ?? ''), /invalid_token/);

      const wrongIssuer = await app.inject({
        method: 'GET',
        url: '/v1/screenings?titleId=tt0000001',
        headers: {
          authorization: `Bearer ${await sign('kino.ticket.read', { issuer: 'http://wrong.kino.com' })}`,
        },
      });
      assert.equal(wrongIssuer.statusCode, 401);
      assert.match(String(wrongIssuer.headers['www-authenticate'] ?? ''), /invalid_token/);

      const missingScope = await app.inject({
        method: 'GET',
        url: '/v1/screenings?titleId=tt0000001',
        headers: { authorization: `Bearer ${await sign()}` },
      });
      assert.equal(missingScope.statusCode, 403);
      assert.match(String(missingScope.headers['www-authenticate'] ?? ''), /insufficient_scope/);

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

      const wrongTokenType = await app.inject({
        method: 'GET',
        url: '/v1/screenings?titleId=tt0000001',
        headers: { authorization: `Bearer ${await sign('kino.ticket.read', { type: 'JWT' })}` },
      });
      assert.equal(wrongTokenType.statusCode, 401);
      assert.match(String(wrongTokenType.headers['www-authenticate'] ?? ''), /invalid_token/);
    } finally {
      await app.close();
    }
  });
});

test('Fastify commits and returns a normal network hold request', async () => {
  await withJwks(async (config, sign) => {
    const allocation = allocationDatabase();
    const app = buildApp(config, allocation.database, emptySeatPresets);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Test ticket server did not bind a TCP port.');
    }
    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/v1/screenings/00000000-0000-0000-0000-000000000001/holds`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${await sign('kino.ticket.write')}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ seatCodes: ['D1'] }),
        }
      );
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        id: '00000000-0000-0000-0000-000000000099',
        state: 'HELD',
        expiresAt: '2030-01-01T20:02:00.000Z',
        seatCodes: ['D1'],
      });
      assert.ok(allocation.queries.includes('COMMIT'));
      assert.equal(allocation.queries.includes('ROLLBACK'), false);
    } finally {
      await app.close();
    }
  });
});

test('Fastify bounds a slow JWKS lookup before the handler deadline', async () => {
  await withJwks(async (config, sign) => {
    const app = buildApp(
      { ...config, jwkTimeoutMs: 100, handlerTimeoutMs: 750 },
      database,
      emptySeatPresets
    );
    try {
      const startedAt = Date.now();
      const response = await app.inject({
        method: 'GET',
        url: '/v1/screenings?titleId=tt0000001',
        headers: { authorization: `Bearer ${await sign('kino.ticket.read')}` },
      });
      assert.equal(response.statusCode, 503);
      assert.deepEqual(response.json(), { error: 'temporarily_unavailable' });
      assert.equal(response.headers['cache-control'], 'private, no-store');
      assert.ok(Date.now() - startedAt < 500);
    } finally {
      await app.close();
    }
  }, { responseDelayMs: 1000 });
});

test('Fastify maps a handler deadline to a retryable response', async () => {
  await withJwks(async (config, sign) => {
    const slowDatabase = {
      ...database,
      query: async () => new Promise((resolve) => {
        setTimeout(() => resolve({ rows: [], rowCount: 0 }), 150);
      }),
    } as unknown as TicketDatabase;
    const app = buildApp({ ...config, handlerTimeoutMs: 50 }, slowDatabase, emptySeatPresets);
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/screenings?titleId=tt0000001',
        headers: { authorization: `Bearer ${await sign('kino.ticket.read')}` },
      });
      assert.equal(response.statusCode, 503);
      assert.deepEqual(response.json(), { error: 'temporarily_unavailable' });
      await new Promise((resolve) => setTimeout(resolve, 160));
    } finally {
      await app.close();
    }
  });
});

test('Fastify reports a configured JWKS endpoint outage without requesting reauthentication', async () => {
  await withJwks(async (config, sign) => {
    const app = buildApp(config, database, emptySeatPresets);
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
    const app = buildApp({ ...config, requestTimeoutMs: 100 }, database, emptySeatPresets);
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
    const app = buildApp(config, unavailableDatabase, emptySeatPresets);
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
    const app = buildApp(config, unavailableDatabase, emptySeatPresets);
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
    const app = buildApp(config, database, emptySeatPresets);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/screenings/00000000-0000-0000-0000-000000000001/holds',
        payload: { seatCodes: ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4'] },
      });
      assert.equal(response.statusCode, 400);
      assert.deepEqual(response.json(), { error: 'invalid_request' });
      assert.equal(response.headers['cache-control'], 'private, no-store');
    } finally {
      await app.close();
    }
  });
});

test('Fastify rejects an oversized direct hold body before allocation', async () => {
  await withJwks(async (config, sign) => {
    const app = buildApp(config, database, emptySeatPresets);
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
      assert.equal(response.headers['cache-control'], 'private, no-store');
    } finally {
      await app.close();
    }
  });
});

test('Fastify readiness checks both the allocation pool and saved-seat-group persistence', async () => {
  const calls: string[] = [];
  const readinessDatabase = {
    ...database,
    query: async (query: string) => {
      calls.push(query);
      return { rows: [], rowCount: 1 };
    },
  } as unknown as TicketDatabase;
  const readinessService = seatPresetService({
    ready: async () => {
      calls.push('seat-presets');
    },
  });
  const app = buildApp(ticketTestConfig({ databaseUrl: 'postgresql://unused' }), readinessDatabase, readinessService);
  try {
    const response = await app.inject({ method: 'GET', url: '/readyz' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(calls, ['SELECT 1', 'seat-presets']);
  } finally {
    await app.close();
  }
});

test('Fastify serves private saved seat groups with scoped, normalized CRUD', async () => {
  await withJwks(async (config, sign) => {
    const createdRequests: { name: string; seatCodes: string[] }[] = [];
    const service = seatPresetService({
      list: async (subject) => [{
        id: '00000000-0000-0000-0000-000000000097',
        name: `Saved for ${subject}`,
        seatCodes: ['A2', 'A3'],
      }],
      create: async (_subject, request) => {
        createdRequests.push(request);
        return {
          id: '00000000-0000-0000-0000-000000000098',
          ...request,
        };
      },
    });
    const app = buildApp(config, database, service);
    try {
      const unauthorized = await app.inject({ method: 'GET', url: '/v1/seat-presets' });
      assert.equal(unauthorized.statusCode, 401);
      assert.equal(unauthorized.headers['cache-control'], 'private, no-store');

      const insufficientScope = await app.inject({
        method: 'GET',
        url: '/v1/seat-presets',
        headers: { authorization: `Bearer ${await sign('kino.ticket.write')}` },
      });
      assert.equal(insufficientScope.statusCode, 403);
      assert.equal(insufficientScope.headers['cache-control'], 'private, no-store');

      const list = await app.inject({
        method: 'GET',
        url: '/v1/seat-presets',
        headers: { authorization: `Bearer ${await sign('kino.ticket.read')}` },
      });
      assert.equal(list.statusCode, 200);
      assert.equal(list.headers['cache-control'], 'private, no-store');
      assert.deepEqual(list.json(), {
        seatPresets: [{
          id: '00000000-0000-0000-0000-000000000097',
          name: 'Saved for opaque-ticket-user',
          seatCodes: ['A2', 'A3'],
        }],
      });

      const created = await app.inject({
        method: 'POST',
        url: '/v1/seat-presets',
        headers: {
          authorization: `Bearer ${await sign('kino.ticket.write')}`,
          'content-type': 'application/json',
        },
        payload: { name: '  Our aisle seats  ', seatCodes: ['A3', 'A2'] },
      });
      assert.equal(created.statusCode, 201);
      assert.equal(created.headers['cache-control'], 'private, no-store');
      assert.deepEqual(created.json(), {
        id: '00000000-0000-0000-0000-000000000098',
        name: 'Our aisle seats',
        seatCodes: ['A2', 'A3'],
      });
      assert.deepEqual(createdRequests, [{ name: 'Our aisle seats', seatCodes: ['A2', 'A3'] }]);

      const deleted = await app.inject({
        method: 'DELETE',
        url: '/v1/seat-presets/00000000-0000-0000-0000-000000000098',
        headers: { authorization: `Bearer ${await sign('kino.ticket.write')}` },
      });
      assert.equal(deleted.statusCode, 204);
      assert.equal(deleted.body, '');
      assert.equal(deleted.headers['cache-control'], 'private, no-store');
    } finally {
      await app.close();
    }
  });
});

test('Fastify protects every saved-seat-group error response from caching', async () => {
  await withJwks(async (config, sign) => {
    const unavailable = seatPresetService({
      list: async () => {
        throw new ServiceUnavailableError();
      },
    });
    const app = buildApp(config, database, unavailable);
    try {
      const invalid = await app.inject({
        method: 'POST',
        url: '/v1/seat-presets',
        headers: {
          authorization: `Bearer ${await sign('kino.ticket.write')}`,
          'content-type': 'application/json',
        },
        payload: { name: '   ', seatCodes: ['A1'] },
      });
      assert.equal(invalid.statusCode, 400);
      assert.deepEqual(invalid.json(), { error: 'invalid_preset_name' });
      assert.equal(invalid.headers['cache-control'], 'private, no-store');

      const tooLarge = await app.inject({
        method: 'POST',
        url: '/v1/seat-presets',
        headers: {
          authorization: `Bearer ${await sign('kino.ticket.write')}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({ name: 'Large request', seatCodes: ['A1'], padding: 'x'.repeat(1024) }),
      });
      assert.equal(tooLarge.statusCode, 413);
      assert.equal(tooLarge.headers['cache-control'], 'private, no-store');

      const unavailableResponse = await app.inject({
        method: 'GET',
        url: '/v1/seat-presets',
        headers: { authorization: `Bearer ${await sign('kino.ticket.read')}` },
      });
      assert.equal(unavailableResponse.statusCode, 503);
      assert.equal(unavailableResponse.headers['cache-control'], 'private, no-store');
    } finally {
      await app.close();
    }
  });
});

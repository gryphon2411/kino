import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createViewingPlanAuthenticator } from '../src/auth.js';
import { InsufficientScopeError, InvalidTokenError } from '../src/errors.js';

const issuer = 'http://local.kino.com';

async function withJwks(callback) {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = 'unit-test-key';
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ keys: [publicJwk] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await callback(privateKey, `http://127.0.0.1:${address.port}/jwks`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function token(privateKey, scope) {
  return new SignJWT({ scope })
    .setProtectedHeader({ alg: 'RS256', kid: 'unit-test-key', typ: 'at+jwt' })
    .setIssuer(issuer)
    .setAudience('kino-viewing-plan-api')
    .setSubject(' subject-preserved ')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

function request(accessToken) {
  return { get: (name) => name === 'authorization' ? `Bearer ${accessToken}` : undefined };
}

test('token verification preserves the opaque subject and requires the requested scope', async () => {
  await withJwks(async (privateKey, authJwkSetUri) => {
    const authenticate = createViewingPlanAuthenticator({
      authJwkSetUri,
      authIssuer: issuer,
      audience: 'kino-viewing-plan-api',
      jwkTimeoutMs: 500,
    });
    const valid = await authenticate(
      request(await token(privateKey, 'kino.viewing-plan.read')),
      'kino.viewing-plan.read'
    );
    assert.equal(valid.subject, ' subject-preserved ');
    await assert.rejects(
      authenticate(request(await token(privateKey, 'kino.viewing-plan.read')), 'kino.viewing-plan.write'),
      InsufficientScopeError
    );
  });
});

test('token verification reports malformed tokens as invalid', async () => {
  await withJwks(async (_privateKey, authJwkSetUri) => {
    const authenticate = createViewingPlanAuthenticator({
      authJwkSetUri,
      authIssuer: issuer,
      audience: 'kino-viewing-plan-api',
      jwkTimeoutMs: 500,
    });
    await assert.rejects(
      authenticate(request('not-a-jwt'), 'kino.viewing-plan.read'),
      InvalidTokenError
    );
  });
});

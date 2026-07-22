import assert from 'node:assert/strict';
import test from 'node:test';
import { getTicketConfig } from '../src/config.js';

const baseEnvironment = {
  TICKET_DATABASE_URL: 'postgresql://kino_ticket_runtime:secret@postgres/kino_ticket',
  AUTH_SERVER_ISSUER_URI: 'http://local.kino.com',
  AUTH_SERVER_JWK_SET_URI: 'http://auth-service:8081/api/v1/auth/oauth2/jwks',
};

test('ticket config uses the documented allocation defaults', () => {
  const config = getTicketConfig(baseEnvironment);
  assert.equal(config.holdDurationSeconds, 120);
  assert.equal(config.databaseConnectionTimeoutMs, 1000);
  assert.equal(config.lockTimeoutMs, 1000);
  assert.equal(config.statementTimeoutMs, 3000);
  assert.equal(config.transactionTimeoutMs, 3500);
  assert.equal(config.requestTimeoutMs, 5000);
  assert.equal(config.audience, 'kino-ticket-api');
});

test('ticket config rejects database work that can outlive the BFF deadline', () => {
  assert.throws(
    () => getTicketConfig({
      ...baseEnvironment,
      TICKET_DB_CONNECTION_TIMEOUT_MS: '2000',
    }),
    /must fit within the BFF deadline/
  );
});

test('ticket config rejects a statement timeout that cannot contain lock waits', () => {
  assert.throws(
    () => getTicketConfig({
      ...baseEnvironment,
      TICKET_DB_LOCK_TIMEOUT_MS: '3000',
      TICKET_DB_STATEMENT_TIMEOUT_MS: '3000',
    }),
    /must exceed/
  );
});

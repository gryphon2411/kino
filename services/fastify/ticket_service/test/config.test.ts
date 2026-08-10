import assert from 'node:assert/strict';
import test from 'node:test';
import { getTicketConfig } from '../src/config.js';
import { ticketTestEnvironment } from './support/config.js';

test('ticket config uses the documented allocation defaults', () => {
  const config = getTicketConfig(ticketTestEnvironment);
  assert.equal(config.holdDurationSeconds, 120);
  assert.equal(config.jwkTimeoutMs, 500);
  assert.equal(config.databaseConnectionTimeoutMs, 1000);
  assert.equal(config.lockTimeoutMs, 1000);
  assert.equal(config.statementTimeoutMs, 3000);
  assert.equal(config.transactionTimeoutMs, 3000);
  assert.equal(config.requestTimeoutMs, 5000);
  assert.equal(config.handlerTimeoutMs, 5000);
  assert.equal(config.audience, 'kino-ticket-api');
});

test('ticket config rejects database work that can outlive the BFF deadline', () => {
  assert.throws(
    () => getTicketConfig({
      ...ticketTestEnvironment,
      TICKET_JWK_TIMEOUT_MS: '1000',
    }),
    /must fit within the BFF deadline/
  );
});

test('ticket config rejects ambiguous timeout values', () => {
  assert.throws(
    () => getTicketConfig({
      ...ticketTestEnvironment,
      TICKET_JWK_TIMEOUT_MS: '500ms',
    }),
    /must be a positive integer/
  );
});

test('ticket config rejects a statement timeout that cannot contain lock waits', () => {
  assert.throws(
    () => getTicketConfig({
      ...ticketTestEnvironment,
      TICKET_DB_LOCK_TIMEOUT_MS: '3000',
      TICKET_DB_STATEMENT_TIMEOUT_MS: '3000',
    }),
    /must exceed/
  );
});

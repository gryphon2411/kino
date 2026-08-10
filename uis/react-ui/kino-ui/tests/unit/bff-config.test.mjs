import assert from 'node:assert/strict';
import test from 'node:test';
import { getBffConfig } from '../../src/server/bff/config.js';

test('the disabled ticket feature requests only the data-service authority by default', () => {
  const original = {
    WEB_BFF_CLIENT_SECRET: process.env.WEB_BFF_CLIENT_SECRET,
    BFF_REDIS_PASSWORD: process.env.BFF_REDIS_PASSWORD,
    WEB_BFF_SCOPES: process.env.WEB_BFF_SCOPES,
    TICKET_SERVICE_ENABLED: process.env.TICKET_SERVICE_ENABLED,
  };
  try {
    process.env.WEB_BFF_CLIENT_SECRET = 'unit-test-client-secret';
    process.env.BFF_REDIS_PASSWORD = 'unit-test-redis-password';
    delete process.env.WEB_BFF_SCOPES;
    delete process.env.TICKET_SERVICE_ENABLED;

    const config = getBffConfig();
    assert.equal(config.ticketServiceEnabled, false);
    assert.equal(config.scopes, 'openid profile kino.data.read');
  } finally {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
});

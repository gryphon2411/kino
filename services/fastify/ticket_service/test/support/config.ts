import { getTicketConfig, type TicketConfig } from '../../src/config.js';

export const ticketTestEnvironment = {
  TICKET_DATABASE_URL: 'postgresql://kino_ticket_runtime:secret@postgres/kino_ticket',
  AUTH_SERVER_ISSUER_URI: 'http://local.kino.com',
  AUTH_SERVER_JWK_SET_URI: 'http://auth-service:8081/api/v1/auth/oauth2/jwks',
};

export function ticketTestConfig(overrides: Partial<TicketConfig> = {}): TicketConfig {
  return {
    ...getTicketConfig(ticketTestEnvironment),
    ...overrides,
  } satisfies TicketConfig;
}

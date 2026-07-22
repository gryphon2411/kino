export type TicketConfig = {
  environment: 'local' | 'dev';
  host: string;
  port: number;
  databaseUrl: string;
  authIssuer: string;
  authJwkSetUri: string;
  audience: string;
  holdDurationSeconds: number;
  databaseConnectionTimeoutMs: number;
  lockTimeoutMs: number;
  statementTimeoutMs: number;
  transactionTimeoutMs: number;
  requestTimeoutMs: number;
};

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be configured for ticket-service.`);
  }
  return value;
}

function positiveInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number
): number {
  const value = Number.parseInt(environment[name] || String(fallback), 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

export function getTicketConfig(
  environment: NodeJS.ProcessEnv = process.env
): TicketConfig {
  const configuredEnvironment = environment.KINO_ENV || 'local';
  if (configuredEnvironment !== 'local' && configuredEnvironment !== 'dev') {
    throw new Error('KINO_ENV must be local or dev until Kino defines production OIDC transport.');
  }

  const authJwkSetUri = required(environment, 'AUTH_SERVER_JWK_SET_URI');
  const jwkUrl = new URL(authJwkSetUri);
  if (jwkUrl.protocol !== 'http:' && jwkUrl.protocol !== 'https:') {
    throw new Error('AUTH_SERVER_JWK_SET_URI must use HTTP(S).');
  }

  const lockTimeoutMs = positiveInteger(environment, 'TICKET_DB_LOCK_TIMEOUT_MS', 1000);
  const databaseConnectionTimeoutMs = positiveInteger(
    environment,
    'TICKET_DB_CONNECTION_TIMEOUT_MS',
    1000
  );
  const statementTimeoutMs = positiveInteger(
    environment,
    'TICKET_DB_STATEMENT_TIMEOUT_MS',
    3000
  );
  if (statementTimeoutMs <= lockTimeoutMs) {
    throw new Error('TICKET_DB_STATEMENT_TIMEOUT_MS must exceed TICKET_DB_LOCK_TIMEOUT_MS.');
  }
  if (databaseConnectionTimeoutMs >= statementTimeoutMs) {
    throw new Error(
      'TICKET_DB_CONNECTION_TIMEOUT_MS must be shorter than TICKET_DB_STATEMENT_TIMEOUT_MS.'
    );
  }
  const bffUpstreamTimeoutMs = positiveInteger(
    environment,
    'TICKET_BFF_UPSTREAM_TIMEOUT_MS',
    5000
  );
  const deadlineSafetyMarginMs = 500;
  const transactionTimeoutMs = bffUpstreamTimeoutMs
    - databaseConnectionTimeoutMs
    - deadlineSafetyMarginMs;
  if (statementTimeoutMs > transactionTimeoutMs) {
    throw new Error(
      'TICKET_DB_CONNECTION_TIMEOUT_MS plus TICKET_DB_STATEMENT_TIMEOUT_MS must fit within the BFF deadline.'
    );
  }

  return {
    environment: configuredEnvironment,
    host: environment.HOST || '0.0.0.0',
    port: positiveInteger(environment, 'PORT', 8080),
    databaseUrl: required(environment, 'TICKET_DATABASE_URL'),
    authIssuer: required(environment, 'AUTH_SERVER_ISSUER_URI'),
    authJwkSetUri,
    audience: environment.TICKET_AUTH_AUDIENCE || 'kino-ticket-api',
    holdDurationSeconds: positiveInteger(environment, 'TICKET_HOLD_DURATION_SECONDS', 120),
    databaseConnectionTimeoutMs,
    lockTimeoutMs,
    statementTimeoutMs,
    transactionTimeoutMs,
    requestTimeoutMs: bffUpstreamTimeoutMs,
  };
}

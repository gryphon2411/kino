function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be configured for viewing-plan-service.`);
  }
  return value;
}

function positiveInteger(environment, name, fallback) {
  const raw = environment[name] ?? String(fallback);
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(`${name} must be a positive integer.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

export function getViewingPlanConfig(environment = process.env) {
  const environmentName = environment.KINO_ENV || 'local';
  if (!['local', 'dev'].includes(environmentName)) {
    throw new Error('KINO_ENV must be local or dev until Kino defines production OIDC transport.');
  }

  const authJwkSetUri = required(environment, 'AUTH_SERVER_JWK_SET_URI');
  const jwkUrl = new URL(authJwkSetUri);
  if (!['http:', 'https:'].includes(jwkUrl.protocol)) {
    throw new Error('AUTH_SERVER_JWK_SET_URI must use HTTP(S).');
  }

  const jwkTimeoutMs = positiveInteger(environment, 'VIEWING_PLAN_JWK_TIMEOUT_MS', 500);
  const databaseConnectionTimeoutMs = positiveInteger(
    environment,
    'VIEWING_PLAN_DB_CONNECTION_TIMEOUT_MS',
    1000
  );
  const statementTimeoutMs = positiveInteger(
    environment,
    'VIEWING_PLAN_DB_STATEMENT_TIMEOUT_MS',
    1500
  );
  const bffUpstreamTimeoutMs = positiveInteger(
    environment,
    'VIEWING_PLAN_BFF_UPSTREAM_TIMEOUT_MS',
    5000
  );
  if ((2 * statementTimeoutMs) + jwkTimeoutMs + databaseConnectionTimeoutMs + 500 > bffUpstreamTimeoutMs) {
    throw new Error(
      'VIEWING_PLAN_JWK_TIMEOUT_MS, VIEWING_PLAN_DB_CONNECTION_TIMEOUT_MS, and two VIEWING_PLAN_DB_STATEMENT_TIMEOUT_MS values must fit within the BFF deadline.'
    );
  }

  return {
    environment: environmentName,
    host: environment.HOST || '0.0.0.0',
    port: positiveInteger(environment, 'PORT', 8080),
    databaseUrl: required(environment, 'VIEWING_PLAN_DATABASE_URL'),
    authIssuer: required(environment, 'AUTH_SERVER_ISSUER_URI'),
    authJwkSetUri,
    audience: environment.VIEWING_PLAN_AUTH_AUDIENCE || 'kino-viewing-plan-api',
    jwkTimeoutMs,
    databaseConnectionTimeoutMs,
    statementTimeoutMs,
    bffUpstreamTimeoutMs,
  };
}

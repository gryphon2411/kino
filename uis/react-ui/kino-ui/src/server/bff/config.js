function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be configured for the Kino BFF.`);
  }
  return value;
}

function integer(name, fallback) {
  const value = Number.parseInt(process.env[name] || fallback, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function viewingPlanInteger(name, fallback) {
  const value = process.env[name] || fallback;
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be a positive integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

export function getBffConfig() {
  const publicOrigin = new URL(
    process.env.BFF_PUBLIC_ORIGIN || 'http://local.kino.com'
  );
  const issuer = new URL(
    process.env.OIDC_ISSUER || 'http://local.kino.com'
  );
  const internalOidcOrigin = new URL(
    process.env.OIDC_INTERNAL_ORIGIN || issuer.origin
  );

  const dataServiceUrl = new URL(
    process.env.DATA_SERVICE_INTERNAL_URL ||
    'http://data-service:8082/api/v1/data'
  );
  if (!dataServiceUrl.pathname.endsWith('/')) {
    dataServiceUrl.pathname += '/';
  }

  const ticketServiceUrl = new URL(
    process.env.TICKET_SERVICE_INTERNAL_URL || 'http://ticket-service:8085'
  );
  if (!ticketServiceUrl.pathname.endsWith('/')) {
    ticketServiceUrl.pathname += '/';
  }

  const viewingPlanServiceUrl = new URL(
    process.env.VIEWING_PLAN_SERVICE_INTERNAL_URL || 'http://viewing-plan-service:8085'
  );
  if (!viewingPlanServiceUrl.pathname.endsWith('/')) {
    viewingPlanServiceUrl.pathname += '/';
  }

  return {
    publicOrigin,
    issuer,
    internalOidcOrigin,
    clientId: process.env.WEB_BFF_CLIENT_ID || 'kino-web-bff',
    clientSecret: required('WEB_BFF_CLIENT_SECRET'),
    redirectUri: new URL(
      process.env.WEB_BFF_REDIRECT_URI ||
      `${publicOrigin.origin}/api/auth/callback`
    ).href,
    postLogoutRedirectUri: new URL(
      process.env.WEB_BFF_POST_LOGOUT_REDIRECT_URI ||
      `${publicOrigin.origin}/api/auth/logout/callback`
    ).href,
    scopes: process.env.WEB_BFF_SCOPES ||
      'openid profile kino.data.read',
    dataServiceUrl,
    ticketServiceUrl,
    ticketServiceEnabled: process.env.TICKET_SERVICE_ENABLED === 'true',
    ticketServiceTimeoutMs: integer('TICKET_SERVICE_TIMEOUT_MS', '5000'),
    viewingPlanServiceUrl,
    viewingPlanServiceEnabled: process.env.VIEWING_PLAN_SERVICE_ENABLED === 'true',
    viewingPlanServiceTimeoutMs: viewingPlanInteger('VIEWING_PLAN_SERVICE_TIMEOUT_MS', '5000'),
    redis: {
      host: process.env.BFF_REDIS_HOST || 'redis-stack.redis-stack-system',
      port: integer('BFF_REDIS_PORT', '6379'),
      username: process.env.BFF_REDIS_USERNAME || 'default',
      password: required('BFF_REDIS_PASSWORD'),
      database: integer('BFF_REDIS_DATABASE', '3'),
    },
    sessionIdleSeconds: integer('BFF_SESSION_IDLE_SECONDS', '1800'),
    sessionAbsoluteSeconds: integer('BFF_SESSION_ABSOLUTE_SECONDS', '28800'),
    cookieSecure: publicOrigin.protocol === 'https:',
  };
}

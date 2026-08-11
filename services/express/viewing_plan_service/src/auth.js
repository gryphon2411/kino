import { createRemoteJWKSet, jwtVerify } from 'jose';
import { JOSEError, JWKInvalid, JWKSMultipleMatchingKeys, JWKSInvalid, JWKSTimeout } from 'jose/errors';
import { InsufficientScopeError, InvalidTokenError, ServiceUnavailableError } from './errors.js';

function bearerToken(request) {
  const match = /^Bearer\s+(.+)$/i.exec(request.get('authorization') || '');
  if (!match || !match[1].trim()) {
    throw new InvalidTokenError();
  }
  return match[1].trim();
}

function isJwkFailure(error) {
  return error instanceof JWKSTimeout
    || error instanceof JWKSInvalid
    || error instanceof JWKInvalid
    || error instanceof JWKSMultipleMatchingKeys
    || (error instanceof JOSEError && error.code === 'ERR_JOSE_GENERIC')
    || error instanceof TypeError;
}

export function createViewingPlanAuthenticator(config) {
  const jwks = createRemoteJWKSet(new URL(config.authJwkSetUri), {
    timeoutDuration: config.jwkTimeoutMs,
  });
  return async function authenticate(request, requiredScope) {
    try {
      const { payload, protectedHeader } = await jwtVerify(bearerToken(request), jwks, {
        issuer: config.authIssuer,
        audience: config.audience,
        algorithms: ['RS256'],
        clockTolerance: 5,
      });
      if (protectedHeader.typ !== 'at+jwt'
        || typeof payload.sub !== 'string'
        || payload.sub.length > 255
        || !payload.sub.trim()
        || !payload.exp) {
        throw new InvalidTokenError();
      }
      const scopes = new Set(typeof payload.scope === 'string'
        ? payload.scope.split(' ').filter(Boolean)
        : []);
      if (!scopes.has(requiredScope)) {
        throw new InsufficientScopeError(requiredScope);
      }
      return { subject: payload.sub };
    } catch (error) {
      if (error instanceof InvalidTokenError || error instanceof InsufficientScopeError) {
        throw error;
      }
      if (isJwkFailure(error)) {
        throw new ServiceUnavailableError();
      }
      throw new InvalidTokenError();
    }
  };
}

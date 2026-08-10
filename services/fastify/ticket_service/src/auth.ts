import type { FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import {
  JOSEError,
  JWKInvalid,
  JWKSMultipleMatchingKeys,
  JWKSInvalid,
  JWKSTimeout,
} from 'jose/errors';
import type { TicketConfig } from './config.js';
import {
  InsufficientScopeError,
  InvalidTokenError,
  ServiceUnavailableError,
} from './errors.js';

export type TicketUser = {
  subject: string;
};

export type TicketAuthenticator = (
  request: FastifyRequest,
  requiredScope: string
) => Promise<TicketUser>;

function bearerToken(request: FastifyRequest): string {
  const authorization = request.headers.authorization;
  const match = authorization && /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) {
    throw new InvalidTokenError();
  }
  const token = match[1].trim();
  if (!token) {
    throw new InvalidTokenError();
  }
  return token;
}

function scopes(payload: JWTPayload): Set<string> {
  const scope = payload.scope;
  if (typeof scope !== 'string') {
    return new Set();
  }
  return new Set(scope.split(' ').filter(Boolean));
}

function isJwkServiceFailure(error: unknown): boolean {
  return error instanceof JWKSTimeout
    || error instanceof JWKSInvalid
    || error instanceof JWKInvalid
    || error instanceof JWKSMultipleMatchingKeys
    // jose uses its generic error for failed JWKS HTTP responses and JSON parsing.
    || (error instanceof JOSEError && error.code === 'ERR_JOSE_GENERIC')
    // Node fetch reports connection failures from the configured JWKS endpoint as TypeError.
    || error instanceof TypeError;
}

export function createTicketAuthenticator(config: TicketConfig): TicketAuthenticator {
  const jwks = createRemoteJWKSet(new URL(config.authJwkSetUri), {
    // Keep a cold cache or key rotation inside the BFF's end-to-end deadline.
    timeoutDuration: config.jwkTimeoutMs,
  });

  return async function authenticate(
    request: FastifyRequest,
    requiredScope: string
  ): Promise<TicketUser> {
    try {
      const { payload, protectedHeader } = await jwtVerify(bearerToken(request), jwks, {
        issuer: config.authIssuer,
        audience: config.audience,
        algorithms: ['RS256'],
        clockTolerance: 5,
      });
      if (protectedHeader.typ !== 'at+jwt') {
        throw new InvalidTokenError();
      }
      if (!payload.exp || typeof payload.sub !== 'string' || !payload.sub.trim()) {
        throw new InvalidTokenError();
      }
      const grantedScopes = scopes(payload);
      if (!grantedScopes.has(requiredScope)) {
        throw new InsufficientScopeError(requiredScope);
      }
      return { subject: payload.sub };
    } catch (error) {
      if (error instanceof InsufficientScopeError || error instanceof InvalidTokenError) {
        throw error;
      }
      if (isJwkServiceFailure(error)) {
        throw new ServiceUnavailableError();
      }
      throw new InvalidTokenError();
    }
  };
}

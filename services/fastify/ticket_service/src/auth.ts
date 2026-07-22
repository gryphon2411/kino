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
  scopes: Set<string>;
};

declare module 'fastify' {
  interface FastifyRequest {
    ticketUser?: TicketUser;
  }
}

function bearerToken(request: FastifyRequest): string {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    throw new InvalidTokenError();
  }
  const token = authorization.slice('Bearer '.length).trim();
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

export function createTicketAuthenticator(config: TicketConfig) {
  const jwks = createRemoteJWKSet(new URL(config.authJwkSetUri));

  return async function authenticate(
    request: FastifyRequest,
    requiredScope: string
  ): Promise<void> {
    try {
      const { payload } = await jwtVerify(bearerToken(request), jwks, {
        issuer: config.authIssuer,
        audience: config.audience,
        algorithms: ['RS256'],
        clockTolerance: 5,
      });
      if (!payload.exp || typeof payload.sub !== 'string' || !payload.sub.trim()) {
        throw new InvalidTokenError();
      }
      const grantedScopes = scopes(payload);
      if (!grantedScopes.has(requiredScope)) {
        throw new InsufficientScopeError(requiredScope);
      }
      request.ticketUser = { subject: payload.sub, scopes: grantedScopes };
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

import * as oidc from 'openid-client';
import { getBffConfig } from './config';
import { redisClient } from './redis';
import { getOidcConfiguration } from './oidc';

const SESSION_PREFIX = 'kino:bff:session:';
const LOGIN_PREFIX = 'kino:bff:login:';
const REFRESH_LOCK_PREFIX = 'kino:bff:refresh-lock:';
const LOGIN_TTL_SECONDS = 600;
const REFRESH_LOCK_TTL_SECONDS = 10;
const REFRESH_WAIT_ATTEMPTS = 30;
const REFRESH_WAIT_MILLISECONDS = 100;

function sessionKey(sessionId) {
  return `${SESSION_PREFIX}${sessionId}`;
}

function loginKey(state) {
  return `${LOGIN_PREFIX}${state}`;
}

function refreshLockKey(sessionId) {
  return `${REFRESH_LOCK_PREFIX}${sessionId}`;
}

function hasUsableAccessToken(session) {
  return session.accessTokenExpiresAt - Date.now() > 30000;
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export class SessionRefreshError extends Error {}

function isInvalidRefreshToken(error) {
  return error instanceof oidc.ResponseBodyError
    && error.error === 'invalid_grant';
}

export async function createLoginTransaction(returnTo) {
  const redis = await redisClient();
  const transactionId = crypto.randomUUID();
  const state = oidc.randomState();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const nonce = oidc.randomNonce();
  await redis.setEx(loginKey(state), LOGIN_TTL_SECONDS, JSON.stringify({
    transactionId,
    codeVerifier,
    nonce,
    returnTo,
  }));
  return { transactionId, state, codeVerifier, nonce };
}

export async function consumeLoginTransaction(state, transactionId) {
  if (!state || !transactionId) {
    return null;
  }
  const redis = await redisClient();
  const key = loginKey(state);
  const serialized = await redis.get(key);
  if (!serialized) {
    return null;
  }
  const transaction = JSON.parse(serialized);
  if (transaction.transactionId !== transactionId) {
    return null;
  }
  await redis.del(key);
  return transaction;
}

export async function createSession(tokens) {
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('The authorization server did not return the required tokens.');
  }

  const config = getBffConfig();
  const now = Date.now();
  const sessionId = crypto.randomUUID();
  const expiresIn = tokens.expiresIn() || 300;
  const session = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    refreshVersion: crypto.randomUUID(),
    accessTokenExpiresAt: now + expiresIn * 1000,
    absoluteExpiresAt: now + config.sessionAbsoluteSeconds * 1000,
  };

  const redis = await redisClient();
  await redis.setEx(
    sessionKey(sessionId),
    config.sessionIdleSeconds,
    JSON.stringify(session)
  );
  return sessionId;
}

export async function getSession(sessionId) {
  if (!sessionId) {
    return null;
  }
  const redis = await redisClient();
  const serialized = await redis.get(sessionKey(sessionId));
  if (!serialized) {
    return null;
  }

  const session = JSON.parse(serialized);
  if (Date.now() >= session.absoluteExpiresAt) {
    await redis.del(sessionKey(sessionId));
    return null;
  }

  await redis.expire(sessionKey(sessionId), getBffConfig().sessionIdleSeconds);
  return session;
}

export async function accessTokenFor(sessionId, session) {
  if (hasUsableAccessToken(session)) {
    return session.accessToken;
  }

  const redis = await redisClient();
  const lockKey = refreshLockKey(sessionId);
  const lockValue = crypto.randomUUID();
  const lockAcquired = await redis.set(lockKey, lockValue, {
    NX: true,
    EX: REFRESH_LOCK_TTL_SECONDS,
  });

  if (lockAcquired !== 'OK') {
    return accessTokenAfterConcurrentRefresh(sessionId);
  }

  let refreshVersion = session.refreshVersion || session.refreshToken;
  try {
    // A prior request may have refreshed after this request loaded its session
    // but before it acquired the distributed lock.
    const currentSession = await getSession(sessionId);
    if (!currentSession) {
      throw new SessionRefreshError('The BFF session has expired.');
    }
    if (hasUsableAccessToken(currentSession)) {
      return currentSession.accessToken;
    }
    refreshVersion = currentSession.refreshVersion || currentSession.refreshToken;

    const tokens = await oidc.refreshTokenGrant(
      await getOidcConfiguration(),
      currentSession.refreshToken
    );
    if (!tokens.access_token) {
      throw new Error('The authorization server did not return a refreshed access token.');
    }

    const refreshedSession = {
      ...currentSession,
      accessToken: tokens.access_token,
      // Spring Authorization Server rotates this token for the BFF client.
      refreshToken: tokens.refresh_token || currentSession.refreshToken,
      refreshVersion: crypto.randomUUID(),
      accessTokenExpiresAt: Date.now() + (tokens.expiresIn() || 300) * 1000,
    };
    await redis.setEx(
      sessionKey(sessionId),
      getBffConfig().sessionIdleSeconds,
      JSON.stringify(refreshedSession)
    );
    return refreshedSession.accessToken;
  } catch (error) {
    if (error instanceof SessionRefreshError) {
      await redis.del(sessionKey(sessionId));
      throw new SessionRefreshError('Unable to refresh the BFF session.', {
        cause: error,
      });
    }
    if (isInvalidRefreshToken(error)) {
      // A rejected rotating refresh token cannot be safely retried. Deleting
      // is safe only when this request still owns that session version. A
      // slow request can outlive its lock lease after another request already
      // stored the rotated token; in that case use the new access token.
      const invalidated = await deleteSessionIfRefreshVersion(
        sessionId,
        refreshVersion
      );
      if (!invalidated) {
        const refreshedSession = await getSession(sessionId);
        if (refreshedSession && hasUsableAccessToken(refreshedSession)) {
          return refreshedSession.accessToken;
        }
      }
      throw new SessionRefreshError('Unable to refresh the BFF session.', {
        cause: error,
      });
    }
    throw error;
  } finally {
    await redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0",
      { keys: [lockKey], arguments: [lockValue] }
    );
  }
}

async function deleteSessionIfRefreshVersion(sessionId, refreshVersion) {
  const redis = await redisClient();
  return redis.eval(
    "local value = redis.call('get', KEYS[1]); if not value then return 0 end; local session = cjson.decode(value); if (session.refreshVersion or session.refreshToken) == ARGV[1] then return redis.call('del', KEYS[1]) end; return 0",
    { keys: [sessionKey(sessionId)], arguments: [refreshVersion] }
  );
}

async function accessTokenAfterConcurrentRefresh(sessionId) {
  for (let attempt = 0; attempt < REFRESH_WAIT_ATTEMPTS; attempt += 1) {
    await wait(REFRESH_WAIT_MILLISECONDS);
    const refreshedSession = await getSession(sessionId);
    if (!refreshedSession) {
      throw new SessionRefreshError('The BFF session has expired.');
    }
    if (hasUsableAccessToken(refreshedSession)) {
      return refreshedSession.accessToken;
    }
  }

  throw new SessionRefreshError('The BFF session refresh did not complete.');
}

export async function destroySession(sessionId) {
  if (!sessionId) {
    return;
  }

  const redis = await redisClient();
  const serialized = await redis.getDel(sessionKey(sessionId));
  if (!serialized) {
    return;
  }

  const session = JSON.parse(serialized);
  try {
    await oidc.tokenRevocation(
      await getOidcConfiguration(),
      session.refreshToken,
      { token_type_hint: 'refresh_token' }
    );
  } catch {
    // Redis deletion is the local logout guarantee even if the IdP is unavailable.
  }
}

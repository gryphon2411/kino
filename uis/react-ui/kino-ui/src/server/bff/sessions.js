import * as oidc from 'openid-client';
import { getBffConfig } from './config.js';
import { redisClient } from './redis.js';
import { getOidcConfiguration } from './oidc.js';

const SESSION_PREFIX = 'kino:bff:session:';
const LOGIN_PREFIX = 'kino:bff:login:';
const LOGOUT_PREFIX = 'kino:bff:logout:';
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

function logoutKey(state) {
  return `${LOGOUT_PREFIX}${state}`;
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

export async function createLogoutTransaction() {
  const redis = await redisClient();
  const transactionId = crypto.randomUUID();
  const state = oidc.randomState();
  await redis.setEx(logoutKey(state), LOGIN_TTL_SECONDS, JSON.stringify({ transactionId }));
  return { transactionId, state };
}

export async function consumeLoginTransaction(state, transactionId) {
  if (!state || !transactionId) {
    return null;
  }
  return consumeTransaction(loginKey(state), transactionId);
}

export async function consumeLogoutTransaction(state, transactionId) {
  if (!state || !transactionId) {
    return null;
  }
  return consumeTransaction(logoutKey(state), transactionId);
}

async function consumeTransaction(key, transactionId) {
  const redis = await redisClient();
  // GETDEL alone is unsafe here: a callback carrying the wrong cookie must
  // not consume the valid transaction. Validate the cookie-bound transaction
  // id and delete the one-time record in the same Redis operation instead.
  const serialized = await redis.eval(
    "local value = redis.call('get', KEYS[1]); if not value then return false end; local ok, transaction = pcall(cjson.decode, value); if not ok or transaction.transactionId ~= ARGV[1] then return false end; redis.call('del', KEYS[1]); return value",
    { keys: [key], arguments: [transactionId] }
  );
  if (!serialized) {
    return null;
  }
  try {
    return JSON.parse(serialized);
  } catch {
    // A malformed record cannot be a valid login transaction. It retains its
    // short TTL only when no matching transaction id was supplied.
    return null;
  }
}

export async function createSession(tokens) {
  if (!tokens.access_token || !tokens.refresh_token || !tokens.id_token) {
    throw new Error('The authorization server did not return the required OIDC tokens.');
  }

  const config = getBffConfig();
  const now = Date.now();
  const sessionId = crypto.randomUUID();
  const expiresIn = tokens.expiresIn() || 300;
  const session = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    idToken: tokens.id_token,
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
    try {
      await redis.setEx(
        sessionKey(sessionId),
        getBffConfig().sessionIdleSeconds,
        JSON.stringify(refreshedSession)
      );
    } catch (error) {
      // The authorization server has already rotated the old refresh token.
      // Never leave the browser with a session that cannot be refreshed again:
      // best-effort delete it and force a fresh authorization flow instead of
      // returning a misleading transient 502.
      await invalidateSessionBestEffort(sessionId);
      throw new SessionRefreshError(
        'The BFF session could not be saved after refresh and was invalidated.',
        { cause: error }
      );
    }
    return refreshedSession.accessToken;
  } catch (error) {
    if (error instanceof SessionRefreshError) {
      await invalidateSessionBestEffort(sessionId);
      throw new SessionRefreshError('Unable to refresh the BFF session.', {
        cause: error,
      });
    }
    if (isInvalidRefreshToken(error)) {
      // A rejected rotating refresh token cannot be safely retried. Deleting
      // is safe only when this request still owns that session version. A
      // slow request can outlive its lock lease after another request already
      // stored the rotated token; in that case use the new access token.
      try {
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
      } catch {
        // Redis is unavailable, so the local session cannot be trusted. The
        // response below still clears the browser cookie deterministically.
      }
      throw new SessionRefreshError('Unable to refresh the BFF session.', {
        cause: error,
      });
    }
    throw error;
  } finally {
    try {
      await redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0",
        { keys: [lockKey], arguments: [lockValue] }
      );
    } catch {
      // The lock has a short TTL. Do not let an unavailable Redis connection
      // mask the deterministic re-authentication result above.
    }
  }
}

async function invalidateSessionBestEffort(sessionId) {
  try {
    const redis = await redisClient();
    await redis.del(sessionKey(sessionId));
  } catch {
    // If Redis itself is unavailable, the caller still clears the browser
    // cookie. A later retry cannot use the now-rotated refresh token.
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
    return null;
  }

  const redis = await redisClient();
  const serialized = await redis.getDel(sessionKey(sessionId));
  if (!serialized) {
    return null;
  }

  const session = JSON.parse(serialized);
  const logoutTokens = await tokensForLogout(session);
  try {
    await oidc.tokenRevocation(
      await getOidcConfiguration(),
      logoutTokens.refreshToken,
      { token_type_hint: 'refresh_token' }
    );
  } catch {
    // Redis deletion is the local logout guarantee even if the IdP is unavailable.
  }
  return { ...session, idToken: logoutTokens.idToken };
}

async function tokensForLogout(session) {
  if (session.idToken) {
    return { idToken: session.idToken, refreshToken: session.refreshToken };
  }

  try {
    // Sessions created before RP-initiated logout retained only the access and
    // refresh tokens. Spring Authorization Server includes a new ID token in
    // an OpenID Connect refresh response, allowing those short-lived legacy
    // sessions to end the authorization-server browser session as well.
    const tokens = await oidc.refreshTokenGrant(
      await getOidcConfiguration(),
      session.refreshToken
    );
    return {
      idToken: tokens.id_token,
      refreshToken: tokens.refresh_token || session.refreshToken,
    };
  } catch {
    return { idToken: null, refreshToken: session.refreshToken };
  }
}

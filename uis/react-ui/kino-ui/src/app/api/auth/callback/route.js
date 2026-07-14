import * as oidc from 'openid-client';
import { NextResponse } from 'next/server';
import { getBffConfig } from '@/server/bff/config';
import {
  LOGIN_TRANSACTION_COOKIE,
  sessionCookieOptions,
} from '@/server/bff/http';
import { getOidcConfiguration } from '@/server/bff/oidc';
import {
  consumeLoginTransaction,
  createSession,
} from '@/server/bff/sessions';

export const runtime = 'nodejs';

function callbackErrorCode(error) {
  if (error instanceof oidc.ResponseBodyError) {
    return error.error;
  }

  return error instanceof Error ? error.message : 'Unknown error';
}

export async function GET(request) {
  const requestUrl = new URL(request.url);
  // The internal pod address is not necessarily the registered redirect URI.
  // Redeem the authorization code with the configured public callback URL.
  const callbackUrl = new URL(
    `${requestUrl.pathname}${requestUrl.search}`,
    getBffConfig().publicOrigin
  );
  const state = callbackUrl.searchParams.get('state');
  const transaction = await consumeLoginTransaction(
    state,
    request.cookies.get(LOGIN_TRANSACTION_COOKIE)?.value
  );
  if (!transaction) {
    return loginErrorResponse('invalid_request');
  }

  try {
    const tokens = await oidc.authorizationCodeGrant(
      await getOidcConfiguration(),
      callbackUrl,
      {
        pkceCodeVerifier: transaction.codeVerifier,
        expectedState: state,
        expectedNonce: transaction.nonce,
      }
    );
    const sessionId = await createSession(tokens);
    const response = NextResponse.redirect(
      new URL(transaction.returnTo, getBffConfig().publicOrigin)
    );
    response.cookies.set({
      ...sessionCookieOptions(),
      name: 'kino_bff_session',
      value: sessionId,
    });
    clearLoginTransactionCookie(response);
    return response;
  } catch (error) {
    console.error(
      'OIDC BFF callback failed:',
      callbackErrorCode(error)
    );
    return loginErrorResponse('authentication_failed');
  }
}

function loginErrorResponse(error) {
  const response = NextResponse.redirect(
    new URL(`/login?error=${error}`, getBffConfig().publicOrigin)
  );
  clearLoginTransactionCookie(response);
  return response;
}

function clearLoginTransactionCookie(response) {
  response.cookies.set({
    ...sessionCookieOptions(),
    name: LOGIN_TRANSACTION_COOKIE,
    value: '',
    maxAge: 0,
  });
}

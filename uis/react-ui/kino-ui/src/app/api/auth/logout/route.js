import { NextResponse } from 'next/server';
import { getBffConfig } from '@/server/bff/config';
import {
  hasExactSameOrigin,
  LOGOUT_TRANSACTION_COOKIE,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '@/server/bff/http';
import { endSessionUrl } from '@/server/bff/oidc';
import { createLogoutTransaction, destroySession } from '@/server/bff/sessions';

export const runtime = 'nodejs';

export async function POST(request) {
  if (!hasExactSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }

  const config = getBffConfig();
  const session = await destroySession(request.cookies.get(SESSION_COOKIE)?.value);
  let logoutUrl = new URL('/', config.publicOrigin).href;
  let transaction;
  if (session?.idToken) {
    try {
      transaction = await createLogoutTransaction();
      logoutUrl = await endSessionUrl(transaction, session.idToken);
    } catch (error) {
      // Local session deletion and refresh-token revocation remain a safe
      // logout result if the authorization server cannot start its browser
      // session logout flow.
      console.error('OIDC end-session initiation failed:', error);
    }
  }

  const response = NextResponse.json({ logoutUrl }, {
    headers: { 'Cache-Control': 'no-store' },
  });
  response.cookies.set({
    ...sessionCookieOptions(),
    name: SESSION_COOKIE,
    value: '',
    maxAge: 0,
  });
  if (transaction) {
    response.cookies.set({
      ...sessionCookieOptions(),
      name: LOGOUT_TRANSACTION_COOKIE,
      value: transaction.transactionId,
      maxAge: 600,
    });
  }
  return response;
}

import { NextResponse } from 'next/server';
import { getBffConfig } from '@/server/bff/config';
import {
  LOGOUT_TRANSACTION_COOKIE,
  sessionCookieOptions,
} from '@/server/bff/http';
import { consumeLogoutTransaction } from '@/server/bff/sessions';

export const runtime = 'nodejs';

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const transaction = await consumeLogoutTransaction(
    requestUrl.searchParams.get('state'),
    request.cookies.get(LOGOUT_TRANSACTION_COOKIE)?.value
  );
  const response = NextResponse.redirect(new URL('/', getBffConfig().publicOrigin));
  response.headers.set('Cache-Control', 'no-store');
  response.cookies.set({
    ...sessionCookieOptions(),
    name: LOGOUT_TRANSACTION_COOKIE,
    value: '',
    maxAge: 0,
  });
  if (!transaction) {
    console.warn('Rejected OIDC logout callback with an invalid state.');
  }
  return response;
}

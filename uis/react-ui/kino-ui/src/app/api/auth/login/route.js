import { NextResponse } from 'next/server';
import { authorizationUrl } from '@/server/bff/oidc';
import { createLoginTransaction } from '@/server/bff/sessions';
import {
  LOGIN_TRANSACTION_COOKIE,
  safeReturnTo,
  sessionCookieOptions,
} from '@/server/bff/http';

export const runtime = 'nodejs';

export async function GET(request) {
  const returnTo = safeReturnTo(
    new URL(request.url).searchParams.get('returnTo')
  );
  const transaction = await createLoginTransaction(returnTo);
  const response = NextResponse.redirect(await authorizationUrl(transaction));
  response.cookies.set({
    ...sessionCookieOptions(),
    name: LOGIN_TRANSACTION_COOKIE,
    value: transaction.transactionId,
    maxAge: 600,
  });
  return response;
}

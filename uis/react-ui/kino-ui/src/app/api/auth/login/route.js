import { NextResponse } from 'next/server';
import { authorizationUrl } from '@/server/bff/oidc';
import { createLoginTransaction } from '@/server/bff/sessions';
import {
  hasExactSameOrigin,
  LOGIN_TRANSACTION_COOKIE,
  safeReturnTo,
  sessionCookieOptions,
} from '@/server/bff/http';

export const runtime = 'nodejs';

export async function POST(request) {
  if (!hasExactSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }

  const returnTo = safeReturnTo(
    new URL(request.url).searchParams.get('returnTo')
  );
  const transaction = await createLoginTransaction(returnTo);
  const response = NextResponse.json({
    authorizationUrl: await authorizationUrl(transaction),
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
  response.cookies.set({
    ...sessionCookieOptions(),
    name: LOGIN_TRANSACTION_COOKIE,
    value: transaction.transactionId,
    maxAge: 600,
  });
  return response;
}

export function GET() {
  return NextResponse.json(
    { error: 'Use POST to initiate login.' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}

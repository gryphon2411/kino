import { NextResponse } from 'next/server';
import {
  hasExactSameOrigin,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '@/server/bff/http';
import { destroySession } from '@/server/bff/sessions';

export const runtime = 'nodejs';

export async function POST(request) {
  if (!hasExactSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }

  await destroySession(request.cookies.get(SESSION_COOKIE)?.value);
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set({
    ...sessionCookieOptions(),
    name: SESSION_COOKIE,
    value: '',
    maxAge: 0,
  });
  return response;
}

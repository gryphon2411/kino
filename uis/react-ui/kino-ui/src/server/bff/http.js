import { NextResponse } from 'next/server.js';
import { getBffConfig } from './config.js';

export const SESSION_COOKIE = 'kino_bff_session';
export const LOGIN_TRANSACTION_COOKIE = 'kino_bff_login';
export const LOGOUT_TRANSACTION_COOKIE = 'kino_bff_logout';

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: getBffConfig().cookieSecure,
    path: '/',
  };
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: 'Authentication is required.' }, {
    status: 401,
  });
}

export function expiredSessionResponse() {
  const response = unauthorizedResponse();
  response.cookies.set(SESSION_COOKIE, '', {
    ...sessionCookieOptions(),
    maxAge: 0,
  });
  return response;
}

export function hasExactSameOrigin(request) {
  const origin = request.headers.get('origin');
  return origin === getBffConfig().publicOrigin.origin;
}

export function safeReturnTo(value) {
  if (!value) {
    return '/';
  }

  try {
    const publicOrigin = getBffConfig().publicOrigin;
    const resolved = new URL(value, publicOrigin);
    if (resolved.origin !== publicOrigin.origin) {
      return '/';
    }
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return '/';
  }
}

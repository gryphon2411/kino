import { NextResponse } from 'next/server';
import { getBffConfig } from '@/server/bff/config';
import {
  expiredSessionResponse,
  SESSION_COOKIE,
  unauthorizedResponse,
} from '@/server/bff/http';
import {
  accessTokenFor,
  getSession,
  SessionRefreshError,
} from '@/server/bff/sessions';

export const runtime = 'nodejs';

const ALLOWED_QUERY_PARAMETERS = ['page', 'size', 'freeText'];

export async function GET(request) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await getSession(sessionId);
  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const requestUrl = new URL(request.url);
    const upstreamUrl = new URL('titles', getBffConfig().dataServiceUrl);
    for (const parameter of ALLOWED_QUERY_PARAMETERS) {
      const value = requestUrl.searchParams.get(parameter);
      if (value !== null) {
        upstreamUrl.searchParams.set(parameter, value);
      }
    }
    const upstream = await fetch(upstreamUrl, {
      headers: {
        Authorization: `Bearer ${await accessTokenFor(sessionId, session)}`,
      },
      cache: 'no-store',
    });
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (error) {
    if (error instanceof SessionRefreshError) {
      return expiredSessionResponse();
    }
    return NextResponse.json({ error: 'Unable to load titles.' }, { status: 502 });
  }
}

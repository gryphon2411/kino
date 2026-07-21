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

export async function GET(request, { params }) {
  if (!/^tt\d+$/.test(params.id)) {
    return NextResponse.json({ error: 'Invalid title identifier.' }, { status: 400 });
  }

  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await getSession(sessionId);
  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const upstreamUrl = new URL(
      `titles/${encodeURIComponent(params.id)}`,
      getBffConfig().dataServiceUrl
    );
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
    return NextResponse.json({ error: 'Unable to load the title.' }, { status: 502 });
  }
}

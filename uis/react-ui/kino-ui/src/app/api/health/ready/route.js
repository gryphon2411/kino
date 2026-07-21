import { NextResponse } from 'next/server';
import { redisClient } from '@/server/bff/redis';
import { getOidcConfiguration } from '@/server/bff/oidc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The UI cannot serve an authenticated BFF request without its session store
// and authorization-server discovery. This intentionally does not attempt a
// token grant: the BFF client is restricted to user Authorization Code flows.
export async function GET() {
  try {
    const redis = await redisClient();
    await Promise.all([
      redis.ping(),
      getOidcConfiguration(),
    ]);
    return NextResponse.json({ status: 'ok' }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ status: 'unavailable' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}

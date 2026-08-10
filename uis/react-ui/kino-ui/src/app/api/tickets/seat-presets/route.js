import { hasExactSameOrigin } from '@/server/bff/http';
import { readTextWithinLimit } from '@/server/bff/request-body.mjs';
import { ticketNoStoreJson, ticketProxy } from '@/server/bff/tickets';

export const runtime = 'nodejs';

const MAXIMUM_SEAT_PRESET_REQUEST_BYTES = 1024;

export async function GET(request) {
  return ticketProxy(request, 'v1/seat-presets');
}

export async function POST(request) {
  if (!hasExactSameOrigin(request)) {
    return ticketNoStoreJson({ error: 'Invalid request origin.' }, 403);
  }
  return ticketProxy(request, 'v1/seat-presets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // ticketProxy invokes this only after it has found the BFF session.
    body: () => readTextWithinLimit(
      request.body,
      request.headers.get('content-length'),
      MAXIMUM_SEAT_PRESET_REQUEST_BYTES
    ),
  });
}

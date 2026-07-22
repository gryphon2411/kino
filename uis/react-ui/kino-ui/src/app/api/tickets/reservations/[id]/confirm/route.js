import { hasExactSameOrigin } from '@/server/bff/http';
import { ticketNoStoreJson, ticketProxy } from '@/server/bff/tickets';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
  if (!hasExactSameOrigin(request)) {
    return ticketNoStoreJson({ error: 'Invalid request origin.' }, 403);
  }
  return ticketProxy(
    request,
    `v1/reservations/${encodeURIComponent(params.id)}/confirm`,
    { method: 'POST' }
  );
}

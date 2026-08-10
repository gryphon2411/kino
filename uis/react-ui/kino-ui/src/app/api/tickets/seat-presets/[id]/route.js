import { hasExactSameOrigin } from '@/server/bff/http';
import { ticketNoStoreJson, ticketProxy } from '@/server/bff/tickets';

export const runtime = 'nodejs';

export async function DELETE(request, { params }) {
  if (!hasExactSameOrigin(request)) {
    return ticketNoStoreJson({ error: 'Invalid request origin.' }, 403);
  }
  return ticketProxy(
    request,
    `v1/seat-presets/${encodeURIComponent(params.id)}`,
    { method: 'DELETE' }
  );
}

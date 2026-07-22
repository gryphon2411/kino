import { ticketProxy } from '@/server/bff/tickets';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  return ticketProxy(
    request,
    `v1/screenings/${encodeURIComponent(params.id)}/seats`
  );
}

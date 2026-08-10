import { ticketNoStoreJson, ticketProxy } from '@/server/bff/tickets';

export const runtime = 'nodejs';

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const titleId = requestUrl.searchParams.get('titleId');
  if (!titleId) {
    return ticketNoStoreJson({ error: 'titleId is required.' }, 400);
  }
  return ticketProxy(
    request,
    `v1/screenings?titleId=${encodeURIComponent(titleId)}`
  );
}

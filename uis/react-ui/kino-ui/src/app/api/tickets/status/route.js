import { ticketNoStoreJson, ticketServiceEnabled } from '@/server/bff/tickets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return ticketNoStoreJson({ enabled: ticketServiceEnabled() }, 200);
}

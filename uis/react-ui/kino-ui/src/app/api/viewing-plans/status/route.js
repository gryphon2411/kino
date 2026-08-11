import { viewingPlanNoStoreJson, viewingPlanServiceEnabled } from '@/server/bff/viewing-plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return viewingPlanNoStoreJson({ enabled: viewingPlanServiceEnabled() }, 200);
}

import { viewingPlanList } from '@/server/bff/viewing-plans';

export const runtime = 'nodejs';

export async function GET(request) {
  return viewingPlanList(request);
}

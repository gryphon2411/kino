import { hasExactSameOrigin } from '@/server/bff/http';
import { viewingPlanNoStoreJson, viewingPlanProxy } from '@/server/bff/viewing-plans';

export const runtime = 'nodejs';

function validId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request, { params }) {
  if (!validId(params.id)) {
    return viewingPlanNoStoreJson({ error: 'Invalid request.' }, 400);
  }
  if (!hasExactSameOrigin(request)) {
    return viewingPlanNoStoreJson({ error: 'Invalid request origin.' }, 403);
  }
  return viewingPlanProxy(request, `v1/viewing-plans/${encodeURIComponent(params.id)}/reopen`, { method: 'POST' });
}

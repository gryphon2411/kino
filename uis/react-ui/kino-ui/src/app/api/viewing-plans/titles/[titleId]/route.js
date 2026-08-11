import { hasExactSameOrigin } from '@/server/bff/http';
import { readTextWithinLimit } from '@/server/bff/request-body.mjs';
import {
  InvalidViewingPlanBodyError,
  viewingPlanNoStoreJson,
  viewingPlanProxy,
} from '@/server/bff/viewing-plans';

export const runtime = 'nodejs';
const MAXIMUM_VIEWING_PLAN_REQUEST_BYTES = 1024;

function validTitleId(value) {
  return /^tt\d{1,30}$/.test(value);
}

function titlePath(params) {
  return `v1/viewing-plans/titles/${encodeURIComponent(params.titleId)}`;
}

export async function GET(request, { params }) {
  if (!validTitleId(params.titleId)) {
    return viewingPlanNoStoreJson({ error: 'Invalid request.' }, 400);
  }
  return viewingPlanProxy(request, titlePath(params));
}

export async function PUT(request, { params }) {
  if (!validTitleId(params.titleId)) {
    return viewingPlanNoStoreJson({ error: 'Invalid request.' }, 400);
  }
  if (!hasExactSameOrigin(request)) {
    return viewingPlanNoStoreJson({ error: 'Invalid request origin.' }, 403);
  }
  return viewingPlanProxy(request, titlePath(params), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: async () => {
      const contentType = request.headers.get('content-type');
      if (!contentType || !/^application\/json(?:\s*;\s*charset=[^;\s]+)?$/i.test(contentType)) {
        throw new InvalidViewingPlanBodyError();
      }
      return readTextWithinLimit(
        request.body,
        request.headers.get('content-length'),
        MAXIMUM_VIEWING_PLAN_REQUEST_BYTES
      );
    },
  });
}

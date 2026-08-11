import assert from 'node:assert/strict';
import test from 'node:test';

const { initialViewingPlanState, viewingPlanReducer } = await import(
  '../../src/app/viewing-plans/viewing-plan-state.js'
);

test('Viewing Plans state resets pagination and pending mutations predictably', () => {
  const selected = viewingPlanReducer(initialViewingPlanState, {
    type: 'load', status: 'DONE', page: 0,
  });
  assert.equal(selected.status, 'DONE');
  assert.equal(selected.loading, true);

  const pending = viewingPlanReducer(selected, { type: 'pending', id: 'plan-1' });
  assert.equal(pending.pending['plan-1'], true);

  const settled = viewingPlanReducer(pending, { type: 'settled', id: 'plan-1' });
  assert.deepEqual(settled.pending, {});
});

test('Viewing Plans state ignores a stale response', () => {
  const loading = viewingPlanReducer(initialViewingPlanState, {
    type: 'load', status: 'OPEN', page: 1, requestId: 2,
  });
  const stale = viewingPlanReducer(loading, {
    type: 'loaded', requestId: 1, items: [{ plan: { id: 'stale' } }], hasNext: false,
  });
  assert.equal(stale, loading);

  const current = viewingPlanReducer(loading, {
    type: 'loaded', requestId: 2, items: [{ plan: { id: 'current' } }], hasNext: true,
  });
  assert.equal(current.items[0].plan.id, 'current');
  assert.equal(current.hasNext, true);
});

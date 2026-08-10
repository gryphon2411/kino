import assert from 'node:assert/strict';
import test from 'node:test';
import { refreshAfterWriteFailure } from '../../src/app/tickets/[id]/ticket-page-actions.js';

test('a write failure remains visible while the ticket view refreshes', async () => {
  const calls = [];
  await refreshAfterWriteFailure(
    new Error('Seat A1 was just taken.'),
    'Unable to hold the selected seats.',
    (message) => calls.push(['error', message]),
    async (options) => calls.push(['refresh', options])
  );

  assert.deepEqual(calls, [
    ['error', 'Seat A1 was just taken.'],
    ['refresh', { preserveError: true }],
  ]);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { seatPresetCompatibility } from '../../src/app/tickets/[id]/seat-preset-compatibility.js';

const availableSeats = [
  { code: 'A1', status: 'AVAILABLE' },
  { code: 'A2', status: 'AVAILABLE' },
  { code: 'A3', status: 'HELD' },
];

test('saved seat group compatibility accepts only entirely available seats', () => {
  assert.deepEqual(
    seatPresetCompatibility(['A1', 'A2'], availableSeats),
    { compatible: true }
  );
});

test('saved seat group compatibility rejects unavailable and missing seats without partial results', () => {
  assert.deepEqual(
    seatPresetCompatibility(['A1', 'A3'], availableSeats),
    {
      compatible: false,
      message: 'Seat A3 is no longer available.',
    }
  );
  assert.deepEqual(
    seatPresetCompatibility(['A1', 'D1'], availableSeats),
    {
      compatible: false,
      message: 'Seat D1 is not part of this seating map.',
    }
  );
});

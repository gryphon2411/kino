import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const baseUrl = (__ENV.KINO_E2E_BASE_URL || '').replace(/\/$/, '');
const session = open(__ENV.KINO_BFF_SESSION_FILE).trim();
const screeningId = '00000000-0000-0000-0000-000000000001';

if (!baseUrl || !session) {
  throw new Error('KINO_E2E_BASE_URL and KINO_BFF_SESSION_FILE are required.');
}

const readLatency = new Trend('ticket_bff_read_latency', true);
const unexpectedResponses = new Rate('ticket_bff_unexpected_responses');
const serverErrors = new Counter('ticket_bff_server_errors');
const contentionSuccess = new Counter('ticket_bff_contention_success');
const contentionConflicts = new Counter('ticket_bff_contention_conflicts');

export const options = {
  scenarios: {
    read_saturation: {
      executor: 'constant-arrival-rate',
      exec: 'readSeats',
      rate: 40,
      timeUnit: '1s',
      duration: '3m',
      preAllocatedVUs: 10,
      maxVUs: 40,
      gracefulStop: '15s',
    },
    same_seat_contention: {
      executor: 'per-vu-iterations',
      exec: 'holdSameSeat',
      startTime: '3m15s',
      vus: 25,
      iterations: 1,
      maxDuration: '30s',
    },
  },
  thresholds: {
    ticket_bff_read_latency: ['p(95)<2000'],
    ticket_bff_unexpected_responses: ['rate==0'],
    ticket_bff_server_errors: ['count==0'],
    ticket_bff_contention_success: ['count==1'],
    ticket_bff_contention_conflicts: ['count==24'],
  },
};

function requestParams(method = 'GET') {
  return {
    headers: {
      Cookie: `kino_bff_session=${session}`,
      ...(method === 'POST' ? {
        Origin: baseUrl,
        'Content-Type': 'application/json',
      } : {}),
    },
    tags: { name: 'ticket_bff' },
  };
}

function recordUnexpected(response, expectedStatuses) {
  const expected = expectedStatuses.includes(response.status);
  unexpectedResponses.add(!expected);
  if (response.status >= 500) {
    serverErrors.add(1);
  }
  return expected;
}

export function setup() {
  const screenings = http.get(
    `${baseUrl}/api/tickets/screenings?titleId=tt0000001`,
    requestParams()
  );
  if (!recordUnexpected(screenings, [200])) {
    throw new Error(`Ticket screening preflight returned ${screenings.status}.`);
  }

  const seats = http.get(
    `${baseUrl}/api/tickets/screenings/${screeningId}/seats`,
    requestParams()
  );
  if (!recordUnexpected(seats, [200])) {
    throw new Error(`Ticket seat preflight returned ${seats.status}.`);
  }
  const a1 = seats.json('seats').filter((seat) => seat.code === 'A1')[0];
  if (!a1 || a1.status !== 'AVAILABLE') {
    throw new Error('A1 must be available in a fresh ticket deployment before the contention test.');
  }
  return { screeningId };
}

export function readSeats(data) {
  const response = http.get(
    `${baseUrl}/api/tickets/screenings/${data.screeningId}/seats`,
    requestParams()
  );
  readLatency.add(response.timings.duration);
  check(response, { 'seat read is successful': (value) => value.status === 200 });
  recordUnexpected(response, [200]);
}

export function holdSameSeat(data) {
  const response = http.post(
    `${baseUrl}/api/tickets/screenings/${data.screeningId}/holds`,
    JSON.stringify({ seatCodes: ['A1'] }),
    requestParams('POST')
  );
  check(response, {
    'contention result is success or conflict': (value) => [200, 409].includes(value.status),
  });
  recordUnexpected(response, [200, 409]);
  if (response.status === 200) {
    contentionSuccess.add(1);
  }
  if (response.status === 409) {
    contentionConflicts.add(1);
  }
}

export function teardown() {
  const response = http.post(
    `${baseUrl}/api/auth/logout`,
    null,
    requestParams('POST')
  );
  if (!recordUnexpected(response, [204])) {
    throw new Error(`BFF logout cleanup returned ${response.status}.`);
  }
}

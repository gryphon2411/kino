import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readTextWithinLimit,
  RequestBodyTooLargeError,
} from '../../src/server/bff/request-body.mjs';

function bodyFromChunks(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });
}

test('ticket hold body reader accepts a bounded streamed JSON body', async () => {
  const body = bodyFromChunks(['{"seat', 'Codes":["A1"]}']);
  assert.equal(
    await readTextWithinLimit(body, null, 1024),
    '{"seatCodes":["A1"]}'
  );
});

test('ticket hold body reader rejects oversized declared and chunked bodies', async () => {
  await assert.rejects(
    readTextWithinLimit(bodyFromChunks(['{}']), '1025', 1024),
    RequestBodyTooLargeError
  );
  await assert.rejects(
    readTextWithinLimit(bodyFromChunks(['1234', '5678']), null, 4),
    RequestBodyTooLargeError
  );
});

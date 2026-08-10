import { Pool, type PoolClient } from 'pg';
import type { TicketConfig } from './config.js';

export type TicketDatabase = Pick<Pool, 'connect' | 'query' | 'end'>;
export type TransactionTimeouts = Pick<
  TicketConfig,
  'lockTimeoutMs' | 'statementTimeoutMs' | 'transactionTimeoutMs'
>;

export class OperationAbortedError extends Error {
  constructor() {
    super('Ticket allocation operation was aborted.');
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new OperationAbortedError();
  }
}

export function createTicketDatabase(config: TicketConfig): Pool {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    connectionTimeoutMillis: config.databaseConnectionTimeoutMs,
    statement_timeout: config.statementTimeoutMs,
  });
  pool.on('error', (error) => {
    process.stderr.write(`ticket database idle client error: ${error.message}\n`);
  });
  return pool;
}

export async function withTransaction<T>(
  database: TicketDatabase,
  timeouts: TransactionTimeouts,
  work: (client: PoolClient) => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  const client = await database.connect();
  let clientError: Error | undefined;
  const rememberClientError = (error: Error) => {
    clientError ??= error;
  };
  client.on('error', rememberClientError);
  try {
    throwIfAborted(signal);
    await client.query('BEGIN');
    await client.query(`SET LOCAL lock_timeout = '${timeouts.lockTimeoutMs}ms'`);
    await client.query(`SET LOCAL statement_timeout = '${timeouts.statementTimeoutMs}ms'`);
    await client.query(`SET LOCAL transaction_timeout = '${timeouts.transactionTimeoutMs}ms'`);
    const result = await work(client);
    // Cancellation is cooperative. PostgreSQL queries already in flight
    // remain bounded by the transaction timeouts above; callers may opt in
    // only when they have a signal that represents a real cancellation.
    throwIfAborted(signal);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // The original allocation failure is more useful than a rollback failure.
    }
    throw clientError ?? error;
  } finally {
    client.off('error', rememberClientError);
    client.release(clientError);
  }
}

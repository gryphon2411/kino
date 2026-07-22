import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import type { TicketConfig } from './config.js';

export type TicketDatabase = Pick<Pool, 'connect' | 'query' | 'end'>;

export function createTicketDatabase(config: TicketConfig): TicketDatabase {
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
  lockTimeoutMs: number,
  statementTimeoutMs: number,
  transactionTimeoutMs: number,
  work: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await database.connect();
  let clientError: Error | undefined;
  const rememberClientError = (error: Error) => {
    clientError ??= error;
  };
  client.on('error', rememberClientError);
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL lock_timeout = '${lockTimeoutMs}ms'`);
    await client.query(`SET LOCAL statement_timeout = '${statementTimeoutMs}ms'`);
    await client.query(`SET LOCAL transaction_timeout = '${transactionTimeoutMs}ms'`);
    const result = await work(client);
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

export function rows<T extends QueryResultRow>(result: { rows: T[] }): T[] {
  return result.rows;
}

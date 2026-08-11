import { Pool } from 'pg';

export function createViewingPlanDatabase(config) {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    connectionTimeoutMillis: config.databaseConnectionTimeoutMs,
    statement_timeout: config.statementTimeoutMs,
  });
  pool.on('error', (error) => {
    process.stderr.write(`viewing plan database idle client error: ${error.message}\n`);
  });
  return pool;
}

export function isRetryableDatabaseError(error) {
  const code = error?.code;
  return ['55P03', '40P01', '57014', '57P01', '40001', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND'].includes(code)
    || (error instanceof Error && [
      'Query read timeout',
      'timeout exceeded when trying to connect',
      'Connection terminated unexpectedly',
    ].includes(error.message));
}

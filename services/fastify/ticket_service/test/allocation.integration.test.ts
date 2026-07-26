import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { Pool } from 'pg';
import { GenericContainer, Wait } from 'testcontainers';
import {
  createTicketDatabase,
  OperationAbortedError,
  withTransaction,
} from '../src/database.js';
import { BadRequestError, ConflictError } from '../src/errors.js';
import { TicketService } from '../src/tickets.js';
import { ticketTestConfig } from './support/config.js';

const integrationTest = process.env.RUN_POSTGRES_INTEGRATION_TESTS === 'true'
  ? test
  : test.skip;

integrationTest('allocation serializes overlap, lazily reclaims expiry, and protects runtime privileges', async () => {
  const container = await new GenericContainer('postgres:17-alpine')
    .withEnvironment({
      POSTGRES_DB: 'kino_ticket',
      POSTGRES_PASSWORD: 'test-password',
    })
    .withExposedPorts(5432)
    // The official image announces readiness once during initialization and
    // once after its final post-init restart.
    .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 2))
    .start();
  const connectionString = `postgresql://postgres:test-password@${container.getHost()}:${container.getMappedPort(5432)}/kino_ticket`;
  const pool = new Pool({ connectionString });
  let runtimePool: Pool | undefined;
  try {
    await pool.query('CREATE ROLE kino_ticket_runtime NOLOGIN');
    await pool.query('CREATE SCHEMA kino_ticket');
    await pool.query('GRANT USAGE ON SCHEMA kino_ticket TO kino_ticket_runtime');
    await pool.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    const migrationDirectory = resolve(
      import.meta.dirname,
      '../../../../orchestrators/k8s/terraform/ticket-db-migrations'
    );
    for (const migrationName of [
      'V1__ticket_allocation_lab.sql',
      'V2__rename_screening.sql',
      'V3__seed_ticket_showtimes.sql',
      'V4__add_alternate_ticket_seating.sql',
    ]) {
      await pool.query(await readFile(resolve(migrationDirectory, migrationName), 'utf8'));
    }
    await pool.query('CREATE TABLE kino_ticket.flyway_schema_history (installed_rank integer)');
    const config = ticketTestConfig({
      databaseUrl: connectionString,
    });
    const tickets = new TicketService(pool, config);
    const boundedDatabase = createTicketDatabase({
      ...config,
      databaseConnectionTimeoutMs: 100,
      lockTimeoutMs: 50,
      statementTimeoutMs: 200,
    });
    try {
      await assert.rejects(
        boundedDatabase.query('SELECT pg_sleep(0.5)'),
        (error: unknown) => (error as { code?: string }).code === '57014'
      );
      assert.equal((await boundedDatabase.query('SELECT 1 AS value')).rows[0].value, 1);
    } finally {
      await boundedDatabase.end();
    }
    const transactionBoundedDatabase = createTicketDatabase({
      ...config,
      databaseConnectionTimeoutMs: 100,
      lockTimeoutMs: 50,
      statementTimeoutMs: 500,
      transactionTimeoutMs: 200,
    });
    try {
      await assert.rejects(
        withTransaction(
          transactionBoundedDatabase,
          {
            lockTimeoutMs: 50,
            statementTimeoutMs: 500,
            transactionTimeoutMs: 200,
          },
          async (client) => {
            await client.query('SELECT pg_sleep(0.15)');
            return client.query('SELECT pg_sleep(0.15)');
          }
        ),
        (error: unknown) => {
          const databaseError = error as { code?: string; message?: string };
          return databaseError.code === '57P01'
            || /transaction timeout|connection terminated/i.test(databaseError.message || '');
        }
      );
    } finally {
      await transactionBoundedDatabase.end();
    }
    const cancellationController = new AbortController();
    await assert.rejects(
      withTransaction(
        pool,
        config,
        async (client) => {
          await client.query('CREATE TABLE kino_ticket.transaction_abort_probe (id integer)');
          cancellationController.abort();
        },
        cancellationController.signal
      ),
      OperationAbortedError
    );
    const abortedTable = await pool.query<{ table_name: string | null }>(
      "SELECT to_regclass('kino_ticket.transaction_abort_probe') AS table_name"
    );
    assert.equal(abortedTable.rows[0].table_name, null);
    const screeningId = '00000000-0000-0000-0000-000000000001';
    const secondScreeningId = '00000000-0000-0000-0000-000000000002';
    const alternateScreeningId = '00000000-0000-0000-0000-000000000007';
    const seededScreenings = await pool.query<{
      id: string;
      title_id: string;
      label: string;
    }>(
      `SELECT id::text, title_id, label
         FROM kino_ticket.screenings
        ORDER BY title_id, starts_at`
    );
    assert.equal(seededScreenings.rowCount, 7);
    assert.deepEqual(
      (await tickets.screenings('tt0000001')).map((screening) => screening.id),
      [screeningId, secondScreeningId, alternateScreeningId]
    );
    assert.deepEqual(
      (await tickets.screenings('tt0000002')).map((screening) => screening.id),
      [
        '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000004',
      ]
    );
    assert.deepEqual(
      (await tickets.screenings('tt0000003')).map((screening) => screening.id),
      [
        '00000000-0000-0000-0000-000000000005',
        '00000000-0000-0000-0000-000000000006',
      ]
    );
    assert.ok(seededScreenings.rows.every((screening) => screening.label === 'Kino allocation'));
    const seatCounts = await pool.query<{ seat_count: number }>(
      `SELECT count(*)::integer AS seat_count
         FROM kino_ticket.screening_seats
        GROUP BY screening_id`
    );
    assert.equal(seatCounts.rowCount, 7);
    assert.deepEqual(
      seatCounts.rows.map((screening) => screening.seat_count).sort((left, right) => left - right),
      [15, 15, 15, 15, 15, 15, 20]
    );

    const [firstScreeningHold, secondScreeningHold] = await Promise.all([
      tickets.hold(screeningId, 'subject-one', ['A5']),
      tickets.hold(secondScreeningId, 'subject-two', ['A5']),
    ]);
    assert.deepEqual(firstScreeningHold.seatCodes, ['A5']);
    assert.deepEqual(secondScreeningHold.seatCodes, ['A5']);

    const alternateScreeningHold = await tickets.hold(
      alternateScreeningId,
      'subject-three',
      ['D1']
    );
    assert.deepEqual(alternateScreeningHold.seatCodes, ['D1']);
    await assert.rejects(
      tickets.hold(screeningId, 'subject-three', ['D1']),
      (error: unknown) => error instanceof BadRequestError && error.code === 'unknown_seat'
    );

    const allocations = await Promise.allSettled([
      tickets.hold(screeningId, 'subject-one', ['A1', 'A2']),
      tickets.hold(screeningId, 'subject-two', ['A2', 'A3']),
    ]);

    assert.equal(allocations.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(allocations.filter((result) => result.status === 'rejected').length, 1);

    const expiring = await tickets.hold(screeningId, 'subject-one', ['B1']);
    await pool.query(
      `UPDATE kino_ticket.reservations
          SET hold_expires_at = clock_timestamp() - interval '1 second'
        WHERE id = $1`,
      [expiring.id]
    );
    const reclaimed = await tickets.hold(screeningId, 'subject-two', ['B1']);
    assert.equal(reclaimed.state, 'HELD');
    await assert.rejects(
      tickets.confirm(expiring.id, 'subject-one'),
      (error: unknown) => error instanceof ConflictError && error.code === 'hold_expired'
    );

    const confirmed = await tickets.hold(screeningId, 'subject-three', ['C1']);
    const firstConfirmation = await tickets.confirm(confirmed.id, 'subject-three');
    const repeatedConfirmation = await tickets.confirm(confirmed.id, 'subject-three');
    assert.equal(firstConfirmation.state, 'CONFIRMED');
    assert.equal(repeatedConfirmation.state, 'CONFIRMED');

    await pool.query("ALTER ROLE kino_ticket_runtime LOGIN PASSWORD 'runtime-password'");
    runtimePool = new Pool({
      connectionString: `postgresql://kino_ticket_runtime:runtime-password@${container.getHost()}:${container.getMappedPort(5432)}/kino_ticket`,
    });
    const runtimeTickets = new TicketService(runtimePool, config);
    assert.equal((await runtimeTickets.screenings('tt0000001')).length, 3);
    assert.equal((await runtimeTickets.seats(screeningId, 'subject-runtime')).seats.length, 15);
    assert.equal((await runtimeTickets.seats(alternateScreeningId, 'subject-runtime')).seats.length, 20);
    const runtimeHold = await runtimeTickets.hold(screeningId, 'subject-runtime', ['C2']);
    const runtimeConfirmation = await runtimeTickets.confirm(runtimeHold.id, 'subject-runtime');
    assert.equal(runtimeConfirmation.state, 'CONFIRMED');

    const client = await runtimePool.connect();
    try {
      await assert.rejects(
        client.query("UPDATE kino_ticket.screening_seats SET seat_code = 'Z9'"),
        /permission denied/
      );
      await assert.rejects(
        client.query('SELECT * FROM kino_ticket.flyway_schema_history'),
        /permission denied/
      );
      await assert.rejects(
        client.query('CREATE TABLE public.ticket_runtime_forbidden (id integer)'),
        /permission denied/
      );
    } finally {
      client.release();
    }
  } finally {
    await runtimePool?.end();
    await pool.end();
    await container.stop();
  }
});

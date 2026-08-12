import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { Pool } from 'pg';
import { GenericContainer, Wait } from 'testcontainers';
import { PostgresViewingPlanRepository } from '../../src/viewing-plans/viewing-plan-postgres-repository.js';

const integrationTest = process.env.RUN_POSTGRES_INTEGRATION_TESTS === 'true' ? test : test.skip;

integrationTest('runtime role applies the delivered lifecycle migration and privileges', async () => {
  const container = await new GenericContainer('postgres:17-alpine')
    .withEnvironment({ POSTGRES_DB: 'kino_viewing_plan', POSTGRES_PASSWORD: 'test-password' })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 2))
    .start();
  const rootUrl = `postgresql://postgres:test-password@${container.getHost()}:${container.getMappedPort(5432)}/kino_viewing_plan`;
  const root = new Pool({ connectionString: rootUrl });
  let runtime;
  try {
    await root.query("CREATE ROLE kino_viewing_plan_runtime LOGIN PASSWORD 'runtime-password'");
    await root.query('CREATE SCHEMA kino_viewing_plan');
    await root.query('GRANT USAGE ON SCHEMA kino_viewing_plan TO kino_viewing_plan_runtime');
    await root.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    const migration = await readFile(resolve(
      import.meta.dirname,
      '../../../../../orchestrators/k8s/terraform/viewing-plan-db-migrations/V1__create_viewing_plans.sql'
    ), 'utf8');
    await root.query(migration);
    runtime = new Pool({
      connectionString: `postgresql://kino_viewing_plan_runtime:runtime-password@${container.getHost()}:${container.getMappedPort(5432)}/kino_viewing_plan`,
    });
    const repository = new PostgresViewingPlanRepository(runtime);
    const first = await repository.upsert('subject-one', 'tt0000001', 'WATCH');
    const repeated = await repository.upsert('subject-one', 'tt0000001', 'WATCH');
    assert.equal(first.id, repeated.id);
    const completed = await repository.transition('subject-one', first.id, 'DONE');
    assert.equal(completed.status, 'DONE');
    const repeatedCompletion = await repository.transition('subject-one', first.id, 'DONE');
    assert.equal(repeatedCompletion.completedAt, completed.completedAt);
    const reopened = await repository.transition('subject-one', first.id, 'OPEN');
    assert.equal(reopened.completedAt, null);
    assert.equal(await repository.openForTitle('another-subject', 'tt0000001'), null);

    await repository.transition('subject-one', first.id, 'DONE');
    const competing = await repository.upsert('subject-one', 'tt0000001', 'REWATCH');
    await assert.rejects(
      repository.transition('subject-one', first.id, 'OPEN'),
      (error) => error.code === 'open_plan_exists'
    );
    assert.equal(competing.status, 'OPEN');

    const concurrent = await Promise.all(
      Array.from({ length: 8 }, (_unused, index) => repository.upsert(
        'subject-concurrent',
        'tt0000002',
        index % 2 === 0 ? 'WATCH' : 'REWATCH'
      ))
    );
    assert.equal(new Set(concurrent.map((plan) => plan.id)).size, 1);

    const older = await repository.upsert('subject-ordered', 'tt0000003', 'WATCH');
    const newer = await repository.upsert('subject-ordered', 'tt0000004', 'WATCH');
    await root.query(
      'UPDATE kino_viewing_plan.viewing_plans SET updated_at = $1 WHERE id = $2',
      ['2026-01-01T00:00:00Z', older.id]
    );
    await root.query(
      'UPDATE kino_viewing_plan.viewing_plans SET updated_at = $1 WHERE id = $2',
      ['2026-01-02T00:00:00Z', newer.id]
    );
    const ordered = await repository.list('subject-ordered', 'OPEN', 0, 20);
    assert.deepEqual(ordered.items.map((plan) => plan.id), [newer.id, older.id]);

    await assert.rejects(
      runtime.query('CREATE TABLE public.runtime_forbidden (id integer)'),
      /permission denied/
    );
  } finally {
    await runtime?.end();
    await root.end();
    await container.stop();
  }
});

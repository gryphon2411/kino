import { randomUUID } from 'node:crypto';
import { OpenPlanExistsError } from '../errors.js';

const SCHEMA = 'kino_viewing_plan.viewing_plans';
const OPEN_CONSTRAINT = 'viewing_plans_open_per_holder_title_unique';

function mapPlan(row) {
  return {
    id: row.id,
    titleId: row.title_id,
    kind: row.kind,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
  };
}

/**
 * PostgreSQL persistence adapter for Viewing Plans.
 * @implements {import('./viewing-plan-service.js').ViewingPlanRepository}
 */
export class PostgresViewingPlanRepository {
  constructor(database) {
    this.database = database;
  }

  async list(subject, status, page, size) {
    const result = await this.database.query(
      `SELECT id::text, title_id, kind, status, created_at, updated_at, completed_at
         FROM ${SCHEMA}
        WHERE holder_subject = $1 AND status = $2
        ORDER BY updated_at DESC, id DESC
        OFFSET $3 LIMIT $4`,
      [subject, status, page * size, size + 1]
    );
    return {
      items: result.rows.slice(0, size).map(mapPlan),
      page,
      size,
      hasNext: result.rows.length > size,
    };
  }

  async openForTitle(subject, titleId) {
    const result = await this.database.query(
      `SELECT id::text, title_id, kind, status, created_at, updated_at, completed_at
         FROM ${SCHEMA}
        WHERE holder_subject = $1 AND title_id = $2 AND status = 'OPEN'`,
      [subject, titleId]
    );
    return result.rows[0] ? mapPlan(result.rows[0]) : null;
  }

  async upsert(subject, titleId, kind) {
    const result = await this.database.query(
      `INSERT INTO ${SCHEMA} AS plan
         (id, holder_subject, title_id, kind, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'OPEN', clock_timestamp(), clock_timestamp())
       ON CONFLICT (holder_subject, title_id) WHERE status = 'OPEN'
       DO UPDATE SET
         kind = EXCLUDED.kind,
         updated_at = CASE
           WHEN plan.kind IS DISTINCT FROM EXCLUDED.kind THEN clock_timestamp()
           ELSE plan.updated_at
         END
       RETURNING id::text, title_id, kind, status, created_at, updated_at, completed_at`,
      [randomUUID(), subject, titleId, kind]
    );
    return mapPlan(result.rows[0]);
  }

  async transition(subject, id, targetStatus) {
    const client = await this.database.connect();
    try {
      const transition = targetStatus === 'DONE'
        ? `WITH now_value AS (SELECT clock_timestamp() AS value)
           UPDATE ${SCHEMA} AS plan
              SET status = 'DONE', completed_at = now_value.value, updated_at = now_value.value
             FROM now_value
            WHERE plan.id = $1 AND plan.holder_subject = $2 AND plan.status = 'OPEN'
           RETURNING plan.id::text, plan.title_id, plan.kind, plan.status,
                     plan.created_at, plan.updated_at, plan.completed_at`
        : `UPDATE ${SCHEMA}
              SET status = 'OPEN', completed_at = NULL, updated_at = clock_timestamp()
            WHERE id = $1 AND holder_subject = $2 AND status = 'DONE'
           RETURNING id::text, title_id, kind, status, created_at, updated_at, completed_at`;
      try {
        const changed = await client.query(transition, [id, subject]);
        if (changed.rows[0]) {
          return mapPlan(changed.rows[0]);
        }
      } catch (error) {
        if (targetStatus === 'OPEN' && error?.code === '23505' && error.constraint === OPEN_CONSTRAINT) {
          throw new OpenPlanExistsError();
        }
        throw error;
      }
      const existing = await client.query(
        `SELECT id::text, title_id, kind, status, created_at, updated_at, completed_at
           FROM ${SCHEMA}
          WHERE id = $1 AND holder_subject = $2`,
        [id, subject]
      );
      if (!existing.rows[0] || existing.rows[0].status !== targetStatus) {
        return null;
      }
      return mapPlan(existing.rows[0]);
    } finally {
      client.release();
    }
  }

  async delete(subject, id) {
    const result = await this.database.query(
      `DELETE FROM ${SCHEMA} WHERE id = $1 AND holder_subject = $2`,
      [id, subject]
    );
    return result.rowCount === 1;
  }
}

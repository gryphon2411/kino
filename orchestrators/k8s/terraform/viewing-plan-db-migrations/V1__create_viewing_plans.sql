CREATE TABLE kino_viewing_plan.viewing_plans (
  id uuid PRIMARY KEY,
  holder_subject varchar(255) NOT NULL,
  title_id varchar(32) NOT NULL,
  kind varchar(16) NOT NULL,
  status varchar(8) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  CONSTRAINT viewing_plans_holder_subject_not_blank
    CHECK (char_length(holder_subject) BETWEEN 1 AND 255 AND btrim(holder_subject) <> ''),
  CONSTRAINT viewing_plans_title_id_format
    CHECK (title_id ~ '^tt[0-9]{1,30}$'),
  CONSTRAINT viewing_plans_kind
    CHECK (kind IN ('WATCH', 'REWATCH')),
  CONSTRAINT viewing_plans_status
    CHECK (status IN ('OPEN', 'DONE')),
  CONSTRAINT viewing_plans_completion_lifecycle
    CHECK ((status = 'OPEN' AND completed_at IS NULL) OR (status = 'DONE' AND completed_at IS NOT NULL))
);

CREATE UNIQUE INDEX viewing_plans_open_per_holder_title_unique
  ON kino_viewing_plan.viewing_plans (holder_subject, title_id)
  WHERE status = 'OPEN';

CREATE INDEX viewing_plans_holder_status_updated_at_index
  ON kino_viewing_plan.viewing_plans (holder_subject, status, updated_at DESC, id DESC);

GRANT SELECT ON kino_viewing_plan.viewing_plans TO kino_viewing_plan_runtime;
GRANT INSERT (id, holder_subject, title_id, kind, status, created_at, updated_at)
  ON kino_viewing_plan.viewing_plans TO kino_viewing_plan_runtime;
GRANT UPDATE (kind, status, completed_at, updated_at)
  ON kino_viewing_plan.viewing_plans TO kino_viewing_plan_runtime;
GRANT DELETE ON kino_viewing_plan.viewing_plans TO kino_viewing_plan_runtime;

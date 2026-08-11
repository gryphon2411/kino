#!/bin/sh
set -eu

until pg_isready -h "$PGHOST" -U "$POSTGRES_USER" -d postgres; do
  sleep 2
done

psql -v ON_ERROR_STOP=1 \
  -v migrator_password="$VIEWING_PLAN_DB_MIGRATOR_PASSWORD" \
  -v runtime_password="$VIEWING_PLAN_DB_RUNTIME_PASSWORD" \
  -U "$POSTGRES_USER" -d postgres <<'SQL'
SELECT 'CREATE DATABASE kino_viewing_plan'
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = 'kino_viewing_plan'
) \gexec

SELECT 'CREATE ROLE kino_viewing_plan_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION'
WHERE NOT EXISTS (
  SELECT FROM pg_roles WHERE rolname = 'kino_viewing_plan_migrator'
) \gexec

SELECT 'CREATE ROLE kino_viewing_plan_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION'
WHERE NOT EXISTS (
  SELECT FROM pg_roles WHERE rolname = 'kino_viewing_plan_runtime'
) \gexec

ALTER ROLE kino_viewing_plan_migrator PASSWORD :'migrator_password';
ALTER ROLE kino_viewing_plan_runtime PASSWORD :'runtime_password';

REVOKE CONNECT, TEMPORARY ON DATABASE kino_viewing_plan FROM PUBLIC;
GRANT CONNECT ON DATABASE kino_viewing_plan TO kino_viewing_plan_migrator, kino_viewing_plan_runtime;
SQL

psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d kino_viewing_plan <<'SQL'
CREATE SCHEMA IF NOT EXISTS kino_viewing_plan AUTHORIZATION kino_viewing_plan_migrator;
REVOKE ALL ON SCHEMA kino_viewing_plan FROM PUBLIC;
GRANT USAGE ON SCHEMA kino_viewing_plan TO kino_viewing_plan_runtime;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE kino_viewing_plan_migrator IN SCHEMA kino_viewing_plan
  REVOKE ALL ON TABLES FROM kino_viewing_plan_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE kino_viewing_plan_migrator IN SCHEMA kino_viewing_plan
  REVOKE ALL ON SEQUENCES FROM kino_viewing_plan_runtime;
SQL

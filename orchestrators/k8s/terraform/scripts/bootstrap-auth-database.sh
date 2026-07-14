#!/bin/sh
set -eu

until pg_isready -h "$PGHOST" -U "$POSTGRES_USER" -d postgres; do
  sleep 2
done

psql -v ON_ERROR_STOP=1 \
  -v migrator_password="$AUTH_DB_MIGRATOR_PASSWORD" \
  -v runtime_password="$AUTH_DB_RUNTIME_PASSWORD" \
  -U "$POSTGRES_USER" -d postgres <<'SQL'
SELECT 'CREATE DATABASE kino_auth'
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = 'kino_auth'
) \gexec

SELECT 'CREATE ROLE kino_auth_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION'
WHERE NOT EXISTS (
  SELECT FROM pg_roles WHERE rolname = 'kino_auth_migrator'
) \gexec

SELECT 'CREATE ROLE kino_auth_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION'
WHERE NOT EXISTS (
  SELECT FROM pg_roles WHERE rolname = 'kino_auth_runtime'
) \gexec

ALTER ROLE kino_auth_migrator PASSWORD :'migrator_password';
ALTER ROLE kino_auth_runtime PASSWORD :'runtime_password';

GRANT CONNECT ON DATABASE kino_auth TO kino_auth_migrator, kino_auth_runtime;
SQL

psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d kino_auth <<'SQL'
CREATE SCHEMA IF NOT EXISTS kino_auth AUTHORIZATION kino_auth_migrator;
GRANT USAGE ON SCHEMA kino_auth TO kino_auth_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE kino_auth_migrator IN SCHEMA kino_auth
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kino_auth_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE kino_auth_migrator IN SCHEMA kino_auth
  GRANT USAGE, SELECT ON SEQUENCES TO kino_auth_runtime;
SQL

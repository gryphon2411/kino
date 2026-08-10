#!/bin/sh
set -eu

until pg_isready -h "$PGHOST" -U "$POSTGRES_USER" -d postgres; do
  sleep 2
done

psql -v ON_ERROR_STOP=1 \
  -v migrator_password="$TICKET_DB_MIGRATOR_PASSWORD" \
  -v runtime_password="$TICKET_DB_RUNTIME_PASSWORD" \
  -U "$POSTGRES_USER" -d postgres <<'SQL'
SELECT 'CREATE DATABASE kino_ticket'
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = 'kino_ticket'
) \gexec

SELECT 'CREATE ROLE kino_ticket_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION'
WHERE NOT EXISTS (
  SELECT FROM pg_roles WHERE rolname = 'kino_ticket_migrator'
) \gexec

SELECT 'CREATE ROLE kino_ticket_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION'
WHERE NOT EXISTS (
  SELECT FROM pg_roles WHERE rolname = 'kino_ticket_runtime'
) \gexec

ALTER ROLE kino_ticket_migrator PASSWORD :'migrator_password';
ALTER ROLE kino_ticket_runtime PASSWORD :'runtime_password';

REVOKE CONNECT, TEMPORARY ON DATABASE kino_ticket FROM PUBLIC;
GRANT CONNECT ON DATABASE kino_ticket TO kino_ticket_migrator, kino_ticket_runtime;
SQL

psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d kino_ticket <<'SQL'
CREATE SCHEMA IF NOT EXISTS kino_ticket AUTHORIZATION kino_ticket_migrator;
REVOKE ALL ON SCHEMA kino_ticket FROM PUBLIC;
GRANT USAGE ON SCHEMA kino_ticket TO kino_ticket_runtime;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE kino_ticket_migrator IN SCHEMA kino_ticket
  REVOKE ALL ON TABLES FROM kino_ticket_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE kino_ticket_migrator IN SCHEMA kino_ticket
  REVOKE ALL ON SEQUENCES FROM kino_ticket_runtime;
SQL

# Kino Viewing Plans service

`viewing-plan-service` is Kino's active Express service for private user plans:
plan to watch a title or watch it again. It owns lifecycle state only; catalog data
continues to come from `data_service` through the Next.js BFF.

Browsers call `/api/viewing-plans/*`. The Express service is private to the UI
BFF, validates user access tokens, and stores plans in isolated PostgreSQL
database/schema `kino_viewing_plan`. The root bootstrap Job creates narrow
migrator/runtime roles, Flyway owns DDL, and the runtime role has only the
column privileges required for owner-scoped CRUD.

## Structure

The application root composes shared Express concerns. `src/viewing-plans/`
contains the Viewing Plans HTTP routes, policy service, and PostgreSQL
repository. This mirrors the active Fastify service's domain-oriented layout
without adding a generic framework layer.

```text
src/
  app.js
  auth.js
  config.js
  database.js
  errors.js
  server.js
  viewing-plans/
    viewing-plan-routes.js
    viewing-plan-service.js
    viewing-plan-postgres-repository.js
```

## API

- `GET /v1/viewing-plans?status=OPEN|DONE&page=&size=`
- `GET` / `PUT /v1/viewing-plans/titles/:titleId`
- `POST /v1/viewing-plans/:id/complete`
- `POST /v1/viewing-plans/:id/reopen`
- `DELETE /v1/viewing-plans/:id`
- `GET /healthz`
- `GET /readyz`

There can be one Open plan per user/title. Repeating a title `PUT`, complete,
or reopen command is idempotent. Done plans remain history. All private
responses use `Cache-Control: private, no-store`.

## Local checks

```bash
npm ci
npm test
npm run test:integration
```

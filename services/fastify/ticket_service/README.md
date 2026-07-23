# Kino ticket service

This is Kino's Fastify-first ticket-allocation lab. It owns one fixed screening
for `tt0000001` in PostgreSQL and accepts user JWTs only from Kino's Next.js
BFF. It is intentionally private: browsers call `/api/tickets/*` on the BFF,
not this service. Kubernetes also permits ingress only from the UI/BFF pod;
JWT validation remains the application-layer boundary.

## Runtime contract

- `TICKET_DATABASE_URL` connects as `kino_ticket_runtime`.
- `AUTH_SERVER_ISSUER_URI` is validated exactly.
- `AUTH_SERVER_JWK_SET_URI` is the explicit local/dev in-cluster JWK trust
  endpoint. It is not OIDC Discovery and must never be taken from a token.
- Access tokens are marked `typ: at+jwt` by auth-service and the ticket
  service rejects other JWT types before using their claims.
- `TICKET_HOLD_DURATION_SECONDS` defaults to `120`.
- `TICKET_DB_LOCK_TIMEOUT_MS` and `TICKET_DB_STATEMENT_TIMEOUT_MS` default to
  `1000` and `3000` respectively.
- `TICKET_JWK_TIMEOUT_MS` defaults to `500`. Its value, the `1000` ms default
  `TICKET_DB_CONNECTION_TIMEOUT_MS`, and the statement timeout must leave a
  500 ms margin inside
  `TICKET_BFF_UPSTREAM_TIMEOUT_MS` (which defaults to the BFF's five-second
  upstream deadline). Transactional allocation also uses PostgreSQL 17's
  `transaction_timeout` to bound the total transaction, not just each
  individual SQL statement. PostgreSQL applies the configured statement timeout
  to both transactional allocation and read-only queries.
- Fastify's application-level handler timeout and Node's request/header receive
  timeouts use the BFF deadline. Write routes pass Fastify's cancellation signal
  into the transaction boundary, which rolls back instead of committing when the
  request has already been aborted. PostgreSQL's timeouts retain the bound for a
  statement that was already in flight when cancellation occurred.

The allocation operation locks seat rows in immutable code order and uses
PostgreSQL `clock_timestamp()` for expiry decisions. Expired holds are reclaimed
lazily; confirmed seats remain sold. The lab deliberately retains expired
reservation history and has no expiry worker; introduce retention/cleanup only
when Kino grows beyond this fixed, short-lived screening. Direct hold requests
are independently capped at 1 KiB and return `413` when too large.

On `SIGTERM` or `SIGINT`, the service stops accepting requests, closes Fastify,
then closes PostgreSQL connections. Kubernetes grants it ten seconds to finish;
a shutdown failure is logged and exits nonzero. The image and Pod run as the
unprivileged `node` user with no Linux capabilities.

## Sources

- [Fastify validation and serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [Fastify body limits](https://fastify.dev/docs/latest/Reference/Server/#bodylimit)
- [Fastify server timeouts](https://fastify.dev/docs/latest/Reference/Server/)
- [node-postgres transactions](https://node-postgres.com/features/transactions)
- [node-postgres pool configuration](https://node-postgres.com/apis/pool)
- [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- [PostgreSQL client connection defaults](https://www.postgresql.org/docs/current/runtime-config-client.html)
- [PostgreSQL date/time functions](https://www.postgresql.org/docs/current/functions-datetime.html)
- [RFC 6750 bearer errors](https://www.rfc-editor.org/rfc/rfc6750.html)
- [RFC 9068 JWT access-token profile](https://www.rfc-editor.org/rfc/rfc9068.html)

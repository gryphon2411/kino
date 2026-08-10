# Kino Architecture

This document is a high-level codemap for the Kino repository.

Its job is to help a contributor answer three questions quickly:

1. What problem does Kino solve?
2. Where should I go to change a behavior?
3. Which boundaries are intentional, and should not be crossed casually?

This file intentionally stays at the "map of the country" level. It names
stable modules, services, and flows. It avoids volatile implementation detail.
Use symbol search for the module, type, or function names mentioned here.

## Bird's-eye View

Kino is an educational, polyglot cinema platform built around a local title
catalog derived from IMDb data.

At a high level, the system has four layers:

- Dataset build and release: `jobs/`
- Runtime services: `services/`
- User interface: `uis/react-ui/kino-ui/`
- Deployment and operations: `orchestrators/k8s/terraform/` and
  `.github/workflows/`

The canonical runtime shape is:

- a Next.js UI behind Kubernetes ingress
- Spring Boot services for auth, catalog access, and trends
- a Django service for title facts generation
- an optional LangGraph agent for grounded title discovery
- MongoDB as the main runtime datastore
- PostgreSQL for Authorization Server protocol state
- PostgreSQL for ticket allocation state and saved seat preferences
- Redis for BFF/session state and service caches
- Kafka for title-search event streaming
- RabbitMQ for request/reply style service integration

## Main Runtime Flows

### 1. Dataset to runtime

`jobs/` downloads IMDb title data, curates it into a quality-gated artifact,
builds a Mongo seed archive, and publishes a digest-pinned seed image.
Terraform consumes that image through a Mongo init job which restores into
`title_basics_staging` and then promotes that collection to `title_basics`,
recording restore metadata and history along the way.

The important boundary is that runtime services do not read raw IMDb artifacts.
They only see the curated Mongo projection.

### 2. User catalog browsing

The UI talks to same-origin BFF routes exposed by Next.js. The BFF holds the
user's OAuth tokens in Redis and calls `data_service`, which queries MongoDB and
returns title DTOs. The catalog ingress route remains available during this
minimal rollout, but the UI no longer sends browser credentials to it directly.

`data_service` is the public system boundary for title retrieval. Other runtime
services should not bypass it by reading the `title_basics` collection directly.

### 3. Title retrieval analytics

Whenever `data_service` returns title data, it emits a `TitleSearchEvent` to
Kafka. Despite the name, that event currently represents titles returned by
`data_service` across public reads, internal agent searches, and RabbitMQ facts
lookups. `trend_service` consumes that stream and maintains windowed aggregates
for title and genre popularity.

This keeps retrieval analytics downstream from the catalog read path. Trend
computation does not belong in the UI or in `data_service` controllers.

### 4. Title facts generation

`generative_service` handles "facts about this title" style enrichment. It
requests title metadata from `data_service` through RabbitMQ RPC, then sends a
prompt to the selected model provider.

RabbitMQ is used here as a request/reply integration boundary, not as a
durable event log.

### 5. Grounded AI discovery

`agent_service` is the newer AI path. It issues client-credentials requests to
`auth_service`, receives a short-lived JWT, and uses that token to call the
internal title search endpoint exposed by `data_service`.

The important property is grounding: the agent is supposed to answer from
catalog search results, not from open-ended model memory.

### 6. Ticket allocation

Title details with scheduled showtimes link to a small Fastify-first ticket
service. The browser calls same-origin Next.js BFF routes; the BFF forwards its
server-held user JWT to the private Fastify service. That service validates the
ticket audience and scope, then uses PostgreSQL row locks and database time to
hold or confirm seats for the selected screening.

`kino_ticket` is separate from both Mongo-backed user profiles and `kino_auth`
OIDC protocol state. Flyway owns its schema; Prisma owns private saved-seat-group
CRUD; direct `pg` owns allocation transactions and row locks; both share one
PostgreSQL pool. It deliberately demonstrates a small transactional PostgreSQL
domain without adding payments, cancellation, a worker, or a generic scheduling
system.

## Codemap

### Root

- `README.md`
  - brief project identity and top-level provisioning entrypoint
- `ARCHITECTURE.md`
  - this document
- `architecture/`
  - diagrams and visual artifacts
- `services/`
  - application runtime code
- `jobs/`
  - offline data pipeline and release packaging
- `orchestrators/`
  - deployment definitions
- `uis/`
  - user-facing frontend code
- `.github/workflows/`
  - CI and image publishing

### `jobs/`

`jobs/` is the authoritative dataset build and seed-release path.

Important modules:

- `imdb_titles_pipeline.capture`
  - downloads raw IMDb data
- `imdb_titles_pipeline.curation`
  - validates and curates the raw snapshot into parquet, including the quality
    gate used by downstream release steps
- `imdb_titles_pipeline.mongo.seed`
  - builds the Mongo projection and dump archive
- `imdb_titles_pipeline.mongo.restore`
  - restores the seed into staging and promotes it into the live collection
- `imdb_titles_pipeline.release.publish`
  - publishes the Mongo seed image and writes the release manifest

This directory is operationally upstream of the entire runtime. If the title
shape or search indexes need to change, this is usually the first place to
look, not `data_service`.

Two invariants here matter operationally:

- the curated artifact must pass its quality gate before seed build and release
  publication proceed
- Mongo restore is a staged promotion flow, not an in-place overwrite of the
  active title collection

### `services/spring-boot/commons`

Shared Java code used by the Spring services lives here.

Important types:

- `TitleSearchEvent`
  - the Kafka payload schema for titles returned by `data_service`, consumed by
    `trend_service`
- `CustomUser`
  - shared Mongo user representation with an immutable opaque OIDC subject

Keep `commons` small. It is a shared contract layer, not a dumping ground for
cross-service business logic.

### `services/spring-boot/auth_service`

`auth_service` handles three related concerns:

- browser-oriented Spring Security login sessions used at the authorization
  endpoint
- OIDC authorization-code-with-PKCE issuance for the confidential Next.js BFF
- machine-oriented OAuth2 client-credentials token issuance

Important areas:

- `AuthServiceSecurityConfig`
  - CSRF-protected form login and short-lived authorization-server sessions
- `AuthServiceMachineAuthConfig`
  - OIDC authorization server, JDBC protocol repositories, JWT signing, JWKS,
    and machine/BFF client registration
- `CustomUserRepository` and `CustomUserDetailsService`
  - user lookup from MongoDB
- `AuthServiceSessionCacheConfig` and `AuthServiceCacheConfig`
  - Redis-backed session and cache configuration

Mongo remains the user store. PostgreSQL `kino_auth` stores only registered
clients, authorization codes, consents, and refresh tokens. Terraform gives the
runtime service DML-only access; a separate Flyway Job owns schema changes.

This service owns the authentication contracts used by the UI and by
`agent_service`.

### `services/spring-boot/data_service`

`data_service` is the core application boundary around title retrieval.

Important areas:

- `TitleController`
  - public title listing and title detail routes
- `InternalTitleController`
  - internal machine-only search endpoint used by the agent
- `TitleService`
  - reads from the repository and emits `TitleSearchEvent` side effects
- `CustomTitleRepositoryImpl`
  - Mongo query construction for filters, text search, and year bounds
- `DataServiceMachineSecurityConfig`
  - JWT validation and scope checks for internal endpoints
- `DataServiceSecurityConfig`
  - stateless user JWT validation for title routes (`kino.data.read`,
    `kino-data-api`)
- `DataServiceMessagingConfig` and `TitleListener`
  - RabbitMQ RPC endpoint used by `generative_service`

If a change affects how titles are searched, filtered, or exposed to other
parts of the system, start here.

### `services/fastify/ticket_service`

`ticket_service` is the private transactional boundary for a small, seeded
ticketing exercise. It is reached only through the Next.js BFF and validates
the BFF's user access token itself.

Important areas:

- `src/ticket-routes.ts`
  - parent ticket HTTP boundary, including the shared no-store response policy
- `src/allocation/`
  - direct PostgreSQL allocation operations, including the explicit row-lock
    transaction that creates holds and confirms reservations
- `src/seat-presets/`
  - owner-scoped saved-seat-group CRUD through Prisma
- `src/server.ts`
  - production composition root for Fastify, the shared PostgreSQL pool, and
    Prisma

Flyway remains the only schema and seed-data owner. Prisma intentionally serves
only ordinary saved-seat-group CRUD; direct `pg` keeps the allocation algorithm
and its PostgreSQL locking semantics explicit.

### `services/spring-boot/trend_service`

`trend_service` is a Kafka Streams consumer over `TitleSearchEvent` traffic.

Important areas:

- `TrendServiceApplication`
  - stream topology definition
- `TitleTrendController`
  - queries the `title-counts` window store
- `GenreTrendController`
  - queries the `genre-counts` window store

This service is intentionally downstream of `data_service`. It should derive
aggregates from events, not become a second catalog API.

### `services/django-rest-framework/generative_service`

`generative_service` provides title fact generation.

Important areas:

- `generative_service_app.views.TitleFacts`
  - HTTP endpoint and orchestration logic
- `generative_service_app.rpc.rpc_client.RpcClient`
  - RabbitMQ RPC client used to fetch title metadata from `data_service`
- `generative_service_app.generative_models.*`
  - provider-specific model wrappers

This service is integration-heavy and currently older in style than the newer
LangGraph agent path.

### `services/langgraph/agent_service`

`agent_service` is the grounded AI discovery service.

Important areas:

- `graph.create_kino_curator`
  - top-level agent wiring and prompt policy
- `tools.search_titles`
  - the only tool used for catalog discovery
- `data_service.KinoDataServiceClient`
  - calls `data_service` internal search with machine JWTs
- `middleware.CuratorResponseMiddleware`
  - deterministic post-processing to keep responses grounded and structured
- `config.CuratorSettings`
  - environment-driven model and service configuration

This service is intentionally narrow: it turns natural-language discovery
requests into grounded catalog searches.

In Terraform, this service is optional and disabled by default. When enabled,
it currently runs the in-memory `langgraph dev` server, so threads and runs are
not durable across pod restarts.

### `uis/react-ui/kino-ui`

This is the main user interface. It is a hybrid Next.js codebase: the main
catalog shell lives under App Router, while login still uses Pages Router.

Important areas:

- `src/app/layout.js`
  - app shell and navigation
- `src/app/titles/`
  - catalog browsing UI
- `src/app/titles/[id]/`
  - title detail and fact retrieval UI
- `src/pages/login/`
  - Spring Authorization Server's browser login form
- `src/http/api.js`
  - public API base URL configuration

The UI is mostly a thin client over backend routes. It should not become a
second place for business rules that belong in the services.

### `orchestrators/k8s/terraform`

This is the canonical deployment path.

Important files:

- `services.tf`
  - deploys auth, data, ticket, trend, generative, agent, UI, and ingress wiring
- `databases.tf`
  - MongoDB, Postgres, and Redis resources, plus the Mongo init job
- `ticket_database.tf`
  - ticket PostgreSQL bootstrap roles, Flyway migration Job, and runtime
    credentials
- `helm.tf`
  - Kafka, RabbitMQ, Prometheus, Grafana, Vault, and External Secrets Operator
- `variables.tf`
  - feature flags and digest-pinned image inputs
- `README.md`
  - the release handoff and operator workflow

Terraform is the source of truth for the deployed topology. Ad hoc kubectl
changes are debugging tools, not the release mechanism.

### `.github/workflows/`

Each major service has its own workflow that validates builds and, on the
canonical branch, can publish a digest-pinned image reference for Terraform.

The notable exception is `kino-jobs.yml`: CI validates the dataset pipeline and
packaging, but official dataset publication remains a local operator workflow.

### Legacy and prototype areas

These directories are useful context, but they are not part of the canonical
runtime path today:

- `services/express/auth-service`
- `services/express/ticket_service`
- `services/nestjs`

Treat them as experiments or historical prototypes unless the deployment path
explicitly starts using them.

## Architectural Invariants

- The Mongo-backed title catalog is curated offline in `jobs/` and consumed at
  runtime through `data_service`.
- The curated artifact must pass its quality gate before Mongo seed build or
  seed publication can proceed.
- Mongo seed restore is a staged promotion flow: restore into
  `title_basics_staging`, validate, then promote to `title_basics` while
  maintaining restore metadata and history.
- In the active Mongo projection, `_id` is the stable IMDb `tconst`, so
  public title IDs now follow the source identifier instead of older
  Mongo-generated ObjectIds from pre-Plan-C seeds.
- `data_service` is the authoritative read boundary for title search and title
  detail APIs.
- `TitleSearchEvent` records titles returned by `data_service`, not raw user
  search intent; trend aggregation is derived from those events, not from
  direct DB inspection.
- RabbitMQ is used for synchronous service integration with
  `generative_service`; Kafka is used for event streaming and analytics.
- Browser, user-token, and machine-token traffic are different security
  domains. The browser has only a BFF cookie; user JWTs protect title and ticket
  routes; machine JWTs with narrower scopes protect `/internal`.
- The BFF treats a refresh as durable only after the rotated token session is
  saved to Redis. If that write fails, it clears the local session and requires
  a new login rather than leaving a stale refresh token in the browser flow.
- `auth_service` owns both human authentication and machine token issuance.
- The deployed system is image-ref driven. Runtime services should be deployed
  from digest-pinned images, and the Mongo seed should be promoted through the
  release manifest handoff.
- `agent_service` is grounded by design. It should search the local catalog and
  answer from the returned records.
- If `agent_service` is enabled in Terraform, it currently runs as an
  in-memory, non-durable LangGraph dev server.

## Boundaries That Matter

- Dataset build vs runtime:
  - `jobs/` prepares and promotes data; runtime services consume only the
    active Mongo projection.
- Auth vs application behavior:
  - `auth_service` issues identity and tokens; other services enforce them.
- Public HTTP vs internal HTTP:
  - the UI uses ingress-routed public paths; the ticket service is ClusterIP-only
    and reachable solely from the UI/BFF pod; other internal services use
    cluster-local addresses and stronger scope checks.
- Catalog reads vs analytics:
  - `data_service` serves reads; `trend_service` derives returned-title
    aggregates downstream.
- Structured service contracts vs direct datastore reads:
  - shared behavior should flow through APIs, events, or shared contract types,
    not through random cross-service collection access.

## Cross-cutting Concerns

### Deployment model

Kino is designed around local and dev Kubernetes environments, not around a
single-process local app. Many "why is this split?" questions are answered by
that deployment target.

### State placement

- MongoDB stores persistent application data, including the title catalog and
  user profiles, plus dataset restore metadata and history.
- PostgreSQL `kino_auth` stores Authorization Server clients, authorization
  codes, consents, and refresh tokens. A migrator role owns its schema; the
  running auth service has only DML permissions.
- PostgreSQL `kino_ticket` stores independent screening seat maps, reservation
  lifecycle state, and owner-scoped saved seat groups. It has separate migrator
  and runtime roles; Flyway owns its schema and deterministic sample data.
- Redis default caches are segmented by service database number. Auth-service
  login sessions and opaque Next.js BFF sessions are separate Redis state. The
  BFF has its own Redis ACL, limited to `kino:bff:*`; its access and refresh
  tokens are therefore not readable with the Auth/Data default Redis account.
  A Redis restart deliberately invalidates these ephemeral sessions and sends
  users through normal reauthentication rather than attempting token recovery.
- Kafka carries the title-return event stream; `trend_service` materializes its
  window state through Kafka Streams state stores.
- RabbitMQ handles RPC-style messaging for the generative path.

### Testing

- Spring services use focused WebMvc and unit tests.
- `ticket_service` uses Fastify unit and PostgreSQL integration tests for its
  HTTP, authorization, allocation, and persistence boundaries.
- `agent_service` uses pytest for unit and integration-style tests.
- `jobs/` uses Python test coverage plus CI verification builds against fixture
  data.

Tests in this repo often validate boundaries and contracts more than deep
end-to-end behavior.

### Observability

Prometheus and Grafana are part of the current Terraform path. Older diagrams
may show Elastic or ECK-related components, but those are not the canonical
deployment path at the moment.

### Security and secrets

Secrets flow through `.env`, Terraform variables, Kubernetes secrets, and
optionally Vault plus External Secrets Operator. The auth-service machine JWT
signing key is intentionally stable across pod restarts within the same
Terraform state.

## Where To Make Changes

- "Change how titles are filtered or searched"
  - start in `CustomTitleRepositoryImpl`, `TitleService`, and the title
    controllers
- "Change how title search events are emitted or consumed"
  - start in `TitleSearchEvent`, `TitleService`, and `TrendServiceApplication`
- "Change user login or machine token behavior"
  - start in `AuthServiceSecurityConfig` and `AuthServiceMachineAuthConfig`
- "Change title facts generation"
  - start in `generative_service_app.views.TitleFacts` and the model wrapper
    modules
- "Change grounded AI discovery"
  - start in `graph`, `tools.search_titles`, `KinoDataServiceClient`, and
    `CuratorResponseMiddleware`
- "Change ticket holds, confirmations, or seat availability"
  - start in `services/fastify/ticket_service/src/allocation/`
- "Change saved ticket seat groups"
  - start in `services/fastify/ticket_service/src/seat-presets/`
- "Change deployment topology or wiring"
  - start in `orchestrators/k8s/terraform/services.tf`
- "Change the source title data or Mongo search shape"
  - start in `jobs/imdb_titles_pipeline`
- "Change Mongo seed promotion or restore behavior"
  - start in `imdb_titles_pipeline.mongo.restore`,
    `imdb_titles_pipeline.mongo.definitions`, and
    `jobs/images/mongo-seed/promote-mongo-seed.js`

## Updating This Document

Prefer updating this file when one of these changes happens:

- a new major service becomes part of the canonical deployment
- a boundary between services changes
- a datastore or messaging system changes role
- the main operator handoff changes

Do not update this file for routine controller additions, endpoint churn, or
small refactors inside an existing module.

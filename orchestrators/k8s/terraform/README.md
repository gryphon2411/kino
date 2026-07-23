# Kino Kubernetes Terraform

Infrastructure as Code for deploying the Kino platform to Kubernetes.
This is a local Minikube workflow, so Terraform state and bootstrap artifacts live in the workspace rather than in a remote backend.

## Architecture

```
Taskfile.yml          # Orchestration (deploy, deploy-with-vault, destroy, clean)
├── playbook.yaml     # Ansible for Minikube + /etc/hosts + retries
└── *.tf              # Terraform for K8s resources
    ├── versions.tf   # Terraform & provider version constraints
    ├── providers.tf  # Provider configuration
    ├── variables.tf  # Input variables
    ├── outputs.tf    # Output values
    ├── namespaces.tf # Namespace resources
    ├── databases.tf  # MongoDB, Postgres, Redis
    ├── auth_database.tf # Auth PostgreSQL bootstrap roles and Flyway migration Job
    ├── helm.tf       # Kafka, RabbitMQ, Prometheus, Grafana, Vault, ESO
    └── services.tf   # Auth, Data, Trend, Generative, Agent, UI, Ingress
```

## Prerequisites

- Minikube
- kubectl
- Terraform >= 1.7
- Ansible
- Task (go-task.dev)
- Docker (the local Minikube driver and the bounded k6 runner)

## Quick Start

```bash
cd jobs
task release-imdb-titles-mongo-seed
# Copy jobs/.artifacts/release-manifest.json somewhere convenient and note mongoSeedImageRef
```

For the release-side details of that local dataset build and publish flow, see
[jobs/README.md](../../../jobs/README.md).

```bash
cd orchestrators/k8s/terraform
cp .env.example .env
# Edit .env with your API keys and database passwords
# Set mongodb_seed_image_ref from jobs/.artifacts/release-manifest.json
# Set each enabled *_image_ref from the corresponding GitHub Actions publish run
```

```bash
# Required local Minikube capacity preflight and /etc/hosts prep
task bootstrap-local-env

# Deploy infrastructure only
task deploy

# If you need Vault-backed runtime secrets for local development
task setup-vault

# Or do both in one step
task deploy-with-vault

# Verify the live cgroup, Kubernetes request budget, and restart/eviction state
task verify-local-capacity

# Update Vault-backed secrets only
task setup-vault

# Tear down
task destroy

# Full reset, including local Minikube state
task clean
```

Kino's bootstrap creates new Minikube clusters with the Calico CNI. This is
required because Redis and the ticket service use Kubernetes NetworkPolicies as
enforced in-cluster boundaries. An existing Minikube cluster created without
Calico is rejected rather than silently running without enforcement; recreate
it with `minikube delete` and then rerun `task bootstrap-local-env`.

The local MongoDB baseline is `mongo:8.2.12`. This fixed patch tag is compatible
with the Linux 7 host kernel used by Kino's Docker-backed Minikube workflow;
do not substitute the moving `mongo:latest` tag.

## Local capacity contract

Kino's full local stack runs only in a Docker-backed Minikube profile with at
least 6 CPUs and 14 GiB memory. Bootstrap rejects a smaller or non-Docker
profile, requires 18 GiB `MemAvailable`, 8 GB total/6 GiB free host swap, and
100 GiB free disk, then configures Minikube's Docker cgroup with no swap.

Every Kino workload, Helm subcomponent, and bootstrap Job has matching CPU and
memory request/limit values. MongoDB is capped at 2 GiB with a 0.75 GiB
WiredTiger cache; the IMDb seed uses one worker and 768 MiB. Mongo seed
completion is a Terraform barrier, so the remaining databases, Helm releases,
and application pods cannot race the restore. Terraform applies the remaining
graph with parallelism 2 by default; set `TF_PARALLELISM` only after reviewing
the rendered capacity budget.

Run `task verify-local-capacity` after deployment and after diagnostics. It
uses the lower of live node Allocatable and the Docker cgroup as the capacity
budget (maximum 80% requested), then checks resource profiles, container
restarts, and OOM/eviction events. This matters because this
Minikube/Docker combination can advertise more node capacity than its
container cgroup permits.

For an authenticated ticket lab load test, first deploy a fresh ticket-enabled
stack and make sure `A1` is available. Then run:

```bash
KINO_E2E_BASE_URL=http://local.kino.com \
KINO_E2E_USERNAME=... \
KINO_E2E_PASSWORD=... \
task load-test-ticket
```

The task uses Playwright for one real PKCE login, retains only the opaque BFF
session in a mode-`0600` temporary file, and runs a 256 MiB/250m k6 container
against public same-origin BFF routes. It makes 40 seat reads per second for
three minutes, then sends 25 concurrent requests for `A1`. Exactly one hold is
expected; the other requests must return `409`, and the hold expires after two
minutes. The test never calls Fastify, Redis, or PostgreSQL directly.

## Local PostgreSQL access

After deploying PostgreSQL, start a localhost-only tunnel for `psql` or a
desktop client such as pgAdmin:

```bash
cd orchestrators/k8s/terraform
task port-forward-postgres
```

The task forwards `127.0.0.1:15432` to the `postgres` Service in
`postgres-system`. It does not change the deployed topology or expose
PostgreSQL beyond the local machine. Keep the terminal open while the client is
connected; press `Ctrl+C` to stop the tunnel.

## Release Handoff

Canonical deployment uses immutable image refs:

1. Publish the Mongo seed locally and copy `mongoSeedImageRef` from `jobs/.artifacts/release-manifest.json`.
   Do not use the CI-only `jobs/.artifacts/verification-manifest.json`; Terraform consumes the local release handoff manifest.
2. Publish each enabled service image through its GitHub Actions workflow and copy the digest-pinned image ref from the workflow summary or uploaded `release-manifest.json` artifact.
   Merged canonical-branch pushes remain the default path:
   `master` publishes `latest`, and `develop` publishes `dev`.
   Operators may also run the workflow manually on those canonical branches with `publish_image=true`.
3. Manual dispatch on a PR branch may publish a preview tag only when that branch has an open PR to the workflow's canonical target branch.
   Draft PRs count.
   Preview tags use the format `pr-<number>-<sha12>` and exist only to help operators discover the preview artifact.
   This is a trusted-operator coordination path, not a security boundary for untrusted contributors.
4. Manual dispatch with `publish_image=false`, or on a branch without a qualifying PR, stays validation-only and does not publish an image.
5. Set `mongodb_seed_image_ref` and the matching `*_image_ref` variables in `.env` or `terraform.tfvars`.
   If your environment is slow to pull the seed image, also set `mongodb_seed_job_active_deadline_seconds`.
   Terraform still deploys only digest-pinned refs such as `repo@sha256:...`; mutable tags and preview tags are not the deploy contract.
   Normal releases change the image ref itself; `mongodb_seed_generation` is only the explicit rerun token for reapplying the same seed digest.
   When Kafka is enabled, the Kafka Helm release creates the shared `title-searches` topic if it is absent during Kafka install or upgrade.
6. Run `task deploy`.

`kubectl rollout restart` is acceptable for ad hoc debugging, but it is not the authoritative release mechanism for this repo.

## Input Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `environment` | `string` | `"local"` | Deployment environment (`local` or `dev`) |
| `enable_mongodb` | `bool` | `true` | Enable MongoDB system |
| `enable_postgres` | `bool` | `true` | Enable Postgres system |
| `enable_redis` | `bool` | `true` | Enable Redis-Stack system |
| `enable_kafka` | `bool` | `true` | Enable Kafka system |
| `enable_rabbitmq` | `bool` | `true` | Enable RabbitMQ system |
| `enable_auth_service` | `bool` | `true` | Enable Kino Auth Service |
| `enable_data_service` | `bool` | `true` | Enable Kino Data Service |
| `enable_ticket_service` | `bool` | `false` | Enable the private Fastify ticket-allocation service |
| `enable_trend_service` | `bool` | `true` | Enable Kino Trend Service |
| `enable_generative_service` | `bool` | `true` | Enable Kino Generative Service |
| `enable_agent_service` | `bool` | `false` | Enable Kino Agent Service |
| `enable_ui` | `bool` | `true` | Enable Kino UI |
| `enable_prometheus` | `bool` | `true` | Enable Prometheus system |
| `enable_grafana` | `bool` | `true` | Enable Grafana system |
| `enable_ingress` | `bool` | `true` | Enable Gateway Ingress |
| `auth_service_image_ref` | `string` | `null` | Digest-pinned auth-service image used by the Deployment when auth-service is enabled |
| `auth_database_bootstrap_image_ref` | `string` | `null` | Optional digest-pinned PostgreSQL client-image override for the auth bootstrap Job; a reviewed built-in digest is used when unset |
| `postgres_image_ref` | `string` | `null` | Optional digest-pinned PostgreSQL server-image override; a reviewed built-in digest is used when unset |
| `auth_database_migration_image_ref` | `string` | `null` | Optional digest-pinned Flyway-image override for the auth migration Job; a reviewed built-in digest is used when unset |
| `data_service_image_ref` | `string` | `null` | Digest-pinned data-service image used by the Deployment when data-service is enabled |
| `ticket_service_image_ref` | `string` | `null` | Digest-pinned Fastify ticket-service image used by the Deployment when enabled |
| `ticket_database_migration_image_ref` | `string` | `null` | Optional digest-pinned Flyway-image override for the ticket migration Job |
| `trend_service_image_ref` | `string` | `null` | Digest-pinned trend-service image used by the Deployment when trend-service is enabled |
| `generative_service_image_ref` | `string` | `null` | Digest-pinned generative-service image used by the Deployment when generative-service is enabled |
| `agent_service_image_ref` | `string` | `null` | Digest-pinned agent-service image used by the Deployment when agent-service is enabled |
| `ui_image_ref` | `string` | `null` | Digest-pinned UI image used by the Deployment when the UI is enabled |
| `mongodb_password` | `string` | — | MongoDB root password (sensitive) |
| `mongodb_seed_image_ref` | `string` | — | Digest-pinned MongoDB seed image used by the init Job |
| `mongodb_seed_generation` | `number` | `0` | Declarative nonce for rerunning the MongoDB seed Job with the same image ref |
| `mongodb_seed_job_active_deadline_seconds` | `number` | `1800` | Maximum wall-clock time for the MongoDB seed Job, including image pull and restore |
| `postgres_password` | `string` | — | Postgres root password (sensitive) |
| `auth_database_migrator_password` | `string` | — | Password for the short-lived PostgreSQL auth migration role (sensitive) |
| `auth_database_runtime_password` | `string` | — | Password for the auth-service PostgreSQL DML role (sensitive) |
| `ticket_database_migrator_password` | `string` | — | Password for the short-lived ticket PostgreSQL migration role (sensitive) |
| `ticket_database_runtime_password` | `string` | — | Password for the ticket-service PostgreSQL runtime role (sensitive) |
| `web_bff_client_secret` | `string` | — | Confidential OIDC secret shared by auth-service and the Next.js BFF (sensitive) |
| `redis_password` | `string` | — | Redis password (sensitive) |
| `web_bff_redis_password` | `string` | `null` | Optional operator-controlled Redis ACL password for BFF-only `kino:bff:*` records; Terraform generates a distinct sensitive value when unset |
| `redis_image_ref` | `string` | `null` | Optional digest-pinned Redis Stack image override; a reviewed built-in digest is used when unset |
| `kafka_password` | `string` | — | Kafka password (sensitive) |
| `rabbitmq_password` | `string` | — | RabbitMQ password (sensitive) |
| `rabbitmq_admin_password` | `string` | `null` | Optional RabbitMQ admin password. Falls back to `rabbitmq_password` when unset |
| `generative_service_provider` | `string` | `"google_genai"` | Kino Generative Service model provider |
| `generative_service_model` | `string` | `"gemini-3.1-flash-lite"` | Kino Generative Service model |
| `agent_service_provider` | `string` | `"google_genai"` | Kino Agent Service model provider |
| `agent_service_model` | `string` | `"gemini-3.1-flash-lite"` | Kino Agent Service model |
| `nvidia_api_key` | `string` | `null` | NVIDIA API key for Kino Agent Service |
| `agent_service_client_secret` | `string` | `"replace-me-agent-secret"` | Auth-service client secret for agent-service machine tokens |

## Outputs

| Output | Description |
|--------|-------------|
| `mongodb_uri` | In-cluster MongoDB connection URI (sensitive) |
| `redis_uri` | In-cluster Redis connection URI (sensitive) |
| `ingress_url` | Ingress Gateway URL |
| `get_grafana_password_cmd` | Command to retrieve Grafana password |

## Kafka Topic Provisioning

The Kafka Helm release owns shared user-topic creation for this repo's local
cluster workflow.

- `title-searches` is created if absent by the Kafka release's provisioning
  hook during Kafka install or upgrade, before `trend_service` is applied.
- Broker auto topic creation is disabled through an additive broker override, so
  future shared topics must be declared intentionally in infra.
- This flow does not reconcile an already-existing topic with the wrong shape or
  configuration; legacy drift must be corrected separately.

## Trend Service Auth

- `trend_service` validates bearer tokens against `auth-service` issuer and JWK
  endpoints, so enabling `trend_service` also requires `enable_auth_service=true`.
- `trend_service` currently reuses the shared internal machine audience
  `kino-data-internal`, matching the existing `agent-service` to `data_service`
  token contract.
- The canonical trend smoke path therefore assumes `auth-service`,
  `data_service`, `trend_service`, and Kafka are all enabled and rolled out
before any machine-token check is attempted.

## Browser authentication and OIDC persistence

Kino keeps user profiles in MongoDB. The immutable, opaque `oidcSubject` on a
user is the `sub` claim; it is deliberately separate from both the username and
Mongo `_id`. PostgreSQL `kino_auth` stores only mutable Authorization Server
protocol state: registered clients, authorization codes, consents, and refresh
tokens.

Terraform first runs a root-only Postgres bootstrap Job. It creates `kino_auth`
and two narrow login roles: `kino_auth_migrator` owns the `kino_auth` schema and
performs DDL through a Flyway Job; `kino_auth_runtime` receives only DML grants
for the running auth service. The Deployments wait on that migration Job.

The UI is an OIDC confidential BFF client. Its browser receives only a host-only
HttpOnly, `SameSite=Lax` opaque session cookie. PKCE state, access tokens, and
rotating refresh tokens remain server-side in Redis. By default, user title
requests carry only `kino.data.read` and audience `kino-data-api`. Enabling the
ticket lab adds `kino.ticket.read`, `kino.ticket.write`, and audience
`kino-ticket-api` to the BFF client registration and its requested scopes. The
existing machine audience remains `kino-data-internal`. The canonical OIDC
issuer is the public gateway origin;
Terraform sends `/.well-known/openid-configuration` to `auth_service` while the
protocol endpoints remain under `/api/v1/auth`.

The BFF uses the dedicated `kino-bff` Redis ACL and can access only
`kino:bff:*` keys. Auth/Data continue to use the Redis `default` account for
their own caches and sessions, but cannot read BFF tokens. A Redis ingress
NetworkPolicy accepts port 6379 only from the UI, Auth, and Data pods. Redis
state is intentionally ephemeral in Kino's local/dev environments: a Redis
restart clears BFF sessions and users authenticate again. If a successful
refresh-token rotation cannot be saved to Redis, the BFF clears the cookie and
returns a deterministic reauthentication response instead of retrying a stale
refresh token. The ACL file stores SHA-256 password hashes; only the relevant
Kubernetes runtime Secret contains the BFF's raw credential.

Changing `web_bff_client_secret` or `auth_database_runtime_password` updates the
corresponding Kubernetes Secret and changes a Pod-template checksum. Terraform
therefore performs a controlled auth/UI rollout: the auth service first picks up
the rotated database and BFF credentials and reconciles its registered client,
then the BFF starts with that same client secret. Existing BFF sessions may need
to authenticate again after a BFF client-secret rotation.

## Ticket allocation lab

When `enable_ticket_service=true`, Terraform provisions an isolated
`kino_ticket` PostgreSQL database. The root bootstrap Job creates the database
and narrow migrator/runtime roles; the Flyway Job owns schema and seed DDL; the
Fastify runtime receives only the column-level privileges needed to read seats,
hold them, and confirm them. The service is ClusterIP-only on port `8085` and
is reachable from browsers solely through same-origin Next.js BFF routes. Its
ingress NetworkPolicy permits only the UI pod, where that BFF runs, to reach the
Fastify container on port `8080`. After an enabled ticket deployment, verify
that boundary with `task verify-ticket-network-policy`; it first proves that
the UI/BFF pod can reach the health endpoint, then launches an ordinary pod and
expects its request to be denied. The same policy limits Fastify egress to
PostgreSQL, the in-cluster auth JWK endpoint, and CoreDNS.

The allocation runtime requires PostgreSQL 17 or newer: it uses
`transaction_timeout` so all work in a seat-allocation transaction completes
before the BFF deadline. Any `postgres_image_ref` override must preserve that
version requirement.

The fixed educational screening references IMDb title `tt0000001`. It uses
PostgreSQL row locking and database time for two-minute holds; it intentionally
does not include payments, cancellation, schedule management, or a background
expiry worker. The internal JWK URI remains Kino's explicit local/dev trust
binding rather than OIDC Discovery.

## Agent Service

The LangGraph agent service runs the in-memory `langgraph dev` runtime in
Kubernetes. It is disabled by default and uses `google_genai` with
`gemini-3.1-flash-lite`. Switch the provider to `nvidia_nim` only if you want
to run one of the NVIDIA-hosted models such as DeepSeek V3.2, and then set
`nvidia_api_key` accordingly.

Agent-to-data access now uses short-lived JWT machine tokens issued by
auth-service. Set `agent_service_client_secret` before relying on the discovery
flow. Terraform also generates a persistent RSA signing key for auth-service
and mounts it as a Kubernetes secret so the JWT signing key survives pod
restarts within the same Terraform state.

## Generative Service

The Django generative service now follows the same provider-plus-model contract
shape as the agent service. By default it uses `google_genai` with
`gemini-3.1-flash-lite`. Switch the provider to `huggingface_hub` only if you
want to use one of the Hugging Face-hosted text models such as Phi-3 or
Mixtral, and then set `huggingface_hub_access_token` accordingly. The old
selector sentinels such as `gemini2flash`, `phi3`, and `mixtral8x7b` remain as
one-transition compatibility aliases inside the Django selector, but they are
deprecated and should not be used in new Terraform inputs.

Provider and model must also match the currently supported upstream ids:
`google_genai` supports `gemini-3.1-flash-lite` and `gemini-2.0-flash`, while
`huggingface_hub` supports `microsoft/Phi-3-mini-4k-instruct` and
`mistralai/Mixtral-8x7B-Instruct-v0.1`.

`setup-vault` now writes whichever generative-service provider secret you
actually supply. Under the default Google path, `gemini_api_key` is sufficient;
`huggingface_hub_access_token` is only needed when you switch the provider to
`huggingface_hub`.

## Security

Secrets are managed via:
- **TF_VAR_*** environment variables (`.env` file, gitignored)
- **HashiCorp Vault** for API keys (synced via External Secrets Operator)
- **Terraform state in the local workspace** for this localhost/minikube demo,
  including the auth-service JWT signing key

Runtime defaults:
- `playbook.yaml` starts Docker-backed Minikube with `MINIKUBE_CPUS=6` and `MINIKUBE_MEMORY=14G` unless you choose larger values in the shell or `.env`; its Docker cgroup has no swap
- `mongodb_seed_image_ref` must be the digest-pinned `mongoSeedImageRef` from `jobs/.artifacts/release-manifest.json`
- enabled service Deployments must receive digest-pinned `*_image_ref` values copied from the corresponding GitHub Actions publish run
- when Kafka is enabled, the release creates the shared `title-searches` topic if absent during Kafka install or upgrade; this is not in-place reconciliation
- `mongodb_seed_generation` is the declarative rerun token for the same seed digest; normal releases should not need it
- `mongodb_seed_job_active_deadline_seconds` defaults to `1800` so the canonical Job budget covers image pull + restore on slower local environments; increase it if needed
- `deploy` performs `terraform init`, `validate`, `plan`, and an apply with parallelism 2; it does not mutate Vault state
- `kubectl rollout restart` is a debugging-only action; release intent belongs in Terraform inputs
- `setup-vault` and `cleanup-vault-bootstrap` manage the local Vault bootstrap artifacts that live outside Terraform state

Destroying the stack with `task destroy` removes only Terraform-managed resources. Use `task cleanup-vault-bootstrap` to remove the local Vault bootstrap artifacts created by `setup-vault`. `task clean` runs both flows, deletes only the `minikube` profile, confirms that profile is gone, and only then removes local Terraform state. It does not use Minikube's global `--purge` option.

Never commit:
- `.env`
- `*.tfvars`
- `*.tfstate`
- `cluster-keys.json`

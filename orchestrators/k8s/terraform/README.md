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
    ├── helm.tf       # Kafka, RabbitMQ, Prometheus, Grafana, Vault, ESO
    └── services.tf   # Auth, Data, Trend, Generative, Agent, UI, Ingress
```

## Prerequisites

- Minikube
- kubectl
- Terraform >= 1.7
- Ansible
- Task (go-task.dev)

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
# Optional local Minikube + /etc/hosts prep
task bootstrap-local-env

# Deploy infrastructure only
task deploy

# If you need Vault-backed runtime secrets for local development
task setup-vault

# Or do both in one step
task deploy-with-vault

# Update Vault-backed secrets only
task setup-vault

# Tear down
task destroy

# Full reset, including local Minikube state
task clean
```

## Release Handoff

Canonical deployment uses immutable image refs:

1. Publish the Mongo seed locally and copy `mongoSeedImageRef` from `jobs/.artifacts/release-manifest.json`.
2. Publish each enabled service image through its GitHub Actions workflow and copy the digest-pinned image ref from the workflow summary or uploaded `release-manifest.json` artifact.
   Merged canonical-branch pushes remain the default path, but operators may also run the workflow manually on `master` or `develop` with `publish_image=true`.
3. Manual dispatch on any other ref, or with `publish_image=false`, stays validation-only and does not publish an image.
4. Set `mongodb_seed_image_ref` and the matching `*_image_ref` variables in `.env` or `terraform.tfvars`.
   If your environment is slow to pull the seed image, also set `mongodb_seed_job_active_deadline_seconds`.
   Normal releases change the image ref itself; `mongodb_seed_generation` is only the explicit rerun token for reapplying the same seed digest.
5. Run `task deploy`.

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
| `enable_trend_service` | `bool` | `true` | Enable Kino Trend Service |
| `enable_generative_service` | `bool` | `true` | Enable Kino Generative Service |
| `enable_agent_service` | `bool` | `false` | Enable Kino Agent Service |
| `enable_ui` | `bool` | `true` | Enable Kino UI |
| `enable_prometheus` | `bool` | `true` | Enable Prometheus system |
| `enable_grafana` | `bool` | `true` | Enable Grafana system |
| `enable_ingress` | `bool` | `true` | Enable Gateway Ingress |
| `auth_service_image_ref` | `string` | `null` | Digest-pinned auth-service image used by the Deployment when auth-service is enabled |
| `data_service_image_ref` | `string` | `null` | Digest-pinned data-service image used by the Deployment when data-service is enabled |
| `trend_service_image_ref` | `string` | `null` | Digest-pinned trend-service image used by the Deployment when trend-service is enabled |
| `generative_service_image_ref` | `string` | `null` | Digest-pinned generative-service image used by the Deployment when generative-service is enabled |
| `agent_service_image_ref` | `string` | `null` | Digest-pinned agent-service image used by the Deployment when agent-service is enabled |
| `ui_image_ref` | `string` | `null` | Digest-pinned UI image used by the Deployment when the UI is enabled |
| `mongodb_password` | `string` | — | MongoDB root password (sensitive) |
| `mongodb_seed_image_ref` | `string` | — | Digest-pinned MongoDB seed image used by the init Job |
| `mongodb_seed_generation` | `number` | `0` | Declarative nonce for rerunning the MongoDB seed Job with the same image ref |
| `mongodb_seed_job_active_deadline_seconds` | `number` | `1800` | Maximum wall-clock time for the MongoDB seed Job, including image pull and restore |
| `postgres_password` | `string` | — | Postgres root password (sensitive) |
| `redis_password` | `string` | — | Redis password (sensitive) |
| `kafka_password` | `string` | — | Kafka password (sensitive) |
| `rabbitmq_password` | `string` | — | RabbitMQ password (sensitive) |
| `rabbitmq_admin_password` | `string` | `null` | Optional RabbitMQ admin password. Falls back to `rabbitmq_password` when unset |
| `agent_service_provider` | `string` | `"google_genai"` | Kino Agent Service model provider |
| `agent_service_model` | `string` | `"gemini-3.1-flash-lite-preview"` | Kino Agent Service model |
| `nvidia_api_key` | `string` | `null` | NVIDIA API key for Kino Agent Service |
| `agent_service_client_secret` | `string` | `"replace-me-agent-secret"` | Auth-service client secret for agent-service machine tokens |

## Outputs

| Output | Description |
|--------|-------------|
| `mongodb_uri` | In-cluster MongoDB connection URI (sensitive) |
| `redis_uri` | In-cluster Redis connection URI (sensitive) |
| `ingress_url` | Ingress Gateway URL |
| `get_grafana_password_cmd` | Command to retrieve Grafana password |

## Agent Service

The LangGraph agent service runs the in-memory `langgraph dev` runtime in
Kubernetes. It is disabled by default and uses DeepSeek V3.2 on `nvidia_nim`
by default, so it requires `nvidia_api_key` when enabled. Set `gemini_api_key`
only if you switch the provider to `google_genai`.

Agent-to-data access now uses short-lived JWT machine tokens issued by
auth-service. Set `agent_service_client_secret` before relying on the discovery
flow. Terraform also generates a persistent RSA signing key for auth-service
and mounts it as a Kubernetes secret so the JWT signing key survives pod
restarts within the same Terraform state.

## Security

Secrets are managed via:
- **TF_VAR_*** environment variables (`.env` file, gitignored)
- **HashiCorp Vault** for API keys (synced via External Secrets Operator)
- **Terraform state in the local workspace** for this localhost/minikube demo,
  including the auth-service JWT signing key

Runtime defaults:
- `playbook.yaml` starts Minikube with conservative defaults (`MINIKUBE_CPUS=4`, `MINIKUBE_MEMORY=7800mb`) unless you override them in the shell or `.env`
- `mongodb_seed_image_ref` must be the digest-pinned `mongoSeedImageRef` from `jobs/.artifacts/release-manifest.json`
- enabled service Deployments must receive digest-pinned `*_image_ref` values copied from the corresponding GitHub Actions publish run
- `mongodb_seed_generation` is the declarative rerun token for the same seed digest; normal releases should not need it
- `mongodb_seed_job_active_deadline_seconds` defaults to `1800` so the canonical Job budget covers image pull + restore on slower local environments; increase it if needed
- `deploy` performs `terraform init`, `validate`, `plan`, and `apply`; it does not mutate Vault state
- `kubectl rollout restart` is a debugging-only action; release intent belongs in Terraform inputs
- `setup-vault` and `cleanup-vault-bootstrap` manage the local Vault bootstrap artifacts that live outside Terraform state

Destroying the stack with `task destroy` removes only Terraform-managed resources. Use `task cleanup-vault-bootstrap` to remove the local Vault bootstrap artifacts created by `setup-vault`. `task clean` runs both flows and deletes Minikube and local state files, but it stops if `terraform destroy` fails so state is not discarded underneath live resources.

Never commit:
- `.env`
- `*.tfvars`
- `*.tfstate`
- `cluster-keys.json`

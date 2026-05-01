# Kino Kubernetes Terraform

Infrastructure as Code for deploying the Kino platform to Kubernetes.
This is a local Minikube workflow, so Terraform state and bootstrap artifacts live in the workspace rather than in a remote backend.

## Architecture

```
Taskfile.yml          # Orchestration (deploy, destroy, setup-vault, clean)
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
cd orchestrators/k8s/terraform
cp .env.example .env
# Edit .env with your API keys and database passwords
```

```bash
# Deploy everything
task deploy

# Update secrets only
task setup-vault

# Tear down
task destroy

# Full reset, including local Minikube state
task clean
```

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
| `mongodb_password` | `string` | — | MongoDB root password (sensitive) |
| `postgres_password` | `string` | — | Postgres root password (sensitive) |
| `redis_password` | `string` | — | Redis password (sensitive) |
| `kafka_password` | `string` | — | Kafka password (sensitive) |
| `rabbitmq_password` | `string` | — | RabbitMQ password (sensitive) |
| `rabbitmq_admin_password` | `string` | `null` | Optional RabbitMQ admin password. Falls back to `rabbitmq_password` when unset |
| `agent_service_provider` | `string` | `"nvidia_nim"` | Kino Agent Service model provider |
| `agent_service_model` | `string` | `"deepseek-ai/deepseek-v3.2"` | Kino Agent Service model |
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

Destroying the stack with `task destroy` removes the Terraform-managed resources plus the Vault bootstrap artifacts created by `setup-vault`. `task clean` additionally deletes Minikube and local state files.

Never commit:
- `.env`
- `*.tfvars`
- `*.tfstate`
- `cluster-keys.json`

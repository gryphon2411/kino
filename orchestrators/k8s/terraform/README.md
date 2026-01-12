# Derkino Kubernetes Terraform

Infrastructure as Code for deploying the Derkino platform to Kubernetes.

## Architecture

```
Taskfile.yml          # Orchestration (deploy, destroy, setup-vault)
├── playbook.yaml     # Ansible for Minikube + /etc/hosts + retries
└── *.tf              # Terraform for K8s resources
    ├── versions.tf   # Terraform & provider version constraints
    ├── providers.tf  # Provider configuration
    ├── variables.tf  # Input variables
    ├── outputs.tf    # Output values
    ├── namespaces.tf # Namespace resources
    ├── databases.tf  # MongoDB, Postgres, Redis
    ├── helm.tf       # Kafka, RabbitMQ, Prometheus, Grafana, Vault, ESO
    └── services.tf   # Auth, Data, Trend, Generative, UI, Ingress
```

## Prerequisites

- Minikube
- kubectl
- Terraform >= 1.7
- Ansible
- Task (go-task.dev)

## Quick Start

```bash
# Configure secrets
cp .env.example .env
# Edit .env with your API keys and passwords

# Deploy everything
task deploy

# Update secrets only
task setup-vault

# Tear down
task destroy
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
| `enable_auth_service` | `bool` | `true` | Enable Derkino Auth Service |
| `enable_data_service` | `bool` | `true` | Enable Derkino Data Service |
| `enable_trend_service` | `bool` | `true` | Enable Derkino Trend Service |
| `enable_generative_service` | `bool` | `true` | Enable Derkino Generative Service |
| `enable_ui` | `bool` | `true` | Enable Derkino UI |
| `enable_prometheus` | `bool` | `true` | Enable Prometheus system |
| `enable_grafana` | `bool` | `true` | Enable Grafana system |
| `enable_ingress` | `bool` | `true` | Enable Gateway Ingress |
| `mongodb_password` | `string` | — | MongoDB root password (sensitive) |
| `postgres_password` | `string` | — | Postgres root password (sensitive) |
| `redis_password` | `string` | — | Redis password (sensitive) |
| `kafka_password` | `string` | — | Kafka password (sensitive) |
| `rabbitmq_password` | `string` | — | RabbitMQ password (sensitive) |

## Outputs

| Output | Description |
|--------|-------------|
| `mongodb_uri` | MongoDB connection URI (sensitive) |
| `redis_uri` | Redis connection URI (sensitive) |
| `ingress_url` | Ingress Gateway URL |
| `grafana_admin_password` | Grafana admin password |
| `get_grafana_password_cmd` | Command to retrieve Grafana password |

## Security

Secrets are managed via:
- **TF_VAR_*** environment variables (`.env` file, gitignored)
- **HashiCorp Vault** for API keys (synced via External Secrets Operator)

Never commit:
- `.env`
- `*.tfvars`
- `*.tfstate`
- `cluster-keys.json`

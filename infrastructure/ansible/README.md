# Ansible Development Environment

This directory contains Ansible playbooks and roles for deploying the Derkino 
application infrastructure.

## Virtual Environment Setup

A Python virtual environment is configured for Ansible development to avoid 
system Python conflicts.

### Activating the Virtual Environment

```bash
# Navigate to this directory
cd /home/eido/code/derkino/infrastructure/ansible

# Activate the virtual environment
source .venv/bin/activate

# Verify Ansible is available
ansible --version
ansible-lint --version
```

### Installing Dependencies

Dependencies are already installed in the virtual environment:
- `ansible` - Core automation tool
- `ansible-lint` - Linting and validation

To install additional packages:
```bash
source .venv/bin/activate
pip install <package-name>
```

### Running Ansible Playbooks

**Important**: You must activate the Python virtual environment before running Ansible playbooks.

```bash
# Activate the virtual environment
source .venv/bin/activate

# Run playbook with local inventory (using secure vault password)
# Option 1: Environment variable
export ANSIBLE_VAULT_PASSWORD="your_secure_password"
ansible-playbook -i inventory/local deploy.yml

# Option 2: External password file
ansible-playbook -i inventory/local deploy.yml --vault-password-file ~/.derkino-vault-password

# Option 3: Prompt for password
ansible-playbook -i inventory/local deploy.yml --ask-vault-pass

# Run with migration enabled
ansible-playbook -i inventory/local deploy.yml -e "migration_enabled=true" --vault-password-file ~/.derkino-vault-password
```

## Directory Structure

```
infrastructure/ansible/
├── deploy.yml              # Main deployment playbook
├── environments/           # Environment-specific variables
├── group_vars/            # Global variables
├── inventory/             # Inventory files
├── roles/                 # Ansible roles
│   ├── common/           # Common tasks
│   ├── helm/             # Helm chart deployment
│   ├── kubernetes/       # Kubernetes resource management
│   ├── migration/        # Zero-downtime migration
│   ├── secrets/          # Secret management with Vault
│   └── ingress/          # Ingress configuration
├── .venv/                # Python virtual environment (gitignored)
└── .gitignore            # Git ignore rules
```

## Development Workflow

1. **Activate virtual environment**: `source .venv/bin/activate`
2. **Edit playbooks/roles**: Make changes to YAML files
3. **Validate with ansible-lint**: `ansible-lint deploy.yml`
4. **Test locally**: `ansible-playbook -i inventory/local deploy.yml -e 
"deployment_environment=local"`
5. **Commit changes**: Git will ignore virtual environment files

## Secrets & Vault

This project uses Ansible Vault for secure secret management. Secrets are loaded directly into memory from encrypted files or environment variables, avoiding plaintext exposure.

### Vault Usage

**For encrypted secrets files:**
```bash
# Edit encrypted secrets file
ansible-vault edit infrastructure/secrets/local/secrets.yml

# Create new encrypted secrets file
ansible-vault create infrastructure/secrets/local/secrets.yml
```

**For environment variable approach (recommended):**
```bash
# Set secrets as environment variables
export ANSIBLE_VAULT_PASSWORD="your_vault_password"
export secrets_vault_mongodb_root_password="your_mongodb_password"
export secrets_vault_postgres_root_password="your_postgres_password"
export secrets_vault_redis_default_password="your_redis_password"
export secrets_vault_kafka_sasl_password="your_kafka_password"

# Run playbook with environment variables
ansible-playbook -i inventory/local deploy.yml
```

**In CI, set the vault password and secrets as GitHub Secrets:**
```bash
ansible-playbook deploy.yml --vault-password-file /path/to/vault-pass
```

### Security Practices

- Never commit plaintext secrets or vault password files
- Use environment variables for secrets when possible
- Ensure proper file permissions (0600) for vault password files
- Set `no_log: true` on tasks that handle sensitive data
- Rotate vault passwords periodically for sensitive environments

## Role Documentation

### Helm Role
Deploys infrastructure components using Helm charts with comprehensive health 
checks and rollback procedures.

**Key Features:**
- Zero-downtime upgrades using `helm upgrade --install`
- Service connectivity testing after deployment
- Automatic rollback on failure using block/rescue patterns
- Namespace management with `--create-namespace`

**Configuration:**
- `helm_infrastructure_namespace`: Target namespace (default: "infrastructure")
- `helm_charts_path`: Path to Helm charts directory

### Migration Role
Implements zero-downtime migration from kubectl manifests to Helm charts.

**Migration Process:**
1. Deploy parallel infrastructure in `infrastructure-parallel` namespace
2. Wait for parallel services to be ready
3. Test connectivity to parallel services
4. Switch traffic using service selector patches
5. Remove original kubectl infrastructure

**Safety Features:**
- Conditional execution based on existing infrastructure
- Rollback procedures for failed traffic switching
- Comprehensive health checks throughout migration

### Secrets Role
Manages Kubernetes secrets using Ansible Vault for secure secret storage.

**Workflow:**
1. Ensure vault password file exists
2. Decrypt secrets file if encrypted
3. Apply secrets to Kubernetes
4. Re-encrypt secrets file

**Security:**
- Vault password stored in environment variable or group_vars
- Secrets file encrypted at rest
- Proper file permissions (0600) for vault password

## Troubleshooting

### Common Issues

**Helm Repository Issues:**
```bash
# Add repository manually if needed
helm repo add derkino-infrastructure 
infrastructure/helm-charts/derkino-infrastructure
helm repo update derkino-infrastructure
```

**Kubernetes Connectivity:**
```bash
# Verify kubectl can connect to cluster
kubectl cluster-info
kubectl get nodes
```

**Ansible Vault Issues:**
```bash
# Set vault password environment variable
export ANSIBLE_VAULT_PASSWORD="your_password"
```

**Rollback Procedures:**
If a deployment fails, the playbook automatically rolls back using Helm 
uninstall commands. Manual intervention may be required for complex failures.

## Quality Assurance

### Code Quality

The Ansible codebase follows strict quality standards:

- **ansible-lint compliance**: All code passes default ansible-lint rules
- **FQCN usage**: Uses `ansible.builtin.*` for built-in modules
- **Idempotency**: Commands include `changed_when: false` where appropriate
- **YAML formatting**: Proper indentation, line lengths, and no trailing spaces

### Testing Strategies

**Syntax Validation:**
```bash
ansible-playbook --syntax-check deploy.yml -e "deployment_environment=local"
```

**Dry-Run Testing:**
```bash
ansible-playbook --check deploy.yml -e "deployment_environment=local"
```

**Linting:**
```bash
ansible-lint deploy.yml
```

**Service Connectivity Testing:**
- MongoDB: `mongosh --eval "db.adminCommand({ping: 1})"`
- PostgreSQL: `psql -U postgres -c "SELECT 1;"`
- Redis: `redis-cli ping`
- Kafka: `kafka-topics.sh --bootstrap-server localhost:9092 --list`

## Milestone 2: Infrastructure Migration

This Ansible implementation completes **Milestone 2: Infrastructure Migration** 
which replaces kubectl manifests with version-controlled Helm charts driven by 
Ansible.

### Key Achievements

✅ **Helm Charts**: 4 core infrastructure components (MongoDB, PostgreSQL, 
Redis-Stack, Kafka)
✅ **Ansible Roles**: Helm deployment, zero-downtime migration, secrets 
management
✅ **Quality Standards**: Full ansible-lint compliance with default rules
✅ **Service Connectivity**: Comprehensive health checks and connectivity 
testing
✅ **Rollback Procedures**: Automatic recovery from failed deployments
✅ **Documentation**: Complete deployment workflow and troubleshooting guide

### Success Metrics

- **Deployment time**: ≤ 15 minutes from clean cluster to running services
- **Lint compliance**: `ansible-lint` returns 0 failures, 0 warnings
- **Migration safety**: Zero-downtime switch from kubectl to Helm
- **Team adoption**: Clear documentation for ≤ 30 minute deployment

## Git Ignore Rules

The `.gitignore` file prevents committing:
- Virtual environment directories (`.venv/`, `venv/`, `env/`)
- Ansible Vault password files
- Temporary files and cache directories
- IDE configuration files
- Local configuration files
# Derkino Infrastructure Deployment

This directory contains the Ansible and Helm-based deployment system for Derkino infrastructure.

## Requirements

Install these locally to match CI:

| Component | Version | Purpose |
|-----------|---------|---------|
| Python | 3.11 | Runtime environment |
| Helm | 3.14.0 | Kubernetes package manager |
| ansible-core | 2.19.3 | Core Ansible functionality |
| ansible | 12.1.0 | Infrastructure automation |
| ansible-lint | 25.9.2 | Ansible code quality |
| yamllint | 1.37.1 | YAML file validation |

Run the same checks locally:

```bash
python -m pip install --upgrade pip
python -m pip install yamllint==1.37.1 ansible==12.1.0 ansible-lint==25.9.2
helm dependency build infrastructure/helm-charts/derkino-infrastructure/
yamllint infrastructure/ -c infrastructure/ansible/.yamllint
ansible-galaxy collection install -r infrastructure/ansible/collections/requirements.yml
ansible-playbook --syntax-check infrastructure/ansible/deploy.yml -e "deployment_environment=local"
```

## CI Validation Pipeline

### Prerequisites
- Helm 3.14+

### Pipeline Sequence

#### 1. Checkout Repository
```bash
git clone https://github.com/gryphon2411/derkino.git
cd derkino
```

#### 2. Build Dependencies from Lock File
```bash
cd infrastructure/helm-charts/derkino-infrastructure
helm dependency build .
```

#### 3. Validate the Chart
```bash
helm lint --with-subcharts .
```

#### 4. Template Validation (Most Powerful Check)
```bash
helm template --debug .
```

### Local Development Workflow

#### For Infrastructure Changes
1. Make changes to Helm charts or Ansible playbooks
2. Test locally:
   ```bash
   cd infrastructure/helm-charts/derkino-infrastructure
   helm dependency update .
   helm lint --with-subcharts .
   ```
3. Commit changes including updated `Chart.lock` file
4. Push to trigger CI/CD pipeline

#### For Dependency Updates
1. Update dependency versions in `Chart.yaml` files
2. Run:
   ```bash
   helm dependency update .
   ```
3. Commit updated `Chart.lock` file
4. The CI/CD pipeline will use `helm dependency build` for reproducible builds

### File Structure

```
infrastructure/
├── ansible/                    # Ansible playbooks and roles
│   ├── deploy.yml             # Main deployment playbook
│   ├── roles/
│   │   ├── helm/              # Helm deployment tasks
│   │   ├── secrets/           # Secret management
│   │   └── migration/         # Zero-downtime migration
│   └── inventory/             # Environment-specific configurations
├── helm-charts/               # Helm charts
│   └── derkino-infrastructure/
│       ├── Chart.yaml         # Parent chart definition
│       ├── Chart.lock         # Dependency lock file
│       ├── values.yaml        # Default values
│       ├── .gitignore         # Exclude downloaded dependencies
│   └── charts/            # Subcharts
│       ├── mongodb/
│       ├── postgresql/
│       ├── redis-stack/
│       └── kafka/
└── secrets/                   # Encrypted secrets (not in repo)
```

### Smoke Tests

Run comprehensive smoke tests to validate infrastructure:

```bash
./infrastructure/smoke-tests.sh
```

This validates Helm chart linting, template generation, and Ansible syntax/idempotency.

### Security

- **Secure secret handling**: Secrets managed via Ansible Vault with `no_log: true` to prevent logging
- **Non-root containers**: All infrastructure components run with `runAsNonRoot: true`
- **StatefulSet for databases**: MongoDB and PostgreSQL use StatefulSet for stable storage and network identity
- **Secret scanning**: CI pipeline includes TruffleHog to detect accidental secret commits
- **Downloaded Helm dependencies excluded** via `.gitignore`
- **All configurations version-controlled**
- **Dependencies pinned** via `Chart.lock` for reproducible builds

### Pre-commit Hooks

Install and configure pre-commit hooks for automated code quality checks:

```bash
# Install pre-commit and detect-secrets
pip install pre-commit detect-secrets

# Install the pre-commit hooks
pre-commit install

# Run pre-commit on all files
pre-commit run --all-files
```

### Molecule Testing

Run Molecule tests for Ansible roles to ensure role functionality:

```bash
# Navigate to the role directory
cd infrastructure/ansible/roles/common

# Run Molecule tests (requires Docker)
molecule test

# Run specific scenario
molecule test -s default
```

The Molecule configuration includes comprehensive testing for the common role with proper Docker driver setup.

### Troubleshooting

#### Dependency Issues
If you encounter dependency warnings:
```bash
cd infrastructure/helm-charts/derkino-infrastructure
helm dependency update .
helm dependency build .
```

#### Validation Failures
Check the specific component:
```bash
# Check individual chart
helm lint charts/mongodb/

# Check Ansible syntax
ansible-playbook --syntax-check deploy.yml
```

This workflow ensures reliable, reproducible infrastructure deployments following Helm and Ansible best practices.
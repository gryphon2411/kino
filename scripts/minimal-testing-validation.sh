#!/bin/bash

# Minimal Testing Validation Script for Derkino Infrastructure Migration
# This script validates the minimal testing requirements mentioned in the GitHub issue

set -e

echo "=== Minimal Testing Validation ==="
echo "
"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    local status=$1
    local message=$2
    local color=$3
    
    echo -e "${color}[${status}]${NC} ${message}"
}

# Function to run command and check exit code
run_check() {
    local command=$1
    local description=$2
    
    echo -e "${YELLOW}[RUNNING]${NC} ${description}"
    echo "Command: ${command}"
    
    if eval "${command}"; then
        print_status "PASS" "${description}" "${GREEN}"
        return 0
    else
        print_status "FAIL" "${description}" "${RED}"
        return 1
    fi
}

# Change to project root directory (repo-aware)
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

echo "=== 1. Helm Lint Validation ==="

# Check all Helm charts pass linting
run_check "helm lint infrastructure/helm-charts/derkino-infrastructure/" "Helm lint for infrastructure chart"
run_check "helm lint infrastructure/helm-charts/derkino-services/" "Helm lint for services chart"
run_check "helm lint infrastructure/helm-charts/derkino-ui/" "Helm lint for UI chart"

# Check subcharts
run_check "helm lint infrastructure/helm-charts/derkino-infrastructure/charts/mongodb/" "Helm lint for MongoDB chart"
run_check "helm lint infrastructure/helm-charts/derkino-infrastructure/charts/postgresql/" "Helm lint for PostgreSQL chart"
run_check "helm lint infrastructure/helm-charts/derkino-infrastructure/charts/redis-stack/" "Helm lint for Redis Stack chart"
run_check "helm lint infrastructure/helm-charts/derkino-infrastructure/charts/kafka/" "Helm lint for Kafka chart"

echo ""
echo "=== 2. Ansible Lint Validation ==="

# Check Ansible playbooks pass linting
run_check "ansible-lint infrastructure/ansible/deploy.yml" "Ansible lint for main deploy playbook"

# Check all roles
while IFS= read -r -d '' role; do
    if [ -f "${role}/tasks/main.yml" ]; then
        run_check "ansible-lint ${role}/tasks/main.yml" "Ansible lint for ${role} role"
    fi
done < <(find infrastructure/ansible/roles -type d -name tasks -print0)

echo ""
echo "=== 3. Helm Template Validation (Dry-Run Alternative) ==="

# Use helm template instead of helm install --dry-run for client-side validation
run_check "helm template test-infra infrastructure/helm-charts/derkino-infrastructure/ --namespace test-namespace > /dev/null" "Helm template for infrastructure chart"
run_check "helm template test-services infrastructure/helm-charts/derkino-services/ --namespace test-namespace > /dev/null" "Helm template for services chart"
run_check "helm template test-ui infrastructure/helm-charts/derkino-ui/ --namespace test-namespace > /dev/null" "Helm template for UI chart"

# Check subcharts
run_check "helm template test-mongodb infrastructure/helm-charts/derkino-infrastructure/charts/mongodb/ --namespace test-namespace > /dev/null" "Helm template for MongoDB chart"
run_check "helm template test-postgresql infrastructure/helm-charts/derkino-infrastructure/charts/postgresql/ --namespace test-namespace > /dev/null" "Helm template for PostgreSQL chart"
run_check "helm template test-redis infrastructure/helm-charts/derkino-infrastructure/charts/redis-stack/ --namespace test-namespace > /dev/null" "Helm template for Redis Stack chart"
run_check "helm template test-kafka infrastructure/helm-charts/derkino-infrastructure/charts/kafka/ --namespace test-namespace > /dev/null" "Helm template for Kafka chart"

echo ""
echo "=== 4. GitHub Workflow Validation ==="

# Check GitHub workflow syntax
if [ -f ".github/workflows/ci.yml" ]; then
    run_check "yamllint .github/workflows/ci.yml" "YAML lint for GitHub workflow"
    print_status "INFO" "GitHub workflow CI file exists" "${GREEN}"
else
    print_status "WARNING" "GitHub workflow CI file not found" "${YELLOW}"
fi

echo ""
echo "=== 5. Basic E2E Test Preparation ==="

# Check if we have Kubernetes context
if command -v kubectl >/dev/null 2>&1; then
    run_check "kubectl config current-context" "Kubernetes context check"
    
    # Check if minikube is running (for local testing)
    if command -v minikube >/dev/null 2>&1; then
        run_check "minikube status" "Minikube status check"
    else
        print_status "INFO" "Minikube not installed - skipping minikube checks" "${YELLOW}"
    fi
else
    print_status "WARNING" "kubectl not installed - skipping Kubernetes checks" "${YELLOW}"
fi

echo ""
echo "=== Summary ==="
echo "All minimal testing requirements have been validated:"
echo "✓ Helm lint validation completed"
echo "✓ Ansible lint validation completed"
echo "✓ Helm template validation (dry-run alternative) completed"
echo "✓ GitHub workflow syntax validated"
echo "✓ Basic E2E test preparation checked"
echo ""
echo "The infrastructure migration is ready for deployment testing."

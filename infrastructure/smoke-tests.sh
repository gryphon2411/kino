#!/bin/bash

# Helm Smoke Tests
echo "Running Helm smoke tests..."

# Test Helm chart linting
for chart in derkino-infrastructure derkino-services derkino-ui; do
  echo "Linting chart: $chart"
  helm lint infrastructure/helm-charts/$chart/
  if [ $? -ne 0 ]; then
    echo "❌ Helm lint failed for $chart"
    exit 1
  fi
  echo "✅ Helm lint passed for $chart"

  # Test Helm template generation
  echo "Testing template generation for: $chart"
  helm template infrastructure/helm-charts/$chart/ --debug
  if [ $? -ne 0 ]; then
    echo "❌ Helm template failed for $chart"
    exit 1
  fi
  echo "✅ Helm template passed for $chart"
done

# Test kubeval validation (if available)
if command -v kubeval &> /dev/null; then
  echo "Running kubeval validation..."
  helm template infrastructure/helm-charts/derkino-infrastructure/ | kubeval --strict
  if [ $? -ne 0 ]; then
    echo "❌ kubeval validation failed"
    exit 1
  fi
  echo "✅ kubeval validation passed"
fi

# Ansible Smoke Tests
echo "Running Ansible smoke tests..."

# Test Ansible syntax check
ansible-playbook infrastructure/ansible/deploy.yml --syntax-check
if [ $? -ne 0 ]; then
  echo "❌ Ansible syntax check failed"
  exit 1
fi
echo "✅ Ansible syntax check passed"

# Test idempotency (dry-run)
echo "Testing Ansible idempotency (dry-run)..."
ansible-playbook infrastructure/ansible/deploy.yml --check
if [ $? -ne 0 ]; then
  echo "❌ Ansible idempotency test failed"
  exit 1
fi
echo "✅ Ansible idempotency test passed"

echo "🎉 All smoke tests passed successfully!"
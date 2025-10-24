# CI Validation Workflow Reference Guide

## Quick Reference

### Local Development
```bash
# 1. Update dependencies (when changing Chart.yaml)
cd infrastructure/helm-charts/derkino-infrastructure
helm dependency update .

# 2. Validate changes
helm lint --with-subcharts .

# 3. Commit including Chart.lock
git add Chart.lock
git commit -m "feat(infra): Update dependencies"
```

### CI Validation Pipeline (Automated)
```bash
# 1. Checkout code (automated)
cd infrastructure/helm-charts/derkino-infrastructure

# 2. Build dependencies from lock file
helm dependency build .  # Uses Chart.lock for reproducibility

# 3. Validate chart
helm lint --with-subcharts .

# 4. Template validation (most powerful check)
helm template --debug .
```

### Key Files
- `Chart.lock` - Dependency lock file for reproducible builds
- `.gitignore` - Excludes downloaded dependency artifacts
- `Chart.yaml` - Defines dependencies and aliases
- `values.yaml` - Configuration values

### Workflow Benefits
- **Reproducible**: Lock file ensures consistent dependency versions
- **Secure**: Downloaded artifacts excluded from repository
- **Automated**: GitHub Actions handles validation and deployment
- **Reliable**: Build from lock file prevents unexpected changes
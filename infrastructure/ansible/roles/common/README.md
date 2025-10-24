# Common Role

This role provides shared utilities and configurations used across all deployments.

## Purpose

- Set common environment variables and defaults
- Ensure kubectl context is properly configured
- Create deployment namespaces
- Define common labels for resources

## Variables

- `deployment_namespace`: Namespace for deployments (default: "derkino")
- `helm_timeout`: Timeout for Helm operations (default: "600s")
- `kubectl_context`: Kubernetes context to use (default: "minikube")

## Usage

This role is automatically included by the main deployment playbook and provides foundational configuration for all infrastructure components.
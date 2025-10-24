# Kubernetes Role

This role handles cluster-wide operations and resource validation.

## Purpose

- Verify Kubernetes cluster connectivity
- Check cluster resources and readiness
- Validate cluster configuration
- Provide cluster status information

## Variables

- `kubernetes_cluster_name`: Detected cluster name
- `kubernetes_node_count`: Number of nodes in the cluster

## Usage

This role runs cluster-level validation and provides cluster context for subsequent deployment tasks.
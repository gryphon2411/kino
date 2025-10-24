# Redis-Stack Helm Chart

A Helm chart for deploying Redis-Stack in Kubernetes.

## Configuration

### Values

| Parameter | Description | Default |
|-----------|-------------|---------|
| `namespace.create` | Whether to create the namespace | `true` |
| `namespace.name` | Name of the namespace | `redis-stack-system` |
| `secret.name` | Name of the secret for credentials | `redis-stack-default-user-credentials` |
| `secret.username` | Redis username | `default` |
| `secret.password` | Redis password | `pu9oq47y7Pgso3RRZLC` |
| `service.name` | Service name | `redis-stack` |
| `service.type` | Service type | `NodePort` |
| `service.ports.default.port` | Default service port | `6379` |
| `service.ports.default.targetPort` | Default target port | `6379` |
| `service.ports.http.port` | HTTP service port | `8001` |
| `service.ports.http.targetPort` | HTTP target port | `8001` |
| `statefulset.name` | StatefulSet name | `redis-stack` |
| `statefulset.replicas` | Number of replicas | `1` |
| `statefulset.image.repository` | Redis-Stack image repository | `redis/redis-stack` |
| `statefulset.image.tag` | Redis-Stack image tag | `latest` |
| `statefulset.containerPorts.default` | Default container port | `6379` |
| `statefulset.containerPorts.http` | HTTP container port | `8001` |

### Usage

```bash
# Install the chart
helm install redis-stack ./charts/redis-stack

# Upgrade the chart
helm upgrade redis-stack ./charts/redis-stack

# Uninstall the chart
helm uninstall redis-stack
```

### Custom Values

Create a custom values file:

```yaml
# custom-values.yaml
namespace:
  create: true
  name: redis-stack-system

secret:
  username: redisuser
  password: mysecurepassword

statefulset:
  replicas: 3
```

Then install with custom values:

```bash
helm install redis-stack ./charts/redis-stack -f custom-values.yaml
```

## Migration from Legacy Deployment

This chart replaces the legacy Redis-Stack deployment defined in `orchestrators/k8s/redis-stack-system.yaml`.

### Migration Steps

1. **Deploy new chart**: Install the Helm chart alongside the existing deployment
2. **Validate connectivity**: Test that applications can connect to the new Redis-Stack instance
3. **Update applications**: Point applications to the new Redis-Stack service
4. **Remove legacy deployment**: Delete the old Redis-Stack resources

## Security

- **Credentials**: Passwords should be managed via Ansible Vault in production
- **NetworkPolicy**: Basic network policy restricts access to derkino namespace only
- **RBAC**: Minimal permissions required for deployment

## Multi-Port Support

Redis-Stack exposes two ports:
- **6379**: Default Redis protocol port
- **8001**: HTTP interface for Redis Insight

Both ports are exposed via the same service with different port names.
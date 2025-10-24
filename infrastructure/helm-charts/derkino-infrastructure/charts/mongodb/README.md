# MongoDB Helm Chart

A Helm chart for deploying MongoDB in Kubernetes.

## Configuration

### Values

| Parameter | Description | Default |
|-----------|-------------|---------|
| `namespace.create` | Whether to create the namespace | `true` |
| `namespace.name` | Name of the namespace | `mongodb-system` |
| `secret.name` | Name of the secret for credentials | `mongodb-root-user-credentials` |
| `secret.username` | MongoDB root username | `root` |
| `secret.password` | MongoDB root password | `X6d9r2SgJ8xQgpGL` |
| `service.name` | Service name | `mongodb` |
| `service.port` | Service port | `27017` |
| `service.targetPort` | Target port | `27017` |
| `service.type` | Service type | `NodePort` |
| `statefulset.name` | StatefulSet name | `mongodb` |
| `statefulset.replicas` | Number of replicas | `1` |
| `statefulset.image.repository` | MongoDB image repository | `mongo` |
| `statefulset.image.tag` | MongoDB image tag | `latest` |
| `statefulset.containerPort` | Container port | `27017` |
| `statefulset.volumeMounts.data.name` | Volume mount name | `mongodb-data` |
| `statefulset.volumeMounts.data.mountPath` | Volume mount path | `/data/db` |
| `statefulset.volumeClaimTemplates.data.name` | PVC name | `mongodb-data` |
| `statefulset.volumeClaimTemplates.data.accessMode` | PVC access mode | `ReadWriteOnce` |
| `statefulset.volumeClaimTemplates.data.storageSize` | PVC storage size | `20Gi` |

### Usage

```bash
# Install the chart
helm install mongodb ./charts/mongodb

# Upgrade the chart
helm upgrade mongodb ./charts/mongodb

# Uninstall the chart
helm uninstall mongodb
```

### Custom Values

Create a custom values file:

```yaml
# custom-values.yaml
namespace:
  create: true
  name: mongodb-system

secret:
  username: admin
  password: mysecurepassword

statefulset:
  replicas: 3
  volumeClaimTemplates:
    data:
      storageSize: 50Gi
```

Then install with custom values:

```bash
helm install mongodb ./charts/mongodb -f custom-values.yaml
```

## Migration from Legacy Deployment

This chart replaces the legacy MongoDB deployment defined in `orchestrators/k8s/mongodb-system.yaml`.

### Migration Steps

1. **Backup existing data**: Ensure you have a backup of your MongoDB data
2. **Deploy new chart**: Install the Helm chart alongside the existing deployment
3. **Validate connectivity**: Test that applications can connect to the new MongoDB instance
4. **Migrate data**: Use MongoDB tools to migrate data from old to new instance
5. **Update applications**: Point applications to the new MongoDB service
6. **Remove legacy deployment**: Delete the old MongoDB resources

## Security

- **Credentials**: Passwords should be managed via Ansible Vault in production
- **NetworkPolicy**: Basic network policy restricts access to derkino namespace only
- **RBAC**: Minimal permissions required for deployment
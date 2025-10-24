# PostgreSQL Helm Chart

A Helm chart for deploying PostgreSQL in Kubernetes.

## Configuration

### Values

| Parameter | Description | Default |
|-----------|-------------|---------|
| `namespace.create` | Whether to create the namespace | `true` |
| `namespace.name` | Name of the namespace | `postgres-system` |
| `secret.name` | Name of the secret for credentials | `postgres-root-user-credentials` |
| `secret.username` | PostgreSQL username | `postgres` |
| `secret.password` | PostgreSQL password | `VCi6aCUFzU49J4aK3HX` |
| `service.name` | Service name | `postgres` |
| `service.port` | Service port | `5432` |
| `service.targetPort` | Target port | `5432` |
| `service.type` | Service type | `NodePort` |
| `statefulset.name` | StatefulSet name | `postgres` |
| `statefulset.replicas` | Number of replicas | `1` |
| `statefulset.image.repository` | PostgreSQL image repository | `postgres` |
| `statefulset.image.tag` | PostgreSQL image tag | `latest` |
| `statefulset.containerPort` | Container port | `5432` |
| `statefulset.volumeMounts.data.name` | Data volume mount name | `postgres-data` |
| `statefulset.volumeMounts.data.mountPath` | Data volume mount path | `/var/lib/postgresql/data` |
| `statefulset.volumeMounts.initdb.name` | Initdb volume mount name | `postgres-initdb-volume` |
| `statefulset.volumeMounts.initdb.mountPath` | Initdb volume mount path | `/docker-entrypoint-initdb.d/postgres-initdb.sh` |
| `statefulset.volumeMounts.initdb.subPath` | Initdb volume subpath | `postgres-initdb.sh` |
| `statefulset.volumeClaimTemplates.data.name` | PVC name | `postgres-data` |
| `statefulset.volumeClaimTemplates.data.accessMode` | PVC access mode | `ReadWriteOnce` |
| `statefulset.volumeClaimTemplates.data.storageSize` | PVC storage size | `20Gi` |
| `configmap.name` | ConfigMap name | `postgres-initdb` |
| `configmap.script` | Initdb script content | Creates `derkino` database |

### Usage

```bash
# Install the chart
helm install postgresql ./charts/postgresql

# Upgrade the chart
helm upgrade postgresql ./charts/postgresql

# Uninstall the chart
helm uninstall postgresql
```

### Custom Values

Create a custom values file:

```yaml
# custom-values.yaml
namespace:
  create: true
  name: postgres-system

secret:
  username: admin
  password: mysecurepassword

statefulset:
  replicas: 2
  volumeClaimTemplates:
    data:
      storageSize: 50Gi
```

Then install with custom values:

```bash
helm install postgresql ./charts/postgresql -f custom-values.yaml
```

## Migration from Legacy Deployment

This chart replaces the legacy PostgreSQL deployment defined in `orchestrators/k8s/postgres-system.yaml`.

### Migration Steps

1. **Backup existing data**: Ensure you have a backup of your PostgreSQL data
2. **Deploy new chart**: Install the Helm chart alongside the existing deployment
3. **Validate connectivity**: Test that applications can connect to the new PostgreSQL instance
4. **Migrate data**: Use PostgreSQL tools to migrate data from old to new instance
5. **Update applications**: Point applications to the new PostgreSQL service
6. **Remove legacy deployment**: Delete the old PostgreSQL resources

## Security

- **Credentials**: Passwords should be managed via Ansible Vault in production
- **NetworkPolicy**: Basic network policy restricts access to derkino namespace only
- **RBAC**: Minimal permissions required for deployment

## InitDB Script

The chart includes an initdb script that:
- Creates a `derkino` database
- Grants all privileges to the PostgreSQL user
- Runs automatically during database initialization
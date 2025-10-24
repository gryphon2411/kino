# Kafka Helm Chart

A Helm chart for deploying Kafka in Kubernetes using the Bitnami Kafka chart as a dependency.

## Configuration

### Values

| Parameter | Description | Default |
|-----------|-------------|---------|
| `namespace.create` | Whether to create the namespace | `true` |
| `namespace.name` | Name of the namespace | `kafka-system` |
| `kafka.enabled` | Whether to enable Kafka deployment | `true` |
| `image.repository` | Kafka image repository | `bitnamilegacy/kafka` |
| `service.type` | Service type | `NodePort` |
| `clusterId` | Kafka cluster ID | `J1mmUOT9JBz1rNWKu2uZZi` |
| `metrics.jmx.enabled` | Enable JMX metrics | `true` |
| `metrics.jmx.image.repository` | JMX exporter image | `bitnamilegacy/jmx-exporter` |
| `sasl.client.users` | SASL client users | `["root"]` |
| `sasl.client.passwords` | SASL client passwords | `["w43Pw4Q9cb"]` |

### Usage

```bash
# Install the chart
helm install kafka ./charts/kafka

# Upgrade the chart
helm upgrade kafka ./charts/kafka

# Uninstall the chart
helm uninstall kafka
```

### Custom Values

Create a custom values file:

```yaml
# custom-values.yaml
namespace:
  create: true
  name: kafka-system

kafka:
  enabled: true

image:
  repository: my-custom-kafka-image

service:
  type: LoadBalancer
```

Then install with custom values:

```bash
helm install kafka ./charts/kafka -f custom-values.yaml
```

## Migration from Legacy Deployment

This chart replaces the legacy Kafka deployment defined in `orchestrators/k8s/charts/kafka/values.yaml`.

### Migration Steps

1. **Deploy new chart**: Install the Helm chart alongside the existing deployment
2. **Validate connectivity**: Test that applications can connect to the new Kafka instance
3. **Update applications**: Point applications to the new Kafka service
4. **Remove legacy deployment**: Delete the old Kafka resources

## Security

- **Credentials**: Passwords should be managed via Ansible Vault in production
- **NetworkPolicy**: Basic network policy restricts access to derkino namespace only
- **RBAC**: Minimal permissions required for deployment

## Bitnami Dependency

This chart uses the Bitnami Kafka chart as a dependency with version range `~30.0.0` following Helm best practices.

### Version Range Strategy

- `~30.0.0` allows patches but not breaking changes
- Provides stability while allowing security updates
- Follows Helm's recommended versioning approach

## Dependencies

Before installing this chart, ensure the Bitnami repository is added:

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update
```
# Kafka (Helm)
resource "helm_release" "kafka" {
  name       = "kafka"
  repository = "oci://registry-1.docker.io/bitnamicharts"
  chart      = "kafka"
  version    = "32.4.3"
  wait       = false

  set {
    name  = "image.registry"
    value = "docker.io"
  }

  set {
    name  = "image.repository"
    value = "bitnamilegacy/kafka"
  }

  set {
    name  = "metrics.jmx.image.registry"
    value = "docker.io"
  }

  set {
    name  = "metrics.jmx.image.repository"
    value = "bitnamilegacy/jmx-exporter"
  }
  namespace = kubernetes_namespace.kafka_system[0].metadata[0].name
  values    = [file("${path.module}/../charts/kafka/values.yaml")]
  count     = var.enable_kafka ? 1 : 0
}

# RabbitMQ (Helm)
resource "helm_release" "rabbitmq" {
  name       = "rabbitmq"
  repository = "https://charts.bitnami.com/bitnami"
  chart      = "rabbitmq"
  version    = "14.6.5"
  wait       = false

  set {
    name  = "image.registry"
    value = "docker.io"
  }

  set {
    name  = "image.repository"
    value = "bitnamilegacy/rabbitmq"
  }
  namespace = kubernetes_namespace.rabbitmq_system[0].metadata[0].name
  values    = [file("${path.module}/../charts/rabbitmq/values.yaml")]
  count     = var.enable_rabbitmq ? 1 : 0
}

# Prometheus (Helm)
resource "helm_release" "prometheus" {
  name       = "prometheus"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "prometheus"
  version    = "25.8.2"
  namespace  = kubernetes_namespace.prometheus_system[0].metadata[0].name
  values     = [file("${path.module}/../charts/prometheus/values.yaml")]
  count      = var.enable_prometheus ? 1 : 0
  timeout    = 600
}

# Grafana (Helm)
resource "helm_release" "grafana" {
  name       = "grafana"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "grafana"
  version    = "7.0.19"
  namespace  = kubernetes_namespace.grafana_system[0].metadata[0].name
  values     = [file("${path.module}/../charts/grafana/values.yaml")]
  count      = var.enable_grafana ? 1 : 0
}

# Vault & ESO Setup

resource "helm_release" "vault" {
  name       = "vault"
  repository = "https://helm.releases.hashicorp.com"
  chart      = "vault"
  namespace  = "default"
  wait       = false # Important: Avoid deadlock. We unseal AFTER deployment.

  set {
    name  = "server.dev.enabled"
    value = "false"
  }
  set {
    name  = "server.standalone.enabled"
    value = "true"
  }
}

resource "helm_release" "external_secrets" {
  name       = "external-secrets"
  repository = "https://charts.external-secrets.io"
  chart      = "external-secrets"
  namespace  = "default"

  set {
    name  = "installCRDs"
    value = "true"
  }
  timeout = 600
}

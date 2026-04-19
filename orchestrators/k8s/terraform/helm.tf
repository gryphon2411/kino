locals {
  rabbitmq_admin_username   = "default"
  rabbitmq_service_username = "kino-services"
  rabbitmq_admin_password   = coalesce(var.rabbitmq_admin_password, var.rabbitmq_password)
}

resource "kubernetes_secret" "rabbitmq_load_definition" {
  count = var.enable_rabbitmq ? 1 : 0

  metadata {
    name      = "rabbitmq-load-definition"
    namespace = kubernetes_namespace.rabbitmq_system[0].metadata[0].name
  }

  data = {
    "load_definition.json" = jsonencode({
      users = [
        {
          name     = local.rabbitmq_admin_username
          password = local.rabbitmq_admin_password
          tags     = "administrator"
        },
        {
          name     = local.rabbitmq_service_username
          password = var.rabbitmq_password
          tags     = ""
        }
      ]
      vhosts = [
        {
          name = "/"
        }
      ]
      permissions = [
        {
          user      = local.rabbitmq_admin_username
          vhost     = "/"
          configure = ".*"
          read      = ".*"
          write     = ".*"
        },
        {
          user      = local.rabbitmq_service_username
          vhost     = "/"
          configure = ".*"
          read      = ".*"
          write     = ".*"
        }
      ]
    })
  }
}

# Kafka (Helm)
resource "helm_release" "kafka" {
  count = var.enable_kafka ? 1 : 0

  name       = "kafka"
  repository = "oci://registry-1.docker.io/bitnamicharts"
  chart      = "kafka"
  version    = "32.4.3"
  namespace  = kubernetes_namespace.kafka_system[0].metadata[0].name
  values     = [file("${path.module}/../charts/kafka/values.yaml")]

  # Avoid timeout during chart installation
  wait = false

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

  set_sensitive {
    name  = "sasl.client.passwords"
    value = var.kafka_password
  }
}

# RabbitMQ (Helm)
resource "helm_release" "rabbitmq" {
  count = var.enable_rabbitmq ? 1 : 0

  name       = "rabbitmq"
  repository = "https://charts.bitnami.com/bitnami"
  chart      = "rabbitmq"
  version    = "14.6.5"
  namespace  = kubernetes_namespace.rabbitmq_system[0].metadata[0].name
  values     = [file("${path.module}/../charts/rabbitmq/values.yaml")]

  # Avoid timeout during chart installation
  wait = false

  set {
    name  = "image.registry"
    value = "docker.io"
  }

  set {
    name  = "image.repository"
    value = "bitnamilegacy/rabbitmq"
  }

  set {
    name  = "auth.username"
    value = local.rabbitmq_admin_username
  }

  set {
    name  = "auth.securePassword"
    value = "false"
  }

  set {
    name  = "loadDefinition.enabled"
    value = "true"
  }

  set {
    name  = "loadDefinition.existingSecret"
    value = kubernetes_secret.rabbitmq_load_definition[0].metadata[0].name
  }

  set_sensitive {
    name  = "auth.password"
    value = local.rabbitmq_admin_password
  }

  depends_on = [kubernetes_secret.rabbitmq_load_definition]
}

# Prometheus (Helm)
resource "helm_release" "prometheus" {
  count = var.enable_prometheus ? 1 : 0

  name       = "prometheus"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "prometheus"
  version    = "25.8.2"
  namespace  = kubernetes_namespace.prometheus_system[0].metadata[0].name
  values     = [file("${path.module}/../charts/prometheus/values.yaml")]
  timeout    = 600
}

# Grafana (Helm)
resource "helm_release" "grafana" {
  count = var.enable_grafana ? 1 : 0

  name       = "grafana"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "grafana"
  version    = "7.0.19"
  namespace  = kubernetes_namespace.grafana_system[0].metadata[0].name
  values     = [file("${path.module}/../charts/grafana/values.yaml")]
}

# Vault (Helm)
resource "helm_release" "vault" {
  name       = "vault"
  repository = "https://helm.releases.hashicorp.com"
  chart      = "vault"
  version    = "0.29.1"
  namespace  = "default"

  # Avoid deadlock: we unseal AFTER deployment
  wait = false

  set {
    name  = "server.dev.enabled"
    value = "false"
  }

  set {
    name  = "server.standalone.enabled"
    value = "true"
  }
}

# External Secrets Operator (Helm)
resource "helm_release" "external_secrets" {
  name       = "external-secrets"
  repository = "https://charts.external-secrets.io"
  chart      = "external-secrets"
  version    = "0.12.1"
  namespace  = "default"
  timeout    = 600

  set {
    name  = "installCRDs"
    value = "true"
  }
}

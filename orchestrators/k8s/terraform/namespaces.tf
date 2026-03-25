# Namespaces
resource "kubernetes_namespace" "mongodb_system" {
  count = var.enable_mongodb ? 1 : 0

  metadata { name = "mongodb-system" }
}

resource "kubernetes_namespace" "postgres_system" {
  count = var.enable_postgres ? 1 : 0

  metadata { name = "postgres-system" }
}

resource "kubernetes_namespace" "redis_stack_system" {
  count = var.enable_redis ? 1 : 0

  metadata { name = "redis-stack-system" }
}

resource "kubernetes_namespace" "kafka_system" {
  count = var.enable_kafka ? 1 : 0

  metadata { name = "kafka-system" }
}

resource "kubernetes_namespace" "rabbitmq_system" {
  count = var.enable_rabbitmq ? 1 : 0

  metadata { name = "rabbitmq-system" }
}

resource "kubernetes_namespace" "prometheus_system" {
  count = var.enable_prometheus ? 1 : 0

  metadata { name = "prometheus-system" }
}

resource "kubernetes_namespace" "grafana_system" {
  count = var.enable_grafana ? 1 : 0

  metadata { name = "grafana-system" }
}

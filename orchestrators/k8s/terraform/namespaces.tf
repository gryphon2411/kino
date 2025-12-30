# Namespaces
resource "kubernetes_namespace" "mongodb_system" {
  metadata { name = "mongodb-system" }
  count = var.enable_mongodb ? 1 : 0
}

resource "kubernetes_namespace" "postgres_system" {
  metadata { name = "postgres-system" }
  count = var.enable_postgres ? 1 : 0
}

resource "kubernetes_namespace" "redis_stack_system" {
  metadata { name = "redis-stack-system" }
  count = var.enable_redis ? 1 : 0
}

resource "kubernetes_namespace" "kafka_system" {
  metadata { name = "kafka-system" }
  count = var.enable_kafka ? 1 : 0
}

resource "kubernetes_namespace" "rabbitmq_system" {
  metadata { name = "rabbitmq-system" }
  count = var.enable_rabbitmq ? 1 : 0
}

resource "kubernetes_namespace" "prometheus_system" {
  metadata { name = "prometheus-system" }
  count = var.enable_prometheus ? 1 : 0
}

resource "kubernetes_namespace" "grafana_system" {
  metadata { name = "grafana-system" }
  count = var.enable_grafana ? 1 : 0
}

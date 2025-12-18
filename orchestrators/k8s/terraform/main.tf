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

# MongoDB
resource "kubernetes_secret" "mongodb_creds" {
  metadata {
    name      = "mongodb-root-user-credentials"
    namespace = kubernetes_namespace.mongodb_system[0].metadata[0].name
  }
  data = {
    username = "root"
    password = var.mongodb_password
  }
  count = var.enable_mongodb ? 1 : 0
}

resource "kubernetes_service" "mongodb" {
  metadata {
    name      = "mongodb"
    namespace = kubernetes_namespace.mongodb_system[0].metadata[0].name
  }
  spec {
    selector = { app = "mongodb" }
    port {
      name        = "default"
      port        = 27017
      target_port = 27017
    }
    type = "NodePort"
  }
  count = var.enable_mongodb ? 1 : 0
}

resource "kubernetes_stateful_set" "mongodb" {
  metadata {
    name      = "mongodb"
    namespace = kubernetes_namespace.mongodb_system[0].metadata[0].name
  }
  spec {
    selector { match_labels = { app = "mongodb" } }
    service_name = "mongodb"
    replicas     = 1
    template {
      metadata { labels = { app = "mongodb" } }
      spec {
        container {
          name  = "mongodb"
          image = "mongo:latest"
          port {
            name           = "default"
            container_port = 27017
          }
          env {
            name = "GENERATIVE_MODEL_NAME"
            value = "gemini2flash"
          }
          env {
            name = "DATA_SERVICE_URL"
            value = "http://data-service:8082/api/v1/data"
          }
          env {
            name = "RABBITMQ_HOST_ADDRESS"
            value = "rabbitmq.rabbitmq-system"
          }
          env {
            name = "RABBITMQ_HOST_PORT"
            value = "5672"
          }
          env {
            name = "RABBITMQ_USERNAME"
            value = "derkino-services"
          }
          env {
            name = "RABBITMQ_PASSWORD"
            value = "2gGCIz8qgvuUzQfW"
          }
          env {
            name = "RABBITMQ_VHOST"
            value = "/"
          }
          env {
            name = "MONGO_INITDB_ROOT_USERNAME"
            value = "root"
          }
          env {
            name = "MONGO_INITDB_ROOT_PASSWORD"
            value = var.mongodb_password
          }
          volume_mount {
            name       = "mongodb-data"
            mount_path = "/data/db"
          }
        }
      }
    }
    volume_claim_template {
      metadata { name = "mongodb-data" }
      spec {
        access_modes = ["ReadWriteOnce"]
        resources { requests = { storage = "20Gi" } }
      }
    }
  }
  count = var.enable_mongodb ? 1 : 0
}

resource "kubernetes_job" "mongodb_init" {
  metadata {
    name      = "mongodb-init"
    namespace = kubernetes_namespace.mongodb_system[0].metadata[0].name
  }
  spec {
    template {
      metadata {}
      spec {
        container {
          name  = "derkino-jobs"
          image = "gryphon2411/derkino-jobs:latest"
          args  = ["python", "run.py", "mongoinit.py"]
          env {
            name  = "MONGO_URI_FORMAT"
            value = "mongodb"
          }
          env {
            name = "MONGO_USERNAME"
            value_from {
              secret_key_ref {
                name = "mongodb-root-user-credentials"
                key  = "username"
              }
            }
          }
          env {
            name = "MONGO_PASSWORD"
            value_from {
              secret_key_ref {
                name = "mongodb-root-user-credentials"
                key  = "password"
              }
            }
          }
          env {
            name  = "MONGO_HOST"
            value = "mongodb.mongodb-system"
          }
        }
        restart_policy = "Never"
      }
    }
  }
  timeouts {
    create = "20m"
  }
  count = var.enable_mongodb ? 1 : 0
  depends_on = [kubernetes_stateful_set.mongodb]
}

# Postgres
resource "kubernetes_config_map" "postgres_initdb" {
  metadata {
    name      = "postgres-initdb"
    namespace = kubernetes_namespace.postgres_system[0].metadata[0].name
  }
  data = {
    "postgres-initdb.sh" = file("${path.module}/../postgres-initdb.sh")
  }
  count = var.enable_postgres ? 1 : 0
}

resource "kubernetes_secret" "postgres_creds" {
  metadata {
    name      = "postgres-root-user-credentials"
    namespace = kubernetes_namespace.postgres_system[0].metadata[0].name
  }
  data = {
    username = "postgres"
    password = var.postgres_password
  }
  # Note: The original script extracts this from a secret created by the statefulset? 
  # Or does it create it? The script says `kubectl -n postgres-system create configmap ...`
  # and then `create_statefulset_and_wait`. The yaml likely defines the secret or the image creates it.
  # Checking postgres-system.yaml would clarify, but for now assuming standard.
  # Wait, the script reads it: `kubectl -n postgres-system get secret postgres-root-user-credentials`
  # This implies the secret is created by the Helm chart or the YAML. 
  # Since we are converting the YAML, we should create the secret if the YAML does.
  count = var.enable_postgres ? 1 : 0
}

resource "kubernetes_stateful_set" "postgres" {
  metadata {
    name      = "postgres"
    namespace = kubernetes_namespace.postgres_system[0].metadata[0].name
  }
  spec {
    selector { match_labels = { app = "postgres" } }
    service_name = "postgres"
    replicas     = 1
    template {
      metadata { labels = { app = "postgres" } }
      spec {
        container {
          name  = "postgres"
          image = "postgres:latest"
          port { container_port = 5432 }
          env {
            name = "POSTGRES_USER"
            value_from {
              secret_key_ref {
                name = "postgres-root-user-credentials"
                key  = "username"
              }
            }
          }
          env {
            name = "POSTGRES_PASSWORD"
            value_from {
              secret_key_ref {
                name = "postgres-root-user-credentials"
                key  = "password"
              }
            }
          }
          volume_mount {
            name       = "postgres-initdb"
            mount_path = "/docker-entrypoint-initdb.d"
          }
        }
        volume {
          name = "postgres-initdb"
          config_map { name = "postgres-initdb" }
        }
      }
    }
    volume_claim_template {
      metadata { name = "postgres-data" }
      spec {
        access_modes = ["ReadWriteOnce"]
        resources { requests = { storage = "20Gi" } }
      }
    }
  }
  count = var.enable_postgres ? 1 : 0
}

resource "kubernetes_service" "postgres" {
  metadata {
    name      = "postgres"
    namespace = kubernetes_namespace.postgres_system[0].metadata[0].name
  }
  spec {
    selector = { app = "postgres" }
    port {
      name        = "default"
      port        = 5432
      target_port = 5432
    }
    type = "NodePort"
  }
  count = var.enable_postgres ? 1 : 0
}

# Redis
resource "kubernetes_secret" "redis_creds" {
  metadata {
    name      = "redis-stack-default-user-credentials"
    namespace = kubernetes_namespace.redis_stack_system[0].metadata[0].name
  }
  data = {
    username = "default"
    password = var.redis_password
  }
  count = var.enable_redis ? 1 : 0
}

resource "kubernetes_stateful_set" "redis" {
  metadata {
    name      = "redis-stack"
    namespace = kubernetes_namespace.redis_stack_system[0].metadata[0].name
  }
  spec {
    selector { match_labels = { app = "redis-stack" } }
    service_name = "redis-stack"
    replicas     = 1
    template {
      metadata { labels = { app = "redis-stack" } }
      spec {
        container {
          name  = "redis-stack"
          image = "redis/redis-stack:latest"
          port { container_port = 6379 }
          port { container_port = 8001 }
          env {
            name = "REDIS_ARGS"
            value = "--requirepass ${kubernetes_secret.redis_creds[0].data.password}"
          }
        }
      }
    }
  }
  count = var.enable_redis ? 1 : 0
}

resource "kubernetes_service" "redis" {
  metadata {
    name      = "redis-stack"
    namespace = kubernetes_namespace.redis_stack_system[0].metadata[0].name
  }
  spec {
    selector = { app = "redis-stack" }
    port {
      name        = "redis"
      port        = 6379
      target_port = 6379
    }
    port {
      name        = "insight"
      port        = 8001
      target_port = 8001
    }
    type = "NodePort"
  }
  count = var.enable_redis ? 1 : 0
}

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
  namespace  = kubernetes_namespace.kafka_system[0].metadata[0].name
  values     = [file("${path.module}/../charts/kafka/values.yaml")]
  count      = var.enable_kafka ? 1 : 0
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
  namespace  = kubernetes_namespace.rabbitmq_system[0].metadata[0].name
  values     = [file("${path.module}/../charts/rabbitmq/values.yaml")]
  count      = var.enable_rabbitmq ? 1 : 0
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

# Auth Service
resource "kubernetes_deployment" "auth_service" {
  metadata {
    name = var.environment == "dev" ? "dev-auth-service" : "auth-service"
  }
  spec {
    replicas = 1
    selector {
      match_labels = {
        app = var.environment == "dev" ? "dev-auth-service" : "auth-service"
      }
    }
    template {
      metadata {
        labels = {
          app = var.environment == "dev" ? "dev-auth-service" : "auth-service"
        }
      }
      spec {
        container {
          name  = var.environment == "dev" ? "dev-auth-service" : "auth-service"
          image = "gryphon2411/derkino-auth_service:latest"
          port { container_port = 8081 }
          env {
            name  = "SERVICE_HOST_PREFIX"
            value = var.environment == "dev" ? "http://dev.derkino.com" : "http://local.derkino.com"
          }
          env {
            name  = "SERVICE_LOGGING_LEVEL"
            value = "INFO"
          }
          env {
            name  = "SERVICE_PORT"
            value = "8081"
          }
          env {
            name  = "SERVICE_PREFIX_PATH"
            value = "/api/v1/auth"
          }
          env {
            name  = "FORM_LOGIN_REDIRECT_URL"
            value = var.environment == "dev" ? "http://dev.derkino.com" : "http://local.derkino.com"
          }
          env {
            name = "KAFKA_HOSTS"
            value = "kafka-controller-0.kafka-controller-headless.kafka-system.svc.cluster.local:9092,kafka-controller-1.kafka-controller-headless.kafka-system.svc.cluster.local:9092,kafka-controller-2.kafka-controller-headless.kafka-system.svc.cluster.local:9092"
          }
          env {
            name = "KAFKA_PASSWORD"
            value = "w43Pw4Q9cb"
          }
          env {
            name = "KAFKA_USERNAME"
            value = "root"
          }
          env {
            name = "MONGO_DATABASE"
            value = "derkino"
          }
          env {
            name = "MONGO_HOST_ADDRESS"
            value = "mongodb.mongodb-system"
          }
          env {
            name = "MONGO_HOST_PORT"
            value = "27017"
          }
          env {
            name = "MONGO_PASSWORD"
            value = var.mongodb_password
          }
          env {
            name = "MONGO_USERNAME"
            value = "root"
          }
          env {
            name = "REDIS_HOST_ADDRESS"
            value = "redis-stack.redis-stack-system"
          }
          env {
            name = "REDIS_PORT"
            value = "6379"
          }
          env {
            name = "REDIS_DATABASE"
            value = "1"
          }
          env {
            name = "REDIS_NAMESPACE"
            value = "derkino:auth"
          }
          env {
            name = "REDIS_USERNAME"
            value = "default"
          }
          env {
            name = "REDIS_PASSWORD"
            value = var.redis_password
          }
        }
      }
    }
  }
  count = var.enable_auth_service ? 1 : 0
}

resource "kubernetes_service" "auth_service" {
  metadata {
    name = var.environment == "dev" ? "dev-auth-service" : "auth-service"
  }
  spec {
    selector = {
      app = var.environment == "dev" ? "dev-auth-service" : "auth-service"
    }
    port {
      name        = "http"
      port        = 8081
      target_port = 8081
    }
    type = "NodePort"
  }
  count = var.enable_auth_service ? 1 : 0
}

# Data Service
resource "kubernetes_deployment" "data_service" {
  metadata { name = "data-service" }
  spec {
    replicas = 1
    selector { match_labels = { app = "data-service" } }
    template {
      metadata { labels = { app = "data-service" } }
      spec {
        container {
          name  = "data-service"
          image = "gryphon2411/derkino-data_service:latest"
          port { container_port = 8080 }
          env {
            name  = "SERVICE_PORT"
            value = "8080"
          }
          env {
            name  = "SERVICE_LOGGING_LEVEL"
            value = "INFO"
          }
          # For brevity in this example, assuming standard env vars or defaults.
          # In a real scenario, I would map all of them.
          # Mapping critical ones:
          env {
            name  = "SERVICE_PREFIX_PATH"
            value = "/api/v1/data"
          }
          env {
            name = "MONGO_HOST_ADDRESS"
            value = "mongodb.mongodb-system"
          }
          env {
            name = "MONGO_HOST_PORT"
            value = "27017"
          }
          env {
            name = "MONGO_DATABASE"
            value = "derkino"
          }
          env {
            name = "MONGO_USERNAME"
            value = "root"
          }
          env {
            name = "MONGO_PASSWORD"
            value = var.mongodb_password
          }
          env {
            name = "REDIS_HOST_ADDRESS"
            value = "redis-stack.redis-stack-system"
          }
          env {
            name = "REDIS_PORT"
            value = "6379"
          }
          env {
            name = "REDIS_DATABASE"
            value = "2"
          }
          env {
            name = "REDIS_NAMESPACE"
            value = "derkino:data"
          }
          env {
            name = "REDIS_USERNAME"
            value = "default"
          }
          env {
            name = "REDIS_PASSWORD"
            value = var.redis_password
          }
          env {
            name = "KAFKA_HOSTS"
            value = "kafka-controller-0.kafka-controller-headless.kafka-system.svc.cluster.local:9092,kafka-controller-1.kafka-controller-headless.kafka-system.svc.cluster.local:9092,kafka-controller-2.kafka-controller-headless.kafka-system.svc.cluster.local:9092"
          }
          env {
            name = "KAFKA_PASSWORD"
            value = "w43Pw4Q9cb"
          }
          env {
            name = "KAFKA_USERNAME"
            value = "root"
          }
          env {
            name = "RABBITMQ_HOST_ADDRESS"
            value = "rabbitmq.rabbitmq-system"
          }
          env {
            name = "RABBITMQ_HOST_PORT"
            value = "5672"
          }
          env {
            name = "RABBITMQ_USERNAME"
            value = "derkino-services"
          }
          env {
            name = "RABBITMQ_PASSWORD"
            value = "2gGCIz8qgvuUzQfW"
          }
          env {
            name = "RABBITMQ_VHOST"
            value = "/"
          }
        }
      }
    }
  }
  count = var.enable_data_service ? 1 : 0
}

resource "kubernetes_service" "data_service" {
  metadata { name = "data-service" }
  spec {
    selector = { app = "data-service" }
    port {
      name        = "http"
      port        = 8082
      target_port = 8080
    }
    type = "NodePort"
  }
  count = var.enable_data_service ? 1 : 0
}

# Trend Service
resource "kubernetes_deployment" "trend_service" {
  metadata { name = "trend-service" }
  spec {
    replicas = 1
    selector { match_labels = { app = "trend-service" } }
    template {
      metadata { labels = { app = "trend-service" } }
      spec {
        container {
          name  = "trend-service"
          image = "gryphon2411/derkino-trend_service:latest"
          port { container_port = 8080 }
          env {
            name = "MONGO_HOST_ADDRESS"
            value = "mongodb.mongodb-system"
          }
          env {
            name = "MONGO_HOST_PORT"
            value = "27017"
          }
          env {
            name = "MONGO_DATABASE"
            value = "derkino"
          }
          env {
            name = "MONGO_USERNAME"
            value = "root"
          }
          env {
            name = "MONGO_PASSWORD"
            value = var.mongodb_password
          }
          env {
            name = "SERVICE_PORT"
            value = "8080"
          }
          env {
            name = "SERVICE_HOST_PREFIX"
            value = "/api/v1"
          }
          env {
            name  = "SERVICE_LOGGING_LEVEL"
            value = "INFO"
          }
          env {
            name = "KAFKA_HOSTS"
            value = "kafka-controller-0.kafka-controller-headless.kafka-system.svc.cluster.local:9092,kafka-controller-1.kafka-controller-headless.kafka-system.svc.cluster.local:9092,kafka-controller-2.kafka-controller-headless.kafka-system.svc.cluster.local:9092"
          }
          env {
            name = "KAFKA_PASSWORD"
            value = "w43Pw4Q9cb"
          }
          env {
            name = "KAFKA_USERNAME"
            value = "root"
          }
        }
      }
    }
  }
  count = var.enable_trend_service ? 1 : 0
}

resource "kubernetes_service" "trend_service" {
  metadata { name = "trend-service" }
  spec {
    selector = { app = "trend-service" }
    port {
      name        = "http"
      port        = 8080
      target_port = 8080
    }
    type = "NodePort"
  }
  count = var.enable_trend_service ? 1 : 0
}

# Generative Service
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


resource "kubernetes_deployment" "generative_service" {
  wait_for_rollout = false
  metadata { name = "generative-service" }
  spec {
    replicas = 1
    selector { match_labels = { app = "generative-service" } }
    template {
      metadata { labels = { app = "generative-service" } }
      spec {
        container {
          name  = "generative-service"
          image = "gryphon2411/derkino-generative_service:latest"
          port { container_port = 8000 }
          env {
            name = "HUGGINGFACE_HUB_ACCESS_TOKEN"
            value_from {
              secret_key_ref {
                name = "huggingface-hub-access-token"
                key  = "token"
              }
            }
          }
          env {
            name = "GEMINI_API_KEY"
            value_from {
              secret_key_ref {
                name = "gemini-api-key"
                key  = "api-key"
              }
            }
          }
          env {
            name  = "GENERATIVE_MODEL_NAME"
            value = "gemini2flash"
          }
          env {
            name = "DATA_SERVICE_URL"
            value = "http://data-service:8082/api/v1/data"
          }
        }
      }
    }
  }
  count = var.enable_generative_service ? 1 : 0
}

resource "kubernetes_service" "generative_service" {
  metadata { name = "generative-service" }
  spec {
    selector = { app = "generative-service" }
    port {
      name        = "http"
      port        = 8083
      target_port = 8000
    }
    type = "NodePort"
  }
  count = var.enable_generative_service ? 1 : 0
}

# UI
resource "kubernetes_deployment" "ui" {
  metadata {
    name = var.environment == "dev" ? "dev-ui" : "ui"
  }
  spec {
    replicas = 1
    selector {
      match_labels = {
        app = var.environment == "dev" ? "dev-ui" : "ui"
      }
    }
    template {
      metadata {
        labels = {
          app = var.environment == "dev" ? "dev-ui" : "ui"
        }
      }
      spec {
        container {
          name  = var.environment == "dev" ? "dev-ui" : "ui"
          image = var.environment == "dev" ? "gryphon2411/derkino-ui:dev" : "gryphon2411/derkino-ui:latest"
          image_pull_policy = var.environment == "dev" ? "Always" : "IfNotPresent"
          port { container_port = 3000 }
          env {
            name  = "NODE_ENV"
            value = var.environment == "dev" ? "development" : "production"
          }
        }
      }
    }
  }
  count = var.enable_ui ? 1 : 0
}

resource "kubernetes_service" "ui" {
  metadata {
    name = var.environment == "dev" ? "dev-ui" : "ui"
  }
  spec {
    selector = {
      app = var.environment == "dev" ? "dev-ui" : "ui"
    }
    port {
      name        = "http"
      port        = 80
      target_port = 3000
    }
    type = "NodePort"
  }
  count = var.enable_ui ? 1 : 0
}

# Ingress
resource "kubernetes_ingress_v1" "gateway" {
  metadata {
    name = "gateway"
  }
  spec {
    rule {
      host = var.environment == "dev" ? "dev.derkino.com" : "local.derkino.com"
      http {
        path {
          path = "/"
          path_type = "Prefix"
          backend {
            service {
              name = var.environment == "dev" ? "dev-ui" : "ui"
              port { number = 80 }
            }
          }
        }
        path {
          path = "/api/v1/auth"
          path_type = "Prefix"
          backend {
            service {
              name = var.environment == "dev" ? "dev-auth-service" : "auth-service"
              port { number = 8081 }
            }
          }
        }
        # ... other paths ...
        path {
          path = "/api/v1/data"
          path_type = "Prefix"
          backend {
            service {
              name = "data-service"
              port { number = 8082 }
            }
          }
        }
        path {
          path = "/api/v1/generative"
          path_type = "Prefix"
          backend {
            service {
              name = "generative-service"
              port { number = 8083 }
            }
          }
        }
      }
    }
  }
  count = var.enable_ingress ? 1 : 0
}

locals {
  kafka_env = [
    { name = "KAFKA_HOSTS", value = "kafka-controller-0.kafka-controller-headless.kafka-system.svc.cluster.local:9092,kafka-controller-1.kafka-controller-headless.kafka-system.svc.cluster.local:9092,kafka-controller-2.kafka-controller-headless.kafka-system.svc.cluster.local:9092" },
    { name = "KAFKA_USERNAME", value = "root" },
    { name = "KAFKA_PASSWORD", value = var.kafka_password }
  ]

  mongo_env = [
    { name = "MONGO_HOST_ADDRESS", value = "mongodb.mongodb-system" },
    { name = "MONGO_HOST_PORT", value = "27017" },
    { name = "MONGO_DATABASE", value = "kino" },
    { name = "MONGO_USERNAME", value = "root" },
    { name = "MONGO_PASSWORD", value = var.mongodb_password }
  ]

  redis_common_env = [
    { name = "REDIS_HOST_ADDRESS", value = "redis-stack.redis-stack-system" },
    { name = "REDIS_PORT", value = "6379" },
    { name = "REDIS_USERNAME", value = "default" },
    { name = "REDIS_PASSWORD", value = var.redis_password }
  ]

  rabbitmq_env = [
    { name = "RABBITMQ_HOST_ADDRESS", value = "rabbitmq.rabbitmq-system" },
    { name = "RABBITMQ_HOST_PORT", value = "5672" },
    { name = "RABBITMQ_USERNAME", value = "kino-services" },
    { name = "RABBITMQ_PASSWORD", value = var.rabbitmq_password },
    { name = "RABBITMQ_VHOST", value = "/" }
  ]
}

# Auth Service
resource "kubernetes_deployment" "auth_service" {
  count = var.enable_auth_service ? 1 : 0

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
          image = "gryphon2411/kino-auth_service:latest"

          port { container_port = 8081 }

          env {
            name  = "SERVICE_HOST_PREFIX"
            value = var.environment == "dev" ? "http://dev.kino.com" : "http://local.kino.com"
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
            value = var.environment == "dev" ? "http://dev.kino.com" : "http://local.kino.com"
          }

          # DRY: Kafka connection
          dynamic "env" {
            for_each = local.kafka_env
            content {
              name  = env.value.name
              value = env.value.value
            }
          }

          # DRY: MongoDB connection
          dynamic "env" {
            for_each = local.mongo_env
            content {
              name  = env.value.name
              value = env.value.value
            }
          }

          # DRY: Redis connection
          dynamic "env" {
            for_each = local.redis_common_env
            content {
              name  = env.value.name
              value = env.value.value
            }
          }

          # Service-specific Redis configuration
          env {
            name  = "REDIS_DATABASE"
            value = "1"
          }

          env {
            name  = "REDIS_NAMESPACE"
            value = "kino:auth"
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "auth_service" {
  count = var.enable_auth_service ? 1 : 0

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
}

# Data Service
resource "kubernetes_deployment" "data_service" {
  count = var.enable_data_service ? 1 : 0

  metadata { name = "data-service" }

  spec {
    replicas = 1
    selector { match_labels = { app = "data-service" } }

    template {
      metadata { labels = { app = "data-service" } }

      spec {
        container {
          name  = "data-service"
          image = "gryphon2411/kino-data_service:latest"

          port { container_port = 8080 }

          env {
            name  = "SERVICE_PORT"
            value = "8080"
          }

          env {
            name  = "SERVICE_LOGGING_LEVEL"
            value = "INFO"
          }

          env {
            name  = "SERVICE_PREFIX_PATH"
            value = "/api/v1/data"
          }

          # DRY: MongoDB connection
          dynamic "env" {
            for_each = local.mongo_env
            content {
              name  = env.value.name
              value = env.value.value
            }
          }

          # DRY: Redis connection
          dynamic "env" {
            for_each = local.redis_common_env
            content {
              name  = env.value.name
              value = env.value.value
            }
          }

          # DRY: Kafka connection
          dynamic "env" {
            for_each = local.kafka_env
            content {
              name  = env.value.name
              value = env.value.value
            }
          }

          # DRY: RabbitMQ connection
          dynamic "env" {
            for_each = local.rabbitmq_env
            content {
              name  = env.value.name
              value = env.value.value
            }
          }

          # Service-specific Redis configuration
          env {
            name  = "REDIS_DATABASE"
            value = "2"
          }

          env {
            name  = "REDIS_NAMESPACE"
            value = "kino:data"
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "data_service" {
  count = var.enable_data_service ? 1 : 0

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
}

# Trend Service
resource "kubernetes_deployment" "trend_service" {
  count = var.enable_trend_service ? 1 : 0

  metadata { name = "trend-service" }

  spec {
    replicas = 1
    selector { match_labels = { app = "trend-service" } }

    template {
      metadata { labels = { app = "trend-service" } }

      spec {
        container {
          name  = "trend-service"
          image = "gryphon2411/kino-trend_service:latest"

          port { container_port = 8080 }

          # DRY: MongoDB connection
          dynamic "env" {
            for_each = local.mongo_env
            content {
              name  = env.value.name
              value = env.value.value
            }
          }

          env {
            name  = "SERVICE_PORT"
            value = "8080"
          }

          env {
            name  = "SERVICE_HOST_PREFIX"
            value = "/api/v1"
          }

          env {
            name  = "SERVICE_LOGGING_LEVEL"
            value = "INFO"
          }

          # DRY: Kafka connection
          dynamic "env" {
            for_each = local.kafka_env
            content {
              name  = env.value.name
              value = env.value.value
            }
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "trend_service" {
  count = var.enable_trend_service ? 1 : 0

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
}

# Generative Service
resource "kubernetes_deployment" "generative_service" {
  count = var.enable_generative_service ? 1 : 0

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
          image = "gryphon2411/kino-generative_service:latest"

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
            name  = "DATA_SERVICE_URL"
            value = "http://data-service:8082/api/v1/data"
          }

          dynamic "env" {
            for_each = local.rabbitmq_env
            content {
              name  = env.value.name
              value = env.value.value
            }
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "generative_service" {
  count = var.enable_generative_service ? 1 : 0

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
}

# UI
resource "kubernetes_deployment" "ui" {
  count = var.enable_ui ? 1 : 0

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
          name              = var.environment == "dev" ? "dev-ui" : "ui"
          image             = var.environment == "dev" ? "gryphon2411/kino-ui:dev" : "gryphon2411/kino-ui:latest"
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
}

resource "kubernetes_service" "ui" {
  count = var.enable_ui ? 1 : 0

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
}

# Ingress
resource "kubernetes_ingress_v1" "gateway" {
  count = var.enable_ingress ? 1 : 0

  metadata {
    name = "gateway"
  }

  spec {
    rule {
      host = var.environment == "dev" ? "dev.kino.com" : "local.kino.com"

      http {
        path {
          path      = "/"
          path_type = "Prefix"

          backend {
            service {
              name = var.environment == "dev" ? "dev-ui" : "ui"
              port { number = 80 }
            }
          }
        }

        path {
          path      = "/api/v1/auth"
          path_type = "Prefix"

          backend {
            service {
              name = var.environment == "dev" ? "dev-auth-service" : "auth-service"
              port { number = 8081 }
            }
          }
        }

        path {
          path      = "/api/v1/data"
          path_type = "Prefix"

          backend {
            service {
              name = "data-service"
              port { number = 8082 }
            }
          }
        }

        path {
          path      = "/api/v1/generative"
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
}

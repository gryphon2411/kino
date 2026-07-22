locals {
  gateway_origin            = var.environment == "dev" ? "http://dev.kino.com" : "http://local.kino.com"
  auth_service_name         = var.environment == "dev" ? "dev-auth-service" : "auth-service"
  ui_service_name           = var.environment == "dev" ? "dev-ui" : "ui"
  ticket_service_name       = var.environment == "dev" ? "dev-ticket-service" : "ticket-service"
  auth_service_internal_url = "http://${local.auth_service_name}:8081/api/v1/auth"
  # Spring Authorization Server 1.1 serves OIDC discovery at the origin-level
  # /.well-known/openid-configuration endpoint.
  auth_service_issuer        = local.gateway_origin
  data_service_url           = "http://data-service:8082/api/v1/data"
  ticket_service_url         = "http://${local.ticket_service_name}:8085"
  ticket_upstream_timeout_ms = 5000

  # These are immutable public OCI image identifiers, not credentials. Keep
  # operator overrides at the variable boundary while preserving reviewed,
  # digest-pinned defaults for local deployments.
  auth_database_bootstrap_image_ref = coalesce(
    var.auth_database_bootstrap_image_ref,
    "postgres@sha256:ebba4f4de37f08f138f97c1443c987a435e783177afedcc4aaf2da1930fbc37a"
  )
  postgres_image_ref = coalesce(
    var.postgres_image_ref,
    "postgres@sha256:ebba4f4de37f08f138f97c1443c987a435e783177afedcc4aaf2da1930fbc37a"
  )
  auth_database_migration_image_ref = coalesce(
    var.auth_database_migration_image_ref,
    "flyway/flyway@sha256:2ec478cc00011c5e6fdaeb170486ca43c2cdedb2be86b740648fe0b63e362da9"
  )
  ticket_database_migration_image_ref = coalesce(
    var.ticket_database_migration_image_ref,
    local.auth_database_migration_image_ref
  )
  redis_image_ref = coalesce(
    var.redis_image_ref,
    "redis/redis-stack@sha256:c2019e98fd5abce4dd11feec004de44d1709d2366a6efa5ffb2bd0daf8f9c6a4"
  )

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

resource "tls_private_key" "auth_service_machine_signing_key" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

resource "kubernetes_secret" "auth_service_machine_signing_key" {
  count = var.enable_auth_service ? 1 : 0

  metadata {
    name = "auth-service-machine-signing-key"
  }

  data = {
    "private-key.pem" = tls_private_key.auth_service_machine_signing_key.private_key_pem_pkcs8
    "public-key.pem"  = tls_private_key.auth_service_machine_signing_key.public_key_pem
  }

  type = "Opaque"
}

# Auth Service
resource "kubernetes_deployment" "auth_service" {
  count = var.enable_auth_service ? 1 : 0

  metadata {
    name = local.auth_service_name
  }

  spec {
    replicas = 1

    selector {
      match_labels = {
        app = local.auth_service_name
      }
    }

    template {
      metadata {
        labels = {
          app = local.auth_service_name
        }

        annotations = {
          # Environment variables sourced from a Secret are fixed at Pod
          # creation. This checksum makes a credential rotation a deliberate
          # rolling restart, so client reconciliation runs with the new secret.
          "kino.io/runtime-credentials-checksum" = nonsensitive(sha256(jsonencode({
            database = kubernetes_secret.auth_database_runtime_credentials[0].data
            web_bff  = kubernetes_secret.auth_service_web_bff_client_credentials[0].data
          })))
        }
      }

      spec {
        volume {
          name = "auth-service-machine-signing-key"

          secret {
            secret_name = kubernetes_secret.auth_service_machine_signing_key[0].metadata[0].name
          }
        }

        container {
          name  = local.auth_service_name
          image = var.auth_service_image_ref

          port { container_port = 8081 }

          env {
            name  = "SERVICE_HOST_PREFIX"
            value = local.gateway_origin
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
            name  = "AUTH_SERVER_ISSUER_URI"
            value = local.auth_service_issuer
          }

          env {
            name  = "AUTH_SERVICE_JWT_PRIVATE_KEY_PATH"
            value = "/var/run/secrets/kino/auth-service-jwt/private-key.pem"
          }

          env {
            name  = "AUTH_SERVICE_JWT_PUBLIC_KEY_PATH"
            value = "/var/run/secrets/kino/auth-service-jwt/public-key.pem"
          }

          env {
            name  = "FORM_LOGIN_REDIRECT_URL"
            value = local.gateway_origin
          }

          env {
            name  = "AGENT_SERVICE_CLIENT_ID"
            value = "agent-service"
          }

          env {
            name  = "AGENT_SERVICE_CLIENT_SECRET"
            value = var.agent_service_client_secret
          }

          env {
            name  = "AGENT_SERVICE_CLIENT_SCOPES"
            value = "kino.agent.curator.read"
          }

          env {
            name  = "AGENT_SERVICE_CLIENT_AUDIENCE"
            value = "kino-data-internal"
          }

          env {
            name  = "MACHINE_ACCESS_TOKEN_TTL"
            value = "PT5M"
          }

          env {
            name  = "WEB_BFF_CLIENT_ID"
            value = "kino-web-bff"
          }

          env {
            name = "WEB_BFF_CLIENT_SECRET"
            value_from {
              secret_key_ref {
                name = "auth-service-web-bff-client-credentials"
                key  = "client-secret"
              }
            }
          }

          env {
            name  = "WEB_BFF_REDIRECT_URI"
            value = "${local.gateway_origin}/api/auth/callback"
          }

          env {
            name  = "WEB_BFF_CLIENT_SCOPES"
            value = var.enable_ticket_service ? "openid,profile,kino.data.read,kino.ticket.read,kino.ticket.write" : "openid,profile,kino.data.read"
          }

          env {
            name  = "WEB_BFF_CLIENT_AUDIENCES"
            value = var.enable_ticket_service ? "kino-data-api,kino-ticket-api" : "kino-data-api"
          }

          env {
            name  = "WEB_BFF_ACCESS_TOKEN_TTL"
            value = "PT5M"
          }

          env {
            name  = "WEB_BFF_REFRESH_TOKEN_TTL"
            value = "PT8H"
          }

          env {
            name  = "AUTH_DATABASE_URL"
            value = "jdbc:postgresql://postgres.postgres-system:5432/kino_auth?currentSchema=kino_auth"
          }

          env {
            name = "AUTH_DATABASE_USERNAME"
            value_from {
              secret_key_ref {
                name = "auth-database-runtime-credentials"
                key  = "username"
              }
            }
          }

          env {
            name = "AUTH_DATABASE_PASSWORD"
            value_from {
              secret_key_ref {
                name = "auth-database-runtime-credentials"
                key  = "password"
              }
            }
          }

          env {
            name  = "CORS_ALLOWED_ORIGINS"
            value = local.gateway_origin
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

          liveness_probe {
            http_get {
              path = "/actuator/health/liveness"
              port = 8081
            }
            initial_delay_seconds = 20
            period_seconds        = 10
            failure_threshold     = 3
          }

          readiness_probe {
            http_get {
              path = "/actuator/health/readiness"
              port = 8081
            }
            initial_delay_seconds = 10
            period_seconds        = 5
            failure_threshold     = 3
          }

          volume_mount {
            name       = "auth-service-machine-signing-key"
            mount_path = "/var/run/secrets/kino/auth-service-jwt"
            read_only  = true
          }
        }
      }
    }
  }

  lifecycle {
    precondition {
      condition     = var.enable_postgres
      error_message = "enable_auth_service requires enable_postgres for OIDC protocol persistence."
    }

    precondition {
      condition     = var.enable_redis
      error_message = "enable_auth_service requires enable_redis for interactive login sessions."
    }
  }

  depends_on = [kubernetes_job.auth_database_migration]
}

resource "kubernetes_service" "auth_service" {
  count = var.enable_auth_service ? 1 : 0

  metadata {
    name = local.auth_service_name
  }

  spec {
    selector = {
      app = local.auth_service_name
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
          image = var.data_service_image_ref

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

          env {
            name  = "AUTH_SERVER_ISSUER_URI"
            value = local.auth_service_issuer
          }

          env {
            name  = "AUTH_SERVER_JWK_SET_URI"
            value = "${local.auth_service_internal_url}/oauth2/jwks"
          }

          env {
            name  = "DATA_SERVICE_INTERNAL_AUDIENCE"
            value = "kino-data-internal"
          }

          env {
            name  = "DATA_SERVICE_USER_AUDIENCE"
            value = "kino-data-api"
          }

          env {
            name  = "CORS_ALLOWED_ORIGINS"
            value = local.gateway_origin
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

  lifecycle {
    precondition {
      condition     = var.enable_auth_service
      error_message = "enable_data_service requires enable_auth_service to validate Kino user and machine JWTs."
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

# Ticket Service
resource "kubernetes_deployment" "ticket_service" {
  count = var.enable_ticket_service ? 1 : 0

  metadata { name = local.ticket_service_name }

  spec {
    replicas = 1
    selector { match_labels = { app = local.ticket_service_name } }

    template {
      metadata {
        labels = { app = local.ticket_service_name }
        annotations = {
          "kino.io/runtime-credentials-checksum" = nonsensitive(sha256(jsonencode(
            kubernetes_secret.ticket_database_runtime_credentials[0].data
          )))
        }
      }

      spec {
        termination_grace_period_seconds = 10
        automount_service_account_token  = false

        security_context {
          run_as_non_root = true
          run_as_user     = 1000
          run_as_group    = 1000

          seccomp_profile {
            type = "RuntimeDefault"
          }
        }

        container {
          name  = local.ticket_service_name
          image = var.ticket_service_image_ref

          security_context {
            allow_privilege_escalation = false

            capabilities {
              drop = ["ALL"]
            }
          }

          port { container_port = 8080 }

          env {
            name  = "KINO_ENV"
            value = var.environment
          }
          env {
            name  = "PORT"
            value = "8080"
          }
          env {
            name = "TICKET_DATABASE_URL"
            value_from {
              secret_key_ref {
                name = "ticket-database-runtime-credentials"
                key  = "database-url"
              }
            }
          }
          env {
            name  = "AUTH_SERVER_ISSUER_URI"
            value = local.auth_service_issuer
          }
          env {
            name  = "AUTH_SERVER_JWK_SET_URI"
            value = "${local.auth_service_internal_url}/oauth2/jwks"
          }
          env {
            name  = "TICKET_AUTH_AUDIENCE"
            value = "kino-ticket-api"
          }
          env {
            name  = "TICKET_HOLD_DURATION_SECONDS"
            value = "120"
          }
          env {
            name  = "TICKET_DB_LOCK_TIMEOUT_MS"
            value = "1000"
          }
          env {
            name  = "TICKET_DB_CONNECTION_TIMEOUT_MS"
            value = "1000"
          }
          env {
            name  = "TICKET_DB_STATEMENT_TIMEOUT_MS"
            value = "3000"
          }
          env {
            name  = "TICKET_BFF_UPSTREAM_TIMEOUT_MS"
            value = tostring(local.ticket_upstream_timeout_ms)
          }

          liveness_probe {
            http_get {
              path = "/healthz"
              port = 8080
            }
            initial_delay_seconds = 10
            period_seconds        = 10
            failure_threshold     = 3
          }

          readiness_probe {
            http_get {
              path = "/readyz"
              port = 8080
            }
            initial_delay_seconds = 10
            period_seconds        = 5
            failure_threshold     = 3
            timeout_seconds       = 4
          }
        }
      }
    }
  }

  lifecycle {
    precondition {
      condition     = var.enable_postgres
      error_message = "enable_ticket_service requires enable_postgres for ticket allocation."
    }
    precondition {
      condition     = var.enable_auth_service
      error_message = "enable_ticket_service requires enable_auth_service to validate user JWTs."
    }
  }

  depends_on = [
    kubernetes_job.ticket_database_migration,
    kubernetes_network_policy_v1.ticket_service_ingress,
  ]
}

resource "kubernetes_service" "ticket_service" {
  count = var.enable_ticket_service ? 1 : 0

  metadata { name = local.ticket_service_name }

  spec {
    selector = { app = local.ticket_service_name }

    port {
      name        = "http"
      port        = 8085
      target_port = 8080
    }

    type = "ClusterIP"
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
          image = var.trend_service_image_ref

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

          env {
            name  = "AUTH_SERVER_ISSUER_URI"
            value = local.auth_service_issuer
          }

          env {
            name  = "AUTH_SERVER_JWK_SET_URI"
            value = "${local.auth_service_internal_url}/oauth2/jwks"
          }

          env {
            name  = "TREND_SERVICE_INTERNAL_AUDIENCE"
            value = "kino-data-internal"
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

  lifecycle {
    precondition {
      condition     = var.enable_auth_service
      error_message = "enable_trend_service requires enable_auth_service to be true."
    }

    precondition {
      condition     = var.enable_kafka
      error_message = "enable_trend_service requires enable_kafka to be true."
    }
  }

  depends_on = [helm_release.kafka]
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
          image = var.generative_service_image_ref

          port { container_port = 8000 }

          dynamic "env" {
            for_each = var.generative_service_provider == "huggingface_hub" ? [1] : []
            content {
              name = "HUGGINGFACE_HUB_ACCESS_TOKEN"
              value_from {
                secret_key_ref {
                  name = "huggingface-hub-access-token"
                  key  = "token"
                }
              }
            }
          }

          dynamic "env" {
            for_each = var.generative_service_provider == "google_genai" ? [1] : []
            content {
              name = "GEMINI_API_KEY"
              value_from {
                secret_key_ref {
                  name = "gemini-api-key"
                  key  = "api-key"
                }
              }
            }
          }

          env {
            name  = "GENERATIVE_MODEL_PROVIDER"
            value = var.generative_service_provider
          }

          env {
            name  = "GENERATIVE_MODEL_NAME"
            value = var.generative_service_model
          }

          env {
            name  = "DATA_SERVICE_URL"
            value = local.data_service_url
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

# Agent Service
resource "kubernetes_deployment" "agent_service" {
  count = var.enable_agent_service ? 1 : 0

  wait_for_rollout = false

  metadata { name = "agent-service" }

  spec {
    replicas = 1
    selector { match_labels = { app = "agent-service" } }

    template {
      metadata { labels = { app = "agent-service" } }

      spec {
        container {
          name  = "agent-service"
          image = var.agent_service_image_ref

          port { container_port = 2024 }

          env {
            name  = "MOUNT_PREFIX"
            value = "/api/v1/agent"
          }

          env {
            name  = "KINO_DATA_SERVICE_URL"
            value = local.data_service_url
          }

          env {
            name  = "KINO_AUTH_SERVICE_URL"
            value = local.auth_service_internal_url
          }

          env {
            name  = "KINO_AUTH_CLIENT_ID"
            value = "agent-service"
          }

          env {
            name  = "KINO_AUTH_CLIENT_SECRET"
            value = var.agent_service_client_secret
          }

          env {
            name  = "KINO_CURATOR_PROVIDER"
            value = var.agent_service_provider
          }

          env {
            name  = "KINO_CURATOR_MODEL"
            value = var.agent_service_model
          }

          env {
            name  = "KINO_CURATOR_THINKING_LEVEL"
            value = "high"
          }

          dynamic "env" {
            for_each = var.agent_service_provider == "google_genai" ? [1] : []
            content {
              name = "GOOGLE_API_KEY"
              value_from {
                secret_key_ref {
                  name = "gemini-api-key"
                  key  = "api-key"
                }
              }
            }
          }

          dynamic "env" {
            for_each = var.agent_service_provider == "nvidia_nim" ? [1] : []
            content {
              name = "NVIDIA_API_KEY"
              value_from {
                secret_key_ref {
                  name = "agent-service-secrets"
                  key  = "nvidia-api-key"
                }
              }
            }
          }
        }
      }
    }
  }

  depends_on = [kubernetes_service.data_service]
}

resource "kubernetes_service" "agent_service" {
  count = var.enable_agent_service ? 1 : 0

  metadata { name = "agent-service" }

  spec {
    selector = { app = "agent-service" }

    port {
      name        = "http"
      port        = 8084
      target_port = 2024
    }

    type = "NodePort"
  }
}

# UI
resource "kubernetes_deployment" "ui" {
  count = var.enable_ui ? 1 : 0

  metadata {
    name = local.ui_service_name
  }

  spec {
    replicas = 1

    selector {
      match_labels = {
        app = local.ui_service_name
      }
    }

    template {
      metadata {
        labels = {
          app = local.ui_service_name
        }

        annotations = {
          # The BFF reads these values once at Node process start.
          "kino.io/bff-runtime-credentials-checksum" = nonsensitive(sha256(
            jsonencode(kubernetes_secret.ui_bff_runtime_credentials[0].data)
          ))
        }
      }

      spec {
        container {
          name              = local.ui_service_name
          image             = var.ui_image_ref
          image_pull_policy = "IfNotPresent"

          port { container_port = 3000 }

          env {
            name  = "NODE_ENV"
            value = var.environment == "dev" ? "development" : "production"
          }

          env {
            name  = "BFF_PUBLIC_ORIGIN"
            value = local.gateway_origin
          }

          env {
            name  = "OIDC_ISSUER"
            value = local.auth_service_issuer
          }

          env {
            name  = "OIDC_INTERNAL_ORIGIN"
            value = "http://${local.auth_service_name}:8081"
          }

          env {
            name  = "WEB_BFF_CLIENT_ID"
            value = "kino-web-bff"
          }

          env {
            name = "WEB_BFF_CLIENT_SECRET"
            value_from {
              secret_key_ref {
                name = "ui-bff-runtime-credentials"
                key  = "client-secret"
              }
            }
          }

          env {
            name  = "WEB_BFF_REDIRECT_URI"
            value = "${local.gateway_origin}/api/auth/callback"
          }

          env {
            name  = "WEB_BFF_SCOPES"
            value = var.enable_ticket_service ? "openid profile kino.data.read kino.ticket.read kino.ticket.write" : "openid profile kino.data.read"
          }

          env {
            name  = "DATA_SERVICE_INTERNAL_URL"
            value = local.data_service_url
          }

          env {
            name  = "TICKET_SERVICE_INTERNAL_URL"
            value = local.ticket_service_url
          }

          env {
            name  = "TICKET_SERVICE_ENABLED"
            value = tostring(var.enable_ticket_service)
          }

          env {
            name  = "TICKET_SERVICE_TIMEOUT_MS"
            value = tostring(local.ticket_upstream_timeout_ms)
          }

          env {
            name  = "BFF_REDIS_HOST"
            value = "redis-stack.redis-stack-system"
          }

          env {
            name  = "BFF_REDIS_PORT"
            value = "6379"
          }

          env {
            name = "BFF_REDIS_USERNAME"
            value_from {
              secret_key_ref {
                name = "ui-bff-runtime-credentials"
                key  = "redis-username"
              }
            }
          }

          env {
            name = "BFF_REDIS_PASSWORD"
            value_from {
              secret_key_ref {
                name = "ui-bff-runtime-credentials"
                key  = "redis-password"
              }
            }
          }

          env {
            name  = "BFF_REDIS_DATABASE"
            value = "3"
          }

          env {
            name  = "BFF_SESSION_IDLE_SECONDS"
            value = "1800"
          }

          env {
            name  = "BFF_SESSION_ABSOLUTE_SECONDS"
            value = "28800"
          }

          liveness_probe {
            http_get {
              path = "/api/health/live"
              port = 3000
            }
            initial_delay_seconds = 10
            period_seconds        = 10
            failure_threshold     = 3
          }

          readiness_probe {
            http_get {
              path = "/api/health/ready"
              port = 3000
            }
            initial_delay_seconds = 10
            period_seconds        = 5
            failure_threshold     = 3
          }
        }
      }
    }
  }

  lifecycle {
    precondition {
      condition     = var.enable_auth_service
      error_message = "enable_ui requires enable_auth_service for the OIDC BFF credentials."
    }

    precondition {
      condition     = var.enable_data_service
      error_message = "enable_ui requires enable_data_service for the BFF title proxy."
    }

    precondition {
      condition     = var.enable_redis
      error_message = "enable_ui requires enable_redis for opaque BFF sessions."
    }
  }

  depends_on = [
    kubernetes_deployment.auth_service,
    kubernetes_service.data_service,
    kubernetes_service.ticket_service,
  ]
}

resource "kubernetes_service" "ui" {
  count = var.enable_ui ? 1 : 0

  metadata {
    name = local.ui_service_name
  }

  spec {
    selector = {
      app = local.ui_service_name
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
          path      = "/.well-known"
          path_type = "Prefix"

          backend {
            service {
              name = var.environment == "dev" ? "dev-auth-service" : "auth-service"
              port { number = 8081 }
            }
          }
        }

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

        dynamic "path" {
          for_each = var.enable_agent_service ? [1] : []
          content {
            path      = "/api/v1/agent"
            path_type = "Prefix"

            backend {
              service {
                name = "agent-service"
                port { number = 8084 }
              }
            }
          }
        }
      }
    }
  }
}

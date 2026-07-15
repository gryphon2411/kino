# OIDC protocol state is relational and mutable, unlike Kino's Mongo-backed
# user profile. Root only provisions the database and narrow roles; a Flyway
# Job owns DDL and the running auth service only receives DML permissions.
resource "kubernetes_config_map" "auth_database_bootstrap" {
  count = var.enable_postgres && var.enable_auth_service ? 1 : 0

  metadata {
    name      = "auth-database-bootstrap"
    namespace = kubernetes_namespace.postgres_system[0].metadata[0].name
  }

  data = {
    "bootstrap-auth-database.sh" = file("${path.module}/scripts/bootstrap-auth-database.sh")
  }
}

resource "kubernetes_secret" "auth_database_bootstrap_credentials" {
  count = var.enable_postgres && var.enable_auth_service ? 1 : 0

  metadata {
    name      = "auth-database-bootstrap-credentials"
    namespace = kubernetes_namespace.postgres_system[0].metadata[0].name
  }

  data = {
    migrator-password = var.auth_database_migrator_password
    runtime-password  = var.auth_database_runtime_password
  }
}

resource "kubernetes_secret" "auth_database_migrator_credentials" {
  count = var.enable_postgres && var.enable_auth_service ? 1 : 0

  metadata { name = "auth-database-migrator-credentials" }

  data = {
    username = "kino_auth_migrator"
    password = var.auth_database_migrator_password
  }
}

resource "kubernetes_secret" "auth_database_runtime_credentials" {
  count = var.enable_postgres && var.enable_auth_service ? 1 : 0

  metadata { name = "auth-database-runtime-credentials" }

  data = {
    username = "kino_auth_runtime"
    password = var.auth_database_runtime_password
  }
}

resource "kubernetes_secret" "auth_service_web_bff_client_credentials" {
  count = var.enable_auth_service ? 1 : 0

  metadata { name = "auth-service-web-bff-client-credentials" }

  data = {
    client-id     = "kino-web-bff"
    client-secret = var.web_bff_client_secret
  }
}

resource "kubernetes_secret" "ui_bff_runtime_credentials" {
  count = var.enable_auth_service && var.enable_ui ? 1 : 0

  metadata { name = "ui-bff-runtime-credentials" }

  data = {
    client-secret  = var.web_bff_client_secret
    redis-username = "kino-bff"
    redis-password = local.web_bff_redis_password
  }

  lifecycle {
    precondition {
      condition     = nonsensitive(local.web_bff_redis_password != var.redis_password)
      error_message = "The BFF Redis credential must be distinct from redis_password."
    }
  }
}

resource "kubernetes_job" "auth_database_bootstrap" {
  count = var.enable_postgres && var.enable_auth_service ? 1 : 0

  wait_for_completion = true

  metadata {
    name      = "auth-database-bootstrap"
    namespace = kubernetes_namespace.postgres_system[0].metadata[0].name
  }

  spec {
    backoff_limit = 3

    template {
      metadata {
        labels = { app = "auth-database-bootstrap" }
      }

      spec {
        container {
          name    = "bootstrap-auth-database"
          image   = local.auth_database_bootstrap_image_ref
          command = ["/bin/sh", "/scripts/bootstrap-auth-database.sh"]

          env {
            name  = "PGHOST"
            value = "postgres"
          }

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
            name = "PGPASSWORD"
            value_from {
              secret_key_ref {
                name = "postgres-root-user-credentials"
                key  = "password"
              }
            }
          }

          env {
            name = "AUTH_DB_MIGRATOR_PASSWORD"
            value_from {
              secret_key_ref {
                name = "auth-database-bootstrap-credentials"
                key  = "migrator-password"
              }
            }
          }

          env {
            name = "AUTH_DB_RUNTIME_PASSWORD"
            value_from {
              secret_key_ref {
                name = "auth-database-bootstrap-credentials"
                key  = "runtime-password"
              }
            }
          }

          volume_mount {
            name       = "bootstrap-script"
            mount_path = "/scripts"
            read_only  = true
          }
        }

        volume {
          name = "bootstrap-script"
          config_map { name = "auth-database-bootstrap" }
        }

        restart_policy = "Never"
      }
    }
  }

  lifecycle {
    replace_triggered_by = [
      kubernetes_config_map.auth_database_bootstrap[0],
      kubernetes_secret.auth_database_bootstrap_credentials[0],
    ]
  }

  depends_on = [kubernetes_stateful_set.postgres]
}

resource "kubernetes_config_map" "auth_database_migrations" {
  count = var.enable_postgres && var.enable_auth_service ? 1 : 0

  metadata { name = "auth-database-migrations" }

  data = {
    for migration in fileset("${path.module}/auth-db-migrations", "*.sql") :
    migration => file("${path.module}/auth-db-migrations/${migration}")
  }
}

resource "kubernetes_job" "auth_database_migration" {
  count = var.enable_postgres && var.enable_auth_service ? 1 : 0

  wait_for_completion = true

  metadata { name = "auth-database-migration" }

  spec {
    backoff_limit = 1

    template {
      metadata {
        labels = { app = "auth-database-migration" }
      }

      spec {
        container {
          name  = "flyway"
          image = local.auth_database_migration_image_ref
          args  = ["migrate"]

          env {
            name  = "FLYWAY_URL"
            value = "jdbc:postgresql://postgres.postgres-system:5432/kino_auth?currentSchema=kino_auth"
          }

          env {
            name = "FLYWAY_USER"
            value_from {
              secret_key_ref {
                name = "auth-database-migrator-credentials"
                key  = "username"
              }
            }
          }

          env {
            name = "FLYWAY_PASSWORD"
            value_from {
              secret_key_ref {
                name = "auth-database-migrator-credentials"
                key  = "password"
              }
            }
          }

          env {
            name  = "FLYWAY_SCHEMAS"
            value = "kino_auth"
          }

          env {
            name  = "FLYWAY_DEFAULT_SCHEMA"
            value = "kino_auth"
          }

          env {
            name  = "FLYWAY_CONNECT_RETRIES"
            value = "60"
          }

          volume_mount {
            name       = "migrations"
            mount_path = "/flyway/sql"
            read_only  = true
          }
        }

        volume {
          name = "migrations"
          config_map { name = "auth-database-migrations" }
        }

        restart_policy = "Never"
      }
    }
  }

  lifecycle {
    replace_triggered_by = [kubernetes_config_map.auth_database_migrations[0]]
  }

  depends_on = [kubernetes_job.auth_database_bootstrap]
}

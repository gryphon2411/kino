# Ticket allocation is a small transactional PostgreSQL domain. As with
# kino_auth, root only provisions narrow login roles; Flyway owns DDL and the
# Fastify runtime receives the exact table/column privileges it needs.
resource "kubernetes_config_map" "ticket_database_bootstrap" {
  count = var.enable_postgres && var.enable_ticket_service ? 1 : 0

  metadata {
    name      = "ticket-database-bootstrap"
    namespace = kubernetes_namespace.postgres_system[0].metadata[0].name
  }

  data = {
    "bootstrap-ticket-database.sh" = file("${path.module}/scripts/bootstrap-ticket-database.sh")
  }
}

resource "kubernetes_secret" "ticket_database_bootstrap_credentials" {
  count = var.enable_postgres && var.enable_ticket_service ? 1 : 0

  metadata {
    name      = "ticket-database-bootstrap-credentials"
    namespace = kubernetes_namespace.postgres_system[0].metadata[0].name
  }

  data = {
    migrator-password = var.ticket_database_migrator_password
    runtime-password  = var.ticket_database_runtime_password
  }
}

resource "kubernetes_secret" "ticket_database_migrator_credentials" {
  count = var.enable_postgres && var.enable_ticket_service ? 1 : 0

  metadata { name = "ticket-database-migrator-credentials" }

  data = {
    username = "kino_ticket_migrator"
    password = var.ticket_database_migrator_password
  }
}

resource "kubernetes_secret" "ticket_database_runtime_credentials" {
  count = var.enable_postgres && var.enable_ticket_service ? 1 : 0

  metadata { name = "ticket-database-runtime-credentials" }

  data = {
    username     = "kino_ticket_runtime"
    password     = var.ticket_database_runtime_password
    database-url = "postgresql://kino_ticket_runtime:${urlencode(var.ticket_database_runtime_password)}@postgres.postgres-system:5432/kino_ticket"
  }
}

resource "kubernetes_job" "ticket_database_bootstrap" {
  count = var.enable_postgres && var.enable_ticket_service ? 1 : 0

  wait_for_completion = true

  metadata {
    name      = "ticket-database-bootstrap"
    namespace = kubernetes_namespace.postgres_system[0].metadata[0].name
  }

  spec {
    backoff_limit = 3

    template {
      metadata { labels = { app = "ticket-database-bootstrap" } }

      spec {
        automount_service_account_token = false

        security_context {
          run_as_non_root = true
          run_as_user     = 999
          run_as_group    = 999

          seccomp_profile {
            type = "RuntimeDefault"
          }
        }

        container {
          name    = "bootstrap-ticket-database"
          image   = local.auth_database_bootstrap_image_ref
          command = ["/bin/sh", "/scripts/bootstrap-ticket-database.sh"]

          security_context {
            allow_privilege_escalation = false

            capabilities {
              drop = ["ALL"]
            }
          }

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
            name = "TICKET_DB_MIGRATOR_PASSWORD"
            value_from {
              secret_key_ref {
                name = "ticket-database-bootstrap-credentials"
                key  = "migrator-password"
              }
            }
          }
          env {
            name = "TICKET_DB_RUNTIME_PASSWORD"
            value_from {
              secret_key_ref {
                name = "ticket-database-bootstrap-credentials"
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
          config_map { name = "ticket-database-bootstrap" }
        }

        restart_policy = "Never"
      }
    }
  }

  lifecycle {
    replace_triggered_by = [
      kubernetes_config_map.ticket_database_bootstrap[0],
      kubernetes_secret.ticket_database_bootstrap_credentials[0],
    ]
  }

  depends_on = [kubernetes_stateful_set.postgres]
}

resource "kubernetes_config_map" "ticket_database_migrations" {
  count = var.enable_postgres && var.enable_ticket_service ? 1 : 0

  metadata { name = "ticket-database-migrations" }

  data = {
    for migration in fileset("${path.module}/ticket-db-migrations", "*.sql") :
    migration => file("${path.module}/ticket-db-migrations/${migration}")
  }
}

resource "kubernetes_job" "ticket_database_migration" {
  count = var.enable_postgres && var.enable_ticket_service ? 1 : 0

  wait_for_completion = true

  metadata { name = "ticket-database-migration" }

  spec {
    backoff_limit = 1

    template {
      metadata { labels = { app = "ticket-database-migration" } }

      spec {
        automount_service_account_token = false

        security_context {
          run_as_non_root = true
          run_as_user     = 1000
          run_as_group    = 1000

          seccomp_profile {
            type = "RuntimeDefault"
          }
        }

        container {
          name  = "flyway"
          image = local.ticket_database_migration_image_ref
          args  = ["migrate"]

          security_context {
            allow_privilege_escalation = false

            capabilities {
              drop = ["ALL"]
            }
          }

          env {
            name  = "FLYWAY_URL"
            value = "jdbc:postgresql://postgres.postgres-system:5432/kino_ticket?currentSchema=kino_ticket"
          }
          env {
            name = "FLYWAY_USER"
            value_from {
              secret_key_ref {
                name = "ticket-database-migrator-credentials"
                key  = "username"
              }
            }
          }
          env {
            name = "FLYWAY_PASSWORD"
            value_from {
              secret_key_ref {
                name = "ticket-database-migrator-credentials"
                key  = "password"
              }
            }
          }
          env {
            name  = "FLYWAY_SCHEMAS"
            value = "kino_ticket"
          }
          env {
            name  = "FLYWAY_DEFAULT_SCHEMA"
            value = "kino_ticket"
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
          config_map { name = "ticket-database-migrations" }
        }

        restart_policy = "Never"
      }
    }
  }

  lifecycle {
    replace_triggered_by = [kubernetes_config_map.ticket_database_migrations[0]]
  }

  depends_on = [kubernetes_job.ticket_database_bootstrap]
}

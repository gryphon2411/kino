# Viewing Plans owns an isolated PostgreSQL database. Bootstrap creates only
# roles and schema boundaries; Flyway owns all table DDL and runtime grants.
resource "kubernetes_config_map" "viewing_plan_database_bootstrap" {
  count = var.enable_postgres && var.enable_viewing_plan_service ? 1 : 0

  metadata {
    name      = "viewing-plan-database-bootstrap"
    namespace = kubernetes_namespace.postgres_system[0].metadata[0].name
  }

  data = {
    "bootstrap-viewing-plan-database.sh" = file("${path.module}/scripts/bootstrap-viewing-plan-database.sh")
  }
}

resource "kubernetes_secret" "viewing_plan_database_bootstrap_credentials" {
  count = var.enable_postgres && var.enable_viewing_plan_service ? 1 : 0

  metadata {
    name      = "viewing-plan-database-bootstrap-credentials"
    namespace = kubernetes_namespace.postgres_system[0].metadata[0].name
  }

  data = {
    migrator-password = var.viewing_plan_database_migrator_password
    runtime-password  = var.viewing_plan_database_runtime_password
  }
}

resource "kubernetes_secret" "viewing_plan_database_migrator_credentials" {
  count = var.enable_postgres && var.enable_viewing_plan_service ? 1 : 0

  metadata { name = "viewing-plan-database-migrator-credentials" }

  data = {
    username = "kino_viewing_plan_migrator"
    password = var.viewing_plan_database_migrator_password
  }
}

resource "kubernetes_secret" "viewing_plan_database_runtime_credentials" {
  count = var.enable_postgres && var.enable_viewing_plan_service ? 1 : 0

  metadata { name = "viewing-plan-database-runtime-credentials" }

  data = {
    username     = "kino_viewing_plan_runtime"
    password     = var.viewing_plan_database_runtime_password
    database-url = "postgresql://kino_viewing_plan_runtime:${urlencode(var.viewing_plan_database_runtime_password)}@postgres.postgres-system:5432/kino_viewing_plan"
  }
}

resource "kubernetes_job" "viewing_plan_database_bootstrap" {
  count = var.enable_postgres && var.enable_viewing_plan_service ? 1 : 0

  wait_for_completion = true

  metadata {
    name      = "viewing-plan-database-bootstrap"
    namespace = kubernetes_namespace.postgres_system[0].metadata[0].name
  }

  spec {
    backoff_limit = 3

    template {
      metadata { labels = { app = "viewing-plan-database-bootstrap" } }

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
          name    = "bootstrap-viewing-plan-database"
          image   = local.auth_database_bootstrap_image_ref
          command = ["/bin/sh", "/scripts/bootstrap-viewing-plan-database.sh"]

          resources {
            limits   = local.local_resource_profiles.database_job
            requests = local.local_resource_profiles.database_job
          }

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
            name = "VIEWING_PLAN_DB_MIGRATOR_PASSWORD"
            value_from {
              secret_key_ref {
                name = "viewing-plan-database-bootstrap-credentials"
                key  = "migrator-password"
              }
            }
          }
          env {
            name = "VIEWING_PLAN_DB_RUNTIME_PASSWORD"
            value_from {
              secret_key_ref {
                name = "viewing-plan-database-bootstrap-credentials"
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
          config_map {
            name = "viewing-plan-database-bootstrap"
          }
        }
        restart_policy = "Never"
      }
    }
  }

  lifecycle {
    replace_triggered_by = [
      kubernetes_config_map.viewing_plan_database_bootstrap[0],
      kubernetes_secret.viewing_plan_database_bootstrap_credentials[0],
    ]
  }

  depends_on = [kubernetes_stateful_set.postgres]
}

resource "kubernetes_config_map" "viewing_plan_database_migrations" {
  count = var.enable_postgres && var.enable_viewing_plan_service ? 1 : 0

  metadata { name = "viewing-plan-database-migrations" }

  data = {
    for migration in fileset("${path.module}/viewing-plan-db-migrations", "*.sql") :
    migration => file("${path.module}/viewing-plan-db-migrations/${migration}")
  }
}

resource "kubernetes_job" "viewing_plan_database_migration" {
  count = var.enable_postgres && var.enable_viewing_plan_service ? 1 : 0

  wait_for_completion = true
  metadata { name = "viewing-plan-database-migration" }

  spec {
    backoff_limit = 1
    template {
      metadata { labels = { app = "viewing-plan-database-migration" } }
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
          image = local.viewing_plan_database_migration_image_ref
          args  = ["migrate"]
          resources {
            limits   = local.local_resource_profiles.database_job
            requests = local.local_resource_profiles.database_job
          }
          security_context {
            allow_privilege_escalation = false
            capabilities {
              drop = ["ALL"]
            }
          }
          env {
            name  = "FLYWAY_URL"
            value = "jdbc:postgresql://postgres.postgres-system:5432/kino_viewing_plan?currentSchema=kino_viewing_plan"
          }
          env {
            name = "FLYWAY_USER"
            value_from {
              secret_key_ref {
                name = "viewing-plan-database-migrator-credentials"
                key  = "username"
              }
            }
          }
          env {
            name = "FLYWAY_PASSWORD"
            value_from {
              secret_key_ref {
                name = "viewing-plan-database-migrator-credentials"
                key  = "password"
              }
            }
          }
          env {
            name  = "FLYWAY_SCHEMAS"
            value = "kino_viewing_plan"
          }
          env {
            name  = "FLYWAY_DEFAULT_SCHEMA"
            value = "kino_viewing_plan"
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
          config_map {
            name = "viewing-plan-database-migrations"
          }
        }
        restart_policy = "Never"
      }
    }
  }

  lifecycle { replace_triggered_by = [kubernetes_config_map.viewing_plan_database_migrations[0]] }
  depends_on = [kubernetes_job.viewing_plan_database_bootstrap]
}

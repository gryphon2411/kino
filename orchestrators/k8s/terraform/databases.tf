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
          # CORRECTNESS FIX: Removed dead code (irrelevant env vars)
          env {
            name  = "MONGO_INITDB_ROOT_USERNAME"
            value = "root"
          }
          env {
            name  = "MONGO_INITDB_ROOT_PASSWORD"
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
  count      = var.enable_mongodb ? 1 : 0
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
            name  = "REDIS_ARGS"
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

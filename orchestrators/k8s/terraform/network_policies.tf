# Redis is a shared technical dependency, but incoming connections are limited
# to the three workloads that use it. The BFF's dedicated Redis ACL is the
# second boundary: Auth/Data may connect for their own state but cannot access
# `kino:bff:*` token records.
resource "kubernetes_network_policy_v1" "redis_ingress" {
  count = var.enable_redis ? 1 : 0

  metadata {
    name      = "redis-stack-allow-kino-services"
    namespace = kubernetes_namespace.redis_stack_system[0].metadata[0].name
  }

  spec {
    pod_selector {
      match_labels = { app = "redis-stack" }
    }

    policy_types = ["Ingress"]

    ingress {
      from {
        namespace_selector {
          match_labels = {
            "kubernetes.io/metadata.name" = "default"
          }
        }

        pod_selector {
          match_expressions {
            key      = "app"
            operator = "In"
            values = [
              local.auth_service_name,
              "data-service",
              local.ui_service_name,
            ]
          }
        }
      }

      ports {
        port     = "6379"
        protocol = "TCP"
      }
    }
  }
}

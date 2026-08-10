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

# Ticket allocation is reached only through the UI's server-side BFF. ClusterIP
# keeps it off the gateway; this policy also limits in-cluster callers to that
# BFF pod. The Fastify JWT checks remain the application-layer boundary.
resource "kubernetes_network_policy_v1" "ticket_service_ingress" {
  count = var.enable_ticket_service ? 1 : 0

  metadata {
    name = "ticket-service-allow-ui-bff"
  }

  spec {
    pod_selector {
      match_labels = { app = local.ticket_service_name }
    }

    policy_types = ["Ingress", "Egress"]

    ingress {
      from {
        namespace_selector {
          match_labels = {
            "kubernetes.io/metadata.name" = "default"
          }
        }

        pod_selector {
          match_labels = { app = local.ui_service_name }
        }
      }

      ports {
        port     = "8080"
        protocol = "TCP"
      }
    }

    # The ticket runtime only needs its own database, the issuer's pinned JWK
    # endpoint, and DNS to resolve those service names.
    egress {
      to {
        namespace_selector {
          match_labels = {
            "kubernetes.io/metadata.name" = "postgres-system"
          }
        }

        pod_selector {
          match_labels = { app = "postgres" }
        }
      }

      ports {
        port     = "5432"
        protocol = "TCP"
      }
    }

    egress {
      to {
        namespace_selector {
          match_labels = {
            "kubernetes.io/metadata.name" = "default"
          }
        }

        pod_selector {
          match_labels = { app = local.auth_service_name }
        }
      }

      ports {
        port     = "8081"
        protocol = "TCP"
      }
    }

    egress {
      to {
        namespace_selector {
          match_labels = {
            "kubernetes.io/metadata.name" = "kube-system"
          }
        }

        pod_selector {
          match_labels = { "k8s-app" = "kube-dns" }
        }
      }

      ports {
        port     = "53"
        protocol = "UDP"
      }

      ports {
        port     = "53"
        protocol = "TCP"
      }
    }
  }
}

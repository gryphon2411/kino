output "mongodb_uri" {
  description = "In-cluster MongoDB connection URI"
  value       = var.enable_mongodb ? "mongodb://root:${var.mongodb_password}@mongodb.mongodb-system.svc.cluster.local:27017" : null
  sensitive   = true
}

output "redis_uri" {
  description = "In-cluster Redis connection URI"
  value       = var.enable_redis ? "redis://default:${var.redis_password}@redis-stack.redis-stack-system.svc.cluster.local:6379" : null
  sensitive   = true
}

output "ingress_url" {
  description = "Ingress Gateway URL"
  value       = var.enable_ingress ? "http://${var.environment == "dev" ? "dev.derkino.com" : "local.derkino.com"}" : null
}

output "get_grafana_password_cmd" {
  value = var.enable_grafana ? "kubectl -n grafana-system get secret grafana -o jsonpath='{.data.admin-password}' | base64 --decode" : null
}

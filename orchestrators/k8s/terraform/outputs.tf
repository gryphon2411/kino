output "mongodb_uri" {
  description = "MongoDB Connection URI"
  value       = var.enable_mongodb ? "mongodb://${kubernetes_secret.mongodb_creds[0].data.username}:${kubernetes_secret.mongodb_creds[0].data.password}@${kubernetes_service.mongodb[0].spec[0].cluster_ip}:27017" : null
  sensitive   = true
}

output "redis_uri" {
  description = "Redis Connection URI"
  value       = var.enable_redis ? "redis://${kubernetes_secret.redis_creds[0].data.username}:${kubernetes_secret.redis_creds[0].data.password}@${kubernetes_service.redis[0].spec[0].cluster_ip}:6379" : null
  sensitive   = true
}

output "ingress_url" {
  description = "Ingress Gateway URL"
  value       = var.enable_ingress ? "http://${var.environment == "dev" ? "dev.derkino.com" : "local.derkino.com"}" : null
}

output "grafana_admin_password" {
  description = "Grafana Admin Password"
  value       = var.enable_grafana ? "admin" : null # Default chart password, usually 'admin' or random. Bitnami charts use random, but here we are using the community chart which defaults to admin/admin or secret.
  # The script gets it from secret: kubectl -n grafana-system get secret grafana -o jsonpath="{.data.admin-password}"
  # We can't easily output that here without a data source reading it back, but for now we'll leave it as a placeholder or remove if unsure.
  # Better to output the command to get it:
}

output "get_grafana_password_cmd" {
  value = "kubectl -n grafana-system get secret grafana -o jsonpath='{.data.admin-password}' | base64 --decode"
}

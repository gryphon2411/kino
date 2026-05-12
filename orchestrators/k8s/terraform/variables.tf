# Environment Configuration
variable "environment" {
  type        = string
  description = "Deployment environment (local or dev)"
  default     = "local"

  validation {
    condition     = contains(["local", "dev"], var.environment)
    error_message = "Environment must be 'local' or 'dev'."
  }
}

# Feature Flags - Databases
variable "enable_mongodb" {
  type        = bool
  description = "Enable MongoDB system"
  default     = true
}

variable "enable_postgres" {
  type        = bool
  description = "Enable Postgres system"
  default     = true
}

variable "enable_redis" {
  type        = bool
  description = "Enable Redis-Stack system"
  default     = true
}

variable "enable_kafka" {
  type        = bool
  description = "Enable Kafka system"
  default     = true
}

variable "enable_rabbitmq" {
  type        = bool
  description = "Enable RabbitMQ system"
  default     = true
}

# Feature Flags - Services
variable "enable_auth_service" {
  type        = bool
  description = "Enable Kino Auth Service"
  default     = true
}

variable "enable_data_service" {
  type        = bool
  description = "Enable Kino Data Service"
  default     = true
}

variable "enable_trend_service" {
  type        = bool
  description = "Enable Kino Trend Service"
  default     = true
}

variable "enable_generative_service" {
  type        = bool
  description = "Enable Kino Generative Service"
  default     = true
}

variable "enable_agent_service" {
  type        = bool
  description = "Enable Kino Agent Service"
  default     = false
}

variable "enable_ui" {
  type        = bool
  description = "Enable Kino UI"
  default     = true
}

# Feature Flags - Monitoring
variable "enable_prometheus" {
  type        = bool
  description = "Enable Prometheus system"
  default     = true
}

variable "enable_grafana" {
  type        = bool
  description = "Enable Grafana system"
  default     = true
}

# Feature Flags - Networking
variable "enable_ingress" {
  type        = bool
  description = "Enable Gateway Ingress"
  default     = true
}

# Database Credentials (sensitive)
# Set via TF_VAR_<name> environment variables or terraform.tfvars
variable "mongodb_password" {
  type        = string
  description = "MongoDB root password"
  sensitive   = true
}

variable "postgres_password" {
  type        = string
  description = "Postgres root password"
  sensitive   = true
}

variable "redis_password" {
  type        = string
  description = "Redis password"
  sensitive   = true
}

variable "kafka_password" {
  type        = string
  description = "Kafka password"
  sensitive   = true
}

variable "rabbitmq_password" {
  type        = string
  description = "RabbitMQ password"
  sensitive   = true
}

variable "rabbitmq_admin_password" {
  type        = string
  description = "RabbitMQ admin password. Defaults to rabbitmq_password when unset."
  sensitive   = true
  default     = null
  nullable    = true
}

variable "agent_service_provider" {
  type        = string
  description = "Kino Agent Service model provider"
  default     = "nvidia_nim"

  validation {
    condition = contains(
      ["google_genai", "nvidia_nim"],
      var.agent_service_provider
    )
    error_message = "Agent service provider must be 'google_genai' or 'nvidia_nim'."
  }
}

variable "agent_service_model" {
  type        = string
  description = "Kino Agent Service model name"
  default     = "deepseek-ai/deepseek-v3.2"
}

variable "nvidia_api_key" {
  type        = string
  description = "NVIDIA API key for Kino Agent Service"
  sensitive   = true
  default     = null
  nullable    = true
}

variable "agent_service_client_secret" {
  type        = string
  description = "Client secret for the auth-service machine token issuer client."
  sensitive   = true
  default     = "replace-me-agent-secret"
}

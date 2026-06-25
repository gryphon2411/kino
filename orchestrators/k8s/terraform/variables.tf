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

# Service Images
variable "auth_service_image_ref" {
  type        = string
  description = "Immutable auth-service image reference deployed by Kubernetes"
  default     = null
  nullable    = true

  validation {
    condition = !var.enable_auth_service || (
      var.auth_service_image_ref != null
      && can(regex(".+@sha256:[0-9a-f]{64}$", var.auth_service_image_ref))
    )
    error_message = "auth_service_image_ref must be a digest-pinned OCI image reference when auth-service is enabled."
  }
}

variable "data_service_image_ref" {
  type        = string
  description = "Immutable data-service image reference deployed by Kubernetes"
  default     = null
  nullable    = true

  validation {
    condition = !var.enable_data_service || (
      var.data_service_image_ref != null
      && can(regex(".+@sha256:[0-9a-f]{64}$", var.data_service_image_ref))
    )
    error_message = "data_service_image_ref must be a digest-pinned OCI image reference when data-service is enabled."
  }
}

variable "trend_service_image_ref" {
  type        = string
  description = "Immutable trend-service image reference deployed by Kubernetes"
  default     = null
  nullable    = true

  validation {
    condition = !var.enable_trend_service || (
      var.trend_service_image_ref != null
      && can(regex(".+@sha256:[0-9a-f]{64}$", var.trend_service_image_ref))
    )
    error_message = "trend_service_image_ref must be a digest-pinned OCI image reference when trend-service is enabled."
  }
}

variable "generative_service_image_ref" {
  type        = string
  description = "Immutable generative-service image reference deployed by Kubernetes"
  default     = null
  nullable    = true

  validation {
    condition = !var.enable_generative_service || (
      var.generative_service_image_ref != null
      && can(regex(".+@sha256:[0-9a-f]{64}$", var.generative_service_image_ref))
    )
    error_message = "generative_service_image_ref must be a digest-pinned OCI image reference when generative-service is enabled."
  }
}

variable "agent_service_image_ref" {
  type        = string
  description = "Immutable agent-service image reference deployed by Kubernetes"
  default     = null
  nullable    = true

  validation {
    condition = !var.enable_agent_service || (
      var.agent_service_image_ref != null
      && can(regex(".+@sha256:[0-9a-f]{64}$", var.agent_service_image_ref))
    )
    error_message = "agent_service_image_ref must be a digest-pinned OCI image reference when agent-service is enabled."
  }
}

variable "ui_image_ref" {
  type        = string
  description = "Immutable UI image reference deployed by Kubernetes"
  default     = null
  nullable    = true

  validation {
    condition = !var.enable_ui || (
      var.ui_image_ref != null
      && can(regex(".+@sha256:[0-9a-f]{64}$", var.ui_image_ref))
    )
    error_message = "ui_image_ref must be a digest-pinned OCI image reference when the UI is enabled."
  }
}

# Database Credentials (sensitive)
# Set via TF_VAR_<name> environment variables or terraform.tfvars
variable "mongodb_password" {
  type        = string
  description = "MongoDB root password"
  sensitive   = true
}

variable "mongodb_seed_image_ref" {
  type        = string
  description = "Immutable MongoDB seed image reference used by the init Job"
  default     = null
  nullable    = true

  validation {
    condition = !var.enable_mongodb || (
      var.mongodb_seed_image_ref != null
      && can(regex(".+@sha256:[0-9a-f]{64}$", var.mongodb_seed_image_ref))
    )
    error_message = "mongodb_seed_image_ref must be a digest-pinned OCI image reference when MongoDB is enabled."
  }
}

variable "mongodb_seed_generation" {
  type        = number
  description = "Declarative nonce for rerunning the MongoDB seed Job with the same image ref."
  default     = 0
}

variable "mongodb_seed_job_active_deadline_seconds" {
  type        = number
  description = "Maximum wall-clock time for the MongoDB seed Job, including image pull, startup, restore, and promotion."
  default     = 1800

  validation {
    condition     = var.mongodb_seed_job_active_deadline_seconds >= 60
    error_message = "mongodb_seed_job_active_deadline_seconds must be at least 60 seconds."
  }
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
  default     = "google_genai"

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
  default     = "gemini-3.1-flash-lite-preview"
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

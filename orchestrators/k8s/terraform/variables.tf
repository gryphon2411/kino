variable "environment" {
  description = "Deployment environment (local or dev)"
  type        = string
  default     = "local"
  validation {
    condition     = contains(["local", "dev"], var.environment)
    error_message = "Environment must be 'local' or 'dev'."
  }
}

variable "enable_mongodb" {
  description = "Enable MongoDB system"
  type        = bool
  default     = true
}

variable "enable_postgres" {
  description = "Enable Postgres system"
  type        = bool
  default     = true
}

variable "enable_redis" {
  description = "Enable Redis-Stack system"
  type        = bool
  default     = true
}

variable "enable_kafka" {
  description = "Enable Kafka system"
  type        = bool
  default     = true
}

variable "enable_rabbitmq" {
  description = "Enable RabbitMQ system"
  type        = bool
  default     = true
}

variable "enable_auth_service" {
  description = "Enable Derkino Auth Service"
  type        = bool
  default     = true
}

variable "enable_data_service" {
  description = "Enable Derkino Data Service"
  type        = bool
  default     = true
}

variable "enable_trend_service" {
  description = "Enable Derkino Trend Service"
  type        = bool
  default     = true
}

variable "enable_generative_service" {
  description = "Enable Derkino Generative Service"
  type        = bool
  default     = true
}

variable "enable_ui" {
  description = "Enable Derkino UI"
  type        = bool
  default     = true
}

variable "enable_prometheus" {
  description = "Enable Prometheus system"
  type        = bool
  default     = true
}

variable "enable_grafana" {
  description = "Enable Grafana system"
  type        = bool
  default     = true
}

variable "enable_ingress" {
  description = "Enable Gateway Ingress"
  type        = bool
  default     = true
}

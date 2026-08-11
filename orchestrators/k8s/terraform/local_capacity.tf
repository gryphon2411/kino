# Kino is a deliberately small, full-stack local environment. Keeping the resource
# profiles in one place makes the Docker-backed Minikube budget reviewable and
# prevents a newly added workload from silently becoming BestEffort.
locals {
  local_resource_profiles = {
    mongodb    = { cpu = "500m", memory = "2Gi" }
    mongo_seed = { cpu = "500m", memory = "768Mi" }
    postgres   = { cpu = "250m", memory = "768Mi" }
    redis      = { cpu = "100m", memory = "256Mi" }

    database_job = { cpu = "100m", memory = "256Mi" }

    auth         = { cpu = "250m", memory = "512Mi" }
    data         = { cpu = "250m", memory = "512Mi" }
    ticket       = { cpu = "150m", memory = "256Mi" }
    viewing_plan = { cpu = "150m", memory = "256Mi" }
    trend        = { cpu = "150m", memory = "384Mi" }
    generative   = { cpu = "250m", memory = "512Mi" }
    agent        = { cpu = "250m", memory = "512Mi" }
    ui           = { cpu = "250m", memory = "384Mi" }
  }
}

# Mongo's seed is the only workload that may run while the IMDb data is being
# restored.  Everything that can create a long-lived pod waits for this
# explicit completion edge instead of merely relying on Terraform parallelism.
resource "terraform_data" "mongodb_seed_complete" {
  input = var.enable_mongodb

  depends_on = [kubernetes_job.mongodb_init]
}

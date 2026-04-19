locals {
  kubeconfig_path = pathexpand(coalesce(var.kubeconfig_path, "~/.kube/config"))
}

provider "kubernetes" {
  config_path    = local.kubeconfig_path
  config_context = var.kube_context
}

provider "helm" {
  kubernetes {
    config_path    = local.kubeconfig_path
    config_context = var.kube_context
  }
}

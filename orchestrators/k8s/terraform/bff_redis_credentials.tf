# The BFF token store must not share Redis credentials with other Kino
# services. Keep the generated value in Terraform's existing sensitive state;
# an operator may set web_bff_redis_password for an intentional rotation.
resource "random_password" "web_bff_redis" {
  count = var.enable_ui ? 1 : 0

  length  = 48
  special = false
}

locals {
  web_bff_redis_password = coalesce(
    var.web_bff_redis_password,
    try(random_password.web_bff_redis[0].result, null)
  )
}

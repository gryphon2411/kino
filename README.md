![Kino Logo](/graphic-designs/logo-scaled.png)

# Kino

Kino ("Cinema"), derived from German Kino and also reflected in Yiddish as קינאָ (kino), represents a personal educational initiative focused on exploring various technologies within the context of a cinema.

## Provision

### Prepare the seed

Kino runs as a Docker-backed Minikube stack. Start with a released Mongo seed:
if you already have one, use its digest; otherwise, follow the [IMDb titles
release guide](jobs/README.md).

### Set the Terraform inputs

From the repository root, prepare the Terraform inputs:

```bash
cd orchestrators/k8s/terraform
cp .env.example .env
```

Edit `.env` before deploying. Replace the sample image refs with digest-pinned
refs from the service release workflows, and set `TF_VAR_mongodb_seed_image_ref`
to the seed digest. Replace the sample passwords and client secrets too. Ticket
and Viewing Plans are enabled by default, so uncomment and fill their database
role passwords. The default Google model path also needs `TF_VAR_gemini_api_key`;
an NVIDIA key is only needed if you switch the agent to NVIDIA.

### Bootstrap and deploy

Then bootstrap the local cluster, deploy, and bring up Vault-backed model
secrets:

```bash
task bootstrap-local-env
task deploy-with-vault
```

Bootstrap checks host capacity, prepares the six-CPU / 14-GiB Calico profile,
and adds the local host entries (sudo password required).

### Verify and open Kino

Check the deployed capacity and list the service URLs:

```bash
task verify-local-capacity
task urls
```

Open Kino at [http://local.kino.com](http://local.kino.com). Keep `.env`,
`cluster-keys.json`, and Terraform state files out of Git. See the [Terraform
guide](orchestrators/k8s/terraform/README.md) for the full workflow and options.

## Components
![Kino Components Diagram](/architecture/components.drawio.svg)

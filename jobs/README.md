# IMDb Titles Artifact Workflow

The authoritative IMDb titles dataset release path is local to your Linux machine.
GitHub Actions validates the pipeline shape, but it does not publish official
dataset artifacts.

## Prerequisites

- Python environment in `jobs/.venv` with `jobs/requirements.txt` installed
- Docker
- Task (`go-task.dev`)
- Docker Hub access for `kino-mongo-seed`

The local release flow uses the same credential names as the GitHub Actions
workflows: `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`. Task auto-loads them
from `jobs/.env` when that file exists.

Typical setup:

```bash
cd jobs
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your Docker Hub username and token
```

If `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` are set, the local publish step
logs in automatically, just like the GitHub workflows do. If you prefer not to
store the token in `jobs/.env`, export the variables in your shell instead.

## Local Release Flow

From this directory:

```bash
task release-imdb-titles-mongo-seed
```

That composed task runs:

1. `task build-imdb-titles-artifacts`
2. `task publish-imdb-titles-mongo-seed`

The build step writes the local provenance artifacts to `jobs/.artifacts/`:

- `raw-imdb/`
- `curated-titles/`
- `mongo-seed/`

The publish step pushes only the Mongo seed image and writes
`jobs/.artifacts/release-manifest.json`.
That manifest records the digest-pinned seed image ref in `repo@sha256:...`
form, not just the pushed tag.
Before it pushes anything, the publish step validates that the standalone raw,
curated, and seed artifacts in `jobs/.artifacts/` all belong to one coherent
release lineage. If that directory mixes outputs from different runs, publish
fails fast instead of pushing a stale seed image.

The package-native operator entrypoints now live under
`jobs/imdb_titles_pipeline/`, with release helpers under
`jobs/imdb_titles_pipeline/release/`. `jobs/images/` contains the container
build assets grouped per image, while `jobs/.artifacts/` remains reserved for
generated outputs.

## Release Manifest

`jobs/.artifacts/release-manifest.json` is the handoff contract for Terraform.
It contains:

- `gitRevision`
- `datasetVersion`
- `transformVersion`
- `rawSourceSha256`
- `rawManifestSha256`
- `curatedManifestSha256`
- `seedManifestSha256`
- `mongoSeedImageRef`

Use `mongoSeedImageRef` as `mongodb_seed_image_ref` in
`orchestrators/k8s/terraform/terraform.tfvars`.

GitHub Actions may also emit a CI-only `verification-manifest.json` while
validating the pipeline shape. That file is not a deploy artifact and should
not be used as the Terraform handoff.

For the deploy-side handoff and `task deploy` flow, continue in
[orchestrators/k8s/terraform/README.md](../orchestrators/k8s/terraform/README.md).

## Retention Policy

For this local-authority workflow, the normal policy is:

- keep `1 active` seed release
- keep `1 rollback` seed release

The raw and curated artifacts are local provenance/debugging outputs. After a
successful publish, you can prune older local copies aggressively.

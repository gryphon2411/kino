# Kino Agent Guide

This file is the repo-wide source of truth for AI agents working in Kino.
Use it together with the scoped instruction files under `.github/instructions/`.

## Overview

Kino is a polyglot cinema application used as an educational project. The
current stack includes:

- React / Next.js UI under `uis/react-ui/kino-ui/`
- Spring Boot services under `services/spring-boot/`
- Django REST Framework under `services/django-rest-framework/`
- Express services under `services/express/`
- LangGraph agent service under `services/langgraph/agent_service/`
- MongoDB, PostgreSQL, Redis, Kafka, and RabbitMQ in Kubernetes

## Canonical Workflows

### Deploy

The canonical deployment path is Terraform-based:

1. Read `orchestrators/k8s/terraform/README.md`
2. Prepare `orchestrators/k8s/terraform/.env`
3. Set digest-pinned image refs for enabled services
4. Run `task deploy` from `orchestrators/k8s/terraform`

Raw Kubernetes manifests under `orchestrators/k8s/` still exist, but they are
not the authoritative deploy path for normal repo work.

### IMDb Titles Data

The titles bootstrap flow is now a local-authority artifact pipeline:

1. Read `jobs/README.md`
2. Run `task release-imdb-titles-mongo-seed` from `jobs/`
3. Use `jobs/.artifacts/release-manifest.json` as the handoff to Terraform

Important contract:

- Terraform consumes `mongodb_seed_image_ref`
- The value must be a digest-pinned OCI ref
- `mongodb_seed_generation` is only the explicit rerun token when reapplying
  the same seed digest

### Service Image Releases

Application service images are published by GitHub Actions workflows. The
canonical deploy contract is the pushed digest, not a mutable tag.

- Use the workflow summary or uploaded release manifest to copy the digest
- Set the matching `*_image_ref` Terraform variable
- `kubectl rollout restart` is debugging-only, not the authoritative release
  mechanism

## Current Architecture Conventions

### Frontend

- Next.js App Router
- Redux Toolkit for shared state
- Material UI for components
- Feature-oriented structure under `uis/react-ui/kino-ui/src/app/`

### Spring Services

- Controllers stay thin
- Services own orchestration logic
- Repositories own query logic
- DTOs and event payloads stay separate from persistence entities
- Shared transport contracts belong in `services/spring-boot/commons`

### Data-Service Title Search

- Mongo `title_basics` documents include derived helper fields when useful for
  read/query performance
- `primaryTitleSearchKey` is an internal stored helper field used for indexed
  case-insensitive prefix search
- `Title` is the Mongo persistence model
- `TitleDto` is the API DTO
- `TitleSearchEvent` is the Kafka payload
- Mapping between these types should remain explicit

### Data Semantics

- The curated IMDb pipeline preserves unknown source values as `null`
- Do not replace unknown values with fabricated defaults in canonical data
- Reduce nullability only at explicit consumption boundaries when the fallback
  is semantically safe

## Verification

Prefer the narrowest verification that matches the change:

- UI: `npm test` in `uis/react-ui/kino-ui/`
- Spring services: `./gradlew test`
- Python jobs: `python -m unittest discover -s tests -p 'test_*.py'`
- Terraform: `terraform validate`

For larger infra/data changes, use the README in the affected area and follow
its documented end-to-end flow.

## Important Files

- `README.md`
- `ARCHITECTURE.md`
- `jobs/README.md`
- `orchestrators/k8s/terraform/README.md`
- `.github/instructions/reactjs.instructions.md`
- `.github/instructions/springboot.instructions.md`

## Safety

Never commit:

- `.env`
- `*.tfvars`
- `*.tfstate`
- `cluster-keys.json`

Prefer updating documentation when you change a deploy contract, artifact
contract, or cross-service payload shape.

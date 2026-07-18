# Kino Auth Service

Kino's Spring Boot Auth Service is the system's Authorization Server. It keeps
application users in MongoDB, keeps OAuth/OIDC protocol state in PostgreSQL,
and uses Redis for short-lived browser login sessions.

## Active responsibilities

- authenticates users through Spring Security's CSRF-protected form login
- issues OIDC Authorization Code with PKCE tokens to the confidential Next.js
  BFF client
- rotates BFF refresh tokens
- issues client-credentials JWTs to the agent service
- publishes OIDC discovery, JWKS, token, revocation, and user-info endpoints

The service does not expose legacy `secured`/`non-secured` demonstration
endpoints. User-facing catalog access is enforced by `data_service`; browser
tokens are held only by the UI's BFF session store.

## State boundaries

| State | Store | Owner |
| --- | --- | --- |
| User profile and password verifier | MongoDB | Auth Service |
| OIDC clients, codes, consents, and refresh tokens | PostgreSQL `kino_auth` | Spring Authorization Server |
| Browser login session | Redis | Spring Session |

`CustomUser.oidcSubject` is a stable opaque identity claim. Mongo creates its
unique sparse index from the persistence model at startup; a legacy-user
backfill is no longer part of the runtime path.

## Run and verify

From this directory:

```bash
./gradlew test
```

The canonical Kubernetes deployment and credential configuration live in
[`orchestrators/k8s/terraform`](../../../orchestrators/k8s/terraform/README.md).
For the cross-service design, see the repository
[`ARCHITECTURE.md`](../../../ARCHITECTURE.md).

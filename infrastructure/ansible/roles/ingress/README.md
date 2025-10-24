# Ingress Role

This role manages ingress controller configuration and routing rules.

## Purpose

- Check ingress controller availability
- Configure ingress class and routing defaults
- Validate ingress configuration
- Set up ingress resources

## Variables

- `ingress_class`: Ingress controller class (default: "nginx")
- `ingress_host`: Default host for ingress rules (default: "local.derkino.com")
- `ingress_tls_enabled`: Enable TLS configuration (default: false)

## Usage

This role configures ingress routing for services and ensures proper external access to applications.
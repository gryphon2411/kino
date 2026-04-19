# Kino Project - AI Coding Assistant Instructions

## Project Overview

Kino is a microservices-based cinema application that demonstrates various technologies within a Kubernetes environment. The system follows a polyglot architecture with different services implemented in different technologies:

- **Frontend**: React/Next.js with Material UI and Redux Toolkit
- **Backend Services**: Spring Boot (Java), Django REST Framework (Python), Node.js/Express
- **Data Stores**: MongoDB, PostgreSQL, Redis Stack
- **Messaging Systems**: Apache Kafka, RabbitMQ
- **Infrastructure**: Kubernetes with Helm charts

This document provides essential context for AI coding assistants to understand the project structure, conventions, and development workflows.

This is the main repository-wide instructions file for GitHub Copilot. For file-specific instructions, see `.github/instructions/**/*.instructions.md` files.

## Architecture Patterns

### Frontend Architecture
- Uses React with functional components and hooks
- State management with Redux Toolkit slices
- Material UI for components and styling
- REST API integration via fetch calls
- Environment-based API endpoint configuration (NEXT_PUBLIC_API_HOST_URL)

### Backend Architecture
- REST controllers with Spring Boot
- MongoDB repositories with custom query implementations
- Kafka integration for event streaming
- Redis for caching
- Environment-based configuration

### Data Flow
1. Frontend makes REST calls to data-service via `/api/v1/data` endpoint
2. Data service queries MongoDB with text search capabilities
3. Search events are published to Kafka for analytics
4. Redis is used for caching (session management, etc.)

## Key Conventions

### Naming Conventions
- Redux slices are named after the domain entity (e.g., `titles`)
- API endpoints follow REST patterns with plural nouns
- Kubernetes manifests use kebab-case naming
- Environment variables use UPPER_SNAKE_CASE

### File Organization
- Frontend: `/uis/react-ui/kino-ui/src/app/[feature]/`
- Backend services: `/services/[technology]/[service_name]/`
- Kubernetes manifests: `/orchestrators/k8s/`
- Documentation: `/architecture/`, `/NOTES.md`

### Code Patterns

#### Frontend Patterns
- Redux slices with async thunks for API calls
- Local state for immediate UI feedback, Redux for persistent state
- Debouncing for search inputs (see LLD.md for search implementation)
- Component composition with Material UI

#### Backend Patterns
- Spring Boot controllers with service layers
- MongoDB repositories with custom implementations for complex queries
- KafkaTemplate for event publishing
- Environment variable configuration

#### Infrastructure Patterns
- Separate YAML files for each Kubernetes component
- Helm charts for complex systems (Kafka, RabbitMQ, Prometheus, Grafana)
- Secrets management with Kubernetes secrets
- Ingress routing for API gateway pattern

## Developer Workflows

### Running the Application Locally
1. Ensure dependencies: `kubectl`, `minikube`, `helm`, `yq`, `jq`
2. Navigate to project root
3. Run `source ./orchestrators/k8s/provision.sh`
4. Select `local` environment
5. Confirm components to deploy (start with essential ones)

### Building and Deploying
- Frontend: `npm run build` creates standalone output
- Backend services: Gradle builds with Docker images
- Kubernetes: Apply manifests or use Helm charts

### Testing
- Unit tests: Located in each service's `src/test` directory
- Integration testing: Via Kubernetes deployment with live services
- Manual testing: Through UI at `http://local.kino.com`
- Visual verification: Using browser automation tools to inspect and interact with the UI
- Test commands:
  * Frontend: `npm test` in `uis/react-ui/kino-ui/`
  * Backend services: Gradle test tasks (e.g., `./gradlew test`)

### GitHub Workflow
- Feature development through GitHub issues and feature branches
- Code review via pull requests with verification comments
- Manual UI verification after deployment before merging
- Structured commit messages following Conventional Commits specification

### Debugging
- Use browser developer tools for frontend debugging
- Use IDE debuggers for backend services
- Check Kubernetes pod logs: `kubectl logs -n <namespace> <pod-name>`
- Monitor services through Grafana dashboards when deployed

## Environment Configuration

### API Endpoints
- Local development: `http://local.kino.com/api/v1/[service]`
- Dev environment: `http://dev.kino.com/api/v1/[service]`
- Services: `auth`, `data`, `generative`

### Environment Variables
- Frontend: `NEXT_PUBLIC_API_HOST_URL` in Dockerfiles
- Backend: Service-specific variables in Kubernetes manifests
- Infrastructure: Defined in Helm values files

## Common Integration Points

### Frontend ↔ Backend
- REST API calls to `/api/v1/data/titles` with query parameters
- Error handling through Redux error state
- Pagination support with page/size parameters

### Backend Services ↔ Data Stores
- MongoDB connections with username/password authentication
- Redis connections for caching/session management
- Kafka producers for event streaming

### Infrastructure Configuration
- Ingress routing maps `/api/v1/[service]` to respective Kubernetes services
- Secrets provide credentials for external services
- ConfigMaps for configuration data

## "Just Enough" Philosophy

This project follows a "just enough" approach to implementation:
- Implement only required features, defer advanced functionality
- Keep designs simple and maintainable
- Avoid premature optimization
- Focus on meeting current requirements rather than anticipating future needs

## Git Commit Message Best Practices

The Kino project follows the **Conventional Commits** specification with these key points:

- **Format**: `<type>(scope): subject` followed by an optional body and/or footer.
- **Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.
- **Subject**: Max 50 chars, imperative mood, capitalized, no period at the end.
- **Body**: Max 72 chars per line, separated from the subject by a blank line.
- **Footer**: Used for linking issues or **describing breaking changes**. Use appropriate formats for issue linking or breaking change descriptions.
- **Breaking Changes**: Mark breaking changes by adding a `!` after the type/scope (e.g., `feat(auth)!:`) or by adding a `BREAKING CHANGE:` footer.

### Examples

**Feature:**
```
feat(auth): Add JWT token refresh functionality

Implement automatic JWT token refresh when a request fails due to an expired token.
```

**Fix with Issue Linking:**
```
fix(titles): Correct pagination for free text search

- Resolve issue where skip parameter was miscalculated.

Include issue linking in footer when applicable.
```
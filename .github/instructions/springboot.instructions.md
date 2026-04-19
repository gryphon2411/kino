---
description: 'Guidelines for building Spring Boot applications in Kino project'
applyTo: '**/*.java, **/*.kt'
---

# Spring Boot Development for Kino Project

## General Instructions

- Make only high confidence suggestions when reviewing code changes.
- Write code with good maintainability practices, including comments on why certain design decisions were made.
- Handle edge cases and write clear exception handling.
- For libraries or external dependencies, mention their usage and purpose in comments.

## Spring Boot Instructions for Kino

### Project Structure
- Java 17 with Spring Boot 3.1.6
- Gradle as build tool
- Multi-module project structure with commons module
- Feature-based package organization (e.g., titles package contains controller, service, repository for titles)

### Dependency Injection

- Use constructor injection for all required dependencies.
- Declare dependency fields as `private final`.
- Use `@Autowired` annotation on constructors or fields (project uses field injection)
- Inject services into controllers, repositories into services

### Configuration

- Use YAML files (`application.yml`) for externalized configuration.
- Environment Profiles: Use Spring profiles for different environments (dev, test, prod)
- Configuration Properties: Use @ConfigurationProperties for type-safe configuration binding
- Secrets Management: Externalize secrets using environment variables or secret management systems
- Use application-${profile}.yml for profile-specific configurations

### Code Organization

- Package Structure: Organize by feature/domain (e.g., com.kino.data_service.titles)
- Separation of Concerns: Keep controllers thin, services focused, and repositories simple
- Utility Classes: Make utility classes final with private constructors
- DTO Pattern: Use DTOs for API responses to decouple from database entities
- Commons Module: Share common code between services in the commons module

### REST Controllers

- Use `@RestController` annotation
- Use `@RequestMapping` for base path configuration (with property placeholders)
- Implement proper HTTP status codes
- Use `@GetMapping`, `@PostMapping`, etc. for specific HTTP methods
- Use `@RequestParam` for query parameters with proper required flags
- Use `@PathVariable` for path parameters
- Return DTOs or Page wrappers for collections
- Handle exceptions with `@ResponseStatus` or global exception handlers

### Service Layer

- Place business logic in `@Service`-annotated classes.
- Services should be stateless and testable.
- Inject repositories via the constructor or field injection.
- Service method signatures should use domain IDs or DTOs, not expose repository entities directly.
- Implement pagination using Spring Data's Pageable
- Handle complex queries with custom repository implementations when needed

### Data Layer

- Use Spring Data MongoDB for database operations
- Extend MongoRepository for basic CRUD operations
- Use custom query methods with @Query annotation for complex queries
- Implement text search capabilities using MongoDB text indexes
- Use Page and Pageable for pagination
- Create custom repository implementations for complex database operations
- Use DTOs for data transfer between layers

### DTOs and Entities

- Use separate DTO classes for API responses
- Map between entities and DTOs in service layer
- Use consistent naming conventions
- Include only necessary fields in DTOs
- Use proper Jackson annotations for serialization/deserialization

### Event Streaming

- Use Spring Kafka for event publishing
- Create events for important business operations
- Use KafkaTemplate for sending messages
- Implement proper error handling for event publishing
- Consider event schema evolution

### Caching

- Use Spring Cache abstraction with Redis
- Annotate methods with @Cacheable, @CachePut, @CacheEvict
- Configure cache names and TTL appropriately
- Use composite keys when necessary

### Logging

- Use SLF4J for all logging (`private static final Logger logger = LoggerFactory.getLogger(MyClass.class);`).
- Do not use concrete implementations (Logback, Log4j2) or `System.out.println()` directly.
- Use parameterized logging: `logger.info("User {} logged in", userId);`.
- Log important business events and errors
- Use appropriate log levels (TRACE, DEBUG, INFO, WARN, ERROR)

### Security & Input Handling

- Use parameterized queries | Always use Spring Data methods to prevent injection.
- Validate request bodies and parameters using JSR-380 (`@NotNull`, `@Size`, etc.) annotations and `BindingResult`
- Implement proper authentication and authorization
- Sanitize input data before processing
- Handle sensitive data appropriately

### Messaging

- Use Spring AMQP for RabbitMQ integration
- Implement message producers and consumers
- Handle message serialization/deserialization
- Implement proper error handling for message processing

### Build and Verification

- After adding or modifying code, verify the project continues to build successfully.
- Run `./gradlew build` (or `gradlew.bat build` on Windows).
- Ensure all tests pass as part of the build.
- Check for dependency conflicts and security vulnerabilities

## Example Patterns

Example pattern from `TitleController.java`:
```java
@GetMapping("/titles")
public Page<TitleDto> getTitlesPage(Pageable pageable,
                                    @RequestParam(required = false) String freeText) {
    return service.getTitlesPage(pageable, titleType, primaryTitle, isAdult, genres, freeText);
}
```
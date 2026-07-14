package com.kino.auth_service.machineauth;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.OAuth2RefreshToken;
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationCode;
import org.springframework.security.oauth2.server.authorization.JdbcOAuth2AuthorizationService;
import org.springframework.security.oauth2.server.authorization.OAuth2Authorization;
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService;
import org.springframework.security.oauth2.server.authorization.OAuth2TokenType;
import org.springframework.security.oauth2.server.authorization.client.JdbcRegisteredClientRepository;
import org.springframework.security.oauth2.server.authorization.client.RegisteredClient;
import org.springframework.security.oauth2.server.authorization.client.RegisteredClientRepository;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Exercises the production JDBC repository against PostgreSQL. The schema is a
 * test fixture matching the Flyway V1 migration managed by Terraform.
 */
@Testcontainers(disabledWithoutDocker = true)
class JdbcOidcPersistenceIntegrationTests {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17");

    private JdbcTemplate jdbcTemplate;
    private RegisteredClientRepository registeredClients;
    private AuthServiceMachineAuthConfig configuration;
    private MachineAuthProperties properties;
    private PasswordEncoder passwordEncoder;

    @BeforeEach
    void setUp() {
        this.jdbcTemplate = new JdbcTemplate(new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword()
        ));
        this.jdbcTemplate.execute("DROP TABLE IF EXISTS oauth2_authorization_consent");
        this.jdbcTemplate.execute("DROP TABLE IF EXISTS oauth2_authorization");
        this.jdbcTemplate.execute("DROP TABLE IF EXISTS oauth2_registered_client");
        new ResourceDatabasePopulator(new ClassPathResource(
                "jdbc-authorization-server-schema.sql"
        )).execute(this.jdbcTemplate.getDataSource());

        this.properties = this.properties();
        this.configuration = new AuthServiceMachineAuthConfig(this.properties);
        this.passwordEncoder = this.configuration.passwordEncoder();
        this.registeredClients = new JdbcRegisteredClientRepository(this.jdbcTemplate);
    }

    @Test
    void persistsPkceClientAndReconcilesItsRotatedSecret() throws Exception {
        this.bootstrapClients();

        RegisteredClient initial = this.registeredClients.findByClientId("kino-web-bff");
        assertThat(initial).isNotNull();
        assertThat(initial.getClientSettings().isRequireProofKey()).isTrue();
        assertThat(initial.getTokenSettings().isReuseRefreshTokens()).isFalse();
        assertThat(this.passwordEncoder.matches("first-bff-secret", initial.getClientSecret()))
                .isTrue();

        this.properties.getWebBff().setClientSecret("rotated-bff-secret");
        this.properties.getWebBff().setRedirectUri(
                "https://kino.example.test/api/auth/callback"
        );
        this.bootstrapClients();

        RegisteredClient reconciled = this.registeredClients.findByClientId("kino-web-bff");
        assertThat(this.passwordEncoder.matches(
                "rotated-bff-secret", reconciled.getClientSecret()
        )).isTrue();
        assertThat(reconciled.getRedirectUris()).containsExactly(
                "https://kino.example.test/api/auth/callback"
        );
    }

    @Test
    void persistsAuthorizationCodeAndRotatedRefreshToken() throws Exception {
        this.bootstrapClients();
        RegisteredClient client = this.registeredClients.findByClientId("kino-web-bff");
        OAuth2AuthorizationService authorizations = this.configuration.authorizationService(
                this.jdbcTemplate, this.registeredClients
        );
        Instant issuedAt = Instant.now();
        com.kino.commons.security.CustomUser principal =
                new com.kino.commons.security.CustomUser("kino-user", "user@kino.test", "password");
        OAuth2Authorization authorization = OAuth2Authorization.withRegisteredClient(client)
                .principalName("kino-user")
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .authorizedScopes(client.getScopes())
                .attribute(
                        java.security.Principal.class.getName(),
                        new UsernamePasswordAuthenticationToken(
                                principal, principal.getPassword(), principal.getAuthorities()
                        )
                )
                .token(new OAuth2AuthorizationCode(
                        "authorization-code", issuedAt, issuedAt.plus(5, ChronoUnit.MINUTES)
                ))
                .token(new OAuth2RefreshToken(
                        "first-refresh-token", issuedAt, issuedAt.plus(8, ChronoUnit.HOURS)
                ))
                .build();
        authorizations.save(authorization);

        OAuth2Authorization persisted = authorizations.findByToken(
                "authorization-code", new OAuth2TokenType("code")
        );
        assertThat(persisted).isNotNull();

        OAuth2Authorization rotated = OAuth2Authorization.from(persisted)
                .token(new OAuth2RefreshToken(
                        "rotated-refresh-token", issuedAt, issuedAt.plus(8, ChronoUnit.HOURS)
                ))
                .build();
        authorizations.save(rotated);

        assertThat(authorizations.findByToken(
                "first-refresh-token", OAuth2TokenType.REFRESH_TOKEN
        )).isNull();
        assertThat(authorizations.findByToken(
                "rotated-refresh-token", OAuth2TokenType.REFRESH_TOKEN
        )).isNotNull();
    }

    @Test
    void legacyPersistenceConstructorDoesNotGenerateAnOidcSubject() {
        assertThat(new com.kino.commons.security.CustomUser().getOidcSubject()).isNull();
    }

    private void bootstrapClients() throws Exception {
        this.configuration.registeredClientBootstrap(
                this.registeredClients, this.passwordEncoder
        ).run(new DefaultApplicationArguments());
    }

    private MachineAuthProperties properties() {
        MachineAuthProperties configured = new MachineAuthProperties();
        configured.getAgent().setClientId("kino-agent-service");
        configured.getAgent().setClientSecret("agent-secret");
        configured.getAgent().setScopes(List.of("kino.agent.curator.read"));
        configured.getAgent().setAudience("kino-data-internal");
        configured.getWebBff().setClientId("kino-web-bff");
        configured.getWebBff().setClientSecret("first-bff-secret");
        configured.getWebBff().setScopes(List.of("kino.data.read"));
        configured.getWebBff().setAudience("kino-data-api");
        configured.getWebBff().setRedirectUri("http://localhost:3000/api/auth/callback");
        return configured;
    }
}

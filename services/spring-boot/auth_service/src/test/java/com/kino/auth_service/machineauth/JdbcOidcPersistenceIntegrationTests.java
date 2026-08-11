package com.kino.auth_service.machineauth;

import com.kino.auth_service.AuthServiceSecurityConfig;
import com.kino.commons.security.CustomUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.OAuth2RefreshToken;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationCode;
import org.springframework.security.oauth2.server.authorization.JdbcOAuth2AuthorizationService;
import org.springframework.security.oauth2.server.authorization.OAuth2Authorization;
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService;
import org.springframework.security.oauth2.server.authorization.OAuth2TokenType;
import org.springframework.security.oauth2.server.authorization.client.JdbcRegisteredClientRepository;
import org.springframework.security.oauth2.server.authorization.client.RegisteredClient;
import org.springframework.security.oauth2.server.authorization.client.RegisteredClientRepository;
import org.springframework.security.oauth2.server.authorization.token.JwtEncodingContext;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Exercises the production JDBC repository against PostgreSQL. The schema is a
 * test fixture matching the Flyway V1/V2 schema managed by Terraform.
 */
@Testcontainers(disabledWithoutDocker = true)
class JdbcOidcPersistenceIntegrationTests {
    private static final String RUNTIME_ROLE = "kino_auth_runtime_test";

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
        this.jdbcTemplate.execute("DROP TABLE IF EXISTS flyway_schema_history");
        this.jdbcTemplate.execute("DROP ROLE IF EXISTS " + RUNTIME_ROLE);
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
    void bffAccessTokenClaimsUseConfiguredAudiencesAndOptionalServiceScopes() throws Exception {
        this.bootstrapClients();
        RegisteredClient client = this.registeredClients.findByClientId("kino-web-bff");
        assertThat(client.getScopes()).contains(
                "kino.viewing-plan.read", "kino.viewing-plan.write"
        );
        assertThat(this.properties.getWebBff().getAudiences()).contains(
                "kino-viewing-plan-api"
        );
        CustomUser user = new CustomUser();
        user.username = "kino-user";
        user.oidcSubject = "opaque-kino-subject";
        com.kino.auth_service.customuser.CustomUserRepository users = mock(
                com.kino.auth_service.customuser.CustomUserRepository.class
        );
        when(users.findCustomUserByUsername("kino-user")).thenReturn(user);

        JwtEncodingContext context = mock(JwtEncodingContext.class);
        JwtClaimsSet.Builder claims = JwtClaimsSet.builder();
        JwsHeader.Builder jwsHeader = JwsHeader.with(SignatureAlgorithm.RS256);
        OAuth2Authorization authorization = OAuth2Authorization.withRegisteredClient(client)
                .principalName("kino-user")
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .authorizedScopes(Set.of(
                        "kino.data.read", "kino.ticket.read", "kino.ticket.write",
                        "kino.viewing-plan.read", "kino.viewing-plan.write"
                ))
                .build();
        when(context.getRegisteredClient()).thenReturn(client);
        when(context.getAuthorization()).thenReturn(authorization);
        when(context.getTokenType()).thenReturn(OAuth2TokenType.ACCESS_TOKEN);
        when(context.getAuthorizedScopes()).thenReturn(authorization.getAuthorizedScopes());
        when(context.getClaims()).thenReturn(claims);
        when(context.getJwsHeader()).thenReturn(jwsHeader);

        this.configuration.jwtCustomizer(users).customize(context);

        JwtClaimsSet encodedClaims = claims.build();
        assertThat(jwsHeader.build().getType()).isEqualTo("at+jwt");
        assertThat(encodedClaims.getAudience()).containsExactly(
                "kino-data-api", "kino-ticket-api", "kino-viewing-plan-api"
        );
        assertThat(encodedClaims.getClaimAsString("scope")).contains(
                "kino.data.read", "kino.ticket.read", "kino.ticket.write",
                "kino.viewing-plan.read", "kino.viewing-plan.write"
        );
        assertThat(encodedClaims.getSubject()).isEqualTo("opaque-kino-subject");
    }

    @Test
    void bffWithoutTicketFeatureRegistersOnlyDataAuthority() throws Exception {
        this.properties.getWebBff().setScopes(List.of("kino.data.read"));
        this.properties.getWebBff().setAudiences(List.of("kino-data-api"));

        this.bootstrapClients();

        RegisteredClient client = this.registeredClients.findByClientId("kino-web-bff");
        assertThat(client.getScopes()).contains("openid", "profile", "kino.data.read");
        assertThat(client.getScopes()).doesNotContain(
                "kino.ticket.read", "kino.ticket.write",
                "kino.viewing-plan.read", "kino.viewing-plan.write"
        );
        assertThat(this.properties.getWebBff().getAudiences()).containsExactly("kino-data-api");
    }

    @Test
    void persistsAuthorizationCodeAndRotatedRefreshToken() throws Exception {
        this.bootstrapClients();
        RegisteredClient client = this.registeredClients.findByClientId("kino-web-bff");
        OAuth2AuthorizationService authorizations = this.configuration.authorizationService(
                this.jdbcTemplate, this.registeredClients
        );
        Instant issuedAt = Instant.now();
        String rawCredential = "raw-user-credential";
        String storedPasswordVerifier = this.passwordEncoder.encode(rawCredential);
        CustomUser user = new CustomUser(
                "kino-user", "user@kino.test", storedPasswordVerifier
        );
        user.id = "mongo-user-id";
        Authentication principal = new AuthServiceSecurityConfig().authenticationManager(
                username -> user, this.passwordEncoder
        ).authenticate(UsernamePasswordAuthenticationToken.unauthenticated(
                "kino-user", rawCredential
        ));
        assertThat(principal.getPrincipal()).isEqualTo("kino-user");
        assertThat(principal.getCredentials()).isNull();
        assertThat(user.getPassword()).isEqualTo(storedPasswordVerifier);
        OAuth2Authorization authorization = OAuth2Authorization.withRegisteredClient(client)
                .principalName("kino-user")
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .authorizedScopes(client.getScopes())
                .attribute(
                        java.security.Principal.class.getName(),
                        principal
                )
                .token(new OAuth2AuthorizationCode(
                        "authorization-code", issuedAt, issuedAt.plus(5, ChronoUnit.MINUTES)
                ))
                .token(new OAuth2RefreshToken(
                        "first-refresh-token", issuedAt, issuedAt.plus(8, ChronoUnit.HOURS)
                ))
                .build();
        authorizations.save(authorization);

        String attributes = this.jdbcTemplate.queryForObject(
                "SELECT attributes FROM oauth2_authorization WHERE id = ?",
                String.class, authorization.getId()
        );
        assertThat(attributes)
                .doesNotContain(rawCredential)
                .doesNotContain(user.getPassword())
                .doesNotContain(user.email)
                .doesNotContain(user.id);

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

    @Test
    void readsPersistedImmutableListMetadataNeededByRefreshTokens() throws Exception {
        this.bootstrapClients();
        RegisteredClient client = this.registeredClients.findByClientId("kino-web-bff");
        OAuth2AuthorizationService authorizations = this.configuration.authorizationService(
                this.jdbcTemplate, this.registeredClients
        );
        Instant issuedAt = Instant.now();
        OAuth2Authorization authorization = OAuth2Authorization.withRegisteredClient(client)
                .principalName("kino-user")
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .authorizedScopes(client.getScopes())
                .attribute("audience", List.of("kino-data-api"))
                .token(new OAuth2RefreshToken(
                        "refresh-token", issuedAt, issuedAt.plus(8, ChronoUnit.HOURS)
                ))
                .build();
        authorizations.save(authorization);

        assertThat(authorizations.findByToken(
                "refresh-token", OAuth2TokenType.REFRESH_TOKEN
        )).isNotNull();
    }

    @Test
    void rejectsAuthorizationRowsForUnknownRegisteredClients() {
        assertThatThrownBy(() -> this.jdbcTemplate.update(
                "INSERT INTO oauth2_authorization (id, registered_client_id, principal_name, authorization_grant_type) "
                        + "VALUES (?, ?, ?, ?)",
                "orphaned-authorization", "unknown-client", "kino-user", "authorization_code"
        )).hasMessageContaining("oauth2_authorization_registered_client_fk");

        assertThatThrownBy(() -> this.jdbcTemplate.update(
                "INSERT INTO oauth2_authorization_consent (registered_client_id, principal_name, authorities) "
                        + "VALUES (?, ?, ?)",
                "unknown-client", "kino-user", "kino.data.read"
        )).hasMessageContaining("oauth2_authorization_consent_registered_client_fk");
    }

    @Test
    void runtimeRoleCanChangeOnlyProtocolTablesNotFlywayHistory() {
        this.jdbcTemplate.execute("CREATE ROLE " + RUNTIME_ROLE + " NOLOGIN");
        this.jdbcTemplate.execute(
                "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM " + RUNTIME_ROLE
        );
        this.jdbcTemplate.execute(
                "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "
                        + "oauth2_registered_client, oauth2_authorization, oauth2_authorization_consent "
                        + "TO " + RUNTIME_ROLE
        );

        assertThat(this.jdbcTemplate.queryForObject(
                "SELECT has_table_privilege(?, 'oauth2_authorization', 'UPDATE')",
                Boolean.class, RUNTIME_ROLE
        )).isTrue();
        assertThat(this.jdbcTemplate.queryForObject(
                "SELECT has_table_privilege(?, 'flyway_schema_history', 'UPDATE')",
                Boolean.class, RUNTIME_ROLE
        )).isFalse();

        this.jdbcTemplate.execute((ConnectionCallback<Void>) connection -> {
            try (java.sql.Statement statement = connection.createStatement()) {
                statement.execute("SET ROLE " + RUNTIME_ROLE);
                assertThatThrownBy(() -> statement.executeUpdate(
                        "UPDATE flyway_schema_history SET installed_rank = 2"
                )).hasMessageContaining("permission denied");
                statement.execute("RESET ROLE");
            }
            return null;
        });
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
        configured.getWebBff().setScopes(List.of(
                "kino.data.read", "kino.ticket.read", "kino.ticket.write",
                "kino.viewing-plan.read", "kino.viewing-plan.write"
        ));
        configured.getWebBff().setAudiences(List.of(
                "kino-data-api", "kino-ticket-api", "kino-viewing-plan-api"
        ));
        configured.getWebBff().setRedirectUri("http://localhost:3000/api/auth/callback");
        return configured;
    }
}

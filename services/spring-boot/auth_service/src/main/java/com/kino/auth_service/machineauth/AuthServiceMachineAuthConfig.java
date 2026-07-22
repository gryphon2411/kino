package com.kino.auth_service.machineauth;

import com.kino.auth_service.customuser.CustomUserRepository;
import com.kino.commons.security.CustomUser;
import com.kino.commons.security.CustomUserMixin;
import com.kino.commons.security.LinkedHashSetMixin;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.proc.SecurityContext;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.Customizer;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;
import org.springframework.security.oauth2.core.oidc.OidcScopes;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.authorization.JdbcOAuth2AuthorizationConsentService;
import org.springframework.security.oauth2.server.authorization.JdbcOAuth2AuthorizationService;
import org.springframework.security.oauth2.server.authorization.OAuth2TokenType;
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationConsentService;
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService;
import org.springframework.security.oauth2.server.authorization.client.JdbcRegisteredClientRepository;
import org.springframework.security.oauth2.server.authorization.client.RegisteredClient;
import org.springframework.security.oauth2.server.authorization.client.RegisteredClientRepository;
import org.springframework.security.oauth2.server.authorization.config.annotation.web.configuration.OAuth2AuthorizationServerConfiguration;
import org.springframework.security.oauth2.server.authorization.config.annotation.web.configurers.OAuth2AuthorizationServerConfigurer;
import org.springframework.security.oauth2.server.authorization.jackson2.OAuth2AuthorizationServerJackson2Module;
import org.springframework.security.oauth2.server.authorization.settings.AuthorizationServerSettings;
import org.springframework.security.oauth2.server.authorization.settings.ClientSettings;
import org.springframework.security.oauth2.server.authorization.settings.OAuth2TokenFormat;
import org.springframework.security.oauth2.server.authorization.settings.TokenSettings;
import org.springframework.security.oauth2.server.authorization.token.JwtEncodingContext;
import org.springframework.security.oauth2.server.authorization.token.OAuth2TokenCustomizer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.LoginUrlAuthenticationEntryPoint;
import org.springframework.security.web.util.matcher.MediaTypeRequestMatcher;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.security.jackson2.SecurityJackson2Modules;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;

@Configuration
@EnableConfigurationProperties(MachineAuthProperties.class)
public class AuthServiceMachineAuthConfig {
    @Value("${kino.server.prefix-path}")
    private String serverPrefixPath;

    private final MachineAuthProperties properties;

    public AuthServiceMachineAuthConfig(MachineAuthProperties properties) {
        this.properties = properties;
    }

    @Bean
    @Order(1)
    public SecurityFilterChain authorizationServerSecurityFilterChain(
            HttpSecurity http
    ) throws Exception {
        OAuth2AuthorizationServerConfiguration.applyDefaultSecurity(http);
        http.getConfigurer(OAuth2AuthorizationServerConfigurer.class)
                .oidc(Customizer.withDefaults());
        http
                .exceptionHandling(exceptions -> exceptions
                        .defaultAuthenticationEntryPointFor(
                                new LoginUrlAuthenticationEntryPoint("/login"),
                                new MediaTypeRequestMatcher(MediaType.TEXT_HTML)
                        )
                );

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }

    @Bean
    @ConditionalOnProperty(
            prefix = "kino.machine-auth.jdbc-persistence",
            name = "enabled",
            havingValue = "true",
            matchIfMissing = true
    )
    public RegisteredClientRepository registeredClientRepository(
            JdbcOperations jdbcOperations
    ) {
        return new JdbcRegisteredClientRepository(jdbcOperations);
    }

    @Bean
    @ConditionalOnProperty(
            prefix = "kino.machine-auth.jdbc-persistence",
            name = "enabled",
            havingValue = "true",
            matchIfMissing = true
    )
    public OAuth2AuthorizationService authorizationService(
            JdbcOperations jdbcOperations,
            RegisteredClientRepository registeredClientRepository
    ) {
        JdbcOAuth2AuthorizationService authorizationService =
                new JdbcOAuth2AuthorizationService(
                jdbcOperations,
                registeredClientRepository
        );
        ObjectMapper objectMapper = this.authorizationObjectMapper();
        JdbcOAuth2AuthorizationService.OAuth2AuthorizationRowMapper rowMapper =
                new JdbcOAuth2AuthorizationService.OAuth2AuthorizationRowMapper(
                        registeredClientRepository
                );
        rowMapper.setObjectMapper(objectMapper);
        authorizationService.setAuthorizationRowMapper(rowMapper);

        JdbcOAuth2AuthorizationService.OAuth2AuthorizationParametersMapper parametersMapper =
                new JdbcOAuth2AuthorizationService.OAuth2AuthorizationParametersMapper();
        parametersMapper.setObjectMapper(objectMapper);
        authorizationService.setAuthorizationParametersMapper(parametersMapper);
        return authorizationService;
    }

    @Bean
    @ConditionalOnProperty(
            prefix = "kino.machine-auth.jdbc-persistence",
            name = "enabled",
            havingValue = "true",
            matchIfMissing = true
    )
    public OAuth2AuthorizationConsentService authorizationConsentService(
            JdbcOperations jdbcOperations,
            RegisteredClientRepository registeredClientRepository
    ) {
        return new JdbcOAuth2AuthorizationConsentService(
                jdbcOperations,
                registeredClientRepository
        );
    }

    /**
     * Clients are configuration, not application memory. The deterministic IDs
     * make this bootstrap idempotent while leaving protocol state in Postgres.
     * A configuration change, including a Kubernetes Secret rotation, replaces
     * the stored client settings on the next auth-service start.
     */
    @Bean
    @Order(1)
    @ConditionalOnProperty(
            prefix = "kino.machine-auth.jdbc-persistence",
            name = "enabled",
            havingValue = "true",
            matchIfMissing = true
    )
    public ApplicationRunner registeredClientBootstrap(
            RegisteredClientRepository registeredClientRepository,
            PasswordEncoder passwordEncoder
    ) {
        return arguments -> {
            this.webBffAudiences();
            this.reconcileClient(
                    registeredClientRepository,
                    this.agentClient(passwordEncoder),
                    this.properties.getAgent().getClientSecret(),
                    passwordEncoder
            );
            this.reconcileClient(
                    registeredClientRepository,
                    this.webBffClient(passwordEncoder),
                    this.properties.getWebBff().getClientSecret(),
                    passwordEncoder
            );
        };
    }

    @Bean
    public JWKSource<SecurityContext> jwkSource() {
        RSAKey rsaKey = this.resolveRsaKey();
        return new ImmutableJWKSet<>(new JWKSet(rsaKey));
    }

    @Bean
    public JwtDecoder jwtDecoder(JWKSource<SecurityContext> jwkSource) {
        return OAuth2AuthorizationServerConfiguration.jwtDecoder(jwkSource);
    }

    @Bean
    public AuthorizationServerSettings authorizationServerSettings() {
        String oauth2Prefix = this.serverPrefixPath + "/oauth2";

        return AuthorizationServerSettings.builder()
                .issuer(this.properties.getIssuer())
                .authorizationEndpoint(oauth2Prefix + "/authorize")
                .tokenEndpoint(oauth2Prefix + "/token")
                .tokenIntrospectionEndpoint(oauth2Prefix + "/introspect")
                .tokenRevocationEndpoint(oauth2Prefix + "/revoke")
                .jwkSetEndpoint(oauth2Prefix + "/jwks")
                .oidcUserInfoEndpoint(oauth2Prefix + "/userinfo")
                .build();
    }

    @Bean
    public OAuth2TokenCustomizer<JwtEncodingContext> jwtCustomizer(
            CustomUserRepository customUserRepository
    ) {
        return context -> {
            boolean webBffToken = this.isWebBffToken(context);
            if (webBffToken) {
                this.applyUserSubject(context, customUserRepository);
            }

            if (!OAuth2TokenType.ACCESS_TOKEN.equals(context.getTokenType())) {
                return;
            }

            List<String> audiences = webBffToken
                    ? this.webBffAudiences()
                    : List.of(this.properties.getAgent().getAudience());
            context.getClaims().audience(new ArrayList<>(audiences));

            LinkedHashSet<String> authorizedScopes = new LinkedHashSet<>(
                    context.getAuthorizedScopes()
            );
            if (authorizedScopes.isEmpty()) {
                authorizedScopes.addAll(
                        context.getRegisteredClient().getScopes()
                );
            }
            if (!authorizedScopes.isEmpty()) {
                context.getClaims().claim(
                        "scope", String.join(" ", authorizedScopes)
                );
            }
        };
    }

    private void reconcileClient(
            RegisteredClientRepository repository,
            RegisteredClient desiredClient,
            String configuredSecret,
            PasswordEncoder passwordEncoder
    ) {
        RegisteredClient existingClient = repository.findByClientId(
                desiredClient.getClientId()
        );
        if (existingClient != null) {
            boolean existingClientMatchesConfiguration =
                    this.matchesConfiguredClient(
                            existingClient,
                            desiredClient,
                            configuredSecret,
                            passwordEncoder
                    );
            if (existingClientMatchesConfiguration) {
                return;
            }
        }

        // JdbcRegisteredClientRepository.save updates by the deterministic
        // registration ID, preserving the relationship of existing
        // authorization rows to this client while applying the new secret
        // and static client settings.
        repository.save(desiredClient);
    }

    private boolean matchesConfiguredClient(
            RegisteredClient existingClient,
            RegisteredClient desiredClient,
            String configuredSecret,
            PasswordEncoder passwordEncoder
    ) {
        boolean secretMatches = passwordEncoder.matches(
                configuredSecret, existingClient.getClientSecret()
        );
        boolean identityMatches = existingClient.getClientId().equals(
                desiredClient.getClientId()
        )
                && existingClient.getClientName().equals(
                desiredClient.getClientName()
        );
        boolean authenticationMatches = existingClient
                .getClientAuthenticationMethods()
                .equals(
                desiredClient.getClientAuthenticationMethods()
        )
                && existingClient.getAuthorizationGrantTypes().equals(
                desiredClient.getAuthorizationGrantTypes()
        );
        boolean redirectUrisMatch = existingClient.getRedirectUris().equals(
                desiredClient.getRedirectUris()
        )
                && existingClient.getPostLogoutRedirectUris().equals(
                desiredClient.getPostLogoutRedirectUris()
        );
        boolean scopesMatch = existingClient.getScopes().equals(
                desiredClient.getScopes()
        );
        boolean settingsMatch = existingClient.getClientSettings()
                .getSettings().equals(
                desiredClient.getClientSettings().getSettings()
        )
                && existingClient.getTokenSettings().getSettings().equals(
                desiredClient.getTokenSettings().getSettings()
        );

        return secretMatches
                && identityMatches
                && authenticationMatches
                && redirectUrisMatch
                && scopesMatch
                && settingsMatch;
    }

    private RegisteredClient agentClient(PasswordEncoder passwordEncoder) {
        MachineAuthProperties.ClientProperties clientProperties =
                this.properties.getAgent();
        RegisteredClient.Builder builder = RegisteredClient.withId(
                        this.clientRegistrationId(clientProperties.getClientId())
                )
                .clientId(clientProperties.getClientId())
                .clientName("Kino agent service")
                .clientSecret(passwordEncoder.encode(
                        clientProperties.getClientSecret()
                ))
                .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_BASIC)
                .authorizationGrantType(AuthorizationGrantType.CLIENT_CREDENTIALS)
                .clientSettings(this.machineClientSettings())
                .tokenSettings(this.machineTokenSettings());

        this.addScopes(builder, clientProperties.getScopes());
        return builder.build();
    }

    private RegisteredClient webBffClient(PasswordEncoder passwordEncoder) {
        MachineAuthProperties.WebBffProperties clientProperties =
                this.properties.getWebBff();
        RegisteredClient.Builder builder = RegisteredClient.withId(
                        this.clientRegistrationId(clientProperties.getClientId())
                )
                .clientId(clientProperties.getClientId())
                .clientName("Kino web BFF")
                .clientSecret(passwordEncoder.encode(
                        clientProperties.getClientSecret()
                ))
                .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_BASIC)
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .authorizationGrantType(AuthorizationGrantType.REFRESH_TOKEN)
                .redirectUri(clientProperties.getRedirectUri())
                .scope(OidcScopes.OPENID)
                .scope(OidcScopes.PROFILE)
                .clientSettings(this.webBffClientSettings())
                .tokenSettings(this.webBffTokenSettings());

        this.addScopes(builder, clientProperties.getScopes());
        return builder.build();
    }

    private void addScopes(
            RegisteredClient.Builder builder,
            List<String> configuredScopes
    ) {
        for (String scope : new LinkedHashSet<>(configuredScopes)) {
            if (!scope.isBlank()) {
                builder.scope(scope);
            }
        }
    }

    private List<String> webBffAudiences() {
        List<String> configuredAudiences = this.properties.getWebBff()
                .getAudiences();
        LinkedHashSet<String> distinctAudiences = new LinkedHashSet<>();
        for (String audience : configuredAudiences) {
            if (audience == null || audience.isBlank()) {
                throw new IllegalStateException(
                        "Web BFF audiences must be nonblank."
                );
            }
            if (!distinctAudiences.add(audience)) {
                throw new IllegalStateException(
                        "Web BFF audiences must not contain duplicates."
                );
            }
        }
        if (distinctAudiences.isEmpty()) {
            throw new IllegalStateException(
                    "Web BFF must have at least one audience."
            );
        }
        return new ArrayList<>(distinctAudiences);
    }

    private String clientRegistrationId(String clientId) {
        return UUID.nameUUIDFromBytes(
                ("kino:" + clientId).getBytes(StandardCharsets.UTF_8)
        ).toString();
    }

    private boolean isWebBffToken(JwtEncodingContext context) {
        return this.properties.getWebBff().getClientId().equals(
                context.getRegisteredClient().getClientId()
        );
    }

    private void applyUserSubject(
            JwtEncodingContext context,
            CustomUserRepository customUserRepository
    ) {
        if (context.getAuthorization() == null) {
            throw new IllegalStateException("User token is missing its authorization.");
        }

        String username = context.getAuthorization().getPrincipalName();
        CustomUser user = customUserRepository.findCustomUserByUsername(username);
        if (user == null || user.getOidcSubject() == null
                || user.getOidcSubject().isBlank()) {
            throw new IllegalStateException(
                    "Cannot issue an OIDC token without a stable user subject."
            );
        }
        context.getClaims().subject(user.getOidcSubject());
    }

    private ClientSettings machineClientSettings() {
        return ClientSettings.builder()
                .requireAuthorizationConsent(false)
                .requireProofKey(false)
                .build();
    }

    private ClientSettings webBffClientSettings() {
        return ClientSettings.builder()
                .requireAuthorizationConsent(false)
                .requireProofKey(true)
                .build();
    }

    private TokenSettings machineTokenSettings() {
        return TokenSettings.builder()
                .accessTokenTimeToLive(this.properties.getTokenTtl())
                .accessTokenFormat(OAuth2TokenFormat.SELF_CONTAINED)
                .build();
    }

    private TokenSettings webBffTokenSettings() {
        MachineAuthProperties.WebBffProperties webBff = this.properties.getWebBff();
        return TokenSettings.builder()
                .accessTokenTimeToLive(webBff.getAccessTokenTtl())
                .refreshTokenTimeToLive(webBff.getRefreshTokenTtl())
                .reuseRefreshTokens(false)
                .accessTokenFormat(OAuth2TokenFormat.SELF_CONTAINED)
                .build();
    }

    private ObjectMapper authorizationObjectMapper() {
        ObjectMapper mapper = new ObjectMapper();
        mapper.addMixIn(CustomUser.class, CustomUserMixin.class);
        mapper.addMixIn(LinkedHashSet.class, LinkedHashSetMixin.class);
        mapper.addMixIn(List.of().getClass(), ImmutableListMixin.class);
        mapper.addMixIn(List.of("item").getClass(), ImmutableListMixin.class);
        mapper.registerModules(SecurityJackson2Modules.getModules(
                AuthServiceMachineAuthConfig.class.getClassLoader()
        ));
        mapper.registerModule(new OAuth2AuthorizationServerJackson2Module());
        return mapper;
    }

    private RSAKey resolveRsaKey() {
        MachineAuthProperties.SigningKeyProperties signingKeyProperties =
                this.properties.getSigningKey();
        String privateKeyPath = signingKeyProperties.getPrivateKeyPath().trim();
        String publicKeyPath = signingKeyProperties.getPublicKeyPath().trim();

        if (privateKeyPath.isEmpty() && publicKeyPath.isEmpty()) {
            return this.generatedRsaKey();
        }
        if (privateKeyPath.isEmpty() || publicKeyPath.isEmpty()) {
            throw new IllegalStateException(
                    "Both auth-service signing key paths must be configured."
            );
        }

        RSAPrivateKey privateKey = this.readPrivateKey(privateKeyPath);
        RSAPublicKey publicKey = this.readPublicKey(publicKeyPath);

        return new RSAKey.Builder(publicKey)
                .privateKey(privateKey)
                .keyID(this.keyId(publicKey))
                .build();
    }

    private RSAKey generatedRsaKey() {
        KeyPair keyPair = this.generateRsaKey();
        RSAPublicKey publicKey = (RSAPublicKey) keyPair.getPublic();
        RSAPrivateKey privateKey = (RSAPrivateKey) keyPair.getPrivate();

        return new RSAKey.Builder(publicKey)
                .privateKey(privateKey)
                .keyID(UUID.randomUUID().toString())
                .build();
    }

    private KeyPair generateRsaKey() {
        try {
            KeyPairGenerator keyPairGenerator = KeyPairGenerator.getInstance(
                    "RSA"
            );
            keyPairGenerator.initialize(2048);
            return keyPairGenerator.generateKeyPair();
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private RSAPrivateKey readPrivateKey(String path) {
        byte[] privateKeyBytes = this.pemBody(
                path,
                "-----BEGIN PRIVATE KEY-----",
                "-----END PRIVATE KEY-----"
        );

        try {
            PKCS8EncodedKeySpec keySpec = new PKCS8EncodedKeySpec(
                    privateKeyBytes
            );
            KeyFactory keyFactory = KeyFactory.getInstance("RSA");
            return (RSAPrivateKey) keyFactory.generatePrivate(keySpec);
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "Failed to read RSA private key from " + path,
                    exception
            );
        }
    }

    private RSAPublicKey readPublicKey(String path) {
        byte[] publicKeyBytes = this.pemBody(
                path,
                "-----BEGIN PUBLIC KEY-----",
                "-----END PUBLIC KEY-----"
        );

        try {
            X509EncodedKeySpec keySpec = new X509EncodedKeySpec(publicKeyBytes);
            KeyFactory keyFactory = KeyFactory.getInstance("RSA");
            return (RSAPublicKey) keyFactory.generatePublic(keySpec);
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "Failed to read RSA public key from " + path,
                    exception
            );
        }
    }

    private byte[] pemBody(String path, String beginMarker, String endMarker) {
        try {
            String pem = Files.readString(
                    Path.of(path), StandardCharsets.US_ASCII
            );
            String base64Body = pem
                    .replace(beginMarker, "")
                    .replace(endMarker, "")
                    .replaceAll("\\s", "");
            return Base64.getDecoder().decode(base64Body);
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "Failed to load PEM key from " + path,
                    exception
            );
        }
    }

    private String keyId(RSAPublicKey publicKey) {
        try {
            MessageDigest messageDigest = MessageDigest.getInstance("SHA-256");
            byte[] digest = messageDigest.digest(publicKey.getEncoded());
            return Base64.getUrlEncoder().withoutPadding().encodeToString(
                    digest
            );
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "Failed to derive key id from RSA public key.",
                    exception
            );
        }
    }
}

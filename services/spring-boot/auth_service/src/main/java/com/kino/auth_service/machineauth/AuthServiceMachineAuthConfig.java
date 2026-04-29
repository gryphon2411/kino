package com.kino.auth_service.machineauth;

import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.proc.SecurityContext;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.authorization.InMemoryOAuth2AuthorizationConsentService;
import org.springframework.security.oauth2.server.authorization.InMemoryOAuth2AuthorizationService;
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationConsentService;
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService;
import org.springframework.security.oauth2.server.authorization.client.InMemoryRegisteredClientRepository;
import org.springframework.security.oauth2.server.authorization.client.RegisteredClient;
import org.springframework.security.oauth2.server.authorization.client.RegisteredClientRepository;
import org.springframework.security.oauth2.server.authorization.config.annotation.web.configuration.OAuth2AuthorizationServerConfiguration;
import org.springframework.security.oauth2.server.authorization.settings.AuthorizationServerSettings;
import org.springframework.security.oauth2.server.authorization.settings.ClientSettings;
import org.springframework.security.oauth2.server.authorization.settings.OAuth2TokenFormat;
import org.springframework.security.oauth2.server.authorization.settings.TokenSettings;
import org.springframework.security.oauth2.server.authorization.token.JwtEncodingContext;
import org.springframework.security.oauth2.server.authorization.token.OAuth2TokenCustomizer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.LoginUrlAuthenticationEntryPoint;
import org.springframework.security.web.util.matcher.MediaTypeRequestMatcher;

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
    public RegisteredClientRepository registeredClientRepository(
            PasswordEncoder passwordEncoder
    ) {
        MachineAuthProperties.ClientProperties clientProperties =
                this.properties.getAgent();
        RegisteredClient.Builder clientBuilder = RegisteredClient.withId(
                UUID.randomUUID().toString()
        ).clientId(clientProperties.getClientId())
                .clientSecret(passwordEncoder.encode(
                        clientProperties.getClientSecret()
                ))
                .clientAuthenticationMethod(
                        ClientAuthenticationMethod.CLIENT_SECRET_BASIC
                )
                .authorizationGrantType(
                        AuthorizationGrantType.CLIENT_CREDENTIALS
                )
                .tokenSettings(this.tokenSettings())
                .clientSettings(this.clientSettings());

        for (String scope : new LinkedHashSet<>(clientProperties.getScopes())) {
            clientBuilder.scope(scope);
        }

        return new InMemoryRegisteredClientRepository(clientBuilder.build());
    }

    @Bean
    public OAuth2AuthorizationService authorizationService() {
        return new InMemoryOAuth2AuthorizationService();
    }

    @Bean
    public OAuth2AuthorizationConsentService authorizationConsentService() {
        return new InMemoryOAuth2AuthorizationConsentService();
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
                .build();
    }

    @Bean
    public OAuth2TokenCustomizer<JwtEncodingContext> jwtCustomizer() {
        String audience = this.properties.getAgent().getAudience();
        return context -> context.getClaims().audience(List.of(audience));
    }

    private ClientSettings clientSettings() {
        return ClientSettings.builder()
                .requireAuthorizationConsent(false)
                .requireProofKey(false)
                .build();
    }

    private TokenSettings tokenSettings() {
        return TokenSettings.builder()
                .accessTokenTimeToLive(this.properties.getTokenTtl())
                .accessTokenFormat(OAuth2TokenFormat.SELF_CONTAINED)
                .build();
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

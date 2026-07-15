package com.kino.data_service;

import com.kino.data_service.nonsecured.NonSecuredController;
import com.kino.data_service.titles.InternalTitleController;
import com.kino.data_service.titles.Title;
import com.kino.data_service.titles.TitleController;
import com.kino.data_service.titles.TitleDto;
import com.kino.data_service.titles.TitleService;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jose.proc.SecurityContext;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageImpl;
import org.springframework.http.HttpHeaders;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest({
        NonSecuredController.class,
        TitleController.class,
        InternalTitleController.class
})
@Import({
        DataServiceSecurityTests.SignedUserJwtDecoderConfiguration.class,
        DataServiceMachineSecurityConfig.class,
        DataServiceSecurityConfig.class
})
@TestPropertySource(properties = {
        "kino.server.prefix-path=/api/v1/data",
        "spring.security.oauth2.resourceserver.jwt.issuer-uri=http://auth-service:8081/api/v1/auth",
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://auth-service:8081/api/v1/auth/oauth2/jwks",
        "spring.main.allow-bean-definition-overriding=true",
        "kino.security.machine-token.audiences=kino-data-internal",
        "kino.security.user-token.audiences=kino-data-api",
        "kino.security.cors.allowed-origins=http://localhost:3000"
})
class DataServiceSecurityTests {
    private static final String ISSUER = "https://kino.example.test";
    private static final String USER_AUDIENCE = "kino-data-api";

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private TitleService titleService;

    @Test
    void unauthenticatedTitleLookupIsRejected() throws Exception {
        this.mockMvc.perform(get("/api/v1/data/titles/tt0000001"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void userAccessTokenCanAccessProtectedTitleRoutes() throws Exception {
        when(this.titleService.getTitle("tt0000001"))
                .thenReturn(Optional.of(this.sampleTitleDto()));

        this.mockMvc.perform(
                        get("/api/v1/data/titles/tt0000001")
                                .with(jwt().authorities(
                                        () -> "SCOPE_kino.data.read"
                                ))
                )
                .andExpect(status().isOk());
    }

    @Test
    void signedBearerTokenPassesTheActualUserSecurityFilterChain() throws Exception {
        when(this.titleService.getTitle("tt0000001"))
                .thenReturn(Optional.of(this.sampleTitleDto()));

        this.mockMvc.perform(
                        get("/api/v1/data/titles/tt0000001")
                                .header(HttpHeaders.AUTHORIZATION,
                                        "Bearer " + signedUserToken(USER_AUDIENCE, "kino.data.read"))
                )
                .andExpect(status().isOk());
    }

    @Test
    void signedBearerTokenWithWrongAudienceIsRejectedByTheFilterChain() throws Exception {
        this.mockMvc.perform(
                        get("/api/v1/data/titles/tt0000001")
                                .header(HttpHeaders.AUTHORIZATION,
                                        "Bearer " + signedUserToken("kino-data-internal", "kino.data.read"))
                )
                .andExpect(status().isUnauthorized());
    }

    @Test
    void signedBearerTokenWithoutTheRequiredScopeIsForbidden() throws Exception {
        this.mockMvc.perform(
                        get("/api/v1/data/titles/tt0000001")
                                .header(HttpHeaders.AUTHORIZATION,
                                        "Bearer " + signedUserToken(USER_AUDIENCE, "profile"))
                )
                .andExpect(status().isForbidden());
    }

    @Test
    void machineTokenCanAccessInternalSearchRoute() throws Exception {
        when(this.titleService.getTitlesPage(
                any(), any(), any(), any(), any(), any(), any(), any()
        )).thenReturn(new PageImpl<>(List.of(this.sampleTitleDto())));

        this.mockMvc.perform(
                        get("/api/v1/data/internal/titles/search?page=0&size=1&minYear=1990")
                                .with(this.machineToken())
                )
                .andExpect(status().isOk());
    }

    @Test
    void machineTokenCannotAccessUserTitleRoute() throws Exception {
        this.mockMvc.perform(
                        get("/api/v1/data/titles/tt0000001")
                                .with(this.machineToken())
                )
                .andExpect(status().isForbidden());
    }

    private TitleDto sampleTitleDto() {
        return new TitleDto(
                "tt0000001",
                "tt0000001",
                "movie",
                "Sample",
                "Sample",
                false,
                1998,
                1998,
                95,
                List.of("Thriller")
        );
    }

    private SecurityMockMvcRequestPostProcessors.JwtRequestPostProcessor
    machineToken() {
        return jwt().authorities(() -> "SCOPE_kino.agent.curator.read");
    }

    private static String signedUserToken(String audience, String scope) throws Exception {
        RSAKey key = SignedUserJwtDecoderConfiguration.KEY;
        NimbusJwtEncoder encoder = new NimbusJwtEncoder(
                new ImmutableJWKSet<SecurityContext>(new JWKSet(key))
        );
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(ISSUER)
                .subject("kino-user")
                .audience(List.of(audience))
                .issuedAt(now)
                .expiresAt(now.plus(5, ChronoUnit.MINUTES))
                .claim("scope", scope)
                .build();
        JwsHeader header = JwsHeader.with(SignatureAlgorithm.RS256)
                .keyId(key.getKeyID())
                .build();
        return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class SignedUserJwtDecoderConfiguration {
        private static final RSAKey KEY = generateKey();

        @Bean(name = "userJwtDecoder")
        JwtDecoder userJwtDecoder() throws Exception {
            NimbusJwtDecoder decoder = NimbusJwtDecoder
                    .withPublicKey(KEY.toRSAPublicKey())
                    .build();
            OAuth2TokenValidator<Jwt> issuerValidator =
                    org.springframework.security.oauth2.jwt.JwtValidators
                            .createDefaultWithIssuer(ISSUER);
            OAuth2TokenValidator<Jwt> audienceValidator = jwt -> {
                if (jwt.getAudience().contains(USER_AUDIENCE)) {
                    return OAuth2TokenValidatorResult.success();
                }
                return OAuth2TokenValidatorResult.failure(new OAuth2Error(
                        "invalid_token", "The required audience is missing.", null
                ));
            };
            decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                    issuerValidator, audienceValidator
            ));
            return decoder;
        }

        private static RSAKey generateKey() {
            try {
                return new RSAKeyGenerator(2048).keyID("filter-chain-test").generate();
            } catch (Exception exception) {
                throw new IllegalStateException("Unable to create the test signing key.", exception);
            }
        }
    }
}

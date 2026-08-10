package com.kino.data_service;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jose.proc.DefaultJOSEObjectTypeVerifier;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtValidationException;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DataServiceJwtValidationTests {
    private static final String ISSUER = "https://kino.example.test";
    private static final String AUDIENCE = "kino-data-api";

    private DataServiceSecurityConfig configuration;
    private NimbusJwtEncoder encoder;
    private NimbusJwtDecoder decoder;

    @BeforeEach
    void setUp() throws Exception {
        this.configuration = new DataServiceSecurityConfig();
        ReflectionTestUtils.setField(this.configuration, "issuerUri", ISSUER);
        ReflectionTestUtils.setField(this.configuration, "audiencesProperty", AUDIENCE);

        RSAKey key = new RSAKeyGenerator(2048).keyID("data-service-test").generate();
        this.encoder = new NimbusJwtEncoder(new ImmutableJWKSet<SecurityContext>(
                new JWKSet(key)
        ));
        this.decoder = NimbusJwtDecoder.withPublicKey(key.toRSAPublicKey())
                .jwtProcessorCustomizer(processor -> processor.setJWSTypeVerifier(
                        new DefaultJOSEObjectTypeVerifier<>(new JOSEObjectType("at+jwt"))
                ))
                .build();
        this.decoder.setJwtValidator(this.configuration.userJwtValidator());
    }

    @Test
    void acceptsSignedUserTokenWithExpectedIssuerAndAudience() {
        assertThat(this.decoder.decode(this.signedToken(ISSUER, AUDIENCE)).getSubject())
                .isEqualTo("stable-oidc-subject");
    }

    @Test
    void rejectsSignedUserTokenWithUnexpectedAudience() {
        assertThatThrownBy(() -> this.decoder.decode(
                this.signedToken(ISSUER, "kino-data-internal")
        )).isInstanceOf(JwtValidationException.class);
    }

    @Test
    void rejectsSignedUserTokenWithUnexpectedIssuer() {
        assertThatThrownBy(() -> this.decoder.decode(
                this.signedToken("https://other.example.test", AUDIENCE)
        )).isInstanceOf(JwtValidationException.class);
    }

    private String signedToken(String issuer, String audience) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(issuer)
                .subject("stable-oidc-subject")
                .audience(java.util.List.of(audience))
                .issuedAt(now)
                .expiresAt(now.plus(5, ChronoUnit.MINUTES))
                .claim("scope", "kino.data.read")
                .build();
        JwsHeader header = JwsHeader.with(SignatureAlgorithm.RS256)
                .keyId("data-service-test")
                .type("at+jwt")
                .build();
        return this.encoder.encode(JwtEncoderParameters.from(header, claims))
                .getTokenValue();
    }
}

package com.kino.trend_service;

import com.kino.trend_service.controllers.GenreTrendController;
import com.kino.trend_service.controllers.TitleTrendController;
import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.JWSSigner;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.apache.kafka.streams.KafkaStreams;
import org.apache.kafka.streams.StoreQueryParameters;
import org.apache.kafka.streams.kstream.Windowed;
import org.apache.kafka.streams.state.KeyValueIterator;
import org.apache.kafka.streams.state.ReadOnlyWindowStore;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.kafka.config.StreamsBuilderFactoryBean;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = TrendServiceSecurityTests.TestApplication.class)
@AutoConfigureMockMvc
class TrendServiceSecurityTests {
    private static final String REQUIRED_SCOPE = "kino.agent.curator.read";
    private static final String REQUIRED_AUDIENCE = "kino-data-internal";
    private static final String ISSUER_PATH = "/api/v1/auth";
    private static final String JWK_SET_PATH = ISSUER_PATH + "/oauth2/jwks";

    private static HttpServer jwkServer;
    private static String issuerUri;
    private static String jwkSetUri;
    private static RSAKey rsaKey;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private StreamsBuilderFactoryBean streamsBuilderFactoryBean;

    private KafkaStreams kafkaStreams;

    @DynamicPropertySource
    static void registerJwtProperties(DynamicPropertyRegistry registry) {
        ensureJwkServer();

        registry.add(
                "spring.security.oauth2.resourceserver.jwt.issuer-uri",
                () -> issuerUri
        );
        registry.add(
                "spring.security.oauth2.resourceserver.jwt.jwk-set-uri",
                () -> jwkSetUri
        );
        registry.add(
                "spring.security.oauth2.resourceserver.jwt.audiences",
                () -> REQUIRED_AUDIENCE
        );
    }

    @AfterAll
    static void tearDownJwkServer() {
        if (jwkServer != null) {
            jwkServer.stop(0);
            jwkServer = null;
        }
    }

    @BeforeEach
    void setUp() {
        this.kafkaStreams = mock(KafkaStreams.class);
        @SuppressWarnings("unchecked")
        ReadOnlyWindowStore<String, Long> windowStore = mock(
                ReadOnlyWindowStore.class
        );
        @SuppressWarnings("unchecked")
        KeyValueIterator<Windowed<String>, Long> iterator = mock(
                KeyValueIterator.class
        );

        when(this.streamsBuilderFactoryBean.getKafkaStreams())
                .thenReturn(this.kafkaStreams);
        doReturn(windowStore)
                .when(this.kafkaStreams)
                .store(any(StoreQueryParameters.class));
        when(windowStore.fetchAll(any(Instant.class), any(Instant.class)))
                .thenReturn(iterator);
        when(iterator.hasNext()).thenReturn(false);
    }

    @Test
    void unauthenticatedTrendLookupIsRejected() throws Exception {
        this.mockMvc.perform(get("/trends/titles?minutes=3"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void validMachineTokenCanAccessTitleTrendRoute() throws Exception {
        this.mockMvc.perform(
                        get("/trends/titles?minutes=3")
                                .header(
                                        "Authorization",
                                        "Bearer " + this.machineToken(
                                                issuerUri,
                                                REQUIRED_AUDIENCE,
                                                REQUIRED_SCOPE
                                        )
                                )
                )
                .andExpect(status().isOk())
                .andExpect(content().json("{}"));
    }

    @Test
    void validMachineTokenCanAccessGenreTrendRoute() throws Exception {
        this.mockMvc.perform(
                        get("/trends/genres?minutes=3")
                                .header(
                                        "Authorization",
                                        "Bearer " + this.machineToken(
                                                issuerUri,
                                                REQUIRED_AUDIENCE,
                                                REQUIRED_SCOPE
                                        )
                                )
                )
                .andExpect(status().isOk())
                .andExpect(content().json("{}"));
    }

    @Test
    void machineTokenWithWrongIssuerIsUnauthorized() throws Exception {
        this.mockMvc.perform(
                        get("/trends/titles?minutes=3")
                                .header(
                                        "Authorization",
                                        "Bearer " + this.machineToken(
                                                issuerUri + "/wrong",
                                                REQUIRED_AUDIENCE,
                                                REQUIRED_SCOPE
                                        )
                                )
                )
                .andExpect(status().isUnauthorized());
    }

    @Test
    void machineTokenWithWrongAudienceIsUnauthorized() throws Exception {
        this.mockMvc.perform(
                        get("/trends/titles?minutes=3")
                                .header(
                                        "Authorization",
                                        "Bearer " + this.machineToken(
                                                issuerUri,
                                                "kino-other-internal",
                                                REQUIRED_SCOPE
                                        )
                                )
                )
                .andExpect(status().isUnauthorized());
    }

    @Test
    void machineTokenWithoutScopeIsForbidden() throws Exception {
        this.mockMvc.perform(
                        get("/trends/titles?minutes=3")
                                .header(
                                        "Authorization",
                                        "Bearer " + this.machineToken(
                                                issuerUri,
                                                REQUIRED_AUDIENCE,
                                                null
                                        )
                                )
                )
                .andExpect(status().isForbidden());
    }

    private String machineToken(String issuer, String audience, String scope)
            throws JOSEException {
        Instant now = Instant.now();
        JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder()
                .jwtID(UUID.randomUUID().toString())
                .subject("agent-service")
                .issuer(issuer)
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plusSeconds(300)))
                .audience(List.of(audience));

        if (scope != null) {
            claims.claim("scope", scope);
        }

        SignedJWT jwt = new SignedJWT(
                new JWSHeader.Builder(JWSAlgorithm.RS256)
                        .type(JOSEObjectType.JWT)
                        .keyID(rsaKey.getKeyID())
                        .build(),
                claims.build()
        );
        JWSSigner signer = new RSASSASigner((RSAPrivateKey) rsaKey.toPrivateKey());
        jwt.sign(signer);
        return jwt.serialize();
    }

    private static synchronized void ensureJwkServer() {
        if (jwkServer != null) {
            return;
        }

        try {
            rsaKey = generateRsaKey();
            jwkServer = HttpServer.create(
                    new InetSocketAddress("127.0.0.1", 0),
                    0
            );
            jwkServer.createContext(
                    JWK_SET_PATH,
                    TrendServiceSecurityTests::handleJwkSetRequest
            );
            jwkServer.start();

            int port = jwkServer.getAddress().getPort();
            issuerUri = "http://127.0.0.1:" + port + ISSUER_PATH;
            jwkSetUri = "http://127.0.0.1:" + port + JWK_SET_PATH;
        } catch (IOException | JOSEException exception) {
            throw new IllegalStateException(
                    "Failed to start local JWK server for auth tests.",
                    exception
            );
        }
    }

    private static void handleJwkSetRequest(HttpExchange exchange)
            throws IOException {
        byte[] response = new JWKSet(rsaKey.toPublicJWK())
                .toString()
                .getBytes(StandardCharsets.UTF_8);

        exchange.getResponseHeaders().add(
                "Content-Type",
                "application/json"
        );
        exchange.sendResponseHeaders(200, response.length);
        exchange.getResponseBody().write(response);
        exchange.close();
    }

    private static RSAKey generateRsaKey() throws JOSEException {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            KeyPair keyPair = generator.generateKeyPair();

            return new RSAKey.Builder((RSAPublicKey) keyPair.getPublic())
                    .privateKey((RSAPrivateKey) keyPair.getPrivate())
                    .keyID(UUID.randomUUID().toString())
                    .build();
        } catch (Exception exception) {
            throw new JOSEException("Failed to generate RSA key.", exception);
        }
    }

    @SpringBootConfiguration
    @EnableAutoConfiguration
    @Import({
            TitleTrendController.class,
            GenreTrendController.class,
            TrendServiceSecurityConfig.class,
            TestBeans.class
    })
    static class TestApplication {
    }

    @TestConfiguration
    static class TestBeans {
        @Bean
        StreamsBuilderFactoryBean streamsBuilderFactoryBean() {
            return mock(StreamsBuilderFactoryBean.class);
        }
    }
}

package com.kino.auth_service;

import com.kino.auth_service.customuser.CustomUserRepository;
import com.kino.auth_service.machineauth.AuthServiceMachineAuthConfig;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;
import org.springframework.security.oauth2.server.authorization.InMemoryOAuth2AuthorizationConsentService;
import org.springframework.security.oauth2.server.authorization.InMemoryOAuth2AuthorizationService;
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationConsentService;
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService;
import org.springframework.security.oauth2.server.authorization.client.InMemoryRegisteredClientRepository;
import org.springframework.security.oauth2.server.authorization.client.RegisteredClient;
import org.springframework.security.oauth2.server.authorization.client.RegisteredClientRepository;
import org.springframework.security.oauth2.server.authorization.settings.ClientSettings;
import org.springframework.security.oauth2.server.authorization.settings.TokenSettings;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest
@Import({
        AuthServiceMachineAuthConfig.class,
        AuthServiceSecurityConfig.class,
        AuthServiceMachineAuthTests.TestAuthorizationServerPersistence.class
})
@TestPropertySource(properties = {
        "SERVICE_LOGGING_LEVEL=INFO",
        "SERVICE_PORT=8081",
        "kino.server.prefix-path=/api/v1/auth",
        "kino.security.form-login.redirect-url=http://localhost:3000",
        "kino.security.cors.allowed-origins=http://localhost:3000",
        "kino.machine-auth.jdbc-persistence.enabled=false",
        "kino.machine-auth.issuer=http://auth-service:8081",
        "kino.machine-auth.agent.client-id=agent-service",
        "kino.machine-auth.agent.client-secret=test-secret",
        "kino.machine-auth.agent.scopes=kino.agent.curator.read",
        "kino.machine-auth.agent.audience=kino-data-internal"
})
class AuthServiceMachineAuthTests {
    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtDecoder jwtDecoder;

    @MockBean
    private CustomUserRepository customUserRepository;

    @Test
    void tokenEndpointIssuesClientCredentialsJwt() throws Exception {
        MvcResult result = this.mockMvc.perform(
                        post("/api/v1/auth/oauth2/token")
                                .with(httpBasic("agent-service", "test-secret"))
                                .contentType(
                                        MediaType.APPLICATION_FORM_URLENCODED
                                )
                                .param("grant_type", "client_credentials")
                )
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.access_token").isNotEmpty())
                .andExpect(jsonPath("$.token_type").value("Bearer"))
                .andReturn();

        String accessToken = result.getResponse().getContentAsString()
                .replaceAll(".*\"access_token\":\"([^\"]+)\".*", "$1");
        Jwt jwt = this.jwtDecoder.decode(accessToken);
        Assertions.assertThat(jwt.getAudience())
                .contains("kino-data-internal");
        Assertions.assertThat(jwt.getIssuer().toString())
                .isEqualTo("http://auth-service:8081");
        Assertions.assertThat(jwt.getClaimAsString("scope"))
                .isEqualTo("kino.agent.curator.read");
    }

    @Test
    void jwkSetEndpointIsPublished() throws Exception {
        this.mockMvc.perform(get("/api/v1/auth/oauth2/jwks"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.keys").isArray());
    }

    @Test
    void oidcDiscoveryUsesThePublicIssuerAndAuthApiEndpoints() throws Exception {
        this.mockMvc.perform(get("/.well-known/openid-configuration"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issuer")
                        .value("http://auth-service:8081"))
                .andExpect(jsonPath("$.authorization_endpoint")
                        .value("http://auth-service:8081/api/v1/auth/oauth2/authorize"))
                .andExpect(jsonPath("$.token_endpoint")
                        .value("http://auth-service:8081/api/v1/auth/oauth2/token"));
    }

    @TestConfiguration
    static class TestAuthorizationServerPersistence {
        @Bean
        @Primary
        RegisteredClientRepository testRegisteredClientRepository(
                PasswordEncoder passwordEncoder
        ) {
            RegisteredClient agentClient = RegisteredClient.withId("test-agent")
                    .clientId("agent-service")
                    .clientSecret(passwordEncoder.encode("test-secret"))
                    .clientAuthenticationMethod(
                            ClientAuthenticationMethod.CLIENT_SECRET_BASIC
                    )
                    .authorizationGrantType(AuthorizationGrantType.CLIENT_CREDENTIALS)
                    .scope("kino.agent.curator.read")
                    .clientSettings(ClientSettings.builder().build())
                    .tokenSettings(TokenSettings.builder().build())
                    .build();
            return new InMemoryRegisteredClientRepository(agentClient);
        }

        @Bean
        @Primary
        OAuth2AuthorizationService testAuthorizationService() {
            return new InMemoryOAuth2AuthorizationService();
        }

        @Bean
        @Primary
        OAuth2AuthorizationConsentService testAuthorizationConsentService() {
            return new InMemoryOAuth2AuthorizationConsentService();
        }
    }
}

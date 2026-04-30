package com.kino.auth_service;

import com.kino.auth_service.customuser.CustomUserRepository;
import com.kino.auth_service.machineauth.AuthServiceMachineAuthConfig;
import com.kino.auth_service.nonsecured.NonSecuredController;
import com.kino.auth_service.secured.SecuredController;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
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

@WebMvcTest({
        NonSecuredController.class,
        SecuredController.class
})
@Import({
        AuthServiceMachineAuthConfig.class,
        AuthServiceSecurityConfig.class
})
@TestPropertySource(properties = {
        "SERVICE_LOGGING_LEVEL=INFO",
        "SERVICE_PORT=8081",
        "kino.server.prefix-path=/api/v1/auth",
        "kino.security.form-login.redirect-url=http://localhost:3000",
        "kino.machine-auth.issuer=http://auth-service:8081/api/v1/auth",
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
                .isEqualTo("http://auth-service:8081/api/v1/auth");
        Assertions.assertThat(jwt.getClaimAsString("scope"))
                .isEqualTo("kino.agent.curator.read");
    }

    @Test
    void jwkSetEndpointIsPublished() throws Exception {
        this.mockMvc.perform(get("/api/v1/auth/oauth2/jwks"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.keys").isArray());
    }
}

package com.kino.data_service;

import com.kino.data_service.nonsecured.NonSecuredController;
import com.kino.data_service.titles.InternalTitleController;
import com.kino.data_service.titles.Title;
import com.kino.data_service.titles.TitleController;
import com.kino.data_service.titles.TitleDto;
import com.kino.data_service.titles.TitleService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageImpl;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest({
        NonSecuredController.class,
        TitleController.class,
        InternalTitleController.class
})
@Import({
        DataServiceMachineSecurityConfig.class,
        DataServiceSecurityConfig.class
})
@TestPropertySource(properties = {
        "kino.server.prefix-path=/api/v1/data",
        "spring.security.oauth2.resourceserver.jwt.issuer-uri=http://auth-service:8081/api/v1/auth",
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://auth-service:8081/api/v1/auth/oauth2/jwks",
        "spring.security.oauth2.resourceserver.jwt.audiences=kino-data-internal"
})
class DataServiceSecurityTests {
    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private TitleService titleService;

    @Test
    void unauthenticatedTitleLookupIsRejected() throws Exception {
        this.mockMvc.perform(get("/api/v1/data/titles/abc123"))
                .andExpect(status().isForbidden());
    }

    @Test
    void userSessionCanAccessProtectedTitleRoutes() throws Exception {
        when(this.titleService.getTitle("abc123"))
                .thenReturn(Optional.of(this.sampleTitleDto()));

        this.mockMvc.perform(
                        get("/api/v1/data/titles/abc123")
                                .with(user("kino-user"))
                )
                .andExpect(status().isOk());
    }

    @Test
    void machineTokenCanAccessInternalSearchRoute() throws Exception {
        when(this.titleService.getTitlesPage(
                any(), anyString(), anyString(), anyBoolean(),
                anyList(), anyString()
        )).thenReturn(new PageImpl<>(List.of(this.sampleTitleDto())));

        this.mockMvc.perform(
                        get("/api/v1/data/internal/titles/search?page=0&size=1")
                                .with(this.machineToken())
                )
                .andExpect(status().isOk());
    }

    @Test
    void machineTokenCannotAccessUserTitleRoute() throws Exception {
        this.mockMvc.perform(
                        get("/api/v1/data/titles/abc123")
                                .header("Authorization", "Bearer test-token")
                )
                .andExpect(status().isForbidden());
    }

    private TitleDto sampleTitleDto() {
        Title title = new Title();
        title.id = "abc123";
        title.titleConst = "tt0000001";
        title.titleType = "movie";
        title.primaryTitle = "Sample";
        title.originalTitle = "Sample";
        title.isAdult = false;
        title.startYear = 1998;
        title.endYear = 1998;
        title.runtimeMinutes = 95;
        title.genres = List.of("Thriller");
        return new TitleDto(title);
    }

    private SecurityMockMvcRequestPostProcessors.JwtRequestPostProcessor
    machineToken() {
        return jwt().authorities(() -> "SCOPE_kino.agent.curator.read");
    }
}

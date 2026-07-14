package com.kino.auth_service;

import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The MUI login page is intentionally client-rendered, but its credentials are
 * submitted through a native form to Spring Security. Exposing the generated
 * CSRF token lets that form keep Spring's same-origin CSRF protection.
 */
@RestController
@RequestMapping("${kino.server.prefix-path}")
public class AuthServiceCsrfController {
    @GetMapping("/csrf")
    public CsrfTokenResponse csrf(CsrfToken csrfToken) {
        return new CsrfTokenResponse(
                csrfToken.getToken(),
                csrfToken.getHeaderName(),
                csrfToken.getParameterName()
        );
    }

    public record CsrfTokenResponse(
            String token,
            String headerName,
            String parameterName
    ) {
    }
}

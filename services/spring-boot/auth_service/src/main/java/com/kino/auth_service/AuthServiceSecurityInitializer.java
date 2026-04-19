package com.kino.auth_service;

import org.springframework.security.web.context.AbstractSecurityWebApplicationInitializer;

public class AuthServiceSecurityInitializer extends AbstractSecurityWebApplicationInitializer {
    public AuthServiceSecurityInitializer() {
        super(AuthServiceSecurityConfig.class, AuthServiceSessionCacheConfig.class);
    }
}

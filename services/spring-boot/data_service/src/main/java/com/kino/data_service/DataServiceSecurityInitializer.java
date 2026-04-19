package com.kino.data_service;

import org.springframework.security.web.context.AbstractSecurityWebApplicationInitializer;

public class DataServiceSecurityInitializer extends AbstractSecurityWebApplicationInitializer {
    public DataServiceSecurityInitializer() {
        super(DataServiceSecurityConfig.class, DataServiceSessionCacheConfig.class);
    }
}

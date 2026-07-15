package com.kino.commons.security;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.security.core.GrantedAuthority;

import java.util.Set;

/**
 * Security-context persistence needs an identity and authorities, never the
 * Mongo profile or password verifier. Keep this shared mixin safe for both
 * Spring Session and Authorization Server persistence.
 */
@JsonIgnoreProperties({"id", "password", "email"})
public abstract class CustomUserMixin {
    @JsonProperty("username") abstract String getUsername();
    @JsonProperty("oidcSubject") abstract String getOidcSubject();
    @JsonProperty("authorities") abstract Set<GrantedAuthority> getAuthorities();
    @JsonProperty("accountNonExpired") abstract boolean isAccountNonExpired();
    @JsonProperty("accountNonLocked") abstract boolean isAccountNonLocked();
    @JsonProperty("credentialsNonExpired") abstract boolean isCredentialsNonExpired();
    @JsonProperty("enabled") abstract boolean isEnabled();
}

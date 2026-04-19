package com.kino.commons.security;

import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.security.core.GrantedAuthority;

import java.util.Set;

public abstract class CustomUserMixin {
    @JsonProperty("id") abstract String getId();
    @JsonProperty("password") abstract String getPassword();
    @JsonProperty("username") abstract String getUsername();
    @JsonProperty("email") abstract String getEmail();
    @JsonProperty("authorities") abstract Set<GrantedAuthority> getAuthorities();
    @JsonProperty("accountNonExpired") abstract boolean isAccountNonExpired();
    @JsonProperty("accountNonLocked") abstract boolean isAccountNonLocked();
    @JsonProperty("credentialsNonExpired") abstract boolean isCredentialsNonExpired();
    @JsonProperty("enabled") abstract boolean isEnabled();
}
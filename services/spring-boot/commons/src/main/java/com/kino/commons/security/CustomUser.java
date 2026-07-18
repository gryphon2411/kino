package com.kino.commons.security;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.security.core.CredentialsContainer;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Set;

/*
 Consider to use authorities handle from:
 - custom-user, example.CustomUserRepositoryUserDetailsService.CustomUserDetails of: https://github.com/spring-projects/spring-security-samples/
 - org.springframework.security.core.userdetails.User;
*/

@Document(collection = "users")
public class CustomUser implements UserDetails, CredentialsContainer {
    @Id
    public String id;
    public String password;
    public String username;
    public String email;
    @Indexed(unique = true, sparse = true)
    public String oidcSubject;
    public Set<GrantedAuthority> authorities;
    public boolean accountNonExpired;
    public boolean accountNonLocked;
    public boolean credentialsNonExpired;
    public boolean enabled;

    public CustomUser(String username, String email, String password, Set<GrantedAuthority> authorities,
                      boolean accountNonExpired, boolean accountNonLocked, boolean credentialsNonExpired,
                      boolean enabled) {
        this.password = password;
        this.username = username;
        this.email = email;
        this.oidcSubject = java.util.UUID.randomUUID().toString();
        this.authorities = new LinkedHashSet<>(authorities);
        this.accountNonExpired = accountNonExpired;
        this.accountNonLocked = accountNonLocked;
        this.credentialsNonExpired = credentialsNonExpired;
        this.enabled = enabled;
    }

    public CustomUser(String username, String email, String password) {
        this(username, email, password, new LinkedHashSet<>(), true, true,
                true, true);
    }

    public CustomUser() {
        // Spring Data uses this persistence constructor for legacy Mongo
        // documents. Leave a missing OIDC subject missing until the explicit
        // migration persists one; never create a transient token subject.
        this.password = "";
        this.username = "";
        this.email = "";
        this.oidcSubject = null;
        this.authorities = new LinkedHashSet<>();
        this.accountNonExpired = true;
        this.accountNonLocked = true;
        this.credentialsNonExpired = true;
        this.enabled = true;
    }

    @Override
    public Collection<GrantedAuthority> getAuthorities() {
        return this.authorities;
    }

    @Override
    public String getPassword() {
        return this.password;
    }

    @Override
    public String getUsername() {
        return this.username;
    }

    /**
     * Stable, opaque OIDC subject. It deliberately does not reuse a mutable
     * username or the Mongo persistence identifier.
     */
    public String getOidcSubject() {
        return this.oidcSubject;
    }

    @Override
    public boolean isEnabled() {
        return this.enabled;
    }

    @Override
    public boolean isAccountNonExpired() {
        return this.accountNonExpired;
    }

    @Override
    public boolean isAccountNonLocked() {
        return this.accountNonLocked;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return this.credentialsNonExpired;
    }

    @Override
    public void eraseCredentials() {
        this.password = null;
    }

    @Override
    public boolean equals(Object object) {
        if (object instanceof User user) {
            return this.username.equals(user.getUsername());
        }
        return false;
    }

    /**
     * Returns the hashcode of the {@code username}.
     */
    @Override
    public int hashCode() {
        return this.username.hashCode();
    }

    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder();
        sb.append(getClass().getName()).append(" [");
        sb.append("Username=").append(this.username).append(", ");
        sb.append("Email=").append(this.email).append(", ");
        sb.append("Password=[PROTECTED], ");
        sb.append("Enabled=").append(this.enabled).append(", ");
        sb.append("AccountNonExpired=").append(this.accountNonExpired).append(", ");
        sb.append("credentialsNonExpired=").append(this.credentialsNonExpired).append(", ");
        sb.append("AccountNonLocked=").append(this.accountNonLocked).append(", ");
        sb.append("Granted Authorities=").append(this.authorities).append("]");
        return sb.toString();
    }
}

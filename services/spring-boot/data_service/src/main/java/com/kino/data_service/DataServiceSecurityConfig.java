package com.kino.data_service;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.ArrayList;
import java.util.List;

/**
 * User-facing title requests carry the short-lived access token minted for the
 * BFF. Data Service is therefore stateless and does not deserialize auth
 * service sessions; its separate internal chain remains machine-token only.
 */
@Configuration
@EnableWebSecurity
public class DataServiceSecurityConfig {
    @Value("${kino.server.prefix-path}")
    private String serverPrefixPath;

    @Value("${spring.security.oauth2.resourceserver.jwt.issuer-uri}")
    private String issuerUri;

    @Value("${spring.security.oauth2.resourceserver.jwt.jwk-set-uri}")
    private String jwkSetUri;

    @Value("${kino.security.user-token.audiences}")
    private String audiencesProperty;

    @Value("${kino.security.cors.allowed-origins}")
    private String allowedCorsOrigins;

    @Bean
    @Order(2)
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            @Qualifier("userJwtDecoder") JwtDecoder userJwtDecoder
    ) throws Exception {
        http
                .securityMatcher(this.serverPrefixPath + "/**")
                .cors(Customizer.withDefaults())
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(
                        SessionCreationPolicy.STATELESS
                ))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers("/login", "/logout").denyAll()
                        .requestMatchers(this.serverPrefixPath + "/titles")
                        .hasAuthority("SCOPE_kino.data.read")
                        .requestMatchers(this.serverPrefixPath + "/titles/*")
                        .hasAuthority("SCOPE_kino.data.read")
                        .anyRequest().denyAll()
                )
                .oauth2ResourceServer(oauth2 ->
                        oauth2.jwt(jwt -> jwt.decoder(userJwtDecoder))
                );

        return http.build();
    }

    @Bean
    public JwtDecoder userJwtDecoder() {
        NimbusJwtDecoder jwtDecoder = NimbusJwtDecoder.withJwkSetUri(
                this.jwkSetUri
        ).build();
        jwtDecoder.setJwtValidator(this.userJwtValidator());
        return jwtDecoder;
    }

    OAuth2TokenValidator<Jwt> userJwtValidator() {
        OAuth2TokenValidator<Jwt> issuerValidator =
                JwtValidators.createDefaultWithIssuer(this.issuerUri);
        return new DelegatingOAuth2TokenValidator<>(
                issuerValidator,
                this.audienceValidator()
        );
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(List.of(this.allowedCorsOrigins.split(",")));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "HEAD"));
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type"));

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    private OAuth2TokenValidator<Jwt> audienceValidator() {
        List<String> requiredAudiences = this.requiredAudiences();
        return jwt -> {
            boolean hasAudience = jwt.getAudience() != null
                    && jwt.getAudience().stream().anyMatch(
                            requiredAudiences::contains
                    );
            if (hasAudience) {
                return OAuth2TokenValidatorResult.success();
            }
            return OAuth2TokenValidatorResult.failure(new OAuth2Error(
                    "invalid_token",
                    "The required audience is missing.",
                    null
            ));
        };
    }

    private List<String> requiredAudiences() {
        ArrayList<String> audiences = new ArrayList<>();
        for (String part : this.audiencesProperty.split(",")) {
            String audience = part.trim();
            if (!audience.isEmpty()) {
                audiences.add(audience);
            }
        }
        return audiences;
    }
}

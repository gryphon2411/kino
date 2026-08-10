package com.kino.trend_service;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.proc.DefaultJOSEObjectTypeVerifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
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

import java.util.ArrayList;
import java.util.List;

@Configuration
@EnableWebSecurity
public class TrendServiceMachineSecurityConfig {
    @Value("${spring.security.oauth2.resourceserver.jwt.issuer-uri}")
    private String issuerUri;

    @Value("${spring.security.oauth2.resourceserver.jwt.jwk-set-uri}")
    private String jwkSetUri;

    @Value("${spring.security.oauth2.resourceserver.jwt.audiences}")
    private String audiencesProperty;

    @Bean
    @Order(1)
    public SecurityFilterChain machineSecurityFilterChain(HttpSecurity http)
            throws Exception {
        http
                .securityMatcher("/trends/**")
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(
                        SessionCreationPolicy.STATELESS
                ))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(HttpMethod.GET, "/trends/**")
                        .hasAuthority("SCOPE_kino.agent.curator.read")
                        .anyRequest().denyAll()
                )
                .oauth2ResourceServer(oauth2 ->
                        oauth2.jwt(Customizer.withDefaults())
                )
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable);

        return http.build();
    }

    @Bean
    @Order(2)
    public SecurityFilterChain fallbackSecurityFilterChain(HttpSecurity http)
            throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(authorize -> authorize
                        .anyRequest().denyAll()
                )
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable);

        return http.build();
    }

    @Bean
    public JwtDecoder machineJwtDecoder() {
        NimbusJwtDecoder jwtDecoder = NimbusJwtDecoder.withJwkSetUri(
                this.jwkSetUri
        ).jwtProcessorCustomizer(processor -> processor.setJWSTypeVerifier(
                new DefaultJOSEObjectTypeVerifier<>(new JOSEObjectType("at+jwt"))
        )).build();
        OAuth2TokenValidator<Jwt> issuerValidator =
                JwtValidators.createDefaultWithIssuer(this.issuerUri);
        OAuth2TokenValidator<Jwt> audienceValidator =
                this.audienceValidator();
        DelegatingOAuth2TokenValidator<Jwt> tokenValidator =
                new DelegatingOAuth2TokenValidator<>(
                        issuerValidator, audienceValidator
                );

        jwtDecoder.setJwtValidator(tokenValidator);
        return jwtDecoder;
    }

    private OAuth2TokenValidator<Jwt> audienceValidator() {
        List<String> requiredAudiences = this.requiredAudiences();

        return jwt -> {
            List<String> tokenAudiences = jwt.getAudience();
            boolean hasAudience = tokenAudiences != null
                    && tokenAudiences.stream().anyMatch(
                    requiredAudiences::contains
            );
            if (hasAudience) {
                return OAuth2TokenValidatorResult.success();
            }

            OAuth2Error error = new OAuth2Error(
                    "invalid_token",
                    "The required audience is missing.",
                    null
            );
            return OAuth2TokenValidatorResult.failure(error);
        };
    }

    private List<String> requiredAudiences() {
        ArrayList<String> audiences = new ArrayList<>();
        String[] parts = this.audiencesProperty.split(",");
        for (String part : parts) {
            String audience = part.trim();
            if (!audience.isEmpty()) {
                audiences.add(audience);
            }
        }
        return audiences;
    }
}

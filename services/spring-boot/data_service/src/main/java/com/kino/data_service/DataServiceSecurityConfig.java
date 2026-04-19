package com.kino.data_service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.util.matcher.RegexRequestMatcher;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;

@Configuration
@EnableWebSecurity
public class DataServiceSecurityConfig {
    @Value("${kino.server.prefix-path}")
    private String serverPrefixPath;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .cors(Customizer.withDefaults())
                .csrf(csrf ->
                        csrf
                                .ignoringRequestMatchers(
                                        this.serverPrefixPath + "/non-secured",
                                        this.serverPrefixPath + "/secured",
                                        this.serverPrefixPath + "/titles")
                                .ignoringRequestMatchers(RegexRequestMatcher.regexMatcher(
                                        this.serverPrefixPath + "/titles/[a-fA-F0-9]{24}")))

                .authorizeHttpRequests(authorize ->
                        authorize
                                .requestMatchers(this.serverPrefixPath + "/non-secured").permitAll()
                                .requestMatchers("/login", "/logout").denyAll()
                                .requestMatchers(RegexRequestMatcher.regexMatcher(
                                        this.serverPrefixPath + "/titles/[a-fA-F0-9]{24}")).permitAll()
                                .anyRequest().authenticated());

                // By default, authentication will be persisted and restored on future requests.

                // By default, anonymous authentication is provided automatically

        return http.build();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(Arrays.asList("*"));
        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "HEAD"));
        configuration.setAllowedHeaders(Arrays.asList("*"));

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);

        return source;
    }
}

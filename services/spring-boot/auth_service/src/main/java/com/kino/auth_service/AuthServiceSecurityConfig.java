package com.kino.auth_service;

import com.kino.auth_service.customuser.CustomUserDetailsService;
import com.kino.auth_service.customuser.CustomUserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.session.security.web.authentication.SpringSessionRememberMeServices;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;

@Configuration
@EnableWebSecurity
public class AuthServiceSecurityConfig {
    @Value("${kino.server.prefix-path}")
    private String serverPrefixPath;

    @Value("${kino.security.form-login.redirect-url}")
    private String formLoginRedirectUrl;

    @Bean
    @Order(2)
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .cors(Customizer.withDefaults())
                .csrf(csrf ->
                        csrf
                                .ignoringRequestMatchers(
                                        this.serverPrefixPath + "/non-secured",
                                        this.serverPrefixPath + "/secured",
                                        this.serverPrefixPath + "/login",
                                        this.serverPrefixPath + "/logout"))

                .authorizeHttpRequests(authorize ->
                        authorize
                                .requestMatchers(this.serverPrefixPath + "/non-secured").permitAll()
                                .anyRequest().authenticated())

                /* The form should:
                    1. Perform a post to /login.
                    2. Needs to include a CSRF Token.
                    3. Specify the username in a parameter named username.
                    4. Specify the password in a parameter named password.
                   If the HTTP parameter named error is found, it indicates the user failed to provide a valid username or password.
                   If the HTTP parameter named logout is found, it indicates the user has logged out successfully.
                */
                .formLogin(formLogin ->
                        formLogin
                                .loginPage("/login").permitAll()
                                .loginProcessingUrl(this.serverPrefixPath + "/login")
                                .defaultSuccessUrl(this.formLoginRedirectUrl, true)
                                .failureUrl(this.formLoginRedirectUrl + "/login?error"))

                /* The default implementation of SecurityContextRepository is
                    DelegatingSecurityContextRepository which delegates to:
                        1. HttpSessionSecurityContextRepository
                        2. RequestAttributeSecurityContextRepository
                 */

                // By default, authentication will be persisted and restored on future requests.

                // By default, anonymous authentication is provided automatically

                .logout(logout ->
                        logout
                                .logoutSuccessUrl(this.serverPrefixPath + "/login?logout")
                                .logoutUrl(this.serverPrefixPath + "/logout"))

                .rememberMe(rememberMe ->
                        rememberMe
                                .rememberMeServices(this.rememberMeServices()));

        return http.build();
    }

    @Bean
    public AuthenticationManager authenticationManager(
            UserDetailsService userDetailsService,
            PasswordEncoder passwordEncoder
    ) {
        DaoAuthenticationProvider authenticationProvider = new DaoAuthenticationProvider();
        authenticationProvider.setUserDetailsService(userDetailsService);
        authenticationProvider.setPasswordEncoder(passwordEncoder);

        ProviderManager providerManager = new ProviderManager(authenticationProvider);
        providerManager.setEraseCredentialsAfterAuthentication(false);

        return providerManager;
    }

    @Bean
    public UserDetailsService userDetailsService(CustomUserRepository repository) {
        return new CustomUserDetailsService(repository);
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

    @Bean
    public SpringSessionRememberMeServices rememberMeServices() {
        SpringSessionRememberMeServices rememberMeServices = new SpringSessionRememberMeServices();

        rememberMeServices.setAlwaysRemember(false);

        return rememberMeServices;
    }
}

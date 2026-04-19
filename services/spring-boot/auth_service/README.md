# Spring Boot Auth Service

## References
- https://docs.spring.io/spring-security/reference/servlet/authentication/passwords/index.html#publish-authentication-manager-bean
- https://spring.io/projects/spring-security
- https://docs.spring.io/spring-security/reference/index.html
- https://docs.spring.io/spring-security/reference/servlet/index.html
- https://github.com/spring-projects/spring-security-samples/tree/6.2.x/servlet/spring-boot/java
- https://docs.spring.io/spring-data/mongodb/reference/
- https://spring.io/guides/topicals/spring-security-architecture
- https://docs.spring.io/spring-security/reference/servlet/authentication/passwords/caching.html
- https://docs.spring.io/spring-framework/reference/integration/cache/annotations.html
- https://docs.spring.io/spring-data/redis/reference/redis/redis-cache.html

- https://spring.io/projects/spring-authorization-server

## Spring Initializr

https://start.spring.io/

- Project: Gradle - Groovy

- Language: Java

- Spring Boot: 3.1.10

- Project Metadata:
  - Group: com.kino
  - Artifact: auth_service
  - Name: auth_service
  - Description: Kino Auth Service
  - Package name: com.kino.auth_service
  - Packaging: Jar
  - Java: 17

- Dependencies:
  - Spring Web
  - Spring Data MongoDB
  - Spring Cache Abstraction
  - Spring Data Redis (Access+Driver)
  - Spring for RabbitMQ Messaging
  - Spring for Apache Kafka Streams
  - Spring Security

```java
// Import required modules
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.authentication.builders.AuthenticationManagerBuilder;
import org.springframework.security.config.annotation.web.configuration.WebSecurityConfigurerAdapter;
import org.springframework.security.config.annotation.method.configuration.EnableGlobalMethodSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.context.annotation.Bean;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.*;

// Define User document
@Document(collection = "users")
public class User {
    @Id
    private String id;
    private String username;
    private String password;
    private String email;
    private Mfa mfa;

    // getters and setters
}

// Define Mfa class
public class Mfa {
    private String secret;
    private boolean enabled;

    // getters and setters
}

// Define UserRepository
public interface UserRepository extends MongoRepository<User, String> {
    User findByUsername(String username);
}

// Define UserService
@Service
public class UserService implements UserDetailsService {
    @Autowired
    private UserRepository userRepository;

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        User user = userRepository.findByUsername(username);
        if (user == null) {
            throw new UsernameNotFoundException(username);
        }
        return new org.springframework.security.core.userdetails.User(user.getUsername(), user.getPassword(), new ArrayList<>());
    }
}

// Define Security Configuration
@EnableWebSecurity
@EnableGlobalMethodSecurity(prePostEnabled = true)
public class WebSecurityConfig extends WebSecurityConfigurerAdapter {
    @Autowired
    private JwtAuthenticationEntryPoint jwtAuthenticationEntryPoint;
    @Autowired
    private UserDetailsService jwtUserDetailsService;
    @Autowired
    private JwtRequestFilter jwtRequestFilter;

    @Autowired
    public void configureGlobal(AuthenticationManagerBuilder auth) throws Exception {
        auth.userDetailsService(jwtUserDetailsService).passwordEncoder(passwordEncoder());
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    @Override
    public AuthenticationManager authenticationManagerBean() throws Exception {
        return super.authenticationManagerBean();
    }

    @Override
    protected void configure(HttpSecurity httpSecurity) throws Exception {
        httpSecurity.csrf().disable()
                .authorizeRequests().antMatchers("/authenticate").permitAll().
                        anyRequest().authenticated().and().
                        exceptionHandling().authenticationEntryPoint(jwtAuthenticationEntryPoint).and().sessionManagement()
                .sessionCreationPolicy(SessionCreationPolicy.STATELESS);
        httpSecurity.addFilterBefore(jwtRequestFilter, UsernamePasswordAuthenticationFilter.class);
    }
}

// Define AuthController
@RestController
@RequestMapping("/auth/api/v1")
public class AuthController {
    @Autowired
    private AuthenticationManager authenticationManager;
    @Autowired
    private JwtTokenUtil jwtTokenUtil;
    @Autowired
    private UserDetailsService userDetailsService;
    @Autowired
    private JavaMailSender javaMailSender;

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody User user) {
        // implement registration logic
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody User user) {
        // implement login logic
    }

    @PostMapping("/mfa/verify")
    public ResponseEntity<?> verifyMfa(@RequestBody User user) {
        // implement MFA verification logic
    }

    @PutMapping("/mfa/enable")
    public ResponseEntity<?> enableMfa(@RequestBody User user) {
        // implement MFA enable logic
    }

    @GetMapping("/secured")
    public ResponseEntity<?> secured() {
        // implement secured route logic
    }
}

// Define Application
@SpringBootApplication
public class AuthServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(AuthServiceApplication.class, args);
    }
}

```

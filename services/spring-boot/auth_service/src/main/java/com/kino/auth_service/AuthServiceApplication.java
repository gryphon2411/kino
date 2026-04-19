package com.kino.auth_service;

import com.kino.auth_service.customuser.CustomUserRepository;
import com.kino.commons.security.CustomUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;

@SpringBootApplication
public class AuthServiceApplication {
	private static final Logger log = LoggerFactory.getLogger(AuthServiceApplication.class);

	public static void main(String[] args) {
		SpringApplication.run(AuthServiceApplication.class, args);
	}

	@Bean
	public CommandLineRunner demo(CustomUserRepository repository) {
		return (args) -> {
			String username = "user";
			CustomUser existingUser = repository.findCustomUserByUsername(username);

			if (existingUser == null) {
				String encodedPassword = PasswordEncoderFactories.createDelegatingPasswordEncoder().encode("password");
				repository.save(new CustomUser(username, "user@example.com", encodedPassword));
			} else {
				log.info("User creation skipped: username \"{}\" already exists", username);
			}
		};
	}
}


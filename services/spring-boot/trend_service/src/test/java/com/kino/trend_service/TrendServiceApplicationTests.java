package com.kino.trend_service;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(classes = TrendServiceApplication.class, properties = {
		"SERVICE_PORT=8080",
		"SERVICE_LOGGING_LEVEL=INFO",
		"MONGO_HOST_ADDRESS=localhost",
		"MONGO_HOST_PORT=27017",
		"MONGO_DATABASE=kino",
		"MONGO_USERNAME=root",
		"MONGO_PASSWORD=test-password",
		"KAFKA_HOSTS=localhost:9092",
		"KAFKA_USERNAME=root",
		"KAFKA_PASSWORD=test-password",
		"spring.kafka.streams.auto-startup=false",
		"spring.security.oauth2.resourceserver.jwt.issuer-uri=http://auth-service:8081/api/v1/auth",
		"spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://auth-service:8081/api/v1/auth/oauth2/jwks",
		"spring.security.oauth2.resourceserver.jwt.audiences=kino-data-internal"
})
class TrendServiceApplicationTests {

	@Test
	void contextLoads() {
	}

}

package com.kino.auth_service.customuser;

import com.kino.commons.security.CustomUser;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface CustomUserRepository extends MongoRepository<CustomUser, String> {
	CustomUser findCustomUserByUsername(String username);
}

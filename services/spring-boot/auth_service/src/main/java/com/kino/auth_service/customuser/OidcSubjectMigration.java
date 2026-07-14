package com.kino.auth_service.customuser;

import com.kino.commons.security.CustomUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

import java.util.List;
import java.util.UUID;

/**
 * Backfills only legacy users. New users receive a subject in CustomUser's
 * constructor, so this migration is idempotent and safe to keep during rollout.
 */
@Configuration
public class OidcSubjectMigration {
    private static final Logger logger = LoggerFactory.getLogger(
            OidcSubjectMigration.class
    );

    @Bean
    @Order(0)
    ApplicationRunner migrateMissingOidcSubjects(
            CustomUserRepository repository,
            MongoTemplate mongoTemplate
    ) {
        return arguments -> {
            // Backfill first. A unique sparse index cannot be created while
            // legacy documents share an empty (or whitespace-only) value.
            Query missingSubject = new Query(new Criteria().orOperator(
                    Criteria.where("oidcSubject").exists(false),
                    Criteria.where("oidcSubject").is(null),
                    Criteria.where("oidcSubject").regex("^\\s*$")
            ));
            List<CustomUser> legacyUsers = mongoTemplate.find(
                    missingSubject, CustomUser.class
            );

            for (CustomUser user : legacyUsers) {
                user.oidcSubject = UUID.randomUUID().toString();
            }
            if (!legacyUsers.isEmpty()) {
                repository.saveAll(legacyUsers);
                logger.info("Backfilled OIDC subjects for {} users", legacyUsers.size());
            }

            mongoTemplate.indexOps(CustomUser.class).ensureIndex(
                    new Index().on("oidcSubject", Sort.Direction.ASC)
                            .unique()
                            .sparse()
            );
        };
    }
}

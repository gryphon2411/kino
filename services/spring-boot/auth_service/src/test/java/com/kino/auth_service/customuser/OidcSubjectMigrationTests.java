package com.kino.auth_service.customuser;

import com.kino.commons.security.CustomUser;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.IndexOperations;
import org.springframework.data.mongodb.core.query.Query;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OidcSubjectMigrationTests {
    @Test
    void backfillsBlankAndWhitespaceSubjectsBeforeCreatingTheUniqueIndex()
            throws Exception {
        CustomUser blank = new CustomUser();
        blank.oidcSubject = "";
        CustomUser whitespace = new CustomUser();
        whitespace.oidcSubject = "  ";
        CustomUserRepository repository = mock(CustomUserRepository.class);
        MongoTemplate mongoTemplate = mock(MongoTemplate.class);
        IndexOperations indexes = mock(IndexOperations.class);
        when(mongoTemplate.find(any(Query.class), eq(CustomUser.class)))
                .thenReturn(List.of(blank, whitespace));
        when(mongoTemplate.indexOps(CustomUser.class)).thenReturn(indexes);

        new OidcSubjectMigration().migrateMissingOidcSubjects(
                repository, mongoTemplate
        ).run(new DefaultApplicationArguments());

        assertThat(blank.getOidcSubject()).isNotBlank();
        assertThat(whitespace.getOidcSubject()).isNotBlank();
        verify(repository).saveAll(List.of(blank, whitespace));
        verify(indexes).ensureIndex(any());

        ArgumentCaptor<Query> query = ArgumentCaptor.forClass(Query.class);
        verify(mongoTemplate).find(query.capture(), eq(CustomUser.class));
        assertThat(query.getValue().getQueryObject().toJson()).contains("^\\\\s*$");
    }
}

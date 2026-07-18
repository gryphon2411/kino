package com.kino.auth_service.customuser;

import com.kino.commons.security.CustomUser;
import org.junit.jupiter.api.Test;
import org.springframework.data.mongodb.core.index.Indexed;

import static org.assertj.core.api.Assertions.assertThat;

class CustomUserOidcSubjectIndexTests {
    @Test
    void declaresTheStableOidcSubjectAsAUniqueSparseMongoIndex() throws Exception {
        Indexed index = CustomUser.class.getField("oidcSubject")
                .getAnnotation(Indexed.class);

        assertThat(index).isNotNull();
        assertThat(index.unique()).isTrue();
        assertThat(index.sparse()).isTrue();
    }
}

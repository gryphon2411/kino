package com.kino.data_service.titles;

import org.bson.Document;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Query;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CustomTitleRepositoryImplTests {
    @Mock
    private MongoTemplate mongoTemplate;

    @InjectMocks
    private CustomTitleRepositoryImpl repository;

    @Test
    void getTitlesPageAppliesStartYearLowerBound() {
        Pageable pageable = PageRequest.of(0, 8);
        when(this.mongoTemplate.find(any(Query.class), eq(Title.class)))
                .thenReturn(List.of());
        when(this.mongoTemplate.count(any(Query.class), eq(Title.class)))
                .thenReturn(0L);

        this.repository.getTitlesPage(
                pageable, "movie", null, false, List.of("Action"), null, 1990
        );

        ArgumentCaptor<Query> queryCaptor = ArgumentCaptor.forClass(Query.class);
        verify(this.mongoTemplate).find(queryCaptor.capture(), eq(Title.class));

        Document queryObject = queryCaptor.getValue().getQueryObject();
        assertThat(queryObject.getString("titleType")).isEqualTo("movie");
        assertThat(queryObject.getBoolean("isAdult")).isFalse();
        assertThat(
                ((Document) queryObject.get("genres")).getList("$in", Object.class)
                        .get(0)
        )
                .isEqualTo("Action");
        assertThat(((Document) queryObject.get("startYear")).get("$gte"))
                .isEqualTo(1990);
    }
}

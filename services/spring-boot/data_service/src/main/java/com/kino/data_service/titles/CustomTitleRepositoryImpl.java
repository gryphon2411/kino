package com.kino.data_service.titles;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.TextCriteria;
import org.springframework.data.mongodb.core.query.TextQuery;

import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

public class CustomTitleRepositoryImpl implements CustomTitleRepository {
    @Autowired
    MongoTemplate mongoTemplate;
    
    @Override
    public Page<Title> getTitlesPage(Pageable pageable, String titleType, String primaryTitle, Boolean isAdult,
                                     List<String> genres, String freeText, Integer minYear, Integer maxYear) {
        Query query = buildTitlesQuery(
                titleType, primaryTitle, isAdult, genres, freeText, minYear, maxYear
        );

        query.with(pageable);

        List<Title> content = mongoTemplate.find(query, Title.class);

        return new PageImpl<>(content, pageable, mongoTemplate.count(query, Title.class));
    }

    private Query buildTitlesQuery(String titleType, String primaryTitle, Boolean isAdult,
                                   List<String> genres, String freeText, Integer minYear, Integer maxYear) {
        Query query;
        
        // Use text search if freeText is provided
        if (freeText != null && !freeText.trim().isEmpty()) {
            TextCriteria textCriteria = TextCriteria.forDefaultLanguage().matching(freeText);
            // For free-text search, prefer Mongo's text-score ranking over default document order.
            query = TextQuery.queryText(textCriteria).sortByScore();
        } else {
            query = new Query();
        }

        if (titleType != null) {
            query.addCriteria(Criteria.where("titleType").is(titleType));
        }
        if (primaryTitle != null && (freeText == null || freeText.trim().isEmpty())) {
            String primaryTitleSearchKey = buildPrimaryTitleSearchKey(primaryTitle);
            if (primaryTitleSearchKey != null) {
                query.addCriteria(
                        Criteria.where("primaryTitleSearchKey")
                                .regex("^" + Pattern.quote(primaryTitleSearchKey))
                );
            }
        }
        if (isAdult != null) {
            query.addCriteria(Criteria.where("isAdult").is(isAdult));
        }
        if (minYear != null || maxYear != null) {
            Criteria yearCriteria = Criteria.where("startYear");
            if (minYear != null) {
                yearCriteria = yearCriteria.gte(minYear);
            }
            if (maxYear != null) {
                yearCriteria = yearCriteria.lte(maxYear);
            }
            query.addCriteria(yearCriteria);
        }
        if (genres != null && !genres.isEmpty()) {
            query.addCriteria(Criteria.where("genres").in(genres));
        }

        return query;
    }

    private String buildPrimaryTitleSearchKey(String primaryTitle) {
        String trimmedTitle = primaryTitle.trim();
        if (trimmedTitle.isEmpty()) {
            return null;
        }
        return trimmedTitle.toLowerCase(Locale.ROOT);
    }
}

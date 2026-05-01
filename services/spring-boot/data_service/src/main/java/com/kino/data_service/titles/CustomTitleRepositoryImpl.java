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

import java.util.ArrayList;
import java.util.List;

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
            query = TextQuery.queryText(textCriteria);
        } else {
            query = new Query();
        }

        if (titleType != null) {
            query.addCriteria(Criteria.where("titleType").is(titleType));
        }
        if (primaryTitle != null && (freeText == null || freeText.trim().isEmpty())) {
            // Only apply primaryTitle regex if freeText is not being used
            query.addCriteria(Criteria.where("primaryTitle").regex(primaryTitle, "i"));
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
            // For genres, we'll use regex matching to search within the list
            if (freeText != null && !freeText.trim().isEmpty()) {
                // When freeText is used, we add genres as additional criteria
                Criteria genresCriteria = new Criteria();
                List<Criteria> genreCriterias = new ArrayList<>();
                for (String genre : genres) {
                    genreCriterias.add(Criteria.where("genres").regex(genre, "i"));
                }
                if (!genreCriterias.isEmpty()) {
                    genresCriteria.orOperator(genreCriterias.toArray(new Criteria[0]));
                    query.addCriteria(genresCriteria);
                }
            } else {
                // When freeText is not used, use the existing in operator
                query.addCriteria(Criteria.where("genres").in(genres));
            }
        }

        return query;
    }
}

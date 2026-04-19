package com.kino.data_service.titles;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;

public interface CustomTitleRepository {
    Page<Title> getTitlesPage(Pageable pageable, String titleType, String primaryTitle, Boolean isAdult,
                              List<String> genres, String freeText);
}

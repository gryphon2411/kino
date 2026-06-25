package com.kino.data_service.titles;

import java.util.List;

// Keep the API DTO separate from the Mongo document so transport shape can
// evolve independently of persistence annotations and internal helper fields.
public class TitleDto {
    public String id;
    public String titleConst;
    public String titleType;
    public String primaryTitle;
    public String originalTitle;
    public Boolean isAdult;
    public Integer startYear;
    public Integer endYear;
    public Integer runtimeMinutes;
    public List<String> genres;

    public TitleDto() {
    }

    public TitleDto(
            String id,
            String titleConst,
            String titleType,
            String primaryTitle,
            String originalTitle,
            Boolean isAdult,
            Integer startYear,
            Integer endYear,
            Integer runtimeMinutes,
            List<String> genres
    ) {
        this.id = id;
        this.titleConst = titleConst;
        this.titleType = titleType;
        this.primaryTitle = primaryTitle;
        this.originalTitle = originalTitle;
        this.isAdult = isAdult;
        this.startYear = startYear;
        this.endYear = endYear;
        this.runtimeMinutes = runtimeMinutes;
        this.genres = genres == null ? null : List.copyOf(genres);
    }
}

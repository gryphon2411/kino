package com.kino.data_service.titles;

public class TitleDto extends Title {
    public TitleDto(Title title) {
        this.id = title.id;
        this.titleConst = title.titleConst;
        this.titleType = title.titleType;
        this.primaryTitle = title.primaryTitle;
        this.originalTitle = title.originalTitle;
        this.isAdult = title.isAdult;
        this.startYear = title.startYear;
        this.endYear = title.endYear;
        this.runtimeMinutes = title.runtimeMinutes;
        this.genres = title.genres;
    }
}

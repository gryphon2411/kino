package com.kino.trend_service.documents;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

import java.util.List;

@Document("title_basics")
public class Title {
    @Id
    public String id;
    @Field("tconst")
    public String titleConst;
    public String titleType;
    public String primaryTitle;
    public String originalTitle;
    public boolean isAdult;
    public int startYear;
    public int endYear;
    public int runtimeMinutes;
    public List<String> genres;

    public Title() { }
}

package com.kino.data_service.titles;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.TextIndexed;
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
    @TextIndexed(weight=2)
    public String primaryTitle;
    @TextIndexed(weight=1)
    public String originalTitle;
    public boolean isAdult;
    public int startYear;
    public int endYear;
    public int runtimeMinutes;
    public List<String> genres;

    public Title() { }
}

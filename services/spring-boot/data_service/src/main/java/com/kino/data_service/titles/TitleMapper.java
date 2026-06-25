package com.kino.data_service.titles;

import com.kino.commons.events.TitleSearchEvent;

final class TitleMapper {
    private TitleMapper() {
    }

    static TitleDto toDto(Title title) {
        return new TitleDto(
                title.id,
                title.titleConst,
                title.titleType,
                title.primaryTitle,
                title.originalTitle,
                title.isAdult,
                title.startYear,
                title.endYear,
                title.runtimeMinutes,
                title.genres
        );
    }

    static TitleSearchEvent toSearchEvent(Title title) {
        return new TitleSearchEvent(
                title.id,
                title.titleConst,
                title.titleType,
                title.primaryTitle,
                title.originalTitle,
                title.isAdult,
                title.startYear,
                title.endYear,
                title.runtimeMinutes,
                title.genres
        );
    }
}

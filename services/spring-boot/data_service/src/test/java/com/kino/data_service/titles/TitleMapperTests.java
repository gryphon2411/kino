package com.kino.data_service.titles;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class TitleMapperTests {
    @Test
    void toDtoPreservesNullGenres() {
        Title title = sampleTitle();

        TitleDto dto = TitleMapper.toDto(title);

        assertThat(dto.genres).isNull();
    }

    @Test
    void toSearchEventPreservesNullGenres() {
        Title title = sampleTitle();

        assertThat(TitleMapper.toSearchEvent(title).genres).isNull();
    }

    private static Title sampleTitle() {
        Title title = new Title();
        title.id = "tt0000001";
        title.titleConst = "tt0000001";
        title.primaryTitle = "Carmencita";
        title.genres = null;
        return title;
    }
}

package com.kino.data_service.titles;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("${kino.server.prefix-path}")
public class InternalTitleController {
    private final TitleService service;

    public InternalTitleController(TitleService service) {
        this.service = service;
    }

    @GetMapping("/internal/titles/search")
    public Page<TitleDto> searchTitles(
            Pageable pageable,
            @RequestParam(required = false) String titleType,
            @RequestParam(required = false) String primaryTitle,
            @RequestParam(required = false) Boolean isAdult,
            @RequestParam(required = false) List<String> genres,
            @RequestParam(required = false) String freeText
    ) {
        return this.service.getTitlesPage(
                pageable, titleType, primaryTitle, isAdult, genres, freeText
        );
    }
}

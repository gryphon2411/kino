package com.kino.data_service.titles;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("${kino.server.prefix-path}")
public class TitleController {
    @Autowired
    TitleService service;

    @GetMapping("/titles/{id}")
    public TitleDto getTitle(@PathVariable String id) {
        return service.getTitle(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, HttpStatus.NOT_FOUND.getReasonPhrase())
                );
    }

    @GetMapping("/titles")
    public Page<TitleDto> getTitlesPage(Pageable pageable,
                                        @RequestParam(required = false) String titleType,
                                        @RequestParam(required = false) String primaryTitle,
                                        @RequestParam(required = false) Boolean isAdult,
                                        @RequestParam(required = false) List<String> genres,
                                        @RequestParam(required = false) String freeText) {
        return service.getTitlesPage(pageable, titleType, primaryTitle, isAdult, genres, freeText);
    }
}

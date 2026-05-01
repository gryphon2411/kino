package com.kino.data_service.titles;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class TitleService {
    private static final Logger logger = LoggerFactory.getLogger(TitleService.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final TitleRepository repository;
    private final KafkaTemplate<String, String> kafkaTemplate;

    public TitleService(TitleRepository repository, KafkaTemplate<String, String> kafkaTemplate) {
        this.repository = repository;
        this.kafkaTemplate = kafkaTemplate;
    }

    public Optional<TitleDto> getTitle(String id) {
        Optional<TitleDto> optional = repository.findById(id).map(TitleDto::new);

        optional.ifPresent(this::sendToKafka);

        return optional;
    }

    public Page<TitleDto> getTitlesPage(Pageable pageable, String titleType, String primaryTitle, Boolean isAdult,
                                        List<String> genres, String freeText) {
        return getTitlesPage(
                pageable, titleType, primaryTitle, isAdult, genres, freeText, null, null
        );
    }

    public Page<TitleDto> getTitlesPage(Pageable pageable, String titleType, String primaryTitle, Boolean isAdult,
                                        List<String> genres, String freeText, Integer minYear, Integer maxYear) {
        Page<Title> titlesPage = repository.getTitlesPage(
                pageable, titleType, primaryTitle, isAdult, genres, freeText,
                minYear, maxYear
        );
        Page<TitleDto> titlesDtoPage = titlesPage.map(TitleDto::new);

        for (Title title : titlesPage) {
            sendToKafka(title);
        }

        return titlesDtoPage;
    }

    private void sendToKafka(Title title) {
        try {
            kafkaTemplate.send("title-searches", title.id, objectMapper.writeValueAsString(title));
        } catch (JsonProcessingException exception) {
            logger.error("Couldn't send title (id: {}) to 'title-searches' topic", title.id, exception);
        }
    }

}

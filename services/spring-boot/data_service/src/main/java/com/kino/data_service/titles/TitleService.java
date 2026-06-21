package com.kino.data_service.titles;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kino.commons.events.TitleSearchEvent;
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
        Optional<Title> optionalTitle = repository.findById(id);

        optionalTitle.ifPresent(this::sendToKafka);

        return optionalTitle.map(TitleMapper::toDto);
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
        Page<TitleDto> titlesDtoPage = titlesPage.map(TitleMapper::toDto);

        titlesPage.forEach(this::sendToKafka);

        return titlesDtoPage;
    }

    private void sendToKafka(Title title) {
        if (title == null) {
            return;
        }
        try {
            TitleSearchEvent event = TitleMapper.toSearchEvent(title);
            kafkaTemplate.send("title-searches", event.id, objectMapper.writeValueAsString(event));
        } catch (JsonProcessingException exception) {
            logger.error("Couldn't send title (id: {}) to 'title-searches' topic", title.id, exception);
        }
    }

}

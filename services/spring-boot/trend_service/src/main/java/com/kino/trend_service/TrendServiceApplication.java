package com.kino.trend_service;

import com.kino.trend_service.common.Utils;
import com.kino.trend_service.documents.Title;
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.streams.StreamsBuilder;
import org.apache.kafka.streams.kstream.Grouped;
import org.apache.kafka.streams.kstream.Consumed;
import org.apache.kafka.streams.kstream.KStream;
import org.apache.kafka.streams.kstream.Materialized;
import org.apache.kafka.streams.kstream.TimeWindows;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.kafka.annotation.EnableKafkaStreams;
import org.springframework.kafka.support.serializer.JsonSerde;

import java.time.Duration;

@EnableKafkaStreams
@SpringBootApplication
public class TrendServiceApplication {
	private static final Logger logger = LoggerFactory.getLogger(TrendServiceApplication.class);

	@Bean
	public KStream<String, Title> kStream(StreamsBuilder builder) {
		KStream<String, Title> stream = builder.stream("title-searches", Consumed.with(Serdes.String(), new JsonSerde<>(Title.class)));

		long minutes = Long.parseLong(Utils.MIN_WINDOW_TIME_MINUTES);

		// Group by title and window for 3 minutes
		stream.groupByKey()
				.windowedBy(TimeWindows.of(Duration.ofMinutes(minutes)))
				.count(Materialized.as("title-counts"))
				.toStream();

		// Group by genre and window for 3 minutes
		stream.flatMapValues(value -> value.genres)
				.groupBy((key, value) -> value, Grouped.with(Serdes.String(), Serdes.String()))
				.windowedBy(TimeWindows.of(Duration.ofMinutes(minutes)))
				.count(Materialized.as("genre-counts"))
				.toStream();

		return stream;
	}


	public static void main(String[] args) {
		SpringApplication.run(TrendServiceApplication.class, args);
	}

}
//	@Bean
//	public KStream<String, Title> kStream(StreamsBuilder streamsBuilder) {
//		KStream<String, Title> stream = streamsBuilder.stream("title-searches", Consumed.with(Serdes.String(), new JsonSerde<>(Title.class)));
//
//		// Write the trending titles by a window duration of 60 minutes to MongoDB
//		stream.map((key, value) -> new KeyValue<>(value.titleConst, value))
//				.groupByKey()
//				.windowedBy(TimeWindows.of(Duration.ofMinutes(60)))
//				.count()
//				.toStream()
//				.foreach((key, value) -> mongoTemplate.save(new Trend("title", key.key(), value), "trends"));
//
//		// Write the trending genres by a window duration of 60 minutes to MongoDB
//		stream.flatMapValues(value -> value.genres)
//				.groupBy((key, value) -> value, Grouped.with(Serdes.String(), Serdes.String()))
//				.windowedBy(TimeWindows.of(Duration.ofMinutes(60)))
//				.count()
//				.toStream()
//				.foreach((key, value) -> mongoTemplate.save(new Trend("genre", key.key(), value), "trends"));
//
//		return stream;
//	}
//}

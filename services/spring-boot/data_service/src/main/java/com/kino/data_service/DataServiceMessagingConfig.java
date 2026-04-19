package com.kino.data_service;


import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.rabbit.listener.api.RabbitListenerErrorHandler;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@Configuration
public class DataServiceMessagingConfig {
    @Bean
    public Queue queue() {
        return new Queue("kino.data_service.title.rpc.requests");
    }

    @Bean
    public DirectExchange exchange() {
        return new DirectExchange("kino.data_service.title.rpc");
    }

    @Bean
    public Binding binding(DirectExchange exchange, Queue queue) {
        return BindingBuilder.bind(queue).to(exchange).with("rpc");
    }

    @Bean
    public MessageConverter jsonConverter() {
        return new Jackson2JsonMessageConverter();
    }

    @Bean
    public RabbitTemplate jsonRabbitTemplate(ConnectionFactory connectionFactory,
                                             Jackson2JsonMessageConverter converter) {
        RabbitTemplate template = new RabbitTemplate(connectionFactory);
        template.setMessageConverter(converter);

        return template;
    }

    @Bean
    public RabbitListenerErrorHandler rabbitListenerErrorHandler() {
        return (amqpMessage, message, listenerException) -> {
            Throwable cause = listenerException.getCause();
            MessageProperties properties = amqpMessage.getMessageProperties();

            int code = HttpStatus.INTERNAL_SERVER_ERROR.value();
            String reason = HttpStatus.INTERNAL_SERVER_ERROR.getReasonPhrase();

            if (cause instanceof ResponseStatusException exception) {
                code = exception.getStatusCode().value();
                reason = (exception.getReason() != null) ? exception.getReason() : "";
            }

            properties.setHeaders(Map.of("error-code", code, "reason", reason));

            return amqpMessage;
        };
    }
}

package com.kino.data_service;

import com.kino.commons.security.CustomUser;
import com.kino.commons.security.CustomUserMixin;
import com.kino.commons.security.LinkedHashSetMixin;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.BeanClassLoaderAware;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.lang.NonNull;
import org.springframework.security.jackson2.SecurityJackson2Modules;
import org.springframework.session.data.redis.config.annotation.web.http.EnableRedisHttpSession;

import java.util.LinkedHashSet;

@Configuration
@EnableRedisHttpSession
public class DataServiceSessionCacheConfig implements BeanClassLoaderAware {
    private ClassLoader loader;

    @Value("${kino.cache.session.redis.host:localhost}")
    private String sessionCacheHost;
    @Value("${kino.cache.session.redis.port:6379}")
    private int sessionCachePort;
    @Value("${kino.cache.session.redis.database:0}")
    private int sessionCacheDatabase;
    @Value("${kino.cache.session.redis.username:#{null}}")
    private String sessionCacheUsername;
    @Value("${kino.cache.session.redis.password:#{null}}")
    private String sessionCachePassword;

    @Override
    public void setBeanClassLoader(@NonNull ClassLoader classLoader) {
        this.loader = classLoader;
    }


    @Bean
    @Primary
    public LettuceConnectionFactory sessionRedisConnectionFactory() {
        RedisStandaloneConfiguration configuration = new RedisStandaloneConfiguration();

        configuration.setHostName(this.sessionCacheHost);
        configuration.setPort(this.sessionCachePort);
        configuration.setDatabase(this.sessionCacheDatabase);
        configuration.setUsername(this.sessionCacheUsername);
        configuration.setPassword(this.sessionCachePassword);

        return new LettuceConnectionFactory(configuration);
    }

    @Bean
    public RedisSerializer<Object> springSessionDefaultRedisSerializer() {
        return new GenericJackson2JsonRedisSerializer(objectMapper());
    }

    private ObjectMapper objectMapper() {
        ObjectMapper mapper = new ObjectMapper();
        mapper.addMixIn(CustomUser.class, CustomUserMixin.class);
        mapper.addMixIn(LinkedHashSet.class, LinkedHashSetMixin.class);
        mapper.registerModules(SecurityJackson2Modules.getModules(this.loader));
        return mapper;
    }
}

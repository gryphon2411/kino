package com.kino.auth_service;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;

@Configuration
@EnableCaching
public class AuthServiceCacheConfig {
    @Value("${kino.cache.default.redis.host:localhost}")
    private String defaultCacheHost;
    @Value("${kino.cache.default.redis.port:6379}")
    private int defaultCachePort;
    @Value("${kino.cache.default.redis.database}")
    private int defaultCacheDatabase;
    @Value("${kino.cache.default.redis.username:#{null}}")
    private String defaultCacheUsername;
    @Value("${kino.cache.default.redis.password:#{null}}")
    private String defaultCachePassword;
    @Value("${kino.cache.default.redis.namespace}")
    private String defaultCacheNamespace;


    @Bean
    public LettuceConnectionFactory defaultRedisConnectionFactory() {
        RedisStandaloneConfiguration configuration = new RedisStandaloneConfiguration();

        configuration.setHostName(this.defaultCacheHost);
        configuration.setPort(this.defaultCachePort);
        configuration.setDatabase(this.defaultCacheDatabase);
        configuration.setUsername(this.defaultCacheUsername);
        configuration.setPassword(this.defaultCachePassword);

        return new LettuceConnectionFactory(configuration);
    }

    @Bean
    public RedisCacheManager cacheManager(@Qualifier("defaultRedisConnectionFactory") RedisConnectionFactory defaultRedisConnectionFactory,
                                          RedisCacheConfiguration cacheConfiguration) {
        return RedisCacheManager.builder(defaultRedisConnectionFactory)
                .cacheDefaults(cacheConfiguration)
                .build();
    }

    @Bean
    public RedisCacheConfiguration cacheConfiguration() {
        return RedisCacheConfiguration.defaultCacheConfig()
                .prefixCacheNameWith(this.getCachePrefix())
                .serializeValuesWith(
                        RedisSerializationContext.SerializationPair.fromSerializer(
                                new GenericJackson2JsonRedisSerializer()
                        )
                );
    }

    private String getCachePrefix() {
        return this.defaultCacheNamespace + ":";
    }
}

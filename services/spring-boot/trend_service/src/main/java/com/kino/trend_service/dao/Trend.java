package com.kino.trend_service.dao;

import org.apache.kafka.streams.KeyValue;
import org.apache.kafka.streams.kstream.Windowed;

public class Trend {
    public Long count;
    public String startTime;
    public String endTime;

    public Trend(KeyValue<Windowed<String>, Long> record) {
        this.count = record.value;
        this.startTime = record.key.window().startTime().toString();
        this.endTime = record.key.window().endTime().toString();
    }
}

package com.kino.commons.security;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.Set;

public abstract class LinkedHashSetMixin {
    @JsonCreator
    public LinkedHashSetMixin(@JsonProperty("set") Set<?> set) {}
}
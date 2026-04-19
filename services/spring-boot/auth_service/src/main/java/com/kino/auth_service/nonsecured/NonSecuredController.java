package com.kino.auth_service.nonsecured;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("${kino.server.prefix-path}")
public class NonSecuredController {
    @GetMapping("/non-secured")
    public ResponseEntity<Map<String, String>> nonSecured() {
        return ResponseEntity.ok(Map.of("message", "Non secured content"));
    }
}

package com.kino.data_service.secured;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.security.Principal;
import java.util.Map;

@RestController
@RequestMapping("${kino.server.prefix-path}")
public class SecuredController {
    @GetMapping("/secured")
    public ResponseEntity<Map<String, String>> secured(Principal principal) {
        return ResponseEntity.ok(Map.of("message", "Secured content for " + principal.getName()));
    }
}

package com.bawibase.chorong.config

import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "시스템")
class HealthController {
    @GetMapping("/api/health")
    fun health() = mapOf("status" to "ok")
}

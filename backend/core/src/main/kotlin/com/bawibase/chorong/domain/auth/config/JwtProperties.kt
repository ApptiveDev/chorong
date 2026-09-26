package com.bawibase.chorong.domain.auth.config

import org.springframework.boot.context.properties.ConfigurationProperties
import java.time.Duration

@ConfigurationProperties(prefix = "app.jwt")
data class JwtProperties(
    val secret: String,
    val accessTtl: Duration,
    val refreshTtl: Duration,
) {
    init {
        require(secret.toByteArray().size >= 32) { "app.jwt.secret 은 32바이트 이상이어야 합니다." }
    }
}

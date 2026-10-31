package com.bawibase.chorong.domain.auth.service

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.client.SimpleClientHttpRequestFactory
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.oauth2.jwt.JwtException
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder
import org.springframework.web.client.RestClientException
import org.springframework.web.client.RestTemplate
import java.io.IOException
import java.time.Clock

class GoogleTokenVerifier(
    private val decoder: JwtDecoder,
    private val allowedClientIds: Set<String>,
    private val clock: Clock,
) {
    fun verify(raw: String): String {
        check(allowedClientIds.isNotEmpty()) { "Google OAuth client IDs are not configured" }
        val jwt =
            try {
                decoder.decode(raw)
            } catch (e: JwtException) {
                if (generateSequence<Throwable>(e) { it.cause }.any { it is IOException || it is RestClientException }) {
                    throw IllegalStateException("Google signing keys are unavailable")
                }
                throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
            }
        val issuer = jwt.getClaimAsString("iss")
        val audience = jwt.audience ?: emptyList()
        val presenter = jwt.getClaimAsString("azp")
        val now = clock.instant()
        val subject = jwt.subject
        if (issuer !in ISSUERS || audience.isEmpty() || audience.any { it !in allowedClientIds } ||
            (audience.size > 1 && presenter == null) || (presenter != null && presenter !in allowedClientIds) ||
            jwt.expiresAt == null || !jwt.expiresAt!!.isAfter(now) ||
            jwt.issuedAt == null || jwt.issuedAt!!.isAfter(now.plusSeconds(60)) ||
            (jwt.notBefore != null && jwt.notBefore!!.isAfter(now)) ||
            subject.isNullOrBlank() || subject.length > 255 || subject.any { it.code !in 33..126 }
        ) {
            throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        }
        return subject
    }

    companion object {
        private val ISSUERS = setOf("accounts.google.com", "https://accounts.google.com")
    }
}

@Configuration
class GoogleTokenConfiguration {
    @Bean
    fun googleTokenVerifier(
        clock: Clock,
        @Value("\${app.oauth.google.client-ids:}") clientIds: String,
    ): GoogleTokenVerifier =
        GoogleTokenVerifier(
            decoder(GOOGLE_JWKS),
            clientIds
                .split(',')
                .map {
                    it.trim()
                }.filter { it.isNotEmpty() }
                .toSet(),
            clock,
        )

    companion object {
        const val GOOGLE_JWKS = "https://www.googleapis.com/oauth2/v3/certs"

        fun decoder(uri: String): JwtDecoder {
            val factory =
                SimpleClientHttpRequestFactory().apply {
                    setConnectTimeout(3000)
                    setReadTimeout(3000)
                }
            return NimbusJwtDecoder.withJwkSetUri(uri).restOperations(RestTemplate(factory)).build().apply {
                setJwtValidator { OAuth2TokenValidatorResult.success() }
            }
        }
    }
}

package com.bawibase.chorong.domain.auth.service

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.fasterxml.jackson.databind.ObjectMapper
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.ECDSASigner
import com.nimbusds.jose.jwk.ECKey
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.web.client.RestTemplateBuilder
import org.springframework.http.HttpEntity
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.http.client.SimpleClientHttpRequestFactory
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.oauth2.jwt.JwtException
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder
import org.springframework.stereotype.Component
import org.springframework.util.LinkedMultiValueMap
import org.springframework.web.client.HttpClientErrorException
import org.springframework.web.client.ResourceAccessException
import org.springframework.web.client.RestClientException
import org.springframework.web.client.RestTemplate
import java.security.KeyFactory
import java.security.interfaces.ECPrivateKey
import java.security.spec.PKCS8EncodedKeySpec
import java.time.Clock
import java.time.Duration
import java.util.Base64
import java.util.Date

class AppleTokenVerifier(
    private val decoder: JwtDecoder,
    private val clientIds: Set<String>,
    private val teamId: String,
    private val keyId: String,
    private val privateKey: ECPrivateKey?,
    private val clock: Clock,
    private val mapper: ObjectMapper,
    restTemplateBuilder: RestTemplateBuilder,
    private val tokenUrl: String = TOKEN_URL,
) {
    private val rest =
        restTemplateBuilder
            .connectTimeout(Duration.ofSeconds(3))
            .readTimeout(Duration.ofSeconds(3))
            .build()

    fun verify(
        rawIdToken: String,
        authorizationCode: String,
    ): String {
        check(clientIds.isNotEmpty() && teamId.isNotBlank() && keyId.isNotBlank() && privateKey != null) {
            "Apple OAuth credentials are not configured"
        }
        if (authorizationCode.isBlank()) throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        val initialSubject = verifyIdToken(rawIdToken)
        val exchangedSubject = exchangeCode(authorizationCode)
        if (initialSubject != exchangedSubject) throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        return initialSubject
    }

    private fun exchangeCode(code: String): String {
        val form =
            LinkedMultiValueMap<String, String>().apply {
                add("client_id", clientIds.single())
                add("client_secret", createClientSecret())
                add("code", code)
                add("grant_type", "authorization_code")
            }
        val headers = HttpHeaders().apply { contentType = MediaType.APPLICATION_FORM_URLENCODED }
        try {
            val response = rest.postForObject(tokenUrl, HttpEntity(form, headers), String::class.java)
            val exchanged = mapper.readTree(response ?: throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)).path("id_token")
            if (!exchanged.isTextual || exchanged.asText().isBlank()) throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
            return verifyIdToken(exchanged.asText())
        } catch (e: HttpClientErrorException) {
            if (e.statusCode.is4xxClientError) throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
            throw IllegalStateException("Apple token service failed", e)
        } catch (e: ResourceAccessException) {
            throw IllegalStateException("Apple token service unavailable", e)
        } catch (e: RestClientException) {
            throw IllegalStateException("Apple token service failed", e)
        } catch (e: ApiV1Exception) {
            throw e
        } catch (e: Exception) {
            throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        }
    }

    private fun verifyIdToken(raw: String): String {
        val jwt =
            try {
                decoder.decode(raw)
            } catch (e: JwtException) {
                if (generateSequence<Throwable>(e) { it.cause }.any { it is java.io.IOException || it is RestClientException }) {
                    throw IllegalStateException("Apple signing keys are unavailable")
                }
                throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
            }
        val now = clock.instant()
        val subject = jwt.subject
        if (jwt.getClaimAsString("iss") != ISSUER || jwt.audience.size != 1 || jwt.audience.single() !in clientIds ||
            jwt.expiresAt == null || !jwt.expiresAt!!.isAfter(now) || jwt.issuedAt == null || jwt.issuedAt!!.isAfter(now) ||
            (jwt.notBefore != null && jwt.notBefore!!.isAfter(now)) || subject.isNullOrBlank() || subject.length > 255 ||
            subject.any { it.code !in 33..126 }
        ) {
            throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        }
        return subject
    }

    private fun createClientSecret(): String {
        val now = clock.instant()
        val claims =
            JWTClaimsSet
                .Builder()
                .issuer(teamId)
                .subject(clientIds.single())
                .audience(ISSUER)
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plusSeconds(300)))
                .build()
        val jwt =
            SignedJWT(
                JWSHeader
                    .Builder(JWSAlgorithm.ES256)
                    .keyID(keyId)
                    .type(com.nimbusds.jose.JOSEObjectType.JWT)
                    .build(),
                claims,
            )
        jwt.sign(ECDSASigner(checkNotNull(privateKey)))
        return jwt.serialize()
    }

    companion object {
        const val ISSUER = "https://appleid.apple.com"
        const val JWKS_URL = "https://appleid.apple.com/auth/keys"
        const val TOKEN_URL = "https://appleid.apple.com/auth/token"

        fun decoder(uri: String): JwtDecoder {
            val factory =
                SimpleClientHttpRequestFactory().apply {
                    setConnectTimeout(3000)
                    setReadTimeout(3000)
                }
            return NimbusJwtDecoder
                .withJwkSetUri(uri)
                .jwsAlgorithm(SignatureAlgorithm.ES256)
                .restOperations(RestTemplate(factory))
                .build()
                .apply { setJwtValidator { OAuth2TokenValidatorResult.success() } }
        }
    }
}

@Component
class AppleTokenVerifierFactory(
    restTemplateBuilder: RestTemplateBuilder,
    mapper: ObjectMapper,
    clock: Clock,
    @Value("\${app.oauth.apple.client-id:}") clientId: String,
    @Value("\${app.oauth.apple.team-id:}") teamId: String,
    @Value("\${app.oauth.apple.key-id:}") keyId: String,
    @Value("\${app.oauth.apple.private-key:}") pem: String,
    @Value("\${app.oauth.apple.jwks-url:https://appleid.apple.com/auth/keys}") jwksUrl: String,
    @Value("\${app.oauth.apple.token-url:https://appleid.apple.com/auth/token}") tokenUrl: String,
) {
    val verifier =
        AppleTokenVerifier(
            AppleTokenVerifier.decoder(jwksUrl),
            clientId
                .split(',')
                .map(String::trim)
                .filter(String::isNotEmpty)
                .toSet(),
            teamId,
            keyId,
            parsePrivateKey(pem),
            clock,
            mapper,
            restTemplateBuilder,
            tokenUrl,
        )

    private fun parsePrivateKey(value: String): ECPrivateKey? {
        if (value.isBlank()) return null
        val encoded =
            value
                .replace(
                    "-----BEGIN PRIVATE KEY-----",
                    "",
                ).replace("-----END PRIVATE KEY-----", "")
                .filterNot(Char::isWhitespace)
        return KeyFactory.getInstance("EC").generatePrivate(PKCS8EncodedKeySpec(Base64.getDecoder().decode(encoded))) as ECPrivateKey
    }
}

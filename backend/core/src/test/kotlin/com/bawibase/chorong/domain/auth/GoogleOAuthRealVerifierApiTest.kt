package com.bawibase.chorong.domain.auth

import com.bawibase.chorong.TestcontainersConfig
import com.bawibase.chorong.domain.auth.service.GoogleTokenConfiguration
import com.bawibase.chorong.domain.auth.service.GoogleTokenVerifier
import com.bawibase.chorong.domain.auth.service.TokenService
import com.bawibase.chorong.domain.user.AuthProvider
import com.bawibase.chorong.domain.user.entity.UserAuthEntity
import com.bawibase.chorong.domain.user.entity.UserEntity
import com.bawibase.chorong.domain.user.repository.UserAuthRepository
import com.bawibase.chorong.domain.user.repository.UserRepository
import com.fasterxml.jackson.databind.ObjectMapper
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.RSASSASigner
import com.nimbusds.jose.jwk.JWKSet
import com.nimbusds.jose.jwk.RSAKey
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import java.net.InetSocketAddress
import java.time.Clock
import java.time.Instant
import java.util.Date
import java.util.UUID
import kotlin.test.assertEquals

class LocalGoogleKeys : AutoCloseable {
    val key: RSAKey = RSAKeyGenerator(2048).keyID("google-test-key").generate()
    private val server =
        HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
            createContext("/keys") { exchange ->
                val bytes = JWKSet(key.toPublicJWK()).toString().toByteArray()
                exchange.responseHeaders.add("Content-Type", "application/json")
                exchange.sendResponseHeaders(200, bytes.size.toLong())
                exchange.responseBody.use { it.write(bytes) }
            }
            start()
        }
    val url get() = "http://127.0.0.1:${server.address.port}/keys"

    fun token(
        audience: String = "test-client",
        subject: String = UUID.randomUUID().toString(),
    ): String {
        val now = Instant.now()
        val claims =
            JWTClaimsSet
                .Builder()
                .issuer("https://accounts.google.com")
                .audience(audience)
                .subject(subject)
                .claim("email", "existing@example.com")
                .claim("email_verified", true)
                .issueTime(Date.from(now.minusSeconds(1)))
                .expirationTime(Date.from(now.plusSeconds(300)))
                .build()
        return SignedJWT(JWSHeader.Builder(JWSAlgorithm.RS256).keyID(key.keyID).build(), claims)
            .also {
                it.sign(RSASSASigner(key))
            }.serialize()
    }

    override fun close() = server.stop(0)
}

@TestConfiguration(proxyBeanMethods = false)
class LocalGoogleVerifierConfig {
    @Bean fun localGoogleKeys() = LocalGoogleKeys()

    @Bean @Primary
    fun localGoogleVerifier(keys: LocalGoogleKeys): GoogleTokenVerifier =
        GoogleTokenVerifier(GoogleTokenConfiguration.decoder(keys.url), setOf("test-client"), Clock.systemUTC())
}

@SpringBootTest(properties = ["spring.application.name=chorong-google-real-verifier-test"])
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import(TestcontainersConfig::class, LocalGoogleVerifierConfig::class)
class GoogleOAuthRealVerifierApiTest {
    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var mapper: ObjectMapper

    @Autowired lateinit var users: UserRepository

    @Autowired lateinit var auths: UserAuthRepository

    @Autowired lateinit var tokens: TokenService

    @Autowired lateinit var keys: LocalGoogleKeys

    @Test fun `signed token is verified end to end before guest conversion`() {
        users.saveAndFlush(UserEntity(email = "existing@example.com"))
        val userId = checkNotNull(users.saveAndFlush(UserEntity()).id)
        val device = UUID.randomUUID().toString()
        auths.saveAndFlush(UserAuthEntity(userId, AuthProvider.GUEST, device))
        val access = tokens.issue(userId, device).accessToken
        val sub = UUID.randomUUID().toString()
        val result =
            mvc
                .post("/api/v1/auth/oauth/google") {
                    header(HttpHeaders.AUTHORIZATION, "Bearer $access")
                    contentType = MediaType.APPLICATION_JSON
                    content = mapper.writeValueAsString(mapOf("idToken" to keys.token(subject = sub), "deviceUuid" to device))
                }.andExpect { status { isOk() } }
                .andReturn()
                .response
        assertEquals(userId, mapper.readTree(result.contentAsByteArray)["data"]["user"]["userId"].asLong())
        assertEquals(userId, checkNotNull(auths.findByProviderAndProviderUid(AuthProvider.GOOGLE, sub)).userId)
    }

    @Test fun `signed token for another audience cannot link guest`() {
        val userId = checkNotNull(users.saveAndFlush(UserEntity()).id)
        val device = UUID.randomUUID().toString()
        val access = tokens.issue(userId, device).accessToken
        val sub = UUID.randomUUID().toString()
        mvc
            .post("/api/v1/auth/oauth/google") {
                header(HttpHeaders.AUTHORIZATION, "Bearer $access")
                contentType = MediaType.APPLICATION_JSON
                content = mapper.writeValueAsString(mapOf("idToken" to keys.token("other-client", sub), "deviceUuid" to device))
            }.andExpect { status { isUnauthorized() } }
        assertEquals(null, auths.findByProviderAndProviderUid(AuthProvider.GOOGLE, sub))
    }
}

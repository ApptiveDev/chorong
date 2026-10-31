package com.bawibase.chorong.domain.auth

import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.auth.service.AppleTokenVerifier
import com.fasterxml.jackson.databind.ObjectMapper
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.ECDSASigner
import com.nimbusds.jose.crypto.ECDSAVerifier
import com.nimbusds.jose.jwk.Curve
import com.nimbusds.jose.jwk.ECKey
import com.nimbusds.jose.jwk.JWKSet
import com.nimbusds.jose.jwk.gen.ECKeyGenerator
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.Test
import org.springframework.boot.web.client.RestTemplateBuilder
import java.net.InetSocketAddress
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.Date
import java.util.concurrent.atomic.AtomicReference
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class AppleTokenVerifierTest {
    private val now = Instant.now()
    private val clock = Clock.fixed(now, ZoneOffset.UTC)

    @Test
    fun `verifies signed id token and exchanges authorization code`() {
        val key = ECKeyGenerator(Curve.P_256).keyID("apple-kid").generate()
        val returnedToken = AtomicReference(token(key, "apple-sub"))
        val form = AtomicReference("")
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/keys") { exchange ->
            val body = JWKSet(key.toPublicJWK()).toString().toByteArray()
            exchange.sendResponseHeaders(200, body.size.toLong())
            exchange.responseBody.use { it.write(body) }
        }
        server.createContext("/token") { exchange ->
            form.set(exchange.requestBody.bufferedReader().use { it.readText() })
            val body = """{"id_token":"${returnedToken.get()}"}""".toByteArray()
            exchange.sendResponseHeaders(200, body.size.toLong())
            exchange.responseBody.use { it.write(body) }
        }
        server.start()
        try {
            val verifier = verifier(server, key)
            assertEquals("apple-sub", verifier.verify(token(key, "apple-sub"), "single-use-code"))
            val request = form.get()
            assert(request.contains("grant_type=authorization_code"))
            assert(request.contains("code=single-use-code"))
            assert(request.contains("client_id=chorong.app"))
            val secret = request.substringAfter("client_secret=").substringBefore('&')
            val parsed = SignedJWT.parse(java.net.URLDecoder.decode(secret, Charsets.UTF_8))
            assertEquals("TEAM123", parsed.jwtClaimsSet.issuer)
            assertEquals("chorong.app", parsed.jwtClaimsSet.subject)
            assertEquals(AppleTokenVerifier.ISSUER, parsed.jwtClaimsSet.audience.single())
            assertEquals("apple-key", parsed.header.keyID)
            assert(parsed.verify(ECDSAVerifier(key.toECPublicKey())))
            returnedToken.set(token(key, "different-sub"))
            assertFailsWith<ApiV1Exception> { verifier.verify(token(key, "apple-sub"), "another-code") }
            assertFailsWith<ApiV1Exception> { verifier.verify("bad-token", "another-code") }
        } finally {
            server.stop(0)
        }
    }

    private fun verifier(
        server: HttpServer,
        key: ECKey,
    ) = AppleTokenVerifier(
        AppleTokenVerifier.decoder("http://127.0.0.1:${server.address.port}/keys"),
        setOf("chorong.app"),
        "TEAM123",
        "apple-key",
        key.toECPrivateKey(),
        clock,
        ObjectMapper(),
        RestTemplateBuilder(),
        "http://127.0.0.1:${server.address.port}/token",
    )

    private fun token(
        key: ECKey,
        subject: String,
    ): String {
        val claims =
            JWTClaimsSet
                .Builder()
                .issuer(AppleTokenVerifier.ISSUER)
                .audience("chorong.app")
                .subject(subject)
                .issueTime(Date.from(now.minusSeconds(10)))
                .expirationTime(Date.from(now.plusSeconds(300)))
                .build()
        val jwt = SignedJWT(JWSHeader.Builder(JWSAlgorithm.ES256).keyID(key.keyID).build(), claims)
        jwt.sign(ECDSASigner(key))
        return jwt.serialize()
    }
}

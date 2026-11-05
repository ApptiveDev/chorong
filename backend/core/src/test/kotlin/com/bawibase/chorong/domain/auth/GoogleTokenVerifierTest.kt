package com.bawibase.chorong.domain.auth

import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.auth.service.GoogleTokenConfiguration
import com.bawibase.chorong.domain.auth.service.GoogleTokenVerifier
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.MACSigner
import com.nimbusds.jose.crypto.RSASSASigner
import com.nimbusds.jose.jwk.JWKSet
import com.nimbusds.jose.jwk.RSAKey
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.Test
import java.net.InetSocketAddress
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.Date
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class GoogleTokenVerifierTest {
    private val now = Instant.parse("2026-01-01T00:00:00Z")
    private val clock = Clock.fixed(now, ZoneOffset.UTC)

    private fun claims() =
        JWTClaimsSet
            .Builder()
            .issuer("https://accounts.google.com")
            .audience("client-id")
            .subject("google-sub")
            .issueTime(Date.from(now.minusSeconds(30)))
            .expirationTime(Date.from(now.plusSeconds(300)))

    private fun signed(
        key: RSAKey,
        claims: JWTClaimsSet,
    ): String {
        val jwt = SignedJWT(JWSHeader.Builder(JWSAlgorithm.RS256).keyID(key.keyID).build(), claims)
        jwt.sign(RSASSASigner(key))
        return jwt.serialize()
    }

    private fun key(id: String): RSAKey = RSAKeyGenerator(2048).keyID(id).generate()

    @Test fun `signed token validates claims and refreshes rotated google keys`() {
        val first = key("first")
        val second = key("second")
        val keys = AtomicReference(JWKSet(first.toPublicJWK()).toString())
        val hits = AtomicInteger()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/keys") { exchange ->
            hits.incrementAndGet()
            val body = keys.get().toByteArray()
            exchange.responseHeaders.add("Content-Type", "application/json")
            exchange.responseHeaders.add("Cache-Control", "max-age=3600")
            exchange.sendResponseHeaders(200, body.size.toLong())
            exchange.responseBody.use { it.write(body) }
        }
        server.start()
        try {
            val decoder = GoogleTokenConfiguration.decoder("http://127.0.0.1:${server.address.port}/keys")
            val verifier = GoogleTokenVerifier(decoder, setOf("client-id"), clock)
            assertEquals("google-sub", verifier.verify(signed(first, claims().build())))
            assertEquals("google-sub", verifier.verify(signed(first, claims().issuer("accounts.google.com").build())))
            val invalid =
                listOf(
                    claims().issuer("https://wrong.example").build(),
                    claims().audience("wrong-client").build(),
                    claims().expirationTime(Date.from(now)).build(),
                    claims().expirationTime(null).build(),
                    claims().issueTime(null).build(),
                    claims().issueTime(Date.from(now.plusSeconds(61))).build(),
                    claims().notBeforeTime(Date.from(now.plusSeconds(1))).build(),
                    claims().subject("").build(),
                    claims().subject("비정상").build(),
                    claims().audience(emptyList()).build(),
                    claims().audience(listOf("client-id", "other-client")).claim("azp", "client-id").build(),
                    claims().claim("azp", "other-client").build(),
                )
            for (bad in invalid) assertFailsWith<ApiV1Exception> { verifier.verify(signed(first, bad)) }
            val wrongKey = key("first")
            assertFailsWith<ApiV1Exception> { verifier.verify(signed(wrongKey, claims().build())) }
            val hmac = SignedJWT(JWSHeader(JWSAlgorithm.HS256), claims().build()).apply { sign(MACSigner(ByteArray(32) { 1 })) }
            assertFailsWith<ApiV1Exception> { verifier.verify(hmac.serialize()) }
            keys.set(JWKSet(second.toPublicJWK()).toString())
            assertEquals("google-sub", verifier.verify(signed(second, claims().build())))
            assertTrue(hits.get() >= 2)
            assertFailsWith<IllegalStateException> { GoogleTokenVerifier(decoder, emptySet(), clock).verify("invalid") }
        } finally {
            server.stop(0)
        }
    }

    @Test fun `remote jwks failure is not treated as a valid token`() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/keys") { exchange ->
            exchange.sendResponseHeaders(503, -1)
            exchange.close()
        }
        server.start()
        try {
            val decoder = GoogleTokenConfiguration.decoder("http://127.0.0.1:${server.address.port}/keys")
            val verifier = GoogleTokenVerifier(decoder, setOf("client-id"), clock)
            assertFailsWith<IllegalStateException> { verifier.verify(signed(key("new-key"), claims().build())) }
        } finally {
            server.stop(0)
        }
    }
}

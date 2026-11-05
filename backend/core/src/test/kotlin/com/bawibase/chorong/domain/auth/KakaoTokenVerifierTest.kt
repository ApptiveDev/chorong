package com.bawibase.chorong.domain.auth

import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.auth.service.KakaoTokenVerifier
import com.fasterxml.jackson.databind.ObjectMapper
import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.Test
import org.springframework.boot.web.client.RestTemplateBuilder
import java.net.InetSocketAddress
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class KakaoTokenVerifierTest {
    private val mapper = ObjectMapper()

    private fun verifier(
        status: Int,
        body: String,
        actualAppId: Long = 1234,
    ): Pair<KakaoTokenVerifier, HttpServer> {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/access-info") { exchange ->
            val response = """{"id":12345,"app_id":$actualAppId,"expires_in":3600}""".toByteArray()
            exchange.sendResponseHeaders(200, response.size.toLong())
            exchange.responseBody.use { it.write(response) }
        }
        server.createContext("/v2/user/me") { exchange ->
            val token = exchange.requestHeaders.getFirst("Authorization")
            val response = if (token == "Bearer access-token") body else "{}"
            val code = if (token == "Bearer access-token") status else 401
            exchange.sendResponseHeaders(code, response.toByteArray().size.toLong())
            exchange.responseBody.use { it.write(response.toByteArray()) }
        }
        server.start()
        val endpoint = "http://127.0.0.1:${server.address.port}/v2/user/me"
        val tokenInfo = "http://127.0.0.1:${server.address.port}/access-info"
        val instance = KakaoTokenVerifier(RestTemplateBuilder(), mapper, "1234", tokenInfo, endpoint)
        return instance to server
    }

    @Test
    fun `token from another Kakao app is rejected`() {
        val (verifier, server) = verifier(200, """{"id":12345}""", actualAppId = 9999)
        try {
            assertFailsWith<ApiV1Exception> { verifier.verify("access-token") }
        } finally {
            server.stop(0)
        }
    }

    @Test
    fun `valid access token resolves Kakao user id`() {
        val (verifier, server) = verifier(200, """{"id":12345,"connected_at":"2025-01-01T00:00:00Z"}""")
        try {
            assertEquals("12345", verifier.verify("access-token"))
        } finally {
            server.stop(0)
        }
    }

    @Test
    fun `invalid token is unauthorized and Kakao server failure is internal`() {
        val (invalid, invalidServer) = verifier(401, "{}")
        try {
            assertFailsWith<ApiV1Exception> { invalid.verify("access-token") }
        } finally {
            invalidServer.stop(0)
        }
        val (failure, failureServer) = verifier(503, "{}")
        try {
            assertFailsWith<IllegalStateException> { failure.verify("access-token") }
        } finally {
            failureServer.stop(0)
        }
    }

    @Test
    fun `missing app key fails closed`() {
        val verifier =
            KakaoTokenVerifier(
                RestTemplateBuilder(),
                mapper,
                "",
                "https://kapi.kakao.com/v1/user/access_token_info",
                "https://kapi.kakao.com/v2/user/me",
            )
        assertFailsWith<IllegalStateException> { verifier.verify("access-token") }
    }
}

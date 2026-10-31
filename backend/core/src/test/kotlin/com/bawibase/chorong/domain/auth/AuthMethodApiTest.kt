package com.bawibase.chorong.domain.auth

import com.bawibase.chorong.TestcontainersConfig
import com.bawibase.chorong.domain.auth.service.GoogleTokenVerifier
import com.bawibase.chorong.domain.auth.service.TokenService
import com.bawibase.chorong.domain.user.AuthProvider
import com.bawibase.chorong.domain.user.UserStatus
import com.bawibase.chorong.domain.user.entity.UserAuthEntity
import com.bawibase.chorong.domain.user.entity.UserEntity
import com.bawibase.chorong.domain.user.repository.UserAuthRepository
import com.bawibase.chorong.domain.user.repository.UserRepository
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.post
import java.util.UUID
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals

@SpringBootTest(properties = ["spring.application.name=chorong-auth-method-test"])
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import(TestcontainersConfig::class, EmailSenderTestConfig::class)
class AuthMethodApiTest {
    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var mapper: ObjectMapper

    @Autowired lateinit var users: UserRepository

    @Autowired lateinit var auths: UserAuthRepository

    @Autowired lateinit var tokens: TokenService

    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var sender: TestEmailSender

    @MockitoBean lateinit var google: GoogleTokenVerifier

    @BeforeEach fun reset() {
        sender.sent.clear()
        sender.fail = false
    }

    private fun member(vararg providers: Pair<AuthProvider, String>): Pair<Long, String> {
        val user = UserEntity(nickname = "member").apply { status = UserStatus.ACTIVE }
        val id = checkNotNull(users.saveAndFlush(user).id)
        providers.forEach { (provider, uid) -> auths.saveAndFlush(UserAuthEntity(id, provider, uid)) }
        return id to tokens.issue(id, UUID.randomUUID().toString()).accessToken
    }

    private fun requestLink(
        access: String,
        provider: String,
        body: Map<String, Any?> = mapOf("idToken" to "valid-id-token"),
        expected: Int = 200,
    ) = mvc
        .post("/api/v1/auth/link/$provider") {
            header(HttpHeaders.AUTHORIZATION, "Bearer $access")
            contentType = MediaType.APPLICATION_JSON
            content = mapper.writeValueAsString(body)
        }.andExpect { status { isEqualTo(expected) } }
        .andReturn()
        .response

    @Test
    fun `links verified provider and hides ownership conflict`() {
        val (owner, ownerAccess) = member(AuthProvider.PASSWORD to "owner-${UUID.randomUUID()}@example.com")
        val (_, otherAccess) = member(AuthProvider.PASSWORD to "other-${UUID.randomUUID()}@example.com")
        val subject = "apple-${UUID.randomUUID()}"
        `when`(google.verify("valid-id-token")).thenReturn(subject)

        val linked = mapper.readTree(requestLink(ownerAccess, "google").contentAsByteArray)
        assertEquals(listOf("EMAIL", "GOOGLE"), mapper.convertValue(linked["data"]["providers"], List::class.java))
        assertEquals(owner, auths.findByProviderAndProviderUid(AuthProvider.GOOGLE, subject)?.userId)
        requestLink(otherAccess, "google", expected = 409)
        assertEquals(
            1L,
            jdbc.queryForObject(
                "SELECT count(*) FROM chorong_dev.user_auth WHERE provider='GOOGLE' AND provider_uid=?",
                Long::class.java,
                subject,
            ),
        )
    }

    @Test
    fun `email verification links member email and verification belongs to caller`() {
        val (owner, access) = member(AuthProvider.GOOGLE to "google-${UUID.randomUUID()}")
        val email = "link-${UUID.randomUUID()}@example.com"
        val started =
            mvc
                .post("/api/v1/auth/email/signup") {
                    header(HttpHeaders.AUTHORIZATION, "Bearer $access")
                    contentType = MediaType.APPLICATION_JSON
                    content = mapper.writeValueAsString(mapOf("email" to email, "password" to "password123"))
                }.andExpect { status { isOk() } }
                .andReturn()
        val verificationId = mapper.readTree(started.response.contentAsByteArray)["data"]["verificationId"].asText()
        val code = sender.sent.single().second
        mvc
            .post("/api/v1/auth/email/verify") {
                header(HttpHeaders.AUTHORIZATION, "Bearer $access")
                contentType = MediaType.APPLICATION_JSON
                content = mapper.writeValueAsString(mapOf("verificationId" to verificationId, "code" to code))
            }.andExpect { status { isOk() } }
        val result = mapper.readTree(requestLink(access, "email", mapOf("verificationId" to verificationId)).contentAsByteArray)
        assertEquals(listOf("EMAIL", "GOOGLE"), mapper.convertValue(result["data"]["providers"], List::class.java))
        assertEquals(owner, auths.findByProviderAndProviderUid(AuthProvider.PASSWORD, email)?.userId)
        val (_, strangerAccess) = member(AuthProvider.GOOGLE to "google-${UUID.randomUUID()}")
        requestLink(strangerAccess, "email", mapOf("verificationId" to verificationId), expected = 400)
    }

    @Test
    fun `cannot unlink last provider and concurrent unlink leaves one provider`() {
        val (_, oneAccess) = member(AuthProvider.PASSWORD to "one-${UUID.randomUUID()}@example.com")
        mvc
            .delete("/api/v1/auth/link/email") {
                header(HttpHeaders.AUTHORIZATION, "Bearer $oneAccess")
            }.andExpect { status { isBadRequest() } }

        val (_, access) =
            member(
                AuthProvider.PASSWORD to "two-${UUID.randomUUID()}@example.com",
                AuthProvider.GOOGLE to "google-${UUID.randomUUID()}",
            )
        val barrier = CyclicBarrier(2)
        val pool = Executors.newFixedThreadPool(2)
        try {
            val results =
                listOf("email", "google")
                    .map { provider ->
                        pool.submit<Int> {
                            barrier.await(15, TimeUnit.SECONDS)
                            mvc
                                .delete("/api/v1/auth/link/$provider") {
                                    header(HttpHeaders.AUTHORIZATION, "Bearer $access")
                                }.andReturn()
                                .response.status
                        }
                    }.map { it.get(45, TimeUnit.SECONDS) }
                    .sorted()
            assertEquals(listOf(200, 400), results)
        } finally {
            pool.shutdownNow()
        }
    }
}

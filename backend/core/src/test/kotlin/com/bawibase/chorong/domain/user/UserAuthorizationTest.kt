package com.bawibase.chorong.domain.user

import com.bawibase.chorong.TestcontainersConfig
import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.api.ApiResponse
import com.bawibase.chorong.config.CurrentUserId
import com.bawibase.chorong.domain.auth.service.AuthService
import com.bawibase.chorong.domain.auth.service.SocialIdentity
import com.bawibase.chorong.domain.auth.service.TokenService
import com.bawibase.chorong.domain.housing.entity.HousingProfileEntity
import com.bawibase.chorong.domain.housing.repository.HousingProfileRepository
import com.bawibase.chorong.domain.user.entity.UserEntity
import com.bawibase.chorong.domain.user.entity.UserWalletEntity
import com.bawibase.chorong.domain.user.repository.UserAuthRepository
import com.bawibase.chorong.domain.user.repository.UserRepository
import com.bawibase.chorong.domain.user.repository.UserWalletRepository
import com.bawibase.chorong.domain.user.service.UserAccessService
import jakarta.persistence.EntityManager
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestComponent
import org.springframework.context.annotation.Import
import org.springframework.http.HttpHeaders
import org.springframework.security.core.Authentication
import org.springframework.security.oauth2.jose.jws.MacAlgorithm
import org.springframework.security.oauth2.jwt.JwsHeader
import org.springframework.security.oauth2.jwt.JwtClaimsSet
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.oauth2.jwt.JwtEncoder
import org.springframework.security.oauth2.jwt.JwtEncoderParameters
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

@SpringBootTest
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import(TestcontainersConfig::class, UserAuthorizationTest.Probe::class)
@Transactional
class UserAuthorizationTest {
    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var auth: AuthService

    @Autowired lateinit var tokens: TokenService

    @Autowired lateinit var users: UserRepository

    @Autowired lateinit var auths: UserAuthRepository

    @Autowired lateinit var wallets: UserWalletRepository

    @Autowired lateinit var profiles: HousingProfileRepository

    @Autowired lateinit var encoder: JwtEncoder

    @Autowired lateinit var decoder: JwtDecoder

    @Autowired lateinit var access: UserAccessService

    @Autowired lateinit var entityManager: EntityManager

    private val guestPath = "/api/v1/authorization-probe"
    private val memberPath = "/api/v1/auth/link/authorization-probe/status"

    private fun guest(): Pair<Long, String> {
        val token = auth.guestSignUp(UUID.randomUUID().toString()).accessToken
        return decoder.decode(token).subject.toLong() to token
    }

    private fun signed(
        subject: String?,
        role: String? = null,
    ): String {
        val now = Instant.now()
        val builder =
            JwtClaimsSet
                .builder()
                .issuer(TokenService.ISSUER)
                .issuedAt(now)
                .expiresAt(now.plusSeconds(600))
        if (subject != null) builder.subject(subject)
        if (role != null) builder.claim("role", role)
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), builder.build())).tokenValue
    }

    @Test fun `guest status and role allow authenticated access but reject member routes`() {
        val (id, token) = guest()
        assertEquals(UserStatus.GUEST, users.findById(id).orElseThrow().status)
        assertEquals("GUEST", decoder.decode(token).getClaimAsString("role"))
        mvc.get(guestPath) { header(HttpHeaders.AUTHORIZATION, "Bearer $token") }.andExpect {
            status { isOk() }
            jsonPath("$.data.authorities[0]") { value("ROLE_GUEST") }
        }
        mvc.get(memberPath) { header(HttpHeaders.AUTHORIZATION, "Bearer $token") }.andExpect {
            status { isForbidden() }
            jsonPath("$.error.code") { value("MEMBER_ONLY") }
        }
        mvc.get(memberPath).andExpect {
            status { isUnauthorized() }
            jsonPath("$.error.code") { value("UNAUTHORIZED") }
        }
    }

    @Test fun `all member-only OpenAPI routes reject guest before controller dispatch`() {
        val (_, token) = guest()
        val routes =
            listOf(
                "/api/v1/housings/explore",
                "/api/v1/housings/7",
                "/api/v1/housings/7/like",
                "/api/v1/blocks",
                "/api/v1/blocks/7",
                "/api/v1/reports",
            )
        for (route in routes) {
            mvc.get(route) { header(HttpHeaders.AUTHORIZATION, "Bearer $token") }.andExpect {
                status { isForbidden() }
                jsonPath("$.error.code") { value("MEMBER_ONLY") }
            }
        }
        // 내 하우징 읽기는 회원 전용 규칙에서 제외한다. 게스트도 200이다.
        mvc.get("/api/v1/housings/me") { header(HttpHeaders.AUTHORIZATION, "Bearer $token") }.andExpect { status { isOk() } }
        mvc.delete("/api/v1/users/me") { header(HttpHeaders.AUTHORIZATION, "Bearer $token") }.andExpect {
            status { isForbidden() }
            jsonPath("$.error.code") { value("MEMBER_ONLY") }
        }
        mvc.delete("/api/v1/users/me").andExpect { status { isUnauthorized() } }
    }

    @Test fun `old token without role uses database state and claimed member cannot elevate guest`() {
        val (id, _) = guest()
        val old = signed(id.toString())
        mvc.get(guestPath) { header(HttpHeaders.AUTHORIZATION, "Bearer $old") }.andExpect { status { isOk() } }
        val forgedRole = signed(id.toString(), "MEMBER")
        mvc.get(memberPath) { header(HttpHeaders.AUTHORIZATION, "Bearer $forgedRole") }.andExpect {
            status { isForbidden() }
            jsonPath("$.error.code") { value("MEMBER_ONLY") }
        }
    }

    @Test fun `guest conversion changes old token access without replacing user or assets`() {
        val (id, old) = guest()
        wallets.saveAndFlush(UserWalletEntity(userId = id, coin = 321))
        profiles.saveAndFlush(HousingProfileEntity(userId = id))
        val identity = SocialIdentity(AuthProvider.GOOGLE, "test-${UUID.randomUUID()}")
        val new = auth.socialLogin(identity, id, null).accessToken
        users.flush()
        assertEquals(id, decoder.decode(new).subject.toLong())
        assertEquals("MEMBER", decoder.decode(new).getClaimAsString("role"))
        assertEquals(UserStatus.ACTIVE, users.findById(id).orElseThrow().status)
        assertEquals(321L, wallets.findById(id).orElseThrow().coin)
        assertEquals(id, profiles.findById(id).orElseThrow().userId)
        assertEquals(2, auths.findAllByUserId(id).size)
        mvc.get(memberPath) { header(HttpHeaders.AUTHORIZATION, "Bearer $old") }.andExpect {
            status { isOk() }
            jsonPath("$.data.authorities[0]") { value("ROLE_MEMBER") }
        }
    }

    @Test fun `withdrawal rejects existing guest and member tokens on new and old APIs`() {
        val (id, old) = guest()
        users.findById(id).orElseThrow().status = UserStatus.WITHDRAWN
        users.flush()
        mvc.get(guestPath) { header(HttpHeaders.AUTHORIZATION, "Bearer $old") }.andExpect {
            status { isUnauthorized() }
            jsonPath("$.error.code") { value("UNAUTHORIZED") }
        }
        mvc.get("/api/auth/me") { header(HttpHeaders.AUTHORIZATION, "Bearer $old") }.andExpect {
            status { isUnauthorized() }
            jsonPath("$.code") { value("USER_WITHDRAWN") }
        }
        assertFailsWith<ApiException> { tokens.issue(id, null) }
    }

    @Test fun `member token loses membership when current state is guest`() {
        val (id, _) = guest()
        val user = users.findById(id).orElseThrow()
        user.status = UserStatus.ACTIVE
        users.flush()
        val memberToken = tokens.issue(id, null).accessToken
        mvc.get(memberPath) { header(HttpHeaders.AUTHORIZATION, "Bearer $memberToken") }.andExpect { status { isOk() } }
        user.status = UserStatus.GUEST
        users.flush()
        mvc.get(memberPath) { header(HttpHeaders.AUTHORIZATION, "Bearer $memberToken") }.andExpect {
            status { isForbidden() }
            jsonPath("$.error.code") { value("MEMBER_ONLY") }
        }
        user.status = UserStatus.WITHDRAWN
        users.flush()
        mvc.get(memberPath) { header(HttpHeaders.AUTHORIZATION, "Bearer $memberToken") }.andExpect { status { isUnauthorized() } }
    }

    @Test fun `invalid missing deleted subjects cannot authenticate`() {
        val (id, _) = guest()
        for (subject in listOf(null, "not-a-user", "0", "-1", Long.MAX_VALUE.toString())) {
            mvc.get(guestPath) { header(HttpHeaders.AUTHORIZATION, "Bearer ${signed(subject)}") }.andExpect { status { isUnauthorized() } }
        }
        val detached = users.saveAndFlush(UserEntity())
        val token = signed(checkNotNull(detached.id).toString())
        users.delete(detached)
        users.flush()
        mvc.get(guestPath) { header(HttpHeaders.AUTHORIZATION, "Bearer $token") }.andExpect { status { isUnauthorized() } }
        assertEquals(UserRole.GUEST, access.role(id))
    }

    @Test fun `settings default safely and preserve existing nickname and saved state`() {
        val originalName = "가".repeat(30)
        val user = users.saveAndFlush(UserEntity(nickname = originalName))
        assertFalse(user.pushEnabled)
        assertFalse(user.onboardingCompleted)
        assertEquals(0, user.streakDays)
        assertNull(user.lastStudyDate)
        user.pushEnabled = true
        user.onboardingCompleted = true
        user.streakDays = 2
        user.lastStudyDate = LocalDate.of(2026, 10, 31)
        users.flush()
        entityManager.clear()
        val stored = users.findById(checkNotNull(user.id)).orElseThrow()
        assertEquals(originalName, stored.nickname)
        assertTrue(stored.pushEnabled)
        assertTrue(stored.onboardingCompleted)
        assertEquals(2, stored.streakDays)
        assertEquals(LocalDate.of(2026, 10, 31), stored.lastStudyDate)
    }

    @TestComponent
    @RestController
    class Probe {
        @GetMapping("/api/v1/authorization-probe", "/api/v1/auth/link/authorization-probe/status")
        fun role(
            @CurrentUserId userId: Long,
            authentication: Authentication,
        ) = ApiResponse(mapOf("userId" to userId, "authorities" to authentication.authorities.map { it.authority }))
    }
}

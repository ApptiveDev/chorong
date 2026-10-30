package com.bawibase.chorong.config

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiResponse
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.common.api.PageMeta
import com.bawibase.chorong.common.api.PagedResponse
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import org.junit.jupiter.api.Test
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.boot.test.context.TestComponent
import org.springframework.context.annotation.Import
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.security.access.AccessDeniedException
import org.springframework.security.oauth2.core.OAuth2Error
import org.springframework.security.oauth2.jwt.BadJwtException
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.oauth2.jwt.JwtValidationException
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.Instant
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@WebMvcTest(ApiContractTest.Probe::class)
@Import(SecurityConfig::class, ApiSecurityErrors::class, ApiExceptionHandler::class, ApiContractTest.Probe::class)
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
class ApiContractTest {
    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var securityErrors: ApiSecurityErrors

    @MockitoBean lateinit var decoder: JwtDecoder

    @MockitoBean lateinit var userJwtAuthenticationConverter: UserJwtAuthenticationConverter

    @Test
    fun `v1 success envelopes are explicit and old responses remain unwrapped`() {
        mvc.get("/api/v1/contract/data") { with(jwt()) }.andExpect {
            status { isOk() }
            jsonPath("$.data.value") { value(7) }
        }
        mvc.get("/api/v1/contract/page") { with(jwt()) }.andExpect {
            status { isOk() }
            jsonPath("$.data.items[0]") { value(7) }
            content { json("""{"data":{"items":[7]},"meta":{"nextCursor":null}}""", true) }
        }
        mvc.get("/api/contract/raw") { with(jwt()) }.andExpect {
            status { isOk() }
            jsonPath("$.value") { value(7) }
            jsonPath("$.data") { doesNotExist() }
        }
    }

    @Test
    fun `mvc domain errors expose only contract fields and preserve old shape`() {
        mvc.get("/api/v1/contract/legacy-error") { with(jwt()) }.andExpect {
            status { isBadRequest() }
            jsonPath("$.error.code") { value("VALIDATION_FAILED") }
            jsonPath("$.error.fields[0].field") { value("response") }
            jsonPath("$.error.secret") { doesNotExist() }
            jsonPath("$.details") { doesNotExist() }
        }
        mvc.get("/api/contract/legacy-error") { with(jwt()) }.andExpect {
            status { isBadRequest() }
            jsonPath("$.code") { value("INVALID_QUIZ_RESPONSE") }
            jsonPath("$.error") { doesNotExist() }
        }
        mvc.get("/api/v1/contract/legacy-locked") { with(jwt()) }.andExpect {
            status { isLocked() }
            jsonPath("$.error.retryAfter") { value(90) }
        }
        mvc.get("/api/contract/legacy-locked") { with(jwt()) }.andExpect {
            status { isUnauthorized() }
            jsonPath("$.code") { value("ACCOUNT_LOCKED") }
        }
    }

    @Test
    fun `domain status and optional error fields match contract`() {
        for ((code, status) in listOf(
            ApiErrorCode.VALIDATION_FAILED to 400,
            ApiErrorCode.UNAUTHORIZED to 401,
            ApiErrorCode.MEMBER_ONLY to 403,
            ApiErrorCode.NOT_FOUND to 404,
            ApiErrorCode.CONFLICT to 409,
            ApiErrorCode.ACCOUNT_LOCKED to 423,
            ApiErrorCode.RATE_LIMITED to 429,
            ApiErrorCode.INTERNAL to 500,
        )) {
            mvc.get("/api/v1/contract/error/${code.name}") { with(jwt()) }.andExpect {
                status { isEqualTo(status) }
                jsonPath("$.error.code") { value(code.name) }
                jsonPath("$.error.details") { doesNotExist() }
            }
        }
        mvc.get("/api/v1/contract/error/LESSON_LOCKED") { with(jwt()) }.andExpect {
            status { isForbidden() }
            jsonPath("$.error.unlocksAt") { value("2026-11-01T00:00:00Z") }
        }
        mvc.get("/api/v1/contract/error/RATE_LIMITED") { with(jwt()) }.andExpect {
            status { isTooManyRequests() }
            jsonPath("$.error.retryAfter") { value(90) }
        }
    }

    @Test
    fun `body validation and malformed JSON use v1 fields without rejected values`() {
        mvc
            .post("/api/v1/contract/body") {
                with(jwt())
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":""}"""
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.error.code") { value("VALIDATION_FAILED") }
                jsonPath("$.error.fields[0].field") { value("name") }
            }
        for (body in listOf("{", "{}")) {
            mvc
                .post("/api/v1/contract/body") {
                    with(jwt())
                    contentType = MediaType.APPLICATION_JSON
                    content = body
                }.andExpect {
                    status { isBadRequest() }
                    jsonPath("$.error.code") { value("VALIDATION_FAILED") }
                }
        }
        mvc
            .post("/api/contract/body") {
                with(jwt())
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":""}"""
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("VALIDATION") }
            }
    }

    @Test
    fun `missing query header and type mismatch are validation errors`() {
        for (route in listOf("query", "header", "query?size=oops")) {
            mvc.get("/api/v1/contract/$route") { with(jwt()) }.andExpect {
                status { isBadRequest() }
                jsonPath("$.error.code") { value("VALIDATION_FAILED") }
            }
        }
        mvc.get("/api/v1/contract/missing-route") { with(jwt()) }.andExpect {
            status { isNotFound() }
            jsonPath("$.error.code") { value("NOT_FOUND") }
        }
        mvc.post("/api/v1/contract/raw") { with(jwt()) }.andExpect {
            status { isMethodNotAllowed() }
            jsonPath("$.error") { exists() }
        }
        mvc.get("/api/v1/contract/denied") { with(jwt()) }.andExpect {
            status { isForbidden() }
            jsonPath("$.error.code") { value("FORBIDDEN") }
        }
        mvc.get("/api/v1/contract/crash") { with(jwt()) }.andExpect {
            status { isInternalServerError() }
            jsonPath("$.error.message") { value("서버 오류가 발생했습니다.") }
        }
    }

    @Test
    fun `security missing invalid and expired bearer tokens use versioned envelopes`() {
        mvc.get("/api/v1/contract/raw").andExpect {
            status { isUnauthorized() }
            jsonPath("$.error.code") { value("UNAUTHORIZED") }
        }
        mvc.get("/api/contract/raw").andExpect {
            status { isUnauthorized() }
            jsonPath("$.code") { value("UNAUTHORIZED") }
            jsonPath("$.error") { doesNotExist() }
        }
        `when`(decoder.decode("invalid")).thenThrow(BadJwtException("invalid token"))
        mvc.get("/api/v1/contract/raw") { header(HttpHeaders.AUTHORIZATION, "Bearer invalid") }.andExpect {
            status { isUnauthorized() }
            jsonPath("$.error.code") { value("UNAUTHORIZED") }
        }
        `when`(
            decoder.decode("expired"),
        ).thenThrow(JwtValidationException("expired", listOf(OAuth2Error("invalid_token", "Jwt expired at 2026-10-30T00:00:00Z", null))))
        mvc.get("/api/v1/contract/raw") { header(HttpHeaders.AUTHORIZATION, "Bearer expired") }.andExpect {
            status { isUnauthorized() }
            jsonPath("$.error.code") { value("AUTH_TOKEN_EXPIRED") }
        }
        mvc.get("/api/contract/raw") { header(HttpHeaders.AUTHORIZATION, "Bearer expired") }.andExpect {
            status { isUnauthorized() }
            jsonPath("$.code") { value("UNAUTHORIZED") }
        }
    }

    @Test
    fun `filter access denial uses JSON and version boundary excludes v10`() {
        val request = MockHttpServletRequest("GET", "/api/v1/contract/raw")
        val response = MockHttpServletResponse()
        securityErrors.accessDeniedHandler.handle(request, response, AccessDeniedException("internal reason"))
        assertEquals(403, response.status)
        assertTrue(response.contentAsString.contains("FORBIDDEN"))
        assertFalse(response.contentAsString.contains("internal reason"))
        assertFalse(ApiContract.isV1(MockHttpServletRequest("GET", "/api/v10/contract")))
        val context = MockHttpServletRequest("GET", "/context/api/v1/contract").apply { contextPath = "/context" }
        assertTrue(ApiContract.isV1(context))
    }

    data class Input(
        @field:NotBlank val name: String,
    )

    @TestComponent
    @RestController
    @RequestMapping("/api/v1/contract", "/api/contract")
    class Probe {
        @GetMapping("/raw")
        fun raw() = mapOf("value" to 7)

        @GetMapping("/data")
        fun data() = ApiResponse(raw())

        @GetMapping("/page")
        fun page() = PagedResponse(mapOf("items" to listOf(7)), PageMeta(null))

        @GetMapping("/legacy-error")
        fun legacy(): Nothing =
            throw ApiException(
                ErrorCode.INVALID_QUIZ_RESPONSE,
                mapOf(
                    "field" to "response",
                    "secret" to "private",
                ),
            )

        @GetMapping("/legacy-locked")
        fun locked(): Nothing = throw ApiException(ErrorCode.ACCOUNT_LOCKED, mapOf("retryAfter" to 90))

        @GetMapping("/error/{code}")
        fun error(
            @PathVariable code: ApiErrorCode,
        ): Nothing =
            throw ApiV1Exception(
                code,
                retryAfter = if (code in listOf(ApiErrorCode.RATE_LIMITED, ApiErrorCode.ACCOUNT_LOCKED)) 90 else null,
                unlocksAt = if (code == ApiErrorCode.LESSON_LOCKED) Instant.parse("2026-11-01T00:00:00Z") else null,
            )

        @PostMapping("/body")
        fun body(
            @Valid @RequestBody input: Input,
        ) = ApiResponse(input)

        @GetMapping("/query")
        fun query(
            @RequestParam size: Int,
        ) = ApiResponse(size)

        @GetMapping("/header")
        fun header(
            @RequestHeader("Required-Header") value: String,
        ) = ApiResponse(value)

        @GetMapping("/denied")
        fun denied(): Nothing = throw AccessDeniedException("private")

        @GetMapping("/crash")
        fun crash(): Nothing = throw IllegalStateException("private implementation detail")
    }
}

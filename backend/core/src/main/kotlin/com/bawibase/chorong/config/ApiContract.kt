package com.bawibase.chorong.config

import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.common.api.ApiError
import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiErrorResponse
import com.fasterxml.jackson.databind.ObjectMapper
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.MediaType
import org.springframework.security.oauth2.jwt.JwtValidationException
import org.springframework.security.oauth2.server.resource.web.access.BearerTokenAccessDeniedHandler
import org.springframework.security.web.AuthenticationEntryPoint
import org.springframework.security.web.access.AccessDeniedHandler
import org.springframework.stereotype.Component

object ApiContract {
    fun isV1(request: HttpServletRequest): Boolean {
        val path = request.requestURI.removePrefix(request.contextPath)
        return path == "/api/v1" || path.startsWith("/api/v1/")
    }
}

@Component
class ApiSecurityErrors(
    private val mapper: ObjectMapper,
) {
    private val legacyDenied = BearerTokenAccessDeniedHandler()

    val authenticationEntryPoint =
        AuthenticationEntryPoint { request, response, exception ->
            val expired =
                generateSequence<Throwable>(exception) { it.cause }
                    .filterIsInstance<JwtValidationException>()
                    .any { validation -> validation.errors.any { it.description.startsWith("Jwt expired at") } }
            val code = if (expired) ApiErrorCode.AUTH_TOKEN_EXPIRED else ApiErrorCode.UNAUTHORIZED
            val accountError =
                generateSequence<Throwable>(exception) { it.cause }
                    .filterIsInstance<AccountAuthenticationException>()
                    .firstOrNull()
            write(request, response, code, accountError?.legacyCode)
        }

    val accessDeniedHandler =
        AccessDeniedHandler { request, response, exception ->
            if (ApiContract.isV1(request)) {
                val code = if (request.getAttribute(MEMBER_REQUIRED) == true) ApiErrorCode.MEMBER_ONLY else ApiErrorCode.FORBIDDEN
                write(request, response, code)
            } else {
                legacyDenied.handle(request, response, exception)
            }
        }

    private fun write(
        request: HttpServletRequest,
        response: HttpServletResponse,
        code: ApiErrorCode,
        legacyCode: ErrorCode? = null,
    ) {
        response.status = code.status.value()
        response.contentType = MediaType.APPLICATION_JSON_VALUE
        response.characterEncoding = "UTF-8"
        val body =
            if (ApiContract.isV1(request)) {
                ApiErrorResponse(ApiError(code))
            } else {
                mapOf("code" to (legacyCode?.name ?: "UNAUTHORIZED"), "message" to (legacyCode?.message ?: "인증이 필요합니다."))
            }
        mapper.writeValue(response.writer, body)
    }

    companion object {
        const val MEMBER_REQUIRED = "chorong.security.memberRequired"
    }
}

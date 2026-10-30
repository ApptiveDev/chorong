package com.bawibase.chorong.config

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.common.ErrorKind
import com.bawibase.chorong.common.api.ApiError
import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.common.api.FieldViolation
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.ConstraintViolationException
import org.slf4j.LoggerFactory
import org.springframework.beans.TypeMismatchException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.security.access.AccessDeniedException
import org.springframework.web.ErrorResponse
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.MissingRequestHeaderException
import org.springframework.web.bind.MissingServletRequestParameterException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.method.annotation.HandlerMethodValidationException
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException
import java.time.Instant
import java.time.OffsetDateTime

@RestControllerAdvice
class ApiExceptionHandler {
    private val log = LoggerFactory.getLogger(javaClass)

    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun handleValidation(
        e: MethodArgumentNotValidException,
        request: HttpServletRequest,
    ): ResponseEntity<Map<String, Any>> {
        if (ApiContract.isV1(request)) {
            return v1(
                ApiError(
                    ApiErrorCode.VALIDATION_FAILED,
                    fields = e.bindingResult.fieldErrors.map { FieldViolation(it.field, it.defaultMessage ?: "invalid") },
                ),
            )
        }
        val fields =
            e.bindingResult.fieldErrors.associate {
                it.field to (it.defaultMessage ?: "invalid")
            }
        return ResponseEntity
            .status(HttpStatus.BAD_REQUEST)
            .body(mapOf("code" to "VALIDATION", "message" to "요청 값이 올바르지 않습니다.", "fields" to fields))
    }

    @ExceptionHandler(MissingRequestHeaderException::class)
    fun handleMissingHeader(
        e: MissingRequestHeaderException,
        request: HttpServletRequest,
    ): ResponseEntity<Map<String, Any>> =
        if (ApiContract.isV1(request)) {
            v1(
                ApiError(
                    ApiErrorCode.VALIDATION_FAILED,
                    fields = listOf(FieldViolation(e.headerName, "필수 헤더입니다.")),
                ),
            )
        } else {
            ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(mapOf("code" to "HEADER_REQUIRED", "message" to "${e.headerName} 헤더가 필요합니다."))
        }

    /** 본문 JSON 파싱 실패, 필수 파라미터 누락, 파라미터 타입 불일치. */
    @ExceptionHandler(
        HttpMessageNotReadableException::class,
        MissingServletRequestParameterException::class,
        TypeMismatchException::class,
    )
    fun handleBadRequest(
        e: Exception,
        request: HttpServletRequest,
    ): ResponseEntity<Map<String, Any>> {
        log.debug("api.rejected code=BAD_REQUEST path={}", request.requestURI)
        if (ApiContract.isV1(request)) {
            val field =
                when (e) {
                    is MissingServletRequestParameterException -> e.parameterName
                    is MethodArgumentTypeMismatchException -> e.name
                    is TypeMismatchException -> e.propertyName
                    else -> null
                }
            return v1(
                ApiError(
                    ApiErrorCode.VALIDATION_FAILED,
                    fields = field?.let { listOf(FieldViolation(it, "형식이 올바르지 않습니다.")) },
                ),
            )
        }
        return ResponseEntity
            .status(HttpStatus.BAD_REQUEST)
            .body(mapOf("code" to "BAD_REQUEST", "message" to "요청 형식이 올바르지 않습니다."))
    }

    @ExceptionHandler(ApiException::class)
    fun handleApi(
        e: ApiException,
        request: HttpServletRequest,
    ): ResponseEntity<Map<String, Any>> {
        if (ApiContract.isV1(request)) {
            log.debug("api.rejected code={} path={}", e.code.name, request.requestURI)
            return v1(legacyError(e))
        }
        if (e.code.kind == ErrorKind.UNAUTHORIZED) {
            log.debug("api.rejected code={} path={}", e.code.name, request.requestURI)
        } else {
            log.warn("api.rejected code={} path={}", e.code.name, request.requestURI)
        }
        return ResponseEntity
            .status(e.code.kind.toHttpStatus())
            .body(mapOf("code" to e.code.name, "message" to e.code.message, "details" to e.details))
    }

    @ExceptionHandler(UnauthorizedException::class)
    fun handleUnauthorized(
        e: UnauthorizedException,
        request: HttpServletRequest,
    ): ResponseEntity<Map<String, Any>> =
        if (ApiContract.isV1(request)) {
            v1(ApiError(ApiErrorCode.UNAUTHORIZED))
        } else {
            ResponseEntity
                .status(HttpStatus.UNAUTHORIZED)
                .body(mapOf("code" to "UNAUTHORIZED", "message" to "인증이 필요합니다."))
        }

    @ExceptionHandler(NoSuchElementException::class)
    fun handleNotFound(
        e: NoSuchElementException,
        request: HttpServletRequest,
    ): ResponseEntity<Map<String, Any>> =
        if (ApiContract.isV1(request)) {
            v1(ApiError(ApiErrorCode.NOT_FOUND))
        } else {
            ResponseEntity
                .status(HttpStatus.NOT_FOUND)
                .body(mapOf("code" to "NOT_FOUND", "message" to (e.message ?: "not found")))
        }

    /** Spring MVC 가 던지는 4xx (404, 405, 415 등) 는 상태 코드를 유지한다. 나머지는 500. */
    @ExceptionHandler(Exception::class)
    fun handleUnexpected(
        e: Exception,
        request: HttpServletRequest,
    ): ResponseEntity<Map<String, Any>> {
        if (e is ErrorResponse && e.statusCode.is4xxClientError) {
            log.debug("api.rejected code={} path={}", e.statusCode.value(), request.requestURI)
            if (ApiContract.isV1(request)) {
                val code =
                    when (e.statusCode.value()) {
                        404 -> ApiErrorCode.NOT_FOUND
                        401 -> ApiErrorCode.UNAUTHORIZED
                        403 -> ApiErrorCode.FORBIDDEN
                        409 -> ApiErrorCode.CONFLICT
                        423 -> ApiErrorCode.ACCOUNT_LOCKED
                        429 -> ApiErrorCode.RATE_LIMITED
                        else -> ApiErrorCode.VALIDATION_FAILED
                    }
                return ResponseEntity.status(e.statusCode).body(mapOf("error" to ApiError(code)))
            }
            return ResponseEntity
                .status(e.statusCode)
                .body(mapOf("code" to "REQUEST_ERROR", "message" to "요청을 처리할 수 없습니다."))
        }
        log.error("api.failed path={}", request.requestURI, e)
        if (ApiContract.isV1(request)) return v1(ApiError(ApiErrorCode.INTERNAL))
        return ResponseEntity
            .status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(mapOf("code" to "INTERNAL", "message" to "서버 오류가 발생했습니다."))
    }

    @ExceptionHandler(ApiV1Exception::class)
    fun handleV1(e: ApiV1Exception): ResponseEntity<Map<String, Any>> {
        if (e.error.code.status.is5xxServerError) {
            log.error("api.failed code={}", e.error.code, e)
        } else {
            log.debug("api.rejected code={}", e.error.code)
        }
        return v1(e.error)
    }

    @ExceptionHandler(AccessDeniedException::class)
    fun handleDenied(
        e: AccessDeniedException,
        request: HttpServletRequest,
    ): ResponseEntity<Map<String, Any>> =
        if (ApiContract.isV1(request)) v1(ApiError(ApiErrorCode.FORBIDDEN)) else handleUnexpected(e, request)

    @ExceptionHandler(ConstraintViolationException::class, HandlerMethodValidationException::class)
    fun handleConstraints(
        e: Exception,
        request: HttpServletRequest,
    ): ResponseEntity<Map<String, Any>> {
        if (!ApiContract.isV1(request)) return handleUnexpected(e, request)
        val fields =
            when (e) {
                is ConstraintViolationException -> {
                    e.constraintViolations.map { FieldViolation(it.propertyPath.toString(), it.message) }
                }

                is HandlerMethodValidationException -> {
                    if (e.isForReturnValue) return handleUnexpected(IllegalStateException("Response validation failed", e), request)
                    e.allValidationResults.flatMap { result ->
                        result.resolvableErrors.map {
                            FieldViolation(result.methodParameter.parameterName ?: "parameter", it.defaultMessage ?: "invalid")
                        }
                    }
                }

                else -> {
                    emptyList()
                }
            }
        return v1(ApiError(ApiErrorCode.VALIDATION_FAILED, fields = fields))
    }

    private fun v1(error: ApiError): ResponseEntity<Map<String, Any>> =
        ResponseEntity.status(error.code.status).body(mapOf("error" to error))

    private fun legacyError(e: ApiException): ApiError {
        val code =
            when (e.code) {
                ErrorCode.ACCOUNT_LOCKED -> {
                    ApiErrorCode.ACCOUNT_LOCKED
                }

                ErrorCode.EMAIL_ALREADY_USED -> {
                    ApiErrorCode.EMAIL_ALREADY_REGISTERED
                }

                ErrorCode.SOCIAL_ALREADY_LINKED -> {
                    ApiErrorCode.ACCOUNT_EXISTS_FOR_PROVIDER
                }

                ErrorCode.QUIZ_DATA_INVALID -> {
                    ApiErrorCode.QUIZ_DATA_INVALID
                }

                ErrorCode.ALREADY_OWNED -> {
                    ApiErrorCode.ALREADY_OWNED
                }

                else -> {
                    when (e.code.kind) {
                        ErrorKind.VALIDATION -> ApiErrorCode.VALIDATION_FAILED
                        ErrorKind.UNAUTHORIZED -> ApiErrorCode.UNAUTHORIZED
                        ErrorKind.NOT_FOUND -> ApiErrorCode.NOT_FOUND
                        ErrorKind.CONFLICT -> ApiErrorCode.CONFLICT
                    }
                }
            }
        val unlocksAt =
            when (val value = e.details["unlocksAt"]) {
                is Instant -> value
                is OffsetDateTime -> value.toInstant()
                is String -> runCatching { Instant.parse(value) }.getOrNull()
                else -> null
            }
        return ApiError(
            code,
            fields = (e.details["field"] as? String)?.let { listOf(FieldViolation(it, code.message)) },
            retryAfter = (e.details["retryAfter"] as? Number)?.toLong(),
            unlocksAt = unlocksAt,
        )
    }

    private fun ErrorKind.toHttpStatus(): HttpStatus =
        when (this) {
            ErrorKind.VALIDATION -> HttpStatus.BAD_REQUEST
            ErrorKind.UNAUTHORIZED -> HttpStatus.UNAUTHORIZED
            ErrorKind.NOT_FOUND -> HttpStatus.NOT_FOUND
            ErrorKind.CONFLICT -> HttpStatus.CONFLICT
        }
}

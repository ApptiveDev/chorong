package com.bawibase.chorong.config

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorKind
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.MissingRequestHeaderException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class ApiExceptionHandler {
    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun handleValidation(e: MethodArgumentNotValidException): ResponseEntity<Map<String, Any>> {
        val fields =
            e.bindingResult.fieldErrors.associate {
                it.field to (it.defaultMessage ?: "invalid")
            }
        return ResponseEntity
            .status(HttpStatus.BAD_REQUEST)
            .body(mapOf("code" to "VALIDATION", "message" to "요청 값이 올바르지 않습니다.", "fields" to fields))
    }

    @ExceptionHandler(MissingRequestHeaderException::class)
    fun handleMissingHeader(e: MissingRequestHeaderException): ResponseEntity<Map<String, Any>> =
        ResponseEntity
            .status(HttpStatus.BAD_REQUEST)
            .body(mapOf("code" to "HEADER_REQUIRED", "message" to "${e.headerName} 헤더가 필요합니다."))

    @ExceptionHandler(ApiException::class)
    fun handleApi(e: ApiException): ResponseEntity<Map<String, Any>> =
        ResponseEntity
            .status(e.code.kind.toHttpStatus())
            .body(mapOf("code" to e.code.name, "message" to e.code.message, "details" to e.details))

    @ExceptionHandler(UnauthorizedException::class)
    fun handleUnauthorized(e: UnauthorizedException): ResponseEntity<Map<String, Any>> =
        ResponseEntity
            .status(HttpStatus.UNAUTHORIZED)
            .body(mapOf("code" to "UNAUTHORIZED", "message" to "인증이 필요합니다."))

    @ExceptionHandler(NoSuchElementException::class)
    fun handleNotFound(e: NoSuchElementException): ResponseEntity<Map<String, Any>> =
        ResponseEntity
            .status(HttpStatus.NOT_FOUND)
            .body(mapOf("code" to "NOT_FOUND", "message" to (e.message ?: "not found")))

    private fun ErrorKind.toHttpStatus(): HttpStatus =
        when (this) {
            ErrorKind.VALIDATION -> HttpStatus.BAD_REQUEST
            ErrorKind.UNAUTHORIZED -> HttpStatus.UNAUTHORIZED
            ErrorKind.NOT_FOUND -> HttpStatus.NOT_FOUND
            ErrorKind.CONFLICT -> HttpStatus.CONFLICT
        }
}

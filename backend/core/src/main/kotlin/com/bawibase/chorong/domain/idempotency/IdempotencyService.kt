package com.bawibase.chorong.domain.idempotency

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.common.api.FieldViolation
import com.fasterxml.jackson.core.JsonProcessingException
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.security.MessageDigest
import java.time.Clock
import java.time.OffsetDateTime

data class IdempotentResponse<T : Any>(
    val status: Int,
    val body: T,
)

@Service
class IdempotencyService(
    private val records: IdempotencyRecordRepository,
    private val mapper: ObjectMapper,
    private val clock: Clock,
) {
    @Transactional
    fun <T : Any> execute(
        userId: Long,
        operationId: String,
        key: String,
        request: Any,
        responseType: Class<T>,
        action: () -> IdempotentResponse<T>,
    ): IdempotentResponse<T> {
        validateScope(operationId, key)
        val requestHash = fingerprint(request)
        val now = OffsetDateTime.now(clock)
        records.claim(userId, operationId, key, requestHash, now, now.plusHours(TTL_HOURS))
        val record = records.findForUpdate(userId, operationId, key) ?: throw ApiV1Exception(ApiErrorCode.INTERNAL)
        if (record.requestHash != requestHash) throw ApiV1Exception(ApiErrorCode.CONFLICT)
        if (record.responseStatus != null && record.responseBody != null) {
            return IdempotentResponse(record.responseStatus, readBody(record.responseBody, responseType))
        }

        val response = action()
        if (response.status !in 200..299) throw ApiV1Exception(ApiErrorCode.INTERNAL)
        records.complete(record.id, response.status, writeBody(response.body))
        return response
    }

    private fun validateScope(
        operationId: String,
        key: String,
    ) {
        if (operationId.isBlank() || operationId.length > MAX_OPERATION_LENGTH) {
            throw ApiV1Exception(
                ApiErrorCode.VALIDATION_FAILED,
                fields = listOf(FieldViolation("operationId", "operationId는 1~100자여야 합니다.")),
            )
        }
        if (key.isBlank() || key.length > MAX_KEY_LENGTH) {
            throw ApiV1Exception(
                ApiErrorCode.VALIDATION_FAILED,
                fields = listOf(FieldViolation("Idempotency-Key", "멱등 키는 1~64자여야 합니다.")),
            )
        }
    }

    private fun fingerprint(request: Any): String = digest(writeBody(request))

    private fun writeBody(value: Any): String =
        try {
            mapper.writeValueAsString(value)
        } catch (exception: JsonProcessingException) {
            throw IllegalStateException("멱등 요청 또는 응답 직렬화에 실패했습니다.", exception)
        }

    private fun <T : Any> readBody(
        body: String,
        responseType: Class<T>,
    ): T =
        try {
            mapper.readValue(body, responseType)
        } catch (exception: JsonProcessingException) {
            throw IllegalStateException("저장된 멱등 응답 역직렬화에 실패했습니다.", exception)
        }

    private fun digest(value: String): String =
        MessageDigest
            .getInstance("SHA-256")
            .digest(value.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }

    companion object {
        const val TTL_HOURS = 24L
        private const val MAX_OPERATION_LENGTH = 100
        private const val MAX_KEY_LENGTH = 64
    }
}

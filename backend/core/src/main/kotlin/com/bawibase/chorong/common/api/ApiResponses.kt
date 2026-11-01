package com.bawibase.chorong.common.api

import com.fasterxml.jackson.annotation.JsonInclude
import org.springframework.http.HttpStatus
import java.time.Instant

data class ApiResponse<T>(
    val data: T,
)

data class PagedResponse<T>(
    val data: T,
    val meta: PageMeta,
)

data class PageMeta(
    @get:JsonInclude(JsonInclude.Include.ALWAYS)
    val nextCursor: String?,
)

data class ApiErrorResponse(
    val error: ApiError,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class ApiError(
    val code: ApiErrorCode,
    val message: String = code.message,
    val fields: List<FieldViolation>? = null,
    val retryAfter: Long? = null,
    val unlocksAt: Instant? = null,
    val items: List<ApiErrorItem>? = null,
)

data class ApiErrorItem(
    val itemId: Long,
    val optionId: Long,
    val code: String,
)

data class FieldViolation(
    val field: String,
    val reason: String,
)

enum class ApiErrorCode(
    val status: HttpStatus,
    val message: String,
) {
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "인증이 필요합니다."),
    FORBIDDEN(HttpStatus.FORBIDDEN, "접근할 수 없습니다."),
    AUTH_TOKEN_EXPIRED(HttpStatus.UNAUTHORIZED, "인증 토큰이 만료되었습니다."),
    AUTH_TOKEN_REUSED(HttpStatus.UNAUTHORIZED, "폐기된 인증 토큰입니다."),
    VALIDATION_FAILED(HttpStatus.BAD_REQUEST, "요청 값이 올바르지 않습니다."),
    NOT_FOUND(HttpStatus.NOT_FOUND, "대상을 찾을 수 없습니다."),
    CONFLICT(HttpStatus.CONFLICT, "현재 상태에서 요청을 처리할 수 없습니다."),
    RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS, "잠시 후 다시 시도하세요."),
    INTERNAL(HttpStatus.INTERNAL_SERVER_ERROR, "서버 오류가 발생했습니다."),
    EMAIL_ALREADY_REGISTERED(HttpStatus.CONFLICT, "이미 가입된 이메일입니다."),
    PROVIDER_ALREADY_LINKED(HttpStatus.CONFLICT, "다른 계정에 연결된 로그인 수단입니다."),
    ACCOUNT_LOCKED(HttpStatus.LOCKED, "계정이 잠겨 있습니다."),
    LAST_AUTH_METHOD(HttpStatus.BAD_REQUEST, "마지막 로그인 수단은 해제할 수 없습니다."),
    ACCOUNT_EXISTS_FOR_PROVIDER(HttpStatus.CONFLICT, "이미 연결된 로그인 수단입니다."),
    VERIFICATION_INVALID(HttpStatus.BAD_REQUEST, "인증코드가 만료되었거나 올바르지 않습니다."),
    QUIZ_DATA_INVALID(HttpStatus.CONFLICT, "문제 설정이 올바르지 않습니다."),
    LESSON_LOCKED(HttpStatus.FORBIDDEN, "아직 해금되지 않은 학습입니다."),
    REVIEW_REQUIRED(HttpStatus.CONFLICT, "복습을 먼저 완료하세요."),
    INVENTORY_ITEM_NOT_OWNED(HttpStatus.BAD_REQUEST, "보유하지 않은 아이템입니다."),
    PLACEMENT_AREA_MISMATCH(HttpStatus.BAD_REQUEST, "배치 영역이 맞지 않습니다."),
    PLACEMENT_NOT_FOUND(HttpStatus.BAD_REQUEST, "배치를 찾을 수 없습니다."),
    HOUSING_PRIVATE_SELF(HttpStatus.FORBIDDEN, "내 하우징을 먼저 공개하세요."),
    MEMBER_ONLY(HttpStatus.FORBIDDEN, "회원만 사용할 수 있습니다."),
    HOUSING_NOT_VISIBLE(HttpStatus.NOT_FOUND, "하우징을 볼 수 없습니다."),
    SELF_TARGET(HttpStatus.BAD_REQUEST, "본인에게 사용할 수 없습니다."),
    ITEM_LOCKED(HttpStatus.FORBIDDEN, "해금되지 않은 아이템입니다."),
    INSUFFICIENT_BALANCE(HttpStatus.PAYMENT_REQUIRED, "재화가 부족합니다."),
    OPTION_INVALID(HttpStatus.BAD_REQUEST, "유효하지 않은 옵션입니다."),
    ALREADY_OWNED(HttpStatus.CONFLICT, "이미 보유한 아이템입니다."),
}

class ApiV1Exception(
    val error: ApiError,
) : RuntimeException(error.message) {
    constructor(
        code: ApiErrorCode,
        fields: List<FieldViolation>? = null,
        retryAfter: Long? = null,
        unlocksAt: Instant? = null,
        items: List<ApiErrorItem>? = null,
    ) : this(ApiError(code, fields = fields, retryAfter = retryAfter, unlocksAt = unlocksAt, items = items))
}

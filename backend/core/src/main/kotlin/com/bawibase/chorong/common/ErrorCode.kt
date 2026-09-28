package com.bawibase.chorong.common

enum class ErrorKind { VALIDATION, UNAUTHORIZED, NOT_FOUND, CONFLICT }

enum class ErrorCode(
    val kind: ErrorKind,
    val message: String,
) {
    UNAUTHORIZED(ErrorKind.UNAUTHORIZED, "인증이 필요합니다."),
    LOGIN_FAILED(ErrorKind.UNAUTHORIZED, "이메일 또는 비밀번호가 맞지 않습니다."),
    ACCOUNT_LOCKED(ErrorKind.UNAUTHORIZED, "로그인 실패가 반복되어 잠겼습니다. 잠시 후 다시 시도하세요."),
    REFRESH_TOKEN_INVALID(ErrorKind.UNAUTHORIZED, "리프레시 토큰이 만료되었거나 폐기되었습니다."),
    GUEST_NOT_FOUND(ErrorKind.UNAUTHORIZED, "등록되지 않은 기기입니다."),
    USER_WITHDRAWN(ErrorKind.UNAUTHORIZED, "탈퇴한 계정입니다."),
    EMAIL_ALREADY_USED(ErrorKind.CONFLICT, "이미 가입된 이메일입니다."),
    DEVICE_ALREADY_REGISTERED(ErrorKind.CONFLICT, "이미 등록된 기기입니다."),
    SOCIAL_ALREADY_LINKED(ErrorKind.CONFLICT, "다른 계정에 이미 연결된 소셜 계정입니다."),
    QUIZ_NOT_FOUND(ErrorKind.NOT_FOUND, "퀴즈를 찾을 수 없습니다."),
    INVALID_QUIZ_RESPONSE(ErrorKind.VALIDATION, "퀴즈 응답 형식이나 값이 올바르지 않습니다."),
    QUIZ_DATA_INVALID(ErrorKind.CONFLICT, "문제 설정이 올바르지 않아 이 퀴즈를 사용할 수 없습니다."),
    INVALID_QUIZ_REQUEST(ErrorKind.VALIDATION, "퀴즈 ID와 학습 ID는 양의 정수여야 합니다."),
    UNKNOWN_ID(ErrorKind.VALIDATION, "카탈로그에 없는 ID 입니다."),
    NOT_OWNED(ErrorKind.VALIDATION, "보유하지 않은 에셋입니다."),
    SURFACE_MISMATCH(ErrorKind.VALIDATION, "방의 면 구성과 맞지 않습니다."),
    SLOT_DUPLICATED(ErrorKind.VALIDATION, "같은 슬롯에 두 번 배치했습니다."),
    SLOT_CATEGORY_MISMATCH(ErrorKind.VALIDATION, "슬롯에 놓을 수 없는 가구입니다."),
    ROOM_INCOMPATIBLE(ErrorKind.VALIDATION, "이 방에 놓을 수 없는 가구입니다."),
    INSUFFICIENT_COIN(ErrorKind.VALIDATION, "코인이 부족합니다."),
    ALREADY_OWNED(ErrorKind.CONFLICT, "이미 보유한 상품입니다."),
    CATALOG_DEFAULT_MISSING(ErrorKind.CONFLICT, "기본 지급 에셋이 카탈로그에 없습니다."),
}

class ApiException(
    val code: ErrorCode,
    val details: Map<String, Any?> = emptyMap(),
) : RuntimeException(code.message)

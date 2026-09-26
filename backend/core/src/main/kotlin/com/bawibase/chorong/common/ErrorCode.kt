package com.bawibase.chorong.common

enum class ErrorKind { VALIDATION, NOT_FOUND, CONFLICT }

enum class ErrorCode(val kind: ErrorKind, val message: String) {
    DEVICE_ID_REQUIRED(ErrorKind.VALIDATION, "X-Device-Id 헤더가 필요합니다."),
    DEVICE_ID_INVALID(ErrorKind.VALIDATION, "X-Device-Id 값이 올바르지 않습니다."),
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

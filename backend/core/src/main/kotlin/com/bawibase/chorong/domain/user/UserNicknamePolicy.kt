package com.bawibase.chorong.domain.user

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.common.api.FieldViolation

object UserNicknamePolicy {
    /** 기존 저장값은 보존하고 새 닉네임 변경 요청에만 적용한다. */
    fun validate(value: String): String {
        if (value.isBlank() || value.codePointCount(0, value.length) !in 2..12) {
            throw ApiV1Exception(
                ApiErrorCode.VALIDATION_FAILED,
                fields = listOf(FieldViolation("nickname", "닉네임은 2~12자로 입력하세요.")),
            )
        }
        return value
    }
}

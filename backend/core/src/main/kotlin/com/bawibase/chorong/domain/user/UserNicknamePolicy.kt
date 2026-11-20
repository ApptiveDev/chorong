package com.bawibase.chorong.domain.user

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.common.api.FieldViolation

object UserNicknamePolicy {
    fun displayName(
        nickname: String?,
        status: UserStatus,
    ): String = nickname ?: if (status == UserStatus.GUEST) GUEST_DEFAULT else DEFAULT

    /** 회원인데 닉네임을 저장하지 않았으면 true. 앱은 닉네임 설정 모달을 띄운다. */
    fun required(
        nickname: String?,
        status: UserStatus,
    ): Boolean = status == UserStatus.ACTIVE && nickname == null

    const val GUEST_DEFAULT = "게스트"
    const val DEFAULT = "사용자"

    /** 앞뒤 공백을 뺀 값을 돌려준다. 기존 저장값은 보존하고 새 닉네임 변경 요청에만 적용한다. */
    fun validate(value: String): String {
        val trimmed = value.trim()
        if (trimmed.codePointCount(0, trimmed.length) !in MIN_LENGTH..MAX_LENGTH) {
            throw ApiV1Exception(
                ApiErrorCode.VALIDATION_FAILED,
                fields = listOf(FieldViolation("nickname", "닉네임은 1~10자로 입력하세요.")),
            )
        }
        return trimmed
    }

    private const val MIN_LENGTH = 1
    private const val MAX_LENGTH = 10
}

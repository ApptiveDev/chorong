package com.bawibase.chorong.domain.auth.dto

import com.bawibase.chorong.domain.user.UserStatus
import jakarta.validation.constraints.Pattern

enum class DevicePlatform { IOS, ANDROID }

data class GuestAuthRequest(
    @field:Pattern(regexp = UUID_PATTERN, message = "UUID 형식으로 입력하세요.")
    val deviceUuid: String,
    val platform: DevicePlatform,
) {
    companion object {
        const val UUID_PATTERN = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
    }
}

data class GuestAuthData(
    val accessToken: String,
    val refreshToken: String,
    val expiresIn: Long,
    val user: UserBrief,
    val isNew: Boolean,
)

data class UserBrief(
    val userId: Long,
    val nickname: String?,
    val status: UserStatus,
)

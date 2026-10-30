package com.bawibase.chorong.domain.user

enum class UserStatus {
    GUEST,
    ACTIVE,
    WITHDRAWN,
    ;

    val available: Boolean get() = this != WITHDRAWN

    val role: UserRole?
        get() =
            when (this) {
                GUEST -> UserRole.GUEST
                ACTIVE -> UserRole.MEMBER
                WITHDRAWN -> null
            }
}

enum class UserRole { GUEST, MEMBER }

enum class AuthProvider(
    val social: Boolean,
) {
    KAKAO(true),
    APPLE(true),
    GOOGLE(true),
    NAVER(true),
    PASSWORD(false),
    GUEST(false),
}

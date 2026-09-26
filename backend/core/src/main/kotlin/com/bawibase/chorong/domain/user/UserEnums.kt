package com.bawibase.chorong.domain.user

enum class UserStatus { ACTIVE, WITHDRAWN }

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

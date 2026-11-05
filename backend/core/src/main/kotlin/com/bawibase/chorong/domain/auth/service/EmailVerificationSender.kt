package com.bawibase.chorong.domain.auth.service

import org.springframework.stereotype.Component

interface EmailVerificationSender {
    fun send(
        email: String,
        code: String,
    )
}

@Component
class UnconfiguredEmailVerificationSender : EmailVerificationSender {
    override fun send(
        email: String,
        code: String,
    ): Unit = throw IllegalStateException("Email delivery is not configured")
}

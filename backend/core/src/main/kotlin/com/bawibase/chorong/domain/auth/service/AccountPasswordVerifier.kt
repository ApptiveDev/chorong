package com.bawibase.chorong.domain.auth.service

import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.crypto.password.Pbkdf2PasswordEncoder
import org.springframework.stereotype.Service

@Service
class AccountPasswordVerifier(
    private val legacyEncoder: PasswordEncoder,
) {
    private val pbkdf2 = Pbkdf2PasswordEncoder.defaultsForSpringSecurity_v5_8().apply { setEncodeHashAsBase64(true) }

    fun matches(
        raw: String,
        hash: String,
    ): Boolean = if (hash.startsWith(PREFIX)) pbkdf2.matches(raw, hash.removePrefix(PREFIX)) else legacyEncoder.matches(raw, hash)

    companion object {
        const val PREFIX = "{pbkdf2-base64}"
    }
}

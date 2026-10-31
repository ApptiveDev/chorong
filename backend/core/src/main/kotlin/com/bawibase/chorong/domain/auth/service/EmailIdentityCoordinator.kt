package com.bawibase.chorong.domain.auth.service

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowCallbackHandler
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.nio.ByteBuffer
import java.security.MessageDigest
import java.util.Locale

@Service
class EmailIdentityCoordinator(
    private val jdbc: JdbcTemplate,
) {
    fun normalize(email: String): String = email.trim().lowercase(Locale.ROOT)

    @Transactional(propagation = Propagation.MANDATORY)
    fun lock(email: String) {
        val bytes = MessageDigest.getInstance("SHA-256").digest("chorong.email-signup:$email".toByteArray(Charsets.UTF_8))
        jdbc.query("SELECT pg_advisory_xact_lock(?)", RowCallbackHandler { }, ByteBuffer.wrap(bytes).long)
    }
}

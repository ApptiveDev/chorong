package com.bawibase.chorong.domain.idempotency

import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.annotation.EnableScheduling
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.OffsetDateTime

@Configuration
@EnableScheduling
class IdempotencySchedulingConfiguration

@Component
class IdempotencyCleanupJob(
    private val records: IdempotencyRecordRepository,
    private val clock: Clock,
) {
    @Scheduled(fixedDelayString = "\${app.idempotency.cleanup-interval-ms:3600000}")
    fun deleteExpiredRecords() {
        records.deleteExpired(OffsetDateTime.now(clock))
    }
}

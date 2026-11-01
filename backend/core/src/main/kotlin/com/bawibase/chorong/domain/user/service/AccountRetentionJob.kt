package com.bawibase.chorong.domain.user.service

import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(prefix = "app.account-retention", name = ["enabled"], havingValue = "true")
class AccountRetentionJob(
    private val retention: AccountRetentionService,
    @Value("\${app.account-retention.batch-size:100}") private val batchSize: Int,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Scheduled(fixedDelayString = "\${app.account-retention.interval-ms:86400000}")
    fun anonymizeDueAccounts() {
        val count = retention.anonymizeDueAccounts(batchSize)
        if (count > 0) log.info("user.retention_batch_completed count={}", count)
    }
}

package com.bawibase.chorong.domain.learning

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.LocalDate
import java.time.ZoneId

@Service
class ReviewGateService(
    private val jdbc: JdbcTemplate,
    private val reviewSets: ReviewSetService,
    private val clock: Clock,
) {
    private val kst = ZoneId.of("Asia/Seoul")

    fun requiredSet(
        userId: Long,
        lessonId: Long,
    ): ReviewSetResponse? {
        val today = LocalDate.ofInstant(clock.instant(), kst)
        val passed =
            jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM lesson_review_gate WHERE user_id=? AND lesson_id=? AND review_date=?)",
                Boolean::class.java,
                userId,
                lessonId,
                today,
            ) ?: false
        if (passed) return null
        val completedToday =
            jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM review_session WHERE user_id=? AND lesson_id=? AND review_date=? AND status='COMPLETED')",
                Boolean::class.java,
                userId,
                lessonId,
                today,
            ) ?: false
        if (completedToday) return null
        val set = reviewSets.next(userId, lessonId)
        return set.takeIf { it.reviewItems.isNotEmpty() }
    }

    fun markPassed(
        userId: Long,
        lessonId: Long,
    ) {
        val today = LocalDate.ofInstant(clock.instant(), kst)
        jdbc.update(
            "INSERT INTO lesson_review_gate(user_id, lesson_id, review_date) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
            userId,
            lessonId,
            today,
        )
    }

    fun enforce(
        userId: Long,
        lessonId: Long,
    ) {
        val today = LocalDate.ofInstant(clock.instant(), kst)
        val passed =
            jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM lesson_review_gate WHERE user_id=? AND lesson_id=? AND review_date=?)",
                Boolean::class.java,
                userId,
                lessonId,
                today,
            ) ?: false
        if (passed) return
        if (requiredSet(userId, lessonId) != null) throw ApiV1Exception(ApiErrorCode.REVIEW_REQUIRED)
        markPassed(userId, lessonId)
    }
}

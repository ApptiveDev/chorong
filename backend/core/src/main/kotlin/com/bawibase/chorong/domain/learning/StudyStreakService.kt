package com.bawibase.chorong.domain.learning

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.LocalDate
import java.time.ZoneId

@Service
class StudyStreakService(
    private val jdbc: JdbcTemplate,
    private val clock: Clock,
) {
    private val kst = ZoneId.of("Asia/Seoul")

    @Transactional
    fun recordCompletedStudy(userId: Long): Int {
        val studyDate = LocalDate.ofInstant(clock.instant(), kst)
        val state =
            jdbc
                .query(
                    "SELECT last_study_date, streak_days FROM app_user WHERE user_id=? AND status <> 'WITHDRAWN' FOR UPDATE",
                    { rs, _ -> StudyState(rs.getDate("last_study_date")?.toLocalDate(), rs.getInt("streak_days")) },
                    userId,
                ).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        if (state.lastStudyDate == studyDate) return state.streakDays
        val streak = if (state.lastStudyDate == studyDate.minusDays(1)) state.streakDays + 1 else 1
        jdbc.update(
            "UPDATE app_user SET last_study_date=?, streak_days=?, modified_at=now() WHERE user_id=?",
            studyDate,
            streak,
            userId,
        )
        return streak
    }

    fun current(userId: Long): Int =
        jdbc.query("SELECT streak_days FROM app_user WHERE user_id=?", { rs, _ -> rs.getInt(1) }, userId).firstOrNull()
            ?: throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)

    private data class StudyState(
        val lastStudyDate: LocalDate?,
        val streakDays: Int,
    )
}

package com.bawibase.chorong.domain.push.service

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import java.time.LocalDate

@Service
class StudyReminderTargetService(
    private val jdbc: JdbcTemplate,
) {
    fun findEligibleUserIds(today: LocalDate): List<Long> =
        jdbc.query(
            """SELECT u.user_id FROM app_user u
               WHERE u.status <> 'WITHDRAWN' AND u.push_enabled = TRUE
                 AND u.streak_days >= 2 AND u.last_study_date <= ?
                 AND EXISTS (SELECT 1 FROM push_device d WHERE d.user_id = u.user_id)
               ORDER BY u.user_id""",
            { rs, _ -> rs.getLong(1) },
            today.minusDays(2),
        )
}

package com.bawibase.chorong.domain.learning

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service

/** 한 사용자의 학습 레슨 상태. 별자리·레슨 순서대로 담는다. */
data class LessonState(
    val lessonId: Long,
    val courseId: Long,
    val title: String,
    val status: String,
    val lastContentId: Long?,
)

data class LearningMap(
    val lessons: List<LessonState>,
    val lockedCourseIds: Set<Long>,
) {
    private val byId = lessons.associateBy { it.lessonId }

    fun status(lessonId: Long): String? = byId[lessonId]?.status

    /** 학습 홈의 물음표 별. 순서상 처음 나오는 열린 미완료 레슨. */
    fun current(): LessonState? = lessons.firstOrNull { it.status == "UNLOCKED" || it.status == "IN_PROGRESS" }
}

/**
 * 레슨 해금을 완료 기록으로 계산한다. 하루 해금 제한은 없다.
 * 별자리 첫 레슨은 앞 별자리를 모두 완료하면, 나머지 레슨은 바로 앞 레슨을 완료하면 열린다.
 * 진행 행(lesson_progress)이 이미 있는 레슨은 그 상태를 그대로 쓴다. 조회는 상태를 바꾸지 않는다.
 */
@Service
class LessonUnlockService(
    private val jdbc: JdbcTemplate,
) {
    fun map(userId: Long): LearningMap {
        val rows =
            jdbc.query(
                """SELECT l.lesson_id, l.course_id, l.title, lp.status, lp.last_content_id
                   FROM lesson l
                   JOIN course c ON c.course_id = l.course_id
                   LEFT JOIN lesson_progress lp ON lp.lesson_id = l.lesson_id AND lp.user_id = ?
                   WHERE NOT c.is_onboarding
                   ORDER BY c.course_order, c.course_id, l.lesson_order, l.lesson_id""",
                { rs, _ ->
                    Row(
                        rs.getLong("lesson_id"),
                        rs.getLong("course_id"),
                        rs.getString("title"),
                        rs.getString("status"),
                        rs.getObject("last_content_id", java.lang.Long::class.java)?.toLong(),
                    )
                },
                userId,
            )
        val lessons = mutableListOf<LessonState>()
        val locked = mutableSetOf<Long>()
        var previousCoursesDone = true
        for ((courseId, courseRows) in rows.groupBy { it.courseId }) {
            if (!previousCoursesDone && courseRows.all { it.status == null }) locked += courseId
            var previousDone = previousCoursesDone
            for (row in courseRows) {
                val status = row.status ?: if (previousDone) "UNLOCKED" else "LOCKED"
                lessons += LessonState(row.lessonId, row.courseId, row.title, status, row.lastContentId)
                previousDone = row.status == "COMPLETED"
            }
            previousCoursesDone = previousCoursesDone && courseRows.all { it.status == "COMPLETED" }
        }
        return LearningMap(lessons, locked)
    }

    /**
     * 열린 레슨에 진행 행이 없으면 UNLOCKED 행을 만든다. 레슨 시작·퀴즈 제출처럼 사용자가 레슨에 들어갈 때만 부른다.
     * 진행 행이 있거나 새로 만들었으면 true, 잠긴 레슨이면 false.
     */
    fun ensureProgress(
        userId: Long,
        lessonId: Long,
    ): Boolean {
        val exists =
            jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM lesson_progress WHERE user_id = ? AND lesson_id = ?)",
                Boolean::class.java,
                userId,
                lessonId,
            ) ?: false
        if (exists) return true
        if (map(userId).status(lessonId) != "UNLOCKED") return false
        jdbc.update(
            """INSERT INTO lesson_progress (user_id, lesson_id, course_id, status)
               SELECT ?, lesson_id, course_id, 'UNLOCKED' FROM lesson WHERE lesson_id = ?
               ON CONFLICT DO NOTHING""",
            userId,
            lessonId,
        )
        return true
    }

    private data class Row(
        val lessonId: Long,
        val courseId: Long,
        val title: String,
        val status: String?,
        val lastContentId: Long?,
    )
}

package com.bawibase.chorong.domain.learning

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.quiz.service.QuizService
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.sql.Timestamp
import java.time.Clock
import java.time.LocalDate
import java.time.ZoneId

@Service
class LearningService(
    private val jdbc: JdbcTemplate,
    private val quizService: QuizService,
    private val clock: Clock,
    private val mapper: ObjectMapper,
) {
    private val kst = ZoneId.of("Asia/Seoul")

    @Transactional(readOnly = true)
    fun listCourses(
        userId: Long,
        category: String?,
        topic: String? = null,
    ): List<CourseSummary> {
        requireId(userId)
        return jdbc.query(
            """SELECT c.course_id, c.title, c.category, c.topic, COUNT(DISTINCT l.lesson_id)::int AS total,
                      COUNT(DISTINCT lp.lesson_id) FILTER (WHERE lp.status = 'COMPLETED')::int AS completed
               FROM course c
               LEFT JOIN lesson l ON l.course_id = c.course_id
               LEFT JOIN lesson_progress lp ON lp.lesson_id = l.lesson_id AND lp.user_id = ?
               WHERE NOT c.is_onboarding
                 AND (CAST(? AS VARCHAR) IS NULL OR c.category = ?)
                 AND (CAST(? AS VARCHAR) IS NULL OR c.topic = ?)
               GROUP BY c.course_id ORDER BY c.course_order, c.course_id""",
            { rs, _ ->
                CourseSummary(
                    rs.getLong("course_id"),
                    rs.getString("title"),
                    rs.getString("category"),
                    rs.getString("topic"),
                    rs.getInt("total"),
                    rs.getInt("completed"),
                )
            },
            userId,
            category,
            category,
            topic,
            topic,
        )
    }

    @Transactional
    fun getCourse(
        userId: Long,
        courseId: Long,
    ): CourseDetail {
        requireId(userId)
        requireId(courseId)
        ensureUser(userId)
        val course =
            jdbc
                .query(
                    """SELECT c.course_id, c.title, c.category, c.topic, c.description, COUNT(l.lesson_id)::int AS total,
                          COUNT(lp.lesson_id) FILTER (WHERE lp.status = 'COMPLETED')::int AS completed
                   FROM course c
                   LEFT JOIN lesson l ON l.course_id = c.course_id
                   LEFT JOIN lesson_progress lp ON lp.lesson_id = l.lesson_id AND lp.user_id = ?
                   WHERE c.course_id = ? AND NOT c.is_onboarding
                   GROUP BY c.course_id""",
                    { rs, _ ->
                        CourseDetail(
                            rs.getLong("course_id"),
                            rs.getString("title"),
                            rs.getString("category"),
                            rs.getString("topic"),
                            rs.getInt("total"),
                            rs.getInt("completed"),
                            null,
                            rs.getString("description"),
                            emptyList(),
                        )
                    },
                    userId,
                    courseId,
                ).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.NOT_FOUND)

        val today = LocalDate.ofInstant(clock.instant(), kst)
        // A persistent per-user/course row lock serializes requests across API instances.
        jdbc.update(
            "INSERT INTO course_unlock_mutex(user_id, course_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
            userId,
            courseId,
        )
        jdbc.query(
            "SELECT user_id FROM course_unlock_mutex WHERE user_id = ? AND course_id = ? FOR UPDATE",
            { rs, _ -> rs.getLong(1) },
            userId,
            courseId,
        )
        unlockNextLesson(userId, courseId, today)
        val hasUnlockedToday =
            jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM course_daily_unlock WHERE user_id = ? AND course_id = ? AND unlock_date = ?)",
                Boolean::class.java,
                userId,
                courseId,
                today,
            ) ?: false
        val unlocksAt = if (hasUnlockedToday) today.plusDays(1).atStartOfDay(kst).toInstant() else null
        val lessons =
            jdbc.query(
                """SELECT l.lesson_id, l.title, l.lesson_order, lp.status, lp.completed_at
                   FROM lesson l
                   LEFT JOIN lesson_progress lp ON lp.lesson_id = l.lesson_id AND lp.user_id = ?
                   WHERE l.course_id = ? ORDER BY l.lesson_order, l.lesson_id""",
                { rs, _ ->
                    val status = rs.getString("status") ?: "LOCKED"
                    val completedAt = rs.getTimestamp("completed_at")?.toInstant()
                    LessonSummary(
                        lessonId = rs.getLong("lesson_id"),
                        title = rs.getString("title"),
                        order = rs.getInt("lesson_order"),
                        status = status,
                        unlocksAt = unlocksAt.takeIf { status == "LOCKED" },
                        completedAt = completedAt,
                    )
                },
                userId,
                courseId,
            )
        return course.copy(lessons = lessons)
    }

    @Transactional(readOnly = true)
    fun getLesson(lessonId: Long): LessonDetail {
        requireId(lessonId)
        val lesson =
            jdbc
                .query(
                    "SELECT lesson_id, course_id, title, description FROM lesson WHERE lesson_id = ?",
                    { rs, _ ->
                        LessonDetail(
                            rs.getLong("lesson_id"),
                            rs.getLong("course_id"),
                            rs.getString("title"),
                            rs.getString("description"),
                            emptyList(),
                            emptyList(),
                        )
                    },
                    lessonId,
                ).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.NOT_FOUND)
        val contents =
            jdbc.query(
                """SELECT content_id, content_order, content_type, body, media_url, quiz_id, segment_id, dialogue, source
                   FROM lesson_content WHERE lesson_id = ? ORDER BY content_order, content_id""",
                { rs, _ ->
                    val quizId = rs.getLong("quiz_id").let { if (rs.wasNull()) null else it }
                    LearningContent(
                        rs.getLong("content_id"),
                        rs.getInt("content_order"),
                        rs.getString("segment_id") ?: "legacy-$lessonId",
                        rs.getString("content_type"),
                        rs.getString("body"),
                        rs.getString("media_url"),
                        quizId?.let { quizService.get(it) },
                        mapper.readTree(rs.getString("dialogue")).map { line ->
                            require(line.isObject && line["speaker"]?.isTextual == true && line["text"]?.isTextual == true) {
                                "Invalid dialogue for content ${rs.getLong("content_id")}"
                            }
                            DialogueLine(line["speaker"].textValue(), line["text"].textValue())
                        },
                        rs.getString("source"),
                    )
                },
                lessonId,
            )
        val contentBySegment = contents.groupBy { it.segmentId }
        val segments =
            jdbc
                .query(
                    """SELECT segment_id, title, segment_order FROM lesson_segment
               WHERE lesson_id = ? ORDER BY segment_order, segment_id""",
                    { rs, _ ->
                        val segmentId = rs.getString("segment_id")
                        LessonSegment(
                            segmentId,
                            rs.getString("title"),
                            rs.getInt("segment_order"),
                            contentBySegment[segmentId].orEmpty().map { it.contentId },
                        )
                    },
                    lessonId,
                ).filter { it.contentIds.isNotEmpty() }
                .toMutableList()
        val legacyId = "legacy-$lessonId"
        if (legacyId in contentBySegment && segments.none { it.segmentId == legacyId }) {
            segments +=
                LessonSegment(
                    legacyId,
                    lesson.title,
                    (
                        segments.maxOfOrNull {
                            it.order
                        } ?: 0
                    ) + 1,
                    contentBySegment.getValue(legacyId).map { it.contentId },
                )
        }
        check(segments.flatMap { it.contentIds }.toSet() == contents.map { it.contentId }.toSet())
        return lesson.copy(segments = segments, contents = contents)
    }

    private fun unlockNextLesson(
        userId: Long,
        courseId: Long,
        today: LocalDate,
    ) {
        val alreadyUnlocked =
            jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM course_daily_unlock WHERE user_id = ? AND course_id = ? AND unlock_date = ?)",
                Boolean::class.java,
                userId,
                courseId,
                today,
            ) ?: false
        if (alreadyUnlocked) return
        val nextLessonId =
            jdbc
                .query(
                    """SELECT l.lesson_id FROM lesson l
                   WHERE l.course_id = ?
                     AND NOT EXISTS (SELECT 1 FROM lesson_progress lp WHERE lp.user_id = ? AND lp.lesson_id = l.lesson_id)
                   ORDER BY l.lesson_order, l.lesson_id LIMIT 1""",
                    { rs, _ -> rs.getLong("lesson_id") },
                    courseId,
                    userId,
                ).firstOrNull() ?: return
        val unlockedAt = Timestamp.from(clock.instant())
        jdbc.update(
            "INSERT INTO lesson_progress(user_id, lesson_id, course_id, status, unlocked_at) VALUES (?, ?, ?, 'UNLOCKED', ?)",
            userId,
            nextLessonId,
            courseId,
            unlockedAt,
        )
        jdbc.update(
            "INSERT INTO course_daily_unlock(user_id, course_id, unlock_date, lesson_id, unlocked_at) VALUES (?, ?, ?, ?, ?)",
            userId,
            courseId,
            today,
            nextLessonId,
            unlockedAt,
        )
    }

    private fun ensureUser(userId: Long) {
        val status = jdbc.query("SELECT status FROM app_user WHERE user_id = ?", { rs, _ -> rs.getString(1) }, userId).firstOrNull()
        if (status == null) throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        if (status == "WITHDRAWN") throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
    }

    private fun requireId(id: Long) {
        if (id <= 0) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
    }
}

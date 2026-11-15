package com.bawibase.chorong.domain.learning

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.quiz.service.QuizService
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class LearningService(
    private val jdbc: JdbcTemplate,
    private val quizService: QuizService,
    private val mapper: ObjectMapper,
    private val unlocks: LessonUnlockService,
) {
    @Transactional(readOnly = true)
    fun listCourses(userId: Long): List<CourseSummary> {
        requireId(userId)
        val locked = unlocks.map(userId).lockedCourseIds
        return jdbc.query(
            """SELECT c.course_id, c.slug, c.title, c.description, c.course_order, c.category, c.topic,
                      COUNT(DISTINCT l.lesson_id)::int AS total,
                      COUNT(DISTINCT lp.lesson_id) FILTER (WHERE lp.status = 'COMPLETED')::int AS completed
               FROM course c
               LEFT JOIN lesson l ON l.course_id = c.course_id
               LEFT JOIN lesson_progress lp ON lp.lesson_id = l.lesson_id AND lp.user_id = ?
               WHERE NOT c.is_onboarding
               GROUP BY c.course_id ORDER BY c.course_order, c.course_id""",
            { rs, _ ->
                CourseSummary(
                    courseId = rs.getLong("course_id"),
                    slug = rs.getString("slug"),
                    title = rs.getString("title"),
                    description = rs.getString("description"),
                    order = rs.getInt("course_order"),
                    category = rs.getString("category"),
                    topic = rs.getString("topic"),
                    locked = rs.getLong("course_id") in locked,
                    totalLessons = rs.getInt("total"),
                    completedLessons = rs.getInt("completed"),
                )
            },
            userId,
        )
    }

    @Transactional(readOnly = true)
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
                    """SELECT c.course_id, c.slug, c.title, c.description, c.course_order, c.category, c.topic,
                          COUNT(l.lesson_id)::int AS total,
                          COUNT(lp.lesson_id) FILTER (WHERE lp.status = 'COMPLETED')::int AS completed
                   FROM course c
                   LEFT JOIN lesson l ON l.course_id = c.course_id
                   LEFT JOIN lesson_progress lp ON lp.lesson_id = l.lesson_id AND lp.user_id = ?
                   WHERE c.course_id = ? AND NOT c.is_onboarding
                   GROUP BY c.course_id""",
                    { rs, _ ->
                        CourseDetail(
                            courseId = rs.getLong("course_id"),
                            slug = rs.getString("slug"),
                            title = rs.getString("title"),
                            description = rs.getString("description"),
                            order = rs.getInt("course_order"),
                            category = rs.getString("category"),
                            topic = rs.getString("topic"),
                            totalLessons = rs.getInt("total"),
                            completedLessons = rs.getInt("completed"),
                            constellation = null,
                            lessons = emptyList(),
                        )
                    },
                    userId,
                    courseId,
                ).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.NOT_FOUND)

        val map = unlocks.map(userId)
        val lessons =
            jdbc.query(
                """SELECT l.lesson_id, l.slug, l.title, l.keyword, l.lesson_order, lp.completed_at
                   FROM lesson l
                   LEFT JOIN lesson_progress lp ON lp.lesson_id = l.lesson_id AND lp.user_id = ?
                   WHERE l.course_id = ? ORDER BY l.lesson_order, l.lesson_id""",
                { rs, _ ->
                    val status = map.status(rs.getLong("lesson_id")) ?: "LOCKED"
                    val completedAt = rs.getTimestamp("completed_at")?.toInstant()
                    LessonSummary(
                        lessonId = rs.getLong("lesson_id"),
                        slug = rs.getString("slug"),
                        title = rs.getString("title"),
                        keyword = rs.getString("keyword"),
                        order = rs.getInt("lesson_order"),
                        status = status,
                        completedAt = completedAt,
                    )
                },
                userId,
                courseId,
            )
        return course.copy(locked = course.courseId in map.lockedCourseIds, lessons = lessons)
    }

    @Transactional(readOnly = true)
    fun getLesson(lessonId: Long): LessonDetail {
        requireId(lessonId)
        var onboarding = false
        val lesson =
            jdbc
                .query(
                    """SELECT l.lesson_id, l.course_id, l.slug, l.title, l.keyword, l.description, l.content_version, l.source,
                          l.ending_text, l.ending_image_url, c.is_onboarding
                       FROM lesson l JOIN course c ON c.course_id = l.course_id
                       WHERE l.lesson_id = ?""",
                    { rs, _ ->
                        onboarding = rs.getBoolean("is_onboarding")
                        LessonDetail(
                            lessonId = rs.getLong("lesson_id"),
                            courseId = rs.getLong("course_id"),
                            slug = rs.getString("slug"),
                            title = rs.getString("title"),
                            keyword = rs.getString("keyword"),
                            description = rs.getString("description"),
                            version = rs.getInt("content_version"),
                            source = rs.getString("source"),
                            ending = LessonEnding(rs.getString("ending_text"), rs.getString("ending_image_url")),
                            segments = emptyList(),
                            contents = emptyList(),
                        )
                    },
                    lessonId,
                ).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.NOT_FOUND)
        val loaded =
            jdbc.query(
                """SELECT content_id, content_order, content_type, body, media_url, keyword, quiz_id, segment_id, dialogue, source
                   FROM lesson_content WHERE lesson_id = ? ORDER BY content_order, content_id""",
                { rs, _ ->
                    val quizId = rs.getLong("quiz_id").let { if (rs.wasNull()) null else it }
                    LearningContent(
                        contentId = rs.getLong("content_id"),
                        order = rs.getInt("content_order"),
                        segmentId = rs.getString("segment_id") ?: "legacy-$lessonId",
                        contentType = rs.getString("content_type"),
                        body = rs.getString("body"),
                        mediaUrl = rs.getString("media_url"),
                        keyword = rs.getString("keyword"),
                        quiz = quizId?.let { quizService.get(it) },
                        dialogue =
                            mapper.readTree(rs.getString("dialogue")).map { line ->
                                val speaker = line["speaker"]
                                require(
                                    line.isObject &&
                                        (speaker == null || speaker.isTextual) &&
                                        line["text"]?.isTextual == true,
                                ) {
                                    "Invalid dialogue for content ${rs.getLong("content_id")}"
                                }
                                DialogueLine(speaker?.textValue(), line["text"].textValue())
                            },
                        source = rs.getString("source"),
                    )
                },
                lessonId,
            )
        // 학습 레슨의 첫 퀴즈는 레슨을 여는 질문이라 채점하지 않는다. 온보딩은 모두 채점한다.
        val firstQuizId = if (onboarding) null else loaded.firstOrNull { it.quiz != null }?.contentId
        val contents =
            loaded.map { content ->
                if (content.contentId == firstQuizId) content.copy(quiz = content.quiz?.copy(graded = false)) else content
            }
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

    private fun ensureUser(userId: Long) {
        val status = jdbc.query("SELECT status FROM app_user WHERE user_id = ?", { rs, _ -> rs.getString(1) }, userId).firstOrNull()
        if (status == null) throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        if (status == "WITHDRAWN") throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
    }

    private fun requireId(id: Long) {
        if (id <= 0) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
    }
}

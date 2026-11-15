package com.bawibase.chorong.domain.learning.contentimport

import com.bawibase.chorong.domain.quiz.serialization.QuizModelConverter
import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

enum class LessonImportStatus { NEW, CHANGED, UNCHANGED }

data class LessonImportResult(
    val key: String,
    val lessonId: Long,
    val status: LessonImportStatus,
    val version: Int,
)

/** missingLessons는 DB에는 있지만 JSON에 없는 레슨 slug. 지우지 않고 목록 뒤로 보낸다. */
data class ContentImportResult(
    val courseId: Long,
    val lessons: List<LessonImportResult>,
    val missingLessons: List<String>,
)

/**
 * 검사를 통과한 별자리를 slug 기준으로 저장한다. 별자리 하나를 한 트랜잭션으로 처리한다.
 * 코스·레슨 ID는 유지한다. 레슨 hash가 바뀌면 구간·화면을 다시 만들고 content_version 을 1 올린다.
 */
@Service
class ContentImportService(
    private val jdbc: JdbcTemplate,
    private val converter: QuizModelConverter,
    private val mapper: ObjectMapper,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Transactional
    fun import(course: ImportCourse): ContentImportResult {
        val courseId =
            checkNotNull(
                jdbc.queryForObject(
                    """INSERT INTO course (slug, title, description, course_order) VALUES (?, ?, ?, ?)
                       ON CONFLICT (slug) DO UPDATE
                       SET title = EXCLUDED.title, description = EXCLUDED.description,
                           course_order = EXCLUDED.course_order, modified_at = now()
                       RETURNING course_id""",
                    Long::class.java,
                    course.slug,
                    course.title,
                    course.description,
                    course.order,
                ),
            )
        val existing =
            jdbc
                .query(
                    "SELECT lesson_id, slug, content_hash FROM lesson WHERE course_id = ? ORDER BY lesson_order, lesson_id",
                    { rs, _ -> StoredLesson(rs.getLong("lesson_id"), rs.getString("slug"), rs.getString("content_hash")) },
                    courseId,
                ).associateBy { it.slug }
        // uq_lesson_course_order 를 피하려고 기존 순서를 비켜 둔 뒤 새 순서를 매긴다.
        jdbc.update("UPDATE lesson SET lesson_order = lesson_order + $ORDER_SHIFT WHERE course_id = ?", courseId)
        val results =
            course.lessons.mapIndexed { index, lesson ->
                importLesson(courseId, "${course.slug}/${lesson.key}", lesson, index + 1, existing)
            }
        val imported = results.map { "${course.slug}/${it.key}" }.toSet()
        val missing = existing.keys.filter { it !in imported }
        missing.forEachIndexed { index, slug ->
            jdbc.update(
                "UPDATE lesson SET lesson_order = ? WHERE lesson_id = ?",
                results.size + index + 1,
                existing.getValue(slug).lessonId,
            )
        }
        log.info(
            "content.imported courseId={} lessons={} changed={} missing={}",
            courseId,
            results.size,
            results.count { it.status != LessonImportStatus.UNCHANGED },
            missing.size,
        )
        return ContentImportResult(courseId, results, missing)
    }

    private fun importLesson(
        courseId: Long,
        slug: String,
        lesson: ImportLesson,
        order: Int,
        existing: Map<String, StoredLesson>,
    ): LessonImportResult {
        val stored = existing[slug]
        if (stored == null) {
            val lessonId =
                checkNotNull(
                    jdbc.queryForObject(
                        """INSERT INTO lesson (course_id, slug, title, keyword, source, ending_text, ending_image_url,
                                              lesson_order, content_version, content_hash)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?) RETURNING lesson_id""",
                        Long::class.java,
                        courseId,
                        slug,
                        lesson.title,
                        lesson.keyword,
                        lesson.source,
                        lesson.endingText,
                        lesson.endingImageUrl,
                        order,
                        lesson.hash,
                    ),
                )
            writeContents(lessonId, lesson)
            return LessonImportResult(lesson.key, lessonId, LessonImportStatus.NEW, 1)
        }
        if (stored.hash == lesson.hash) {
            jdbc.update("UPDATE lesson SET lesson_order = ? WHERE lesson_id = ?", order, stored.lessonId)
            val version =
                checkNotNull(
                    jdbc.queryForObject("SELECT content_version FROM lesson WHERE lesson_id = ?", Int::class.java, stored.lessonId),
                )
            return LessonImportResult(lesson.key, stored.lessonId, LessonImportStatus.UNCHANGED, version)
        }
        val version =
            checkNotNull(
                jdbc.queryForObject(
                    """UPDATE lesson SET title = ?, keyword = ?, source = ?, ending_text = ?, ending_image_url = ?, lesson_order = ?,
                              content_version = content_version + 1, content_hash = ?, modified_at = now()
                       WHERE lesson_id = ? RETURNING content_version""",
                    Int::class.java,
                    lesson.title,
                    lesson.keyword,
                    lesson.source,
                    lesson.endingText,
                    lesson.endingImageUrl,
                    order,
                    lesson.hash,
                    stored.lessonId,
                ),
            )
        writeContents(stored.lessonId, lesson)
        return LessonImportResult(lesson.key, stored.lessonId, LessonImportStatus.CHANGED, version)
    }

    /**
     * 구간과 화면은 지우고 새로 만든다. 진행 중이던 사용자의 마지막 화면(last_content_id)은 null이 된다.
     * 퀴즈는 레슨 퀴즈·복습 전용 퀴즈 각각 같은 순번이고 유형이 같으면 ID를 유지해 풀이 기록과 복습 풀을 남긴다.
     * 남는 기존 퀴즈는 풀이 기록과 함께 지운다.
     */
    private fun writeContents(
        lessonId: Long,
        lesson: ImportLesson,
    ) {
        jdbc.update("DELETE FROM lesson_content WHERE lesson_id = ?", lessonId)
        jdbc.update("DELETE FROM lesson_segment WHERE lesson_id = ?", lessonId)
        val old =
            jdbc.query(
                "SELECT quiz_id, interaction_type, review_only FROM quiz_item WHERE lesson_id = ? ORDER BY quiz_order, quiz_id",
                { rs, _ -> StoredQuiz(rs.getLong("quiz_id"), rs.getString("interaction_type"), rs.getBoolean("review_only")) },
                lessonId,
            )
        val lessonQuizzes = lesson.screens.filterIsInstance<QuizScreen>().map { it.quiz }
        val kept = mutableSetOf<Long>()
        var quizOrder = 0

        fun save(
            quizzes: List<ImportQuiz>,
            previous: List<StoredQuiz>,
            reviewOnly: Boolean,
        ): List<Long> =
            quizzes.mapIndexed { index, quiz ->
                val reuse = previous.getOrNull(index)?.takeIf { it.type == quiz.definition.interactionType.name }
                saveQuiz(lessonId, quiz, ++quizOrder, reviewOnly, reuse?.quizId).also { kept += it }
            }

        val lessonQuizIds = save(lessonQuizzes, old.filterNot { it.reviewOnly }, reviewOnly = false)
        save(lesson.reviewQuizzes, old.filter { it.reviewOnly }, reviewOnly = true)
        val removed = old.map { it.quizId }.filterNot { it in kept }
        if (removed.isNotEmpty()) {
            val ids = removed.joinToString(",")
            jdbc.update("DELETE FROM quiz_attempt WHERE quiz_id IN ($ids)")
            jdbc.update("DELETE FROM quiz_item WHERE quiz_id IN ($ids)")
        }

        var segmentOrder = 0
        var previousSection: String? = null
        var quizIndex = 0
        lesson.screens.forEachIndexed { index, screen ->
            if (screen.section != previousSection) {
                segmentOrder++
                previousSection = screen.section
                jdbc.update(
                    "INSERT INTO lesson_segment (lesson_id, segment_id, title, segment_order) VALUES (?, ?, ?, ?)",
                    lessonId,
                    "s$segmentOrder",
                    screen.section,
                    segmentOrder,
                )
            }
            val row =
                when (screen) {
                    is NarrationScreen -> ContentRow("TEXT", null, null, null, screen.lines)
                    is ConceptScreen -> ContentRow("IMAGE", screen.imageUrl, screen.keyword, null, screen.lines)
                    is QuizScreen -> ContentRow("QUIZ", null, null, lessonQuizIds[quizIndex++], emptyList())
                }
            jdbc.update(
                """INSERT INTO lesson_content (lesson_id, content_order, content_type, media_url, keyword, quiz_id, segment_id, dialogue, source)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?)""",
                lessonId,
                index + 1,
                row.type,
                row.mediaUrl,
                row.keyword,
                row.quizId,
                "s$segmentOrder",
                mapper.writeValueAsString(
                    row.lines.map { line ->
                        listOfNotNull(line.speaker?.let { "speaker" to it }, "text" to line.text).toMap()
                    },
                ),
                screen.source,
            )
        }
    }

    private fun saveQuiz(
        lessonId: Long,
        quiz: ImportQuiz,
        order: Int,
        reviewOnly: Boolean,
        quizId: Long?,
    ): Long {
        val type = quiz.definition.interactionType.name
        val config = mapper.writeValueAsString(converter.writeConfig(quiz.definition.config))
        val answer = converter.writeAnswer(quiz.definition.answer)?.let(mapper::writeValueAsString)
        if (quizId != null) {
            jdbc.update(
                """UPDATE quiz_item SET question = ?, instruction = ?, interaction_type = ?, config = ?::jsonb, answer = ?::jsonb,
                          explanation = ?, difficulty = ?, quiz_order = ?, source = ?, review_only = ?, modified_at = now()
                   WHERE quiz_id = ?""",
                quiz.question,
                quiz.instruction,
                type,
                config,
                answer,
                quiz.explanation,
                DIFFICULTY,
                order,
                quiz.source,
                reviewOnly,
                quizId,
            )
            return quizId
        }
        return checkNotNull(
            jdbc.queryForObject(
                """INSERT INTO quiz_item (lesson_id, question, instruction, interaction_type, config, answer, explanation,
                                         difficulty, quiz_order, source, review_only)
                   VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?, ?, ?) RETURNING quiz_id""",
                Long::class.java,
                lessonId,
                quiz.question,
                quiz.instruction,
                type,
                config,
                answer,
                quiz.explanation,
                DIFFICULTY,
                order,
                quiz.source,
                reviewOnly,
            ),
        )
    }

    private data class StoredLesson(
        val lessonId: Long,
        val slug: String,
        val hash: String?,
    )

    private data class StoredQuiz(
        val quizId: Long,
        val type: String,
        val reviewOnly: Boolean,
    )

    private class ContentRow(
        val type: String,
        val mediaUrl: String?,
        val keyword: String?,
        val quizId: Long?,
        val lines: List<ImportLine>,
    )

    companion object {
        private const val ORDER_SHIFT = 1_000_000

        /** 가이드에 난이도 칸이 없다. quiz_item.difficulty 는 비울 수 없어 고정값을 넣는다. */
        const val DIFFICULTY = "기본"
    }
}

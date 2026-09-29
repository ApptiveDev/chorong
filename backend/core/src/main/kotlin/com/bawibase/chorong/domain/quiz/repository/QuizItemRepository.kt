package com.bawibase.chorong.domain.quiz.repository

import com.bawibase.chorong.domain.quiz.entity.QuizItemEntity
import org.springframework.data.jpa.repository.JpaRepository

interface QuizItemRepository : JpaRepository<QuizItemEntity, Long> {
    fun findAllByLessonIdOrderByQuizOrderAscIdAsc(lessonId: Long): List<QuizItemEntity>
}

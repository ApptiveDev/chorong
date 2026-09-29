package com.bawibase.chorong.domain.quiz.repository

import com.bawibase.chorong.domain.quiz.entity.QuizAttemptEntity
import org.springframework.data.jpa.repository.JpaRepository

interface QuizAttemptRepository : JpaRepository<QuizAttemptEntity, Long>

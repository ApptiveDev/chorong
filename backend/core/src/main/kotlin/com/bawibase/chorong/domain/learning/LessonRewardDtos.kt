package com.bawibase.chorong.domain.learning

import com.bawibase.chorong.domain.user.controller.WalletBalancesResponse
import com.fasterxml.jackson.annotation.JsonInclude
import java.time.Instant

data class LearningRewardBadge(
    val badgeType: String,
    val constellationId: Long,
    val lessonId: Long? = null,
)

data class LearningReward(
    val type: String,
    val currency: String? = null,
    val amount: Long? = null,
    val itemId: Long? = null,
    val badge: LearningRewardBadge? = null,
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val artwork: LearningArtwork? = null,
)

data class LearningArtwork(
    val artworkId: Long,
    val lessonId: Long,
    val imageUrl: String,
    val completedAt: Instant,
)

data class QuizSummary(
    val correctCount: Int,
    val totalCount: Int,
)

data class LessonCompleteResponse(
    val rewards: List<LearningReward>,
    val wallet: WalletBalancesResponse,
    val courseCompleted: Boolean,
    val quizSummary: QuizSummary = QuizSummary(0, 0),
)

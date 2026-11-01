package com.bawibase.chorong.domain.learning

import com.bawibase.chorong.domain.user.controller.WalletBalancesResponse

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
)

data class LessonCompleteResponse(
    val rewards: List<LearningReward>,
    val wallet: WalletBalancesResponse,
    val courseCompleted: Boolean,
)

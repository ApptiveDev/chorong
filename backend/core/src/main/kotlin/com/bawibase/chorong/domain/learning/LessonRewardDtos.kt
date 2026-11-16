package com.bawibase.chorong.domain.learning

import com.bawibase.chorong.domain.user.controller.WalletBalancesResponse
import com.fasterxml.jackson.annotation.JsonInclude

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
    // 별자리 완성 보너스에만 쓰는 필드. 없으면 응답에서 뺀다.
    @field:JsonInclude(JsonInclude.Include.NON_NULL) val optionId: Long? = null,
    @field:JsonInclude(JsonInclude.Include.NON_NULL) val storyId: Long? = null,
    @field:JsonInclude(JsonInclude.Include.NON_NULL) val convertedEnergy: Int? = null,
)

/** GRANTED 별가루 지급·에너지 1 사용, NO_ENERGY 에너지가 없어 보상 미수령 유지, ALREADY_GRANTED 이미 받은 레슨. */
enum class LessonRewardStatus { GRANTED, NO_ENERGY, ALREADY_GRANTED }

data class NextLesson(
    val lessonId: Long,
    val courseId: Long,
    val title: String,
)

/** 기본값은 0.4.0 이전에 저장한 멱등 응답을 다시 읽을 때만 쓰인다. */
data class LessonCompleteResponse(
    val rewards: List<LearningReward>,
    val wallet: WalletBalancesResponse,
    val rewardStatus: LessonRewardStatus = LessonRewardStatus.ALREADY_GRANTED,
    val firstLesson: Boolean = false,
    val firstCompletion: Boolean = false,
    val courseCompleted: Boolean = false,
    val nextLesson: NextLesson? = null,
)

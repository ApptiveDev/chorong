package com.bawibase.chorong.domain.learning

import com.bawibase.chorong.domain.user.service.UserWalletService
import com.bawibase.chorong.domain.user.service.WalletCurrency
import org.slf4j.LoggerFactory
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * 별자리 완성 보너스. 코스를 처음 완성할 때 그 코스에 등록한 보너스를 모두 지급한다.
 * 보너스마다 reward_ledger 의 source_key 로 한 번만 지급한다. 에너지와 관계없이 지급한다.
 */
@Service
class ConstellationBonusService(
    private val jdbc: JdbcTemplate,
    private val wallets: UserWalletService,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Transactional
    fun grant(
        userId: Long,
        courseId: Long,
    ): List<LearningReward> {
        val bonuses =
            jdbc.query(
                """SELECT bonus_id, bonus_type, energy, item_id, option_id, story_id
                   FROM constellation_bonus WHERE course_id=? ORDER BY sort_order, bonus_id""",
                { rs, _ ->
                    Bonus(
                        rs.getLong("bonus_id"),
                        rs.getString("bonus_type"),
                        rs.getObject("energy", Integer::class.java)?.toInt(),
                        rs.getObject("item_id", java.lang.Long::class.java)?.toLong(),
                        rs.getObject("option_id", java.lang.Long::class.java)?.toLong(),
                        rs.getObject("story_id", java.lang.Long::class.java)?.toLong(),
                    )
                },
                courseId,
            )
        val rewards = bonuses.filterNot { granted(userId, courseId, it.id) }.flatMap { grantOne(userId, courseId, it) }
        if (rewards.isNotEmpty()) {
            log.info("learning.constellation_bonus.granted userId={} courseId={} rewardCount={}", userId, courseId, rewards.size)
        }
        return rewards
    }

    private fun grantOne(
        userId: Long,
        courseId: Long,
        bonus: Bonus,
    ): List<LearningReward> =
        when (bonus.type) {
            "ENERGY" -> {
                grantEnergy(userId, courseId, bonus.id, checkNotNull(bonus.energy))
            }

            "UNLOCK" -> {
                val itemId = checkNotNull(bonus.itemId)
                jdbc.update(
                    """INSERT INTO user_store_unlock(user_id,item_id,option_id) VALUES (?,?,?)
                       ON CONFLICT (user_id,item_id,COALESCE(option_id,0)) DO NOTHING""",
                    userId,
                    itemId,
                    bonus.optionId,
                )
                insert(
                    userId,
                    courseId,
                    "${prefix(courseId, bonus.id)}UNLOCK",
                    "UNLOCK",
                    itemId = itemId,
                    optionId = bonus.optionId,
                )
                listOf(LearningReward(type = "UNLOCK", itemId = itemId, optionId = bonus.optionId))
            }

            "STORY" -> {
                val storyId = checkNotNull(bonus.storyId)
                insert(userId, courseId, "${prefix(courseId, bonus.id)}STORY", "STORY", storyId = storyId)
                listOf(LearningReward(type = "STORY", storyId = storyId))
            }

            else -> {
                error("unknown bonus type ${bonus.type}")
            }
        }

    /** 에너지는 최대치까지만 채운다. 넘친 1개당 별가루 10개를 convertedEnergy 와 함께 준다. */
    private fun grantEnergy(
        userId: Long,
        courseId: Long,
        bonusId: Long,
        amount: Int,
    ): List<LearningReward> {
        val overflow = wallets.addEnergy(userId, amount)
        val added = amount - overflow
        val rewards = mutableListOf<LearningReward>()
        if (added > 0) {
            insert(userId, courseId, "${prefix(courseId, bonusId)}ENERGY", "WALLET", currency = "ENERGY", amount = added.toLong())
            rewards += LearningReward("WALLET", "ENERGY", added.toLong())
        }
        if (overflow > 0) {
            val stardust = overflow * STARDUST_PER_ENERGY
            insert(
                userId,
                courseId,
                "${prefix(courseId, bonusId)}STARDUST",
                "WALLET",
                currency = "STARDUST",
                amount = stardust,
                convertedEnergy = overflow,
            )
            wallets.credit(userId, WalletCurrency.STARDUST, stardust)
            rewards += LearningReward("WALLET", "STARDUST", stardust, convertedEnergy = overflow)
        }
        return rewards
    }

    private fun granted(
        userId: Long,
        courseId: Long,
        bonusId: Long,
    ): Boolean =
        jdbc.queryForObject(
            "SELECT EXISTS (SELECT 1 FROM reward_ledger WHERE user_id=? AND source_key LIKE ?)",
            Boolean::class.java,
            userId,
            "${prefix(courseId, bonusId)}%",
        ) ?: false

    private fun prefix(
        courseId: Long,
        bonusId: Long,
    ) = "COURSE:$courseId:BONUS:$bonusId:"

    private fun insert(
        userId: Long,
        courseId: Long,
        sourceKey: String,
        rewardType: String,
        currency: String? = null,
        amount: Long? = null,
        itemId: Long? = null,
        optionId: Long? = null,
        storyId: Long? = null,
        convertedEnergy: Int? = null,
    ) {
        jdbc.update(
            """INSERT INTO reward_ledger(user_id,source_type,source_id,source_key,reward_type,currency,amount,item_id,option_id,story_id,converted_energy)
               VALUES (?, 'COURSE', ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            userId,
            courseId,
            sourceKey,
            rewardType,
            currency,
            amount,
            itemId,
            optionId,
            storyId,
            convertedEnergy,
        )
    }

    private data class Bonus(
        val id: Long,
        val type: String,
        val energy: Int?,
        val itemId: Long?,
        val optionId: Long?,
        val storyId: Long?,
    )

    companion object {
        const val STARDUST_PER_ENERGY = 10L
    }
}

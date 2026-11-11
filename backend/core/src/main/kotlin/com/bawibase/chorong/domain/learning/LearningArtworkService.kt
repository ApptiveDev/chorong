package com.bawibase.chorong.domain.learning

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import java.sql.Timestamp
import java.time.Instant

@Service
class LearningArtworkService(
    private val jdbc: JdbcTemplate,
) {
    fun grant(
        userId: Long,
        lessonId: Long,
        completedAt: Instant,
    ): LearningReward? {
        val artwork =
            jdbc
                .query(
                    """INSERT INTO learning_artwork(user_id,lesson_id,image_url,completed_at)
               SELECT ?,lesson_id,artwork_image_url,? FROM lesson WHERE lesson_id=? AND artwork_image_url IS NOT NULL
               ON CONFLICT (user_id,lesson_id) DO NOTHING RETURNING artwork_id,lesson_id,image_url,completed_at""",
                    {
                        rs,
                        _,
                        ->
                        LearningArtwork(
                            rs.getLong("artwork_id"),
                            rs.getLong("lesson_id"),
                            rs.getString("image_url"),
                            rs.getTimestamp("completed_at").toInstant(),
                        )
                    },
                    userId,
                    Timestamp.from(completedAt),
                    lessonId,
                ).firstOrNull() ?: return null
        jdbc.update(
            """INSERT INTO reward_ledger(user_id,source_type,source_id,source_key,reward_type,artwork_id)
               VALUES (?, 'LESSON', ?, ?, 'ARTWORK', ?)""",
            userId,
            lessonId,
            "LESSON:$lessonId:ARTWORK",
            artwork.artworkId,
        )
        return LearningReward(type = "ARTWORK", artwork = artwork)
    }
}

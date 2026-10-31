package com.bawibase.chorong.domain.push.repository

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository

@Repository
class PushDeviceRepository(
    private val jdbc: JdbcTemplate,
) {
    fun upsert(
        deviceUuid: String,
        userId: Long,
        platform: String,
        pushToken: String,
    ) {
        jdbc.update(
            """INSERT INTO push_device (device_uuid,user_id,platform,push_token)
                VALUES (?,?,?,?)
                ON CONFLICT (device_uuid) DO UPDATE SET
                    user_id=EXCLUDED.user_id, platform=EXCLUDED.platform,
                    push_token=EXCLUDED.push_token, modified_at=now()""",
            deviceUuid,
            userId,
            platform,
            pushToken,
        )
    }

    fun delete(
        userId: Long,
        deviceUuid: String,
    ): Int = jdbc.update("DELETE FROM push_device WHERE user_id=? AND lower(device_uuid)=lower(?)", userId, deviceUuid)

    fun deleteAll(userId: Long): Int = jdbc.update("DELETE FROM push_device WHERE user_id=?", userId)
}

package com.bawibase.chorong.domain.idempotency

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.time.OffsetDateTime

data class IdempotencyRecord(
    val id: Long,
    val requestHash: String,
    val responseStatus: Int?,
    val responseBody: String?,
)

@Repository
class IdempotencyRecordRepository(
    private val jdbc: JdbcTemplate,
) {
    fun claim(
        userId: Long,
        operationId: String,
        key: String,
        requestHash: String,
        now: OffsetDateTime,
        expiresAt: OffsetDateTime,
    ) {
        jdbc.update(
            """INSERT INTO idempotency_record
                (user_id,operation_id,idempotency_key,request_hash,response_status,response_body,created_at,expires_at)
                VALUES (?,?,?, ?,NULL,NULL,?,?)
                ON CONFLICT (user_id,operation_id,idempotency_key) DO UPDATE SET
                    request_hash=EXCLUDED.request_hash,
                    response_status=NULL,
                    response_body=NULL,
                    created_at=EXCLUDED.created_at,
                    expires_at=EXCLUDED.expires_at
                WHERE idempotency_record.expires_at <= EXCLUDED.created_at""",
            userId,
            operationId,
            key,
            requestHash,
            now,
            expiresAt,
        )
    }

    fun findForUpdate(
        userId: Long,
        operationId: String,
        key: String,
    ): IdempotencyRecord? =
        jdbc
            .query(
                """SELECT idempotency_record_id,request_hash,response_status,response_body
                    FROM idempotency_record
                    WHERE user_id=? AND operation_id=? AND idempotency_key=?
                    FOR UPDATE""",
                { rs, _ ->
                    val status = rs.getInt("response_status").let { value -> if (rs.wasNull()) null else value }
                    IdempotencyRecord(
                        id = rs.getLong("idempotency_record_id"),
                        requestHash = rs.getString("request_hash").trim(),
                        responseStatus = status,
                        responseBody = rs.getString("response_body"),
                    )
                },
                userId,
                operationId,
                key,
            ).singleOrNull()

    fun complete(
        id: Long,
        status: Int,
        body: String,
    ) {
        jdbc.update(
            "UPDATE idempotency_record SET response_status=?,response_body=? WHERE idempotency_record_id=?",
            status,
            body,
            id,
        )
    }

    fun deleteExpired(now: OffsetDateTime): Int = jdbc.update("DELETE FROM idempotency_record WHERE expires_at <= ?", now)
}

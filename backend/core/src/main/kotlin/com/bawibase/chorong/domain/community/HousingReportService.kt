package com.bawibase.chorong.domain.community

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.common.api.FieldViolation
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

data class HousingReportRequest(
    val housingId: Long,
    // 생략하면 OTHER 로 저장한다.
    val reason: String? = null,
    val detail: String? = null,
)

data class HousingReportResponse(
    val reportId: Long,
)

@Service
class HousingReportService(
    private val jdbc: JdbcTemplate,
) {
    @Transactional
    fun report(
        reporterUserId: Long,
        request: HousingReportRequest,
    ): HousingReportResponse {
        requireId(reporterUserId)
        requireId(request.housingId)
        if (reporterUserId == request.housingId) throw ApiV1Exception(ApiErrorCode.SELF_TARGET)
        val reason = request.reason ?: DEFAULT_REASON
        if (reason !in REASONS) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        // 신고 사유는 자유 입력이 필수다. 앞뒤 공백을 뺀 뒤 1~255자.
        val detail = request.detail?.trim().orEmpty()
        if (detail.codePointCount(0, detail.length) !in 1..MAX_DETAIL_LENGTH) {
            throw ApiV1Exception(
                ApiErrorCode.VALIDATION_FAILED,
                fields = listOf(FieldViolation("detail", "신고 사유를 1~255자로 입력하세요.")),
            )
        }
        requireActiveMember(reporterUserId)
        requireActiveTarget(request.housingId)

        jdbc.execute("SELECT pg_advisory_xact_lock(${request.housingId})")
        val insertedReportId =
            jdbc
                .query(
                    """INSERT INTO housing_report(housing_user_id,reporter_user_id,reason,detail)
                   SELECT ?,?,?,? WHERE NOT EXISTS (
                     SELECT 1 FROM housing_report WHERE housing_user_id=? AND reporter_user_id=?
                       AND created_at>now()-INTERVAL '24 hours'
                   ) RETURNING report_id""",
                    { rs, _ -> rs.getLong("report_id") },
                    request.housingId,
                    reporterUserId,
                    reason,
                    detail,
                    request.housingId,
                    reporterUserId,
                ).firstOrNull()
        val reportId =
            insertedReportId ?: jdbc
                .query(
                    """SELECT report_id FROM housing_report
                   WHERE housing_user_id=? AND reporter_user_id=? AND created_at>now()-INTERVAL '24 hours'
                   ORDER BY created_at DESC LIMIT 1""",
                    { rs, _ -> rs.getLong("report_id") },
                    request.housingId,
                    reporterUserId,
                ).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.INTERNAL)

        hideIfThresholdReached(request.housingId)
        return HousingReportResponse(reportId)
    }

    @Transactional(readOnly = true)
    fun isHidden(housingUserId: Long): Boolean =
        jdbc.queryForObject(
            "SELECT EXISTS (SELECT 1 FROM housing_moderation_hide WHERE housing_user_id=? AND hidden_until>now())",
            Boolean::class.java,
            housingUserId,
        ) ?: false

    private fun hideIfThresholdReached(housingUserId: Long) {
        jdbc.update(
            """INSERT INTO housing_moderation_hide(housing_user_id,hidden_until,triggered_at)
               SELECT ?,now()+INTERVAL '30 days',now()
               WHERE (SELECT COUNT(DISTINCT reporter_user_id) FROM housing_report
                      WHERE housing_user_id=? AND created_at>now()-INTERVAL '24 hours') >= ?
               ON CONFLICT (housing_user_id) DO UPDATE
                 SET hidden_until=EXCLUDED.hidden_until,triggered_at=EXCLUDED.triggered_at
                 WHERE housing_moderation_hide.hidden_until<=now()""",
            housingUserId,
            housingUserId,
            REPORT_THRESHOLD,
        )
    }

    private fun requireActiveMember(userId: Long) {
        val active =
            jdbc
                .query(
                    "SELECT status='ACTIVE' FROM app_user WHERE user_id=?",
                    { rs, _ -> rs.getBoolean(1) },
                    userId,
                ).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        if (!active) throw ApiV1Exception(ApiErrorCode.MEMBER_ONLY)
    }

    private fun requireActiveTarget(userId: Long) {
        val active =
            jdbc
                .query(
                    "SELECT status='ACTIVE' FROM app_user WHERE user_id=?",
                    { rs, _ -> rs.getBoolean(1) },
                    userId,
                ).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.NOT_FOUND)
        if (!active) throw ApiV1Exception(ApiErrorCode.NOT_FOUND)
    }

    private fun requireId(id: Long) {
        if (id <= 0) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
    }

    companion object {
        private const val REPORT_THRESHOLD = 3
        private const val MAX_DETAIL_LENGTH = 255
        private const val DEFAULT_REASON = "OTHER"
        private val REASONS = setOf("INAPPROPRIATE_NAME", "ABUSE", "SPAM", "OTHER")
    }
}

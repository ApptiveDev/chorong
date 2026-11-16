package com.bawibase.chorong.domain.user

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.user.entity.UserEntity
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import java.security.SecureRandom

/** 닉네임 중복 확인과 회원 기본 닉네임 부여. 중복의 최종 방어선은 uq_app_user_nickname 이다. */
@Service
class UserNicknameService(
    private val jdbc: JdbcTemplate,
) {
    private val random = SecureRandom()

    /** 회원이 되는 시점에 닉네임이 없으면 `No. ` + 무작위 숫자 8자리를 넣는다. 비회원은 비워 둔다. */
    fun assignDefaultIfMissing(user: UserEntity) {
        if (user.nickname == null) user.nickname = newDefault()
    }

    fun newDefault(): String {
        repeat(MAX_ATTEMPTS) {
            val candidate = DEFAULT_PREFIX + "%08d".format(random.nextInt(100_000_000))
            if (!taken(candidate, null)) return candidate
        }
        error("default nickname exhausted")
    }

    fun requireAvailable(
        nickname: String,
        userId: Long,
    ) {
        if (taken(nickname, userId)) throw ApiV1Exception(ApiErrorCode.NICKNAME_TAKEN)
    }

    private fun taken(
        nickname: String,
        exceptUserId: Long?,
    ): Boolean =
        jdbc.queryForObject(
            "SELECT EXISTS (SELECT 1 FROM app_user WHERE nickname = ? AND user_id <> ?)",
            Boolean::class.java,
            nickname,
            exceptUserId ?: 0L,
        ) ?: false

    companion object {
        const val DEFAULT_PREFIX = "No. "
        private const val MAX_ATTEMPTS = 10
    }
}

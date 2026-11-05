package com.bawibase.chorong.domain.user

import com.bawibase.chorong.common.api.ApiV1Exception
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class UserNicknamePolicyTest {
    @Test fun `display name supplies a contract value when nickname is missing`() {
        assertEquals("게스트", UserNicknamePolicy.displayName(null, UserStatus.GUEST))
        assertEquals("사용자", UserNicknamePolicy.displayName(null, UserStatus.ACTIVE))
        assertEquals("민지", UserNicknamePolicy.displayName("민지", UserStatus.GUEST))
    }

    @Test fun `accepts boundary lengths without changing supplied text`() {
        for (value in listOf("초롱", "가".repeat(12), " 별 ", "𐐀".repeat(12))) {
            assertEquals(value, UserNicknamePolicy.validate(value))
        }
    }

    @Test fun `rejects blank too short and too long nicknames`() {
        for (value in listOf("", "  ", "가", "가".repeat(13))) {
            val error = assertFailsWith<ApiV1Exception> { UserNicknamePolicy.validate(value) }
            assertEquals(
                "nickname",
                error.error.fields
                    ?.single()
                    ?.field,
            )
        }
    }
}

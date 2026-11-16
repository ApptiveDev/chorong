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

    @Test fun `accepts one to ten characters after trimming`() {
        for (value in listOf("초", "가".repeat(10), "𐐀".repeat(10))) {
            assertEquals(value, UserNicknamePolicy.validate(value))
        }
        assertEquals("별", UserNicknamePolicy.validate(" 별 "))
        assertEquals("가".repeat(10), UserNicknamePolicy.validate("  " + "가".repeat(10) + "  "))
    }

    @Test fun `rejects blank too short and too long nicknames`() {
        for (value in listOf("", "  ", "가".repeat(11), "𐐀".repeat(11))) {
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

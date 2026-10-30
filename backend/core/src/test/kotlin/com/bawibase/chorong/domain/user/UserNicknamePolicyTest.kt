package com.bawibase.chorong.domain.user

import com.bawibase.chorong.common.api.ApiV1Exception
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class UserNicknamePolicyTest {
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

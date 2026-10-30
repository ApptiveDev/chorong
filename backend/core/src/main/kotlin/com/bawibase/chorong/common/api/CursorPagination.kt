package com.bawibase.chorong.common.api

import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component
import java.time.Instant
import java.util.Base64

enum class CursorSort { INSTANT, LONG }

data class CursorPosition(
    val sortValue: String,
    val id: Long,
)

/** scope는 목록·정렬·필터를 식별한다. 사용자 범위 제한은 쿼리에서 별도로 검사한다. */
@Component
class CursorCodec(
    objectMapper: ObjectMapper,
) {
    private val mapper =
        objectMapper
            .copy()
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
            .enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)

    fun encode(
        scope: String,
        sort: CursorSort,
        position: CursorPosition,
    ): String {
        require(scope.isNotBlank() && scope.length <= 128)
        require(position.id > 0 && validSortValue(sort, position.sortValue))
        val node =
            mapper
                .createObjectNode()
                .put("v", 1)
                .put("scope", scope)
                .put("sort", sort.name)
                .put("value", position.sortValue)
                .put("id", position.id)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(mapper.writeValueAsBytes(node))
    }

    fun decode(
        cursor: String?,
        scope: String,
        sort: CursorSort,
    ): CursorPosition? {
        if (cursor == null) return null
        try {
            require(cursor.length in 1..1024 && cursor.matches(Regex("[A-Za-z0-9_-]+")))
            val bytes = Base64.getUrlDecoder().decode(cursor)
            require(Base64.getUrlEncoder().withoutPadding().encodeToString(bytes) == cursor)
            val node = mapper.readTree(bytes)
            require(node != null && node.isObject && node.fieldNames().asSequence().toSet() == KEYS)
            require(node["v"].isIntegralNumber && node["v"].intValue() == 1 && node["v"].canConvertToInt())
            require(node["scope"].isTextual && node["scope"].textValue() == scope)
            require(node["sort"].isTextual && node["sort"].textValue() == sort.name)
            require(node["value"].isTextual && validSortValue(sort, node["value"].textValue()))
            require(node["id"].isIntegralNumber && node["id"].canConvertToLong() && node["id"].longValue() > 0)
            return CursorPosition(node["value"].textValue(), node["id"].longValue())
        } catch (_: IllegalArgumentException) {
            invalidCursor()
        } catch (_: com.fasterxml.jackson.core.JacksonException) {
            invalidCursor()
        }
    }

    private fun validSortValue(
        sort: CursorSort,
        value: String,
    ): Boolean =
        value.length in 1..64 &&
            when (sort) {
                CursorSort.INSTANT -> runCatching { Instant.parse(value) }.isSuccess
                CursorSort.LONG -> value.toLongOrNull()?.toString() == value
            }

    private fun invalidCursor(): Nothing =
        throw ApiV1Exception(
            ApiErrorCode.VALIDATION_FAILED,
            fields = listOf(FieldViolation("cursor", "커서가 올바르지 않습니다.")),
        )

    companion object {
        private val KEYS = setOf("v", "scope", "sort", "value", "id")
    }
}

data class PageSlice<T>(
    val items: List<T>,
    val meta: PageMeta,
)

object CursorPagination {
    fun size(value: Int = 20): Int {
        if (value !in 1..100) {
            throw ApiV1Exception(
                ApiErrorCode.VALIDATION_FAILED,
                fields = listOf(FieldViolation("size", "1부터 100까지의 정수를 입력하세요.")),
            )
        }
        return value
    }

    /** 쿼리는 정렬값·ID 내림차순으로 size+1개를 읽는다. 마지막 반환 행에서 커서를 만든다. */
    fun <T> page(
        rows: List<T>,
        size: Int,
        encode: (T) -> String,
    ): PageSlice<T> {
        val limit = size(size)
        require(rows.size <= limit + 1)
        val items = rows.take(limit)
        return PageSlice(items, PageMeta(if (rows.size > limit) encode(items.last()) else null))
    }
}

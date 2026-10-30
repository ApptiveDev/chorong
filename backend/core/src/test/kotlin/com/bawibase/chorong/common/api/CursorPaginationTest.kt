package com.bawibase.chorong.common.api

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.Base64
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

class CursorPaginationTest {
    private val mapper = jacksonObjectMapper()
    private val codec = CursorCodec(mapper)

    @Test
    fun `round trips timestamp and numeric sorts without losing precision`() {
        for ((sort, value) in listOf(
            CursorSort.INSTANT to "2026-10-31T01:02:03.123456789Z",
            CursorSort.LONG to Long.MAX_VALUE.toString(),
        )) {
            val position = CursorPosition(value, Long.MAX_VALUE)
            assertEquals(position, codec.decode(codec.encode("rewards:me", sort, position), "rewards:me", sort))
        }
        assertNull(codec.decode(null, "rewards:me", CursorSort.INSTANT))
    }

    @Test
    fun `rejects malformed cursors mismatched scope sort and unsupported versions`() {
        val valid = codec.encode("explore:popular", CursorSort.LONG, CursorPosition("4", 7))
        val payload = mapper.readTree(Base64.getUrlDecoder().decode(valid))
        val modified =
            listOf(
                payload.deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>().put("v", 2),
                payload.deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>().put("id", 0),
                payload.deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>().put("id", "7"),
                payload.deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>().put("id", 1.5),
                payload.deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>().put("value", "NaN"),
                payload.deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>().put("extra", "field"),
            ).map { Base64.getUrlEncoder().withoutPadding().encodeToString(mapper.writeValueAsBytes(it)) }
        val badJson =
            listOf(
                "{",
                "[]",
                "null",
                mapper.writeValueAsString(payload) + " {}",
                mapper.writeValueAsString(payload).replace(""""v":1""", """"v":1,"v":1"""),
            ).map { Base64.getUrlEncoder().withoutPadding().encodeToString(it.toByteArray()) }
        for (cursor in listOf("", " ", "!!", "x".repeat(1025), valid + "=") + modified + badJson) {
            val e = assertFailsWith<ApiV1Exception> { codec.decode(cursor, "explore:popular", CursorSort.LONG) }
            assertEquals(ApiErrorCode.VALIDATION_FAILED, e.error.code)
            assertEquals(
                "cursor",
                e.error.fields
                    ?.single()
                    ?.field,
            )
        }
        assertFailsWith<ApiV1Exception> { codec.decode(valid, "explore:recent", CursorSort.LONG) }
        assertFailsWith<ApiV1Exception> { codec.decode(valid, "explore:popular", CursorSort.INSTANT) }
    }

    @Test
    fun `keyset pages include each tied row exactly once`() {
        val rows = listOf(9L to 8L, 9L to 7L, 9L to 6L, 8L to 5L, 8L to 4L, 8L to 3L, 7L to 2L)
        val received = mutableListOf<Pair<Long, Long>>()
        var cursor: String? = null
        do {
            val position = codec.decode(cursor, "explore:popular", CursorSort.LONG)
            val fetched =
                rows
                    .filter { row ->
                        position == null || row.first < position.sortValue.toLong() ||
                            (row.first == position.sortValue.toLong() && row.second < position.id)
                    }.take(3)
            val page =
                CursorPagination.page(fetched, 2) {
                    codec.encode("explore:popular", CursorSort.LONG, CursorPosition(it.first.toString(), it.second))
                }
            received.addAll(page.items)
            cursor = page.meta.nextCursor
        } while (cursor != null)
        assertEquals(rows, received)
    }

    @Test
    fun `same timestamp uses unique id as a tie breaker`() {
        val value = Instant.parse("2026-10-31T00:00:00Z").toString()
        val rows = (1L..5L).reversed().map { CursorPosition(value, it) }
        val first = CursorPagination.page(rows.take(3), 2) { codec.encode("rewards", CursorSort.INSTANT, it) }
        val position = codec.decode(first.meta.nextCursor, "rewards", CursorSort.INSTANT)!!
        val next = rows.filter { it.id < position.id }.take(3)
        assertEquals(listOf(3L, 2L), CursorPagination.page(next, 2) { "next" }.items.map { it.id })
    }

    @Test
    fun `page size bounds and terminal cursor are explicit`() {
        assertEquals(20, CursorPagination.size())
        assertEquals(1, CursorPagination.size(1))
        assertEquals(100, CursorPagination.size(100))
        for (size in listOf(-1, 0, 101, Int.MAX_VALUE)) assertFailsWith<ApiV1Exception> { CursorPagination.size(size) }
        val page = CursorPagination.page(listOf(1, 2), 2) { "unused" }
        assertNull(page.meta.nextCursor)
        assertEquals("""{"nextCursor":null}""", mapper.writeValueAsString(page.meta))
        assertNull(CursorPagination.page(emptyList<Int>(), 2) { "unused" }.meta.nextCursor)
    }
}

package com.bawibase.chorong.domain.idempotency

import com.bawibase.chorong.TestcontainersConfig
import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.user.entity.UserEntity
import com.bawibase.chorong.domain.user.repository.UserRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.JdbcTemplate
import java.time.OffsetDateTime
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

data class IdempotencyTestRequest(
    val value: String,
)

data class IdempotencyTestBody(
    val value: String,
    val revision: Int,
)

@SpringBootTest
@Import(TestcontainersConfig::class)
class IdempotencyApiTest {
    @Autowired lateinit var idempotency: IdempotencyService

    @Autowired lateinit var users: UserRepository

    @Autowired lateinit var jdbc: JdbcTemplate

    @Test
    fun `same user operation key and body replays saved status and response`() {
        val userId = userId()
        val calls = AtomicInteger()
        val first = execute(userId, "stable-key", "same") { calls.incrementAndGet() }
        val replay = execute(userId, "stable-key", "same") { calls.incrementAndGet() }

        assertEquals(first, replay)
        assertEquals(1, calls.get())
    }

    @Test
    fun `same key with a different body conflicts while another user has an independent scope`() {
        val userId = userId()
        execute(userId, "shared-key", "first") { 1 }

        val conflict = assertFailsWith<ApiV1Exception> { execute(userId, "shared-key", "changed") { 2 } }
        assertEquals(ApiErrorCode.CONFLICT, conflict.error.code)
        assertEquals(IdempotencyTestBody("first", 1), execute(userId(), "shared-key", "first") { 1 }.body)
    }

    @Test
    fun `failed action rolls back idempotency row and the same key can retry`() {
        val userId = userId()
        assertFailsWith<IllegalStateException> {
            idempotency.execute(
                userId,
                "API-TEST",
                "retry-key",
                IdempotencyTestRequest("request"),
                IdempotencyTestBody::class.java,
            ) {
                jdbc.update("UPDATE app_user SET push_enabled=true WHERE user_id=?", userId)
                throw IllegalStateException("expected test failure")
            }
        }
        assertEquals(0L, count(userId, "API-TEST", "retry-key"))
        assertEquals(false, jdbc.queryForObject("SELECT push_enabled FROM app_user WHERE user_id=?", Boolean::class.java, userId))

        val result =
            idempotency.execute(
                userId,
                "API-TEST",
                "retry-key",
                IdempotencyTestRequest("request"),
                IdempotencyTestBody::class.java,
            ) {
                jdbc.update("UPDATE app_user SET push_enabled=true WHERE user_id=?", userId)
                IdempotentResponse(200, IdempotencyTestBody("retry", 7))
            }
        assertEquals(IdempotencyTestBody("retry", 7), result.body)
        assertEquals(true, jdbc.queryForObject("SELECT push_enabled FROM app_user WHERE user_id=?", Boolean::class.java, userId))
    }

    @Test
    fun `expired key starts a new request and replaces cached response`() {
        val userId = userId()
        execute(userId, "expired-key", "old") { 1 }
        jdbc.update(
            "UPDATE idempotency_record SET expires_at=? WHERE user_id=? AND operation_id=? AND idempotency_key=?",
            OffsetDateTime.now().minusSeconds(1),
            userId,
            "API-TEST",
            "expired-key",
        )

        val refreshed = execute(userId, "expired-key", "new") { 2 }
        assertEquals(IdempotencyTestBody("new", 2), refreshed.body)
        assertEquals(1L, count(userId, "API-TEST", "expired-key"))
    }

    @Test
    fun `concurrent identical requests execute business action once`() {
        val userId = userId()
        val calls = AtomicInteger()
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val tasks =
                (1..2).map {
                    executor.submit<IdempotentResponse<IdempotencyTestBody>> {
                        check(start.await(10, TimeUnit.SECONDS))
                        idempotency.execute(
                            userId,
                            "API-TEST",
                            "parallel-key",
                            IdempotencyTestRequest("parallel"),
                            IdempotencyTestBody::class.java,
                        ) {
                            calls.incrementAndGet()
                            Thread.sleep(150)
                            IdempotentResponse(200, IdempotencyTestBody("parallel", 1))
                        }
                    }
                }
            start.countDown()
            val results = tasks.map { it.get(20, TimeUnit.SECONDS) }
            assertEquals(results[0], results[1])
        } finally {
            executor.shutdownNow()
        }
        assertEquals(1, calls.get())
    }

    private fun execute(
        userId: Long,
        key: String,
        request: String,
        actionResult: () -> Int,
    ): IdempotentResponse<IdempotencyTestBody> =
        idempotency.execute(
            userId,
            "API-TEST",
            key,
            IdempotencyTestRequest(request),
            IdempotencyTestBody::class.java,
        ) {
            IdempotentResponse(200, IdempotencyTestBody(request, actionResult()))
        }

    private fun userId(): Long = checkNotNull(users.saveAndFlush(UserEntity()).id)

    private fun count(
        userId: Long,
        operationId: String,
        key: String,
    ): Long =
        checkNotNull(
            jdbc.queryForObject(
                "SELECT count(*) FROM idempotency_record WHERE user_id=? AND operation_id=? AND idempotency_key=?",
                Long::class.java,
                userId,
                operationId,
                key,
            ),
        )
}

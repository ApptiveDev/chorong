package com.bawibase.chorong.domain.user

import com.fasterxml.jackson.databind.ObjectMapper
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

@Testcontainers
class UserStateMigrationTest {
    @Test fun `v8 upgrade classifies guest-only accounts and preserves all assets and eleven quizzes`() {
        val schema = "user_state_upgrade"

        fun migrate(target: String) =
            Flyway
                .configure()
                .dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
                .schemas(schema)
                .defaultSchema(schema)
                .target(target)
                .load()
                .migrate()
        migrate("8")
        val jdbc = JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password))
        val nickname = "가".repeat(30)
        for ((id, status) in listOf(10L to "ACTIVE", 20L to "ACTIVE", 30L to "ACTIVE", 40L to "WITHDRAWN", 50L to "ACTIVE")) {
            jdbc.update("INSERT INTO $schema.app_user(user_id,status,nickname) VALUES (?,?,?)", id, status, nickname)
        }
        for ((id, provider) in listOf(10L to "GUEST", 20L to "PASSWORD", 30L to "GUEST", 30L to "GOOGLE", 40L to "GUEST")) {
            jdbc.update("INSERT INTO $schema.user_auth(user_id,provider,provider_uid) VALUES (?,?,?)", id, provider, "$provider-$id")
        }
        jdbc.update("INSERT INTO $schema.user_wallet(user_id,coin) VALUES (10,321)")
        jdbc.update("INSERT INTO $schema.housing_profile(user_id) VALUES (10)")
        jdbc.update("INSERT INTO $schema.housing_background(background_id,code,name) VALUES (1,'legacy','legacy')")
        jdbc.update("INSERT INTO $schema.housing_owned_item(user_id,item_type,item_id) VALUES (10,'BACKGROUND',1)")
        val mapper = ObjectMapper()
        val input = checkNotNull(javaClass.getResourceAsStream("/quiz/quiz-items.json"))
        val fixtures = input.use { mapper.readTree(it) }.toList()
        assertEquals(11, fixtures.size)
        for (fixture in fixtures) {
            jdbc.update(
                """INSERT INTO $schema.quiz_item(quiz_id,lesson_id,question,instruction,interaction_type,config,answer,explanation,difficulty,quiz_order)
                VALUES (?,23,?,?,?,?::jsonb,?::jsonb,?,?,?)""",
                fixture["quizOrder"].asLong(),
                fixture["question"].asText(),
                fixture["instruction"].asText(),
                fixture["interactionType"].asText(),
                fixture["config"].toString(),
                fixture["answer"].toString(),
                fixture["explanation"].asText(),
                fixture["difficulty"].asText(),
                fixture["quizOrder"].asInt(),
            )
        }
        jdbc.update(
            """INSERT INTO $schema.quiz_attempt(quiz_id,user_id,response,graded,correct,completed)
            VALUES (1,10,'{}'::jsonb,true,true,true)""",
        )
        val before =
            jdbc.queryForList(
                "SELECT quiz_id,lesson_id,question,instruction,interaction_type,config::text,answer::text,explanation,difficulty,quiz_order FROM $schema.quiz_item ORDER BY quiz_id",
            )

        migrate("9")

        val expected = mapOf(10L to "GUEST", 20L to "ACTIVE", 30L to "ACTIVE", 40L to "WITHDRAWN", 50L to "ACTIVE")
        for ((id, status) in expected) {
            val row = jdbc.queryForMap("SELECT * FROM $schema.app_user WHERE user_id=?", id)
            assertEquals(status, row["status"])
            assertEquals(nickname, row["nickname"])
            assertEquals(false, row["push_enabled"])
            assertEquals(false, row["onboarding_completed"])
            assertEquals(0, row["streak_days"])
            assertEquals(null, row["last_study_date"])
        }
        assertEquals(321L, jdbc.queryForObject("SELECT coin FROM $schema.user_wallet WHERE user_id=10", Long::class.java))
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM $schema.housing_profile WHERE user_id=10", Int::class.java))
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM $schema.housing_owned_item WHERE user_id=10", Int::class.java))
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM $schema.quiz_attempt WHERE user_id=10", Int::class.java))
        assertEquals(
            before,
            jdbc.queryForList(
                "SELECT quiz_id,lesson_id,question,instruction,interaction_type,config::text,answer::text,explanation,difficulty,quiz_order FROM $schema.quiz_item ORDER BY quiz_id",
            ),
        )
        jdbc.update("INSERT INTO $schema.app_user(user_id) VALUES (60)")
        assertEquals("GUEST", jdbc.queryForObject("SELECT status FROM $schema.app_user WHERE user_id=60", String::class.java))
        assertFailsWith<DataIntegrityViolationException> { jdbc.update("UPDATE $schema.app_user SET streak_days=-1 WHERE user_id=60") }
        assertFailsWith<DataIntegrityViolationException> { jdbc.update("UPDATE $schema.app_user SET status='UNKNOWN' WHERE user_id=60") }
    }

    @Test fun `v10 keeps historical platform unknown and enforces platform and auth cascade`() {
        val schema = "guest_platform_upgrade"

        fun migrate(target: String) =
            Flyway
                .configure()
                .dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
                .schemas(schema)
                .defaultSchema(schema)
                .target(target)
                .load()
                .migrate()
        migrate("9")
        val jdbc = JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password))
        jdbc.update("INSERT INTO $schema.app_user(user_id) VALUES (10)")
        jdbc.update("INSERT INTO $schema.user_auth(auth_id,user_id,provider,provider_uid) VALUES (3,10,'GUEST','legacy-device')")
        migrate("10")
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM $schema.auth_guest", Int::class.java))
        assertEquals("legacy-device", jdbc.queryForObject("SELECT provider_uid FROM $schema.user_auth WHERE auth_id=3", String::class.java))
        jdbc.update("INSERT INTO $schema.auth_guest(auth_id,platform) VALUES (3,'IOS')")
        assertFailsWith<DataIntegrityViolationException> { jdbc.update("UPDATE $schema.auth_guest SET platform='WEB' WHERE auth_id=3") }
        assertFailsWith<DataIntegrityViolationException> {
            jdbc.update(
                "INSERT INTO $schema.auth_guest(auth_id,platform) VALUES (999,'IOS')",
            )
        }
        jdbc.update("DELETE FROM $schema.user_auth WHERE auth_id=3")
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM $schema.auth_guest", Int::class.java))
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM $schema.app_user WHERE user_id=10", Int::class.java))
    }

    @Test fun `v11 adds empty email sessions without changing existing account or wallet`() {
        val schema = "email_signup_upgrade"

        fun migrate(target: String) =
            Flyway
                .configure()
                .dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
                .schemas(schema)
                .defaultSchema(schema)
                .target(target)
                .load()
                .migrate()
        migrate("10")
        val jdbc = JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password))
        jdbc.update("INSERT INTO $schema.app_user(user_id,nickname) VALUES (10,'legacy')")
        jdbc.update("INSERT INTO $schema.user_wallet(user_id,coin) VALUES (10,321)")
        migrate("11")
        assertEquals("legacy", jdbc.queryForObject("SELECT nickname FROM $schema.app_user WHERE user_id=10", String::class.java))
        assertEquals(321L, jdbc.queryForObject("SELECT coin FROM $schema.user_wallet WHERE user_id=10", Long::class.java))
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM $schema.email_signup_verification", Int::class.java))
        assertFailsWith<DataIntegrityViolationException> {
            jdbc.update(
                """INSERT INTO $schema.email_signup_verification
                (verification_id,user_id,email,password_hash,code_hash,created_at,expires_at)
                VALUES (gen_random_uuid(),999,'a@example.com','hash','hash',now(),now())""",
            )
        }
    }

    companion object {
        @Container
        @JvmField
        val postgres: PostgreSQLContainer<*> = PostgreSQLContainer("postgres:16-alpine")
    }
}

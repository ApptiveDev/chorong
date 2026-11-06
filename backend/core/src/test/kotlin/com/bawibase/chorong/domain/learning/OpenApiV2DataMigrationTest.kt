package com.bawibase.chorong.domain.learning

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class OpenApiV2DataMigrationTest {
    @Test
    fun `v37 backfills lesson segments and prepares inventory artwork and visibility`() {
        val schema = "openapi_v2_upgrade"

        fun migrate(target: String) =
            Flyway
                .configure()
                .dataSource(database.jdbcUrl, database.username, database.password)
                .schemas(schema)
                .defaultSchema(schema)
                .target(target)
                .load()
                .migrate()

        migrate("36")
        val jdbc = JdbcTemplate(DriverManagerDataSource(database.jdbcUrl, database.username, database.password))
        jdbc.update("INSERT INTO $schema.app_user(user_id,status) VALUES (100,'ACTIVE'),(101,'ACTIVE')")
        jdbc.update("INSERT INTO $schema.housing_profile(user_id,is_public) VALUES (100,FALSE)")
        val courseId =
            jdbc.queryForObject(
                "INSERT INTO $schema.course(title,category) VALUES ('과학','SCIENCE') RETURNING course_id",
                Long::class.java,
            )!!
        val lessonId =
            jdbc.queryForObject(
                "INSERT INTO $schema.lesson(course_id,title,lesson_order) VALUES (?,'달',1) RETURNING lesson_id",
                Long::class.java,
                courseId,
            )!!
        val contentId =
            jdbc.queryForObject(
                "INSERT INTO $schema.lesson_content(lesson_id,content_order,content_type,body) VALUES (?,0,'TEXT','본문') RETURNING content_id",
                Long::class.java,
                lessonId,
            )!!

        migrate("37")

        assertEquals("과학", jdbc.queryForObject("SELECT topic FROM $schema.course WHERE course_id=?", String::class.java, courseId))
        assertFailsWith<DataIntegrityViolationException> {
            jdbc.update("INSERT INTO $schema.course(title,category) VALUES ('주제 없음','SCIENCE')")
        }

        assertEquals(
            "legacy-$lessonId",
            jdbc.queryForObject("SELECT segment_id FROM $schema.lesson_content WHERE content_id=?", String::class.java, contentId),
        )
        assertEquals("달", jdbc.queryForObject("SELECT title FROM $schema.lesson_segment WHERE lesson_id=?", String::class.java, lessonId))
        assertEquals(
            "[]",
            jdbc.queryForObject("SELECT dialogue::text FROM $schema.lesson_content WHERE content_id=?", String::class.java, contentId),
        )
        assertEquals(false, jdbc.queryForObject("SELECT is_public FROM $schema.housing_profile WHERE user_id=100", Boolean::class.java))
        jdbc.update("INSERT INTO $schema.housing_profile(user_id) VALUES (101)")
        assertEquals(true, jdbc.queryForObject("SELECT is_public FROM $schema.housing_profile WHERE user_id=101", Boolean::class.java))

        jdbc.update("INSERT INTO $schema.housing_owned_item(user_id,item_type,item_id) VALUES (100,'FURNITURE',1),(100,'FURNITURE',1)")
        assertFailsWith<DataIntegrityViolationException> {
            jdbc.update("INSERT INTO $schema.housing_owned_item(user_id,item_type,item_id) VALUES (100,'ROOM',1),(100,'ROOM',1)")
        }
        val itemId =
            jdbc.queryForObject(
                "INSERT INTO $schema.housing_store_item(name,item_type) VALUES ('의자','FURNITURE') RETURNING item_id",
                Long::class.java,
            )!!
        val optionId =
            jdbc.queryForObject(
                "INSERT INTO $schema.housing_store_option(item_id,currency,price,preview_asset) VALUES (?,'STARDUST',10,'chair') RETURNING option_id",
                Long::class.java,
                itemId,
            )!!
        jdbc.update("INSERT INTO $schema.housing_store_owned_option(user_id,option_id) VALUES (100,?),(100,?)", optionId, optionId)
        assertEquals(
            2,
            jdbc.queryForObject(
                "SELECT count(*) FROM $schema.housing_store_owned_option WHERE user_id=100 AND option_id=?",
                Int::class.java,
                optionId,
            ),
        )

        jdbc.update("UPDATE $schema.lesson SET artwork_image_url='https://example.com/moon.png' WHERE lesson_id=?", lessonId)
        jdbc.update(
            "INSERT INTO $schema.learning_artwork(user_id,lesson_id,image_url,completed_at) VALUES (100,?,'https://example.com/moon.png',now())",
            lessonId,
        )
        assertFailsWith<DataIntegrityViolationException> {
            jdbc.update(
                "INSERT INTO $schema.learning_artwork(user_id,lesson_id,image_url,completed_at) VALUES (100,?,'https://example.com/again.png',now())",
                lessonId,
            )
        }
    }

    companion object {
        private data class DatabaseConnection(
            val jdbcUrl: String,
            val username: String,
            val password: String,
        )

        private val database: DatabaseConnection by lazy {
            val jdbcUrl = System.getenv("CHORONG_MIGRATION_TEST_JDBC_URL")
            if (jdbcUrl != null) {
                DatabaseConnection(
                    jdbcUrl,
                    System.getenv("CHORONG_MIGRATION_TEST_USERNAME") ?: "postgres",
                    System.getenv("CHORONG_MIGRATION_TEST_PASSWORD") ?: "",
                )
            } else {
                PostgreSQLContainer<Nothing>("postgres:16-alpine").apply { start() }.let {
                    DatabaseConnection(it.jdbcUrl, it.username, it.password)
                }
            }
        }
    }
}

package com.bawibase.chorong.domain.learning

import com.bawibase.chorong.domain.push.service.StudyReminderTargetService
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class OpenApiV2DataMigrationTest {
    @Test
    fun `study reminder targets opted in users with a missed day and registered device`() {
        val schema = "openapi_v2_push_targets"
        Flyway
            .configure()
            .dataSource(database.jdbcUrl, database.username, database.password)
            .schemas(schema)
            .defaultSchema(schema)
            .load()
            .migrate()
        val separator = if ('?' in database.jdbcUrl) "&" else "?"
        val source = DriverManagerDataSource(database.jdbcUrl + "${separator}currentSchema=$schema", database.username, database.password)
        val jdbc = JdbcTemplate(source)
        val today = LocalDate.of(2026, 11, 7)
        jdbc.update(
            """INSERT INTO app_user(user_id,status,push_enabled,streak_days,last_study_date) VALUES
               (1,'ACTIVE',true,2,'2026-11-05'), (2,'GUEST',true,3,'2026-11-04'),
               (3,'ACTIVE',true,2,'2026-11-06'), (4,'ACTIVE',true,1,'2026-11-05'),
               (5,'ACTIVE',false,2,'2026-11-05'), (6,'WITHDRAWN',true,2,'2026-11-05'),
               (7,'ACTIVE',true,2,'2026-11-05'), (8,'ACTIVE',true,0,NULL)""",
        )
        for (id in listOf(1, 2, 3, 4, 5, 6, 8)) {
            jdbc.update("INSERT INTO push_device(device_uuid,user_id,platform,push_token) VALUES (?,?,'IOS','token')", "device-$id", id)
        }
        jdbc.update("INSERT INTO push_device(device_uuid,user_id,platform,push_token) VALUES ('second-device',1,'ANDROID','token')")
        assertEquals(listOf(1L, 2L), StudyReminderTargetService(jdbc).findEligibleUserIds(today))
    }

    @Test
    fun `v41 backfills missing starter furniture without duplicating existing inventory`() {
        val schema = "openapi_v2_starter_furniture"

        fun migrate(target: String) =
            Flyway
                .configure()
                .dataSource(database.jdbcUrl, database.username, database.password)
                .schemas(schema)
                .defaultSchema(schema)
                .target(target)
                .load()
                .migrate()
        migrate("40")
        val jdbc = JdbcTemplate(DriverManagerDataSource(database.jdbcUrl, database.username, database.password))
        jdbc.update("INSERT INTO $schema.app_user(user_id,status) VALUES (100,'ACTIVE'),(101,'GUEST'),(102,'WITHDRAWN')")
        val itemId =
            jdbc.queryForObject(
                "INSERT INTO $schema.housing_furniture(code,name,category) VALUES ('starter_cat','Cat','AVATAR') RETURNING furniture_id",
                Long::class.java,
            )!!
        val ownedId =
            jdbc.queryForObject(
                "INSERT INTO $schema.housing_owned_item(user_id,item_type,item_id,acquired_via) " +
                    "VALUES (100,'FURNITURE',?,'STARTER') RETURNING owned_item_id",
                Long::class.java,
                itemId,
            )!!
        migrate("41")
        for (userId in listOf(100, 101)) {
            assertEquals(3, jdbc.queryForObject("SELECT count(*) FROM $schema.housing_owned_item WHERE user_id=?", Int::class.java, userId))
        }
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM $schema.housing_owned_item WHERE user_id=102", Int::class.java))
        assertEquals(
            1,
            jdbc.queryForObject("SELECT count(*) FROM $schema.housing_owned_item WHERE owned_item_id=?", Int::class.java, ownedId),
        )
    }

    @Test
    fun `v40 backfills acquisition sources without changing inventory ids`() {
        val schema = "openapi_v2_inventory_sources"

        fun migrate(target: String) =
            Flyway
                .configure()
                .dataSource(database.jdbcUrl, database.username, database.password)
                .schemas(schema)
                .defaultSchema(schema)
                .target(target)
                .load()
                .migrate()
        migrate("39")
        val jdbc = JdbcTemplate(DriverManagerDataSource(database.jdbcUrl, database.username, database.password))
        jdbc.update("INSERT INTO $schema.app_user(user_id,status) VALUES (100,'ACTIVE')")
        val starter =
            jdbc.queryForObject(
                "INSERT INTO $schema.housing_background(code,name,is_default) VALUES ('starter','Starter',true) RETURNING background_id",
                Long::class.java,
            )!!
        val purchased =
            jdbc.queryForObject(
                "INSERT INTO $schema.housing_background(code,name,is_default) VALUES ('paid','Paid',false) RETURNING background_id",
                Long::class.java,
            )!!
        val starterId =
            jdbc.queryForObject(
                "INSERT INTO $schema.housing_owned_item(user_id,item_type,item_id) VALUES (100,'BACKGROUND',?) RETURNING owned_item_id",
                Long::class.java,
                starter,
            )!!
        val paidId =
            jdbc.queryForObject(
                "INSERT INTO $schema.housing_owned_item(user_id,item_type,item_id) VALUES (100,'BACKGROUND',?) RETURNING owned_item_id",
                Long::class.java,
                purchased,
            )!!
        migrate("40")
        assertEquals(
            "STARTER",
            jdbc.queryForObject("SELECT acquired_via FROM $schema.housing_owned_item WHERE owned_item_id=?", String::class.java, starterId),
        )
        assertEquals(
            "PURCHASE",
            jdbc.queryForObject("SELECT acquired_via FROM $schema.housing_owned_item WHERE owned_item_id=?", String::class.java, paidId),
        )
        jdbc.update("UPDATE $schema.housing_owned_item SET acquired_via='REWARD' WHERE owned_item_id=?", paidId)
        assertFailsWith<DataIntegrityViolationException> {
            jdbc.update("UPDATE $schema.housing_owned_item SET acquired_via='UNKNOWN' WHERE owned_item_id=?", paidId)
        }
    }

    @Test
    fun `v39 keeps existing rewards and adds artwork rewards`() {
        val schema = "openapi_v2_artwork"

        fun migrate(target: String) =
            Flyway
                .configure()
                .dataSource(database.jdbcUrl, database.username, database.password)
                .schemas(schema)
                .defaultSchema(schema)
                .target(target)
                .load()
                .migrate()
        migrate("38")
        val jdbc = JdbcTemplate(DriverManagerDataSource(database.jdbcUrl, database.username, database.password))
        jdbc.update("INSERT INTO $schema.app_user(user_id,status) VALUES (100,'ACTIVE')")
        jdbc.update(
            "INSERT INTO $schema.reward_ledger(user_id,source_type,source_id,source_key,reward_type,constellation_id) VALUES (100,'COURSE',1,'old','CONSTELLATION',42)",
        )
        migrate("39")
        assertEquals(
            "CONSTELLATION",
            jdbc.queryForObject("SELECT badge_type FROM $schema.reward_ledger WHERE source_key='old'", String::class.java),
        )
        val courseId =
            jdbc.queryForObject(
                "INSERT INTO $schema.course(title,category,topic) VALUES ('course','TEST','topic') RETURNING course_id",
                Long::class.java,
            )!!
        val lessonId =
            jdbc.queryForObject(
                "INSERT INTO $schema.lesson(course_id,title,lesson_order) VALUES (?,'lesson',1) RETURNING lesson_id",
                Long::class.java,
                courseId,
            )!!
        val artworkId =
            jdbc.queryForObject(
                "INSERT INTO $schema.learning_artwork(user_id,lesson_id,image_url,completed_at) VALUES (100,?,'https://example.com/a.png',now()) RETURNING artwork_id",
                Long::class.java,
                lessonId,
            )!!
        jdbc.update(
            "INSERT INTO $schema.reward_ledger(user_id,source_type,source_id,source_key,reward_type,artwork_id) VALUES (100,'LESSON',?,'art','ARTWORK',?)",
            lessonId,
            artworkId,
        )
        assertFailsWith<DataIntegrityViolationException> {
            jdbc.update(
                "INSERT INTO $schema.reward_ledger(user_id,source_type,source_id,source_key,reward_type,artwork_id) VALUES (100,'LESSON',?,'duplicate','ARTWORK',?)",
                lessonId,
                artworkId,
            )
        }
    }

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
        val oldInventoryId =
            jdbc.queryForObject(
                "INSERT INTO $schema.housing_owned_item(user_id,item_type,item_id) VALUES (100,'FURNITURE',42) RETURNING owned_item_id",
                Long::class.java,
            )!!
        val oldPlacementId =
            jdbc.queryForObject(
                """INSERT INTO $schema.housing_coordinate_placement(user_id,owned_item_id,area,x,y,rotation,layer)
                   VALUES (100,?,'INTERIOR',0.2,0.4,90,12) RETURNING placement_id""",
                Long::class.java,
                oldInventoryId,
            )!!
        jdbc.update(
            """INSERT INTO $schema.reward_ledger(user_id,source_type,source_id,source_key,reward_type,currency,amount)
               VALUES (100,'LESSON',1,'legacy-star','WALLET','STAR',5)""",
        )
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

        assertEquals(
            12,
            jdbc.queryForObject(
                "SELECT layer FROM $schema.housing_coordinate_placement WHERE placement_id=?",
                Int::class.java,
                oldPlacementId,
            ),
        )
        assertEquals(
            false,
            jdbc.queryForObject(
                "SELECT flipped_x FROM $schema.housing_coordinate_placement WHERE placement_id=?",
                Boolean::class.java,
                oldPlacementId,
            ),
        )
        migrate("41")
        assertEquals(
            "STAR",
            jdbc.queryForObject("SELECT currency FROM $schema.reward_ledger WHERE source_key='legacy-star'", String::class.java),
        )
        assertEquals(
            90,
            jdbc.queryForObject(
                "SELECT rotation FROM $schema.housing_coordinate_placement WHERE placement_id=?",
                Int::class.java,
                oldPlacementId,
            ),
        )

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

    @Test
    fun `v38 converts the authored fill blank quiz to tap without changing its id`() {
        val schema = "openapi_v2_fill_blank"

        fun migrate(target: String) =
            Flyway
                .configure()
                .dataSource(database.jdbcUrl, database.username, database.password)
                .schemas(schema)
                .defaultSchema(schema)
                .target(target)
                .load()
                .migrate()

        migrate("37")
        val jdbc = JdbcTemplate(DriverManagerDataSource(database.jdbcUrl, database.username, database.password))
        val quizId =
            jdbc.queryForObject(
                """INSERT INTO $schema.quiz_item
                   (lesson_id,question,instruction,interaction_type,config,answer,explanation,difficulty,quiz_order)
                   VALUES (23,'르네상스는 어떤 시대인가요?','빈칸에 답을 입력하세요.','FILL_BLANK','{}'::jsonb,
                           '{"texts":["Renaissance"]}'::jsonb,'정답은 Renaissance입니다.','기초',12)
                   RETURNING quiz_id""",
                Long::class.java,
            )!!
        val countBefore = jdbc.queryForObject("SELECT count(*) FROM $schema.quiz_item", Int::class.java)

        migrate("38")

        assertEquals(countBefore, jdbc.queryForObject("SELECT count(*) FROM $schema.quiz_item", Int::class.java))
        assertEquals(
            quizId,
            jdbc.queryForObject("SELECT quiz_id FROM $schema.quiz_item WHERE question='르네상스는 어떤 시대인가요?'", Long::class.java),
        )
        assertEquals(
            "TAP",
            jdbc.queryForObject("SELECT interaction_type FROM $schema.quiz_item WHERE quiz_id=?", String::class.java, quizId),
        )
        assertEquals(
            "FILL_BLANK",
            jdbc.queryForObject("SELECT config->>'displayMode' FROM $schema.quiz_item WHERE quiz_id=?", String::class.java, quizId),
        )
        assertEquals(
            "renaissance",
            jdbc.queryForObject("SELECT answer->'correctItemIds'->>0 FROM $schema.quiz_item WHERE quiz_id=?", String::class.java, quizId),
        )
        assertFailsWith<DataIntegrityViolationException> {
            jdbc.update(
                """INSERT INTO $schema.quiz_item
                   (lesson_id,question,instruction,interaction_type,config,answer,explanation,difficulty,quiz_order)
                   VALUES (23,'금지된 유형','입력','FILL_BLANK','{}'::jsonb,'{"texts":["x"]}'::jsonb,'설명','기초',13)""",
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

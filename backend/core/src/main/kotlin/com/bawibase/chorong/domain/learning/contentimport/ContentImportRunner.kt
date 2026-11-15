package com.bawibase.chorong.domain.learning.contentimport

import com.bawibase.chorong.domain.quiz.service.QuizGrader
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.boot.SpringApplication
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.ConfigurableApplicationContext
import org.springframework.stereotype.Component
import java.nio.file.Files
import java.nio.file.Path
import kotlin.system.exitProcess

/**
 * 관리용 명령. app.content-import.path 를 주고 서버를 띄우면 별자리 JSON을 DB에 넣고 종료한다.
 * 사용법은 docs/CONTENT_IMPORT.md.
 */
@Component
@ConditionalOnProperty(prefix = "app.content-import", name = ["path"])
class ContentImportRunner(
    private val grader: QuizGrader,
    private val importer: ContentImportService,
    private val context: ConfigurableApplicationContext,
    @Value("\${app.content-import.path}") private val path: String,
    @Value("\${app.content-import.media-check:true}") private val mediaCheck: Boolean,
    @Value("\${app.media-base-url}") private val mediaBaseUrl: String,
) : ApplicationRunner {
    override fun run(args: ApplicationArguments) {
        val code = runImport()
        exitProcess(SpringApplication.exit(context, { code }))
    }

    private fun runImport(): Int {
        val source = ContentSource.locate(Path.of(path)) ?: return 2
        val result =
            ContentParser(
                grader,
                mediaBaseUrl,
            ).parse(Files.readAllBytes(source.json), source.json.fileName.toString(), source.mediaRoot(mediaCheck))
        val course = result.course
        if (course == null) {
            ContentSource.printIssues(result.issues)
            return 1
        }
        val imported = importer.import(course)
        println("별자리 ${course.slug} courseId=${imported.courseId}")
        imported.lessons.forEach { println("  ${it.status} ${it.key} lessonId=${it.lessonId} version=${it.version}") }
        imported.missingLessons.forEach { println("  JSON에 없는 레슨(지우지 않음): $it") }
        return 0
    }
}

/** 경로가 폴더면 "{폴더}/{폴더 이름}.json"을, 파일이면 그 파일을 읽는다. 그림·소리는 JSON이 있는 폴더 아래 레슨 폴더에서 찾는다. */
class ContentSource private constructor(
    val json: Path,
) {
    fun mediaRoot(check: Boolean): Path? = if (check) json.toAbsolutePath().parent else null

    companion object {
        fun locate(path: Path): ContentSource? {
            val json = if (Files.isDirectory(path)) path.resolve("${path.fileName}.json") else path
            if (!Files.isRegularFile(json)) {
                println("파일이 없습니다: ${json.toAbsolutePath()}")
                return null
            }
            return ContentSource(json)
        }

        fun printIssues(issues: List<ContentIssue>) {
            println("고칠 곳 ${issues.size}건")
            issues.forEach { println("- $it") }
        }
    }
}

package com.bawibase.chorong.domain.learning.contentimport

import com.bawibase.chorong.domain.quiz.service.QuizGrader
import java.nio.file.Files
import java.nio.file.Path
import kotlin.system.exitProcess

/**
 * DB 없이 별자리 JSON만 검사한다. 오류가 있으면 "레슨 · 화면 · 칸: 이유" 목록을 출력하고 1로 끝낸다.
 * 실행: ./gradlew :core:contentCheck --args="<별자리 폴더 또는 JSON> [--no-media-check]"
 */
fun main(args: Array<String>) {
    val path = args.firstOrNull { !it.startsWith("--") }
    if (path == null) {
        println("사용법: contentCheck <별자리 폴더 또는 JSON 파일> [--no-media-check]")
        exitProcess(2)
    }
    val source = ContentSource.locate(Path.of(path)) ?: exitProcess(2)
    // 검사에는 실제 주소가 필요 없다.
    val parser = ContentParser(QuizGrader(), "https://media.invalid/")
    val result =
        parser.parse(
            Files.readAllBytes(source.json),
            source.json.fileName.toString(),
            source.mediaRoot("--no-media-check" !in args),
        )
    val course = result.course
    if (course == null) {
        ContentSource.printIssues(result.issues)
        exitProcess(1)
    }
    val quizzes = course.lessons.sumOf { lesson -> lesson.screens.count { it is QuizScreen } + lesson.reviewQuizzes.size }
    println("오류 없음: 별자리 ${course.slug}, 레슨 ${course.lessons.size}개, 퀴즈 ${quizzes}개")
}

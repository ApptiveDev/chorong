package com.bawibase.chorong.domain.learning.contentimport

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.domain.quiz.model.BlankAnswer
import com.bawibase.chorong.domain.quiz.model.BlankConfig
import com.bawibase.chorong.domain.quiz.model.BlankQuizDefinition
import com.bawibase.chorong.domain.quiz.model.ChosungAnswer
import com.bawibase.chorong.domain.quiz.model.ChosungConfig
import com.bawibase.chorong.domain.quiz.model.ChosungQuizDefinition
import com.bawibase.chorong.domain.quiz.model.MatchConfig
import com.bawibase.chorong.domain.quiz.model.MatchQuizDefinition
import com.bawibase.chorong.domain.quiz.model.MultiAnswer
import com.bawibase.chorong.domain.quiz.model.MultiConfig
import com.bawibase.chorong.domain.quiz.model.MultiQuizDefinition
import com.bawibase.chorong.domain.quiz.model.OxAnswer
import com.bawibase.chorong.domain.quiz.model.OxConfig
import com.bawibase.chorong.domain.quiz.model.OxQuizDefinition
import com.bawibase.chorong.domain.quiz.model.QuizDefinition
import com.bawibase.chorong.domain.quiz.model.SingleAnswer
import com.bawibase.chorong.domain.quiz.model.SingleConfig
import com.bawibase.chorong.domain.quiz.model.SinglePresentation
import com.bawibase.chorong.domain.quiz.model.SinglePresentationType
import com.bawibase.chorong.domain.quiz.model.SingleQuizDefinition
import com.bawibase.chorong.domain.quiz.model.SliderAnswer
import com.bawibase.chorong.domain.quiz.model.SliderConfig
import com.bawibase.chorong.domain.quiz.model.SliderQuizDefinition
import com.bawibase.chorong.domain.quiz.service.QuizGrader
import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.core.JsonProcessingException
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.json.JsonMapper
import java.math.BigDecimal
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest

/**
 * 컨텐츠 작성 가이드(local-only/컨텐츠 가이드) 형식의 별자리 JSON을 읽는다.
 * 오류는 멈추지 않고 모두 모아 돌려준다. 오류가 하나라도 있으면 course는 null이다.
 */
class ContentParser(
    private val grader: QuizGrader,
    mediaBaseUrl: String,
) {
    private val mediaBase = mediaBaseUrl.trim().let { if (it.endsWith("/")) it else "$it/" }

    private val mapper: ObjectMapper =
        JsonMapper
            .builder()
            .enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
            .build()

    /**
     * @param fileName 파일 이름 확인용. 확장자를 뺀 이름이 별자리 id와 같아야 한다.
     * @param mediaRoot 별자리 폴더. null이 아니면 그림·소리 파일이 레슨 폴더에 있는지 확인한다.
     */
    fun parse(
        json: ByteArray,
        fileName: String? = null,
        mediaRoot: Path? = null,
    ): ContentParseResult {
        val issues = mutableListOf<ContentIssue>()
        val root =
            try {
                mapper.readTree(json)
            } catch (e: JsonProcessingException) {
                val at = e.location?.let { "${it.lineNr}번째 줄 ${it.columnNr}번째 글자 근처" } ?: "위치 모름"
                issues += ContentIssue(null, null, "", "JSON 문법 오류($at): ${e.originalMessage}")
                return ContentParseResult(null, issues)
            }
        val course = Reader(issues, mediaRoot).course(root, fileName)
        return ContentParseResult(course.takeIf { issues.isEmpty() }, issues)
    }

    private inner class Reader(
        private val issues: MutableList<ContentIssue>,
        private val mediaRoot: Path?,
    ) {
        fun course(
            root: JsonNode?,
            fileName: String?,
        ): ImportCourse? {
            val scope = Scope(issues, null, null)
            if (root == null || !root.isObject) {
                scope.issue("", "파일 전체가 { }로 감싼 객체여야 합니다")
                return null
            }
            scope.fields(root, setOf("id", "name", "desc", "order", "lessons"))
            val slug = scope.slug(root, "id", MAX_COURSE_SLUG)
            if (slug != null && fileName != null && fileName.substringBeforeLast('.') != slug) {
                scope.issue("id", "파일 이름($fileName)과 별자리 id($slug)가 다릅니다")
            }
            val title = scope.text(root, "name")
            val description = scope.text(root, "desc")
            val order = scope.int(root, "order", 1..MAX_ORDER)
            val lessonNodes = scope.array(root, "lessons", min = 1)
            val keys = mutableSetOf<String>()
            val lessons =
                lessonNodes.orEmpty().mapIndexedNotNull { index, node ->
                    val key =
                        node
                            .takeIf { it.isObject }
                            ?.get("id")
                            ?.takeIf { it.isTextual }
                            ?.textValue()
                    val label = key ?: "${index + 1}번째"
                    if (key != null && !keys.add(key)) Scope(issues, label, null).issue("id", "같은 레슨 id가 두 번 나옵니다")
                    lesson(node, label, slug)
                }
            if (slug == null || title == null || description == null || order == null || lessons.size != lessonNodes?.size) return null
            return ImportCourse(slug, title, description, order, lessons)
        }

        private fun lesson(
            node: JsonNode,
            label: String,
            courseSlug: String?,
        ): ImportLesson? {
            val scope = Scope(issues, label, null)
            if (!node.isObject) {
                scope.issue("", "레슨은 { }로 감싼 객체여야 합니다")
                return null
            }
            scope.fields(node, setOf("id", "title", "keyword", "source", "ending", "screens", "reviewQuizzes"))
            val key = scope.slug(node, "id", MAX_LESSON_KEY)
            val title = scope.text(node, "title")
            val keyword = scope.text(node, "keyword")
            val source = scope.text(node, "source", required = false)
            val ending = scope.obj(node, "ending")
            var endingText: String? = null
            var endingImage: String? = null
            if (ending != null) {
                scope.fields(ending, setOf("text", "image"), "ending.")
                endingText = scope.text(ending, "text", field = "ending.text")
                endingImage = scope.file(ending, "image", key, required = false, field = "ending.image")
            }
            val media = Media(courseSlug, key)
            val screenNodes = scope.array(node, "screens", min = 1)
            val screens =
                screenNodes.orEmpty().mapIndexedNotNull {
                    i,
                    screen,
                    ->
                    screen(screen, Scope(issues, label, "screens ${i + 1}번"), media)
                }
            val reviewNodes = scope.array(node, "reviewQuizzes", required = false)
            val reviews =
                reviewNodes.orEmpty().mapIndexedNotNull { i, quiz ->
                    val quizScope = Scope(issues, label, "reviewQuizzes ${i + 1}번")
                    if (!quiz.isObject) {
                        quizScope.issue("", "문제는 { }로 감싼 객체여야 합니다")
                        null
                    } else if (quiz["type"]?.textValue() != "quiz") {
                        quizScope.issue("type", "복습 전용 문제의 type은 \"quiz\"여야 합니다")
                        null
                    } else {
                        quiz(quiz, quizScope, media, review = true)
                    }
                }
            if (key == null || title == null || keyword == null || endingText == null || courseSlug == null) return null
            if (screens.size != screenNodes?.size || reviews.size != reviewNodes.orEmpty().size) return null
            return ImportLesson(
                key = key,
                title = title,
                keyword = keyword,
                source = source,
                endingText = endingText,
                endingImageUrl = endingImage?.let { media.image(it) },
                screens = screens,
                reviewQuizzes = reviews,
                hash = hash(courseSlug, node),
            )
        }

        private fun screen(
            node: JsonNode,
            scope: Scope,
            media: Media,
        ): ImportScreen? {
            if (!node.isObject) {
                scope.issue("", "화면은 { }로 감싼 객체여야 합니다")
                return null
            }
            val section = scope.text(node, "section")
            return when (val type = scope.text(node, "type")) {
                null -> {
                    null
                }

                "narration" -> {
                    scope.fields(node, setOf("type", "section", "source", "lines"))
                    val lines = lines(node, scope)
                    val source = scope.text(node, "source", required = false)
                    if (section == null || lines == null) null else NarrationScreen(section, lines, source)
                }

                "concept" -> {
                    scope.fields(node, setOf("type", "section", "source", "keyword", "image", "lines"))
                    val keyword = scope.text(node, "keyword")
                    val image = scope.file(node, "image", media.lesson)
                    val lines = lines(node, scope)
                    val source = scope.text(node, "source", required = false)
                    if (section == null || keyword == null || image == null || lines == null) {
                        null
                    } else {
                        ConceptScreen(section, keyword, media.image(image), lines, source)
                    }
                }

                "quiz" -> {
                    val quiz = quiz(node, scope, media, review = false)
                    if (section == null || quiz == null) null else QuizScreen(section, quiz)
                }

                else -> {
                    scope.issue("type", "\"$type\"은 없는 화면 유형입니다. narration, concept, quiz 중 하나를 씁니다")
                    null
                }
            }
        }

        private fun lines(
            node: JsonNode,
            scope: Scope,
        ): List<ImportLine>? {
            val nodes = scope.array(node, "lines", min = 1) ?: return null
            val lines =
                nodes.mapIndexedNotNull { i, line ->
                    val field = "lines ${i + 1}번"
                    if (!line.isObject) {
                        scope.issue(field, "대사는 { }로 감싼 객체여야 합니다")
                        return@mapIndexedNotNull null
                    }
                    scope.fields(line, setOf("speaker", "text"), "$field.")
                    val speaker = scope.text(line, "speaker", required = false, field = "$field.speaker")
                    val text = scope.text(line, "text", field = "$field.text") ?: return@mapIndexedNotNull null
                    ImportLine(speaker, text)
                }
            return lines.takeIf { it.size == nodes.size }
        }

        private fun quiz(
            node: JsonNode,
            scope: Scope,
            media: Media,
            review: Boolean,
        ): ImportQuiz? {
            val kind = scope.text(node, "kind") ?: return null
            val spec = KINDS[kind]
            if (spec == null) {
                scope.issue("kind", "\"$kind\"은 없는 퀴즈 유형입니다")
                return null
            }
            if (spec.reviewOnly && !review) {
                scope.issue("kind", "$kind 유형은 복습 전용이라 reviewQuizzes에만 넣을 수 있습니다")
                return null
            }
            scope.fields(node, COMMON_QUIZ_FIELDS + spec.fields)
            val question = if (kind == "blank") scope.text(node, "question", required = false) ?: "" else scope.text(node, "question")
            val explanation = scope.text(node, "explain", required = false)
            val source = scope.text(node, "source", required = false)
            val definition = definition(kind, node, scope, media) ?: return null
            if (question == null) return null
            try {
                grader.validate(definition)
            } catch (_: ApiException) {
                scope.issue("", "문제 형식 검사에 실패했습니다. 칸 값을 다시 확인하세요")
                return null
            }
            return ImportQuiz(definition, question, spec.instruction, explanation, source)
        }

        private fun definition(
            kind: String,
            node: JsonNode,
            scope: Scope,
            media: Media,
        ): QuizDefinition? =
            when (kind) {
                "ox" -> {
                    scope.bool(node, "answer")?.let { OxQuizDefinition(OxConfig(), OxAnswer(it)) }
                }

                "single" -> {
                    choice(node, scope)?.let { (options, answer) -> SingleQuizDefinition(SingleConfig(options), SingleAnswer(answer)) }
                }

                "multi" -> {
                    val options = scope.texts(node, "options", min = 2)
                    val answers = scope.ints(node, "answers")
                    if (options == null || answers == null) {
                        null
                    } else if (answers.isEmpty() || answers.any { it !in options.indices }) {
                        scope.issue("answers", "정답 보기 순번은 0부터 ${options.size - 1}까지입니다")
                        null
                    } else if (answers.toSet().size != answers.size) {
                        scope.issue("answers", "같은 순번이 두 번 들어 있습니다")
                        null
                    } else {
                        MultiQuizDefinition(MultiConfig(options), MultiAnswer(answers.sorted()))
                    }
                }

                "blank" -> {
                    val before = scope.text(node, "before")
                    val after = scope.text(node, "after")
                    val choice = choice(node, scope)
                    if (before == null || after == null || choice == null) {
                        null
                    } else {
                        BlankQuizDefinition(BlankConfig(before, after, choice.first), BlankAnswer(choice.second))
                    }
                }

                "slider" -> {
                    val ticks = scope.texts(node, "ticks", min = 2)
                    val hint = scope.text(node, "hint", required = false)
                    val answer = scope.decimal(node, "answer", "0에서 1 사이 숫자")
                    val tolerance = scope.decimal(node, "tolerance", "0에서 1 사이 숫자")
                    if (ticks == null || answer == null ||
                        tolerance == null
                    ) {
                        null
                    } else {
                        SliderQuizDefinition(SliderConfig(ticks, hint), SliderAnswer(answer, tolerance))
                    }
                }

                "match" -> {
                    match(node, scope)
                }

                "chosung" -> {
                    val hint = scope.text(node, "hint")
                    val answers = scope.texts(node, "answer", min = 1, hint = "하나여도 [\"낱말\"]처럼 [ ]로 감쌉니다")

                    // 앱은 힌트의 공백을 뺀 글자 수만큼 입력 칸을 만들고, 다 채우면 제출한다.
                    fun letters(value: String) = QuizGrader.compact(value).let { it.codePointCount(0, it.length) }
                    val length = hint?.let(::letters)
                    val mismatched = answers.orEmpty().filter { letters(it) != length }
                    if (length != null && mismatched.isNotEmpty()) {
                        scope.issue(
                            "answer",
                            "정답 글자 수가 초성 힌트($length 글자)와 다릅니다: ${mismatched.joinToString()}. 띄어쓰기를 뺀 글자 수를 맞춥니다",
                        )
                    }
                    if (hint == null || answers == null || mismatched.isNotEmpty()) {
                        null
                    } else {
                        ChosungQuizDefinition(ChosungConfig(hint), ChosungAnswer(answers))
                    }
                }

                "sound" -> {
                    val audio = scope.file(node, "audio", media.lesson)
                    presented(node, scope, audio?.let { SinglePresentation(SinglePresentationType.AUDIO, mediaUrl = media.audio(it)) })
                }

                "tile" -> {
                    val image = scope.file(node, "image", media.lesson)
                    val rows = scope.int(node, "rows", 2..8)
                    val columns = scope.int(node, "columns", 2..8)
                    val presentation =
                        if (image == null || rows == null || columns == null) {
                            null
                        } else {
                            SinglePresentation(SinglePresentationType.TILE, mediaUrl = media.image(image), rows = rows, columns = columns)
                        }
                    presented(node, scope, presentation)
                }

                "zoomout" -> {
                    staged(node, scope, media, SinglePresentationType.ZOOM_OUT, 1..8, last = 1)
                }

                "sharpen" -> {
                    staged(node, scope, media, SinglePresentationType.SHARPEN, 0..32, last = 0)
                }

                "wrongword" -> {
                    wrongWord(node, scope)
                }

                else -> {
                    error("unreachable kind $kind")
                }
            }

        private fun choice(
            node: JsonNode,
            scope: Scope,
        ): Pair<List<String>, Int>? {
            val options = scope.texts(node, "options", min = 2)
            val answer = scope.int(node, "answer", null)
            if (options == null || answer == null) return null
            if (answer !in options.indices) {
                scope.issue("answer", "정답 보기 순번은 0부터 ${options.size - 1}까지입니다. 첫 번째 보기가 0입니다")
                return null
            }
            return options to answer
        }

        private fun presented(
            node: JsonNode,
            scope: Scope,
            presentation: SinglePresentation?,
        ): QuizDefinition? {
            val choice = choice(node, scope)
            if (presentation == null || choice == null) return null
            return SingleQuizDefinition(SingleConfig(choice.first, presentation), SingleAnswer(choice.second))
        }

        private fun staged(
            node: JsonNode,
            scope: Scope,
            media: Media,
            type: SinglePresentationType,
            range: IntRange,
            last: Int,
        ): QuizDefinition? {
            val image = scope.file(node, "image", media.lesson)
            var stages = scope.ints(node, "stages")
            if (stages != null) {
                val ok =
                    stages.isNotEmpty() && stages.all { it in range } && stages.zipWithNext().all { (a, b) -> a > b } &&
                        stages.last() == last
                if (!ok) {
                    scope.issue("stages", "${range.first}~${range.last} 사이 숫자를 큰 수부터 줄어드는 순서로 적고 마지막은 ${last}이어야 합니다")
                    stages = null
                }
            }
            val presentation =
                if (image == null || stages == null) null else SinglePresentation(type, mediaUrl = media.image(image), stages = stages)
            return presented(node, scope, presentation)
        }

        private fun match(
            node: JsonNode,
            scope: Scope,
        ): QuizDefinition? {
            val nodes = scope.array(node, "pairs", min = 2) ?: return null
            val pairs =
                nodes.mapNotNull { pair ->
                    pair
                        .takeIf { it.isArray && it.size() == 2 && it.all { side -> side.isTextual && side.textValue().isNotBlank() } }
                        ?.map { it.textValue() }
                }
            if (pairs.size != nodes.size) {
                scope.issue("pairs", "짝마다 [\"왼쪽\", \"오른쪽\"]처럼 글자 두 개를 적습니다")
                return null
            }
            if (pairs.map { it[0] }.toSet().size != pairs.size || pairs.map { it[1] }.toSet().size != pairs.size) {
                scope.issue("pairs", "왼쪽 또는 오른쪽에 같은 글자가 두 번 나옵니다")
                return null
            }
            return MatchQuizDefinition(MatchConfig(pairs))
        }

        private fun wrongWord(
            node: JsonNode,
            scope: Scope,
        ): QuizDefinition? {
            val sentence = scope.text(node, "sentence")
            val correct = scope.text(node, "correct")
            if (sentence == null || correct == null) return null
            val words = sentence.trim().split(WHITESPACE)
            val marked = words.withIndex().filter { '[' in it.value || ']' in it.value }
            val word = marked.singleOrNull()
            val inner = word?.value?.let { BRACKETED.find(it)?.groupValues?.get(1) }
            if (sentence.count { it == '[' } != 1 || sentence.count { it == ']' } != 1 || word == null || inner.isNullOrBlank()) {
                scope.issue("sentence", "틀린 낱말 하나만 [ ]로 감싸야 합니다. [ ] 안에 띄어쓰기를 넣지 않습니다")
                return null
            }
            val options = words.map { it.replace("[", "").replace("]", "") }
            return SingleQuizDefinition(
                SingleConfig(options, SinglePresentation(SinglePresentationType.INLINE_WORD)),
                SingleAnswer(word.index, correct),
            )
        }

        /** 이미지·음원 주소를 만든다. 레슨 폴더 안에 파일이 있는지는 [Scope.file]이 확인한다. */
        private inner class Media(
            private val course: String?,
            val lesson: String?,
        ) {
            fun image(file: String) = "${mediaBase}quiz/images/$course/$lesson/$file"

            fun audio(file: String) = "${mediaBase}quiz/audio/$course/$lesson/$file"
        }

        private inner class Scope(
            private val issues: MutableList<ContentIssue>,
            private val lesson: String?,
            private val screen: String?,
        ) {
            fun issue(
                field: String,
                reason: String,
            ) {
                issues += ContentIssue(lesson, screen, field, reason)
            }

            fun fields(
                node: JsonNode,
                allowed: Set<String>,
                prefix: String = "",
            ) {
                node.fieldNames().forEach { if (it != "memo" && it !in allowed) issue("$prefix$it", "가이드에 없는 칸입니다") }
            }

            private fun value(
                node: JsonNode,
                name: String,
                required: Boolean,
                field: String,
            ): JsonNode? {
                val value = node[name]
                if (value == null || value.isNull) {
                    if (required) issue(field, "필수 칸이 없습니다")
                    return null
                }
                return value
            }

            fun text(
                node: JsonNode,
                name: String,
                required: Boolean = true,
                field: String = name,
            ): String? {
                val value = value(node, name, required, field) ?: return null
                if (!value.isTextual) {
                    issue(field, "글자는 큰따옴표(\"\")로 감싸서 적습니다")
                    return null
                }
                if (value.textValue().isBlank()) {
                    issue(field, "비어 있습니다")
                    return null
                }
                return value.textValue()
            }

            fun slug(
                node: JsonNode,
                name: String,
                max: Int,
            ): String? {
                val value = text(node, name) ?: return null
                if (!SLUG.matches(value) || value.length > max) {
                    issue(name, "영어 소문자, 숫자, -만 씁니다(${max}자 이하). 예: blue-pigment")
                    return null
                }
                return value
            }

            fun file(
                node: JsonNode,
                name: String,
                lessonKey: String?,
                required: Boolean = true,
                field: String = name,
            ): String? {
                val value = text(node, name, required, field) ?: return null
                if (!FILE.matches(value)) {
                    issue(field, "파일 이름은 영어 소문자, 숫자, -와 확장자만 씁니다. 폴더 경로는 적지 않습니다. 예: lapis.svg")
                    return null
                }
                if (mediaRoot != null && lessonKey != null && !Files.isRegularFile(mediaRoot.resolve(lessonKey).resolve(value))) {
                    issue(field, "$lessonKey 레슨 폴더에 $value 파일이 없습니다")
                }
                return value
            }

            fun int(
                node: JsonNode,
                name: String,
                range: IntRange?,
            ): Int? {
                val value = value(node, name, true, name) ?: return null
                if (!value.isIntegralNumber || !value.canConvertToInt()) {
                    issue(name, "따옴표 없는 정수로 적습니다")
                    return null
                }
                if (range != null && value.intValue() !in range) {
                    issue(name, "${range.first}부터 ${range.last}까지 적을 수 있습니다")
                    return null
                }
                return value.intValue()
            }

            fun bool(
                node: JsonNode,
                name: String,
            ): Boolean? {
                val value = value(node, name, true, name) ?: return null
                if (!value.isBoolean) {
                    issue(name, "따옴표 없이 true 또는 false로 적습니다")
                    return null
                }
                return value.booleanValue()
            }

            fun decimal(
                node: JsonNode,
                name: String,
                expected: String,
            ): BigDecimal? {
                val value = value(node, name, true, name) ?: return null
                val number = value.takeIf { it.isNumber }?.decimalValue()
                if (number == null || number < BigDecimal.ZERO || number > BigDecimal.ONE) {
                    issue(name, "따옴표 없이 $expected 로 적습니다")
                    return null
                }
                return number
            }

            fun obj(
                node: JsonNode,
                name: String,
            ): JsonNode? {
                val value = value(node, name, true, name) ?: return null
                if (!value.isObject) {
                    issue(name, "{ }로 감싼 객체여야 합니다")
                    return null
                }
                return value
            }

            fun array(
                node: JsonNode,
                name: String,
                required: Boolean = true,
                min: Int = 0,
            ): List<JsonNode>? {
                val value = value(node, name, required, name) ?: return null
                if (!value.isArray) {
                    issue(name, "[ ]로 감싼 목록이어야 합니다")
                    return null
                }
                if (value.size() < min) {
                    issue(name, "${min}개 이상 있어야 합니다")
                    return null
                }
                return value.toList()
            }

            fun texts(
                node: JsonNode,
                name: String,
                min: Int,
                hint: String = "",
            ): List<String>? {
                val value = value(node, name, true, name) ?: return null
                if (!value.isArray || value.any { !it.isTextual || it.textValue().isBlank() }) {
                    issue(name, "글자 목록 [\"가\", \"나\"]으로 적고 빈 글자를 넣지 않습니다. $hint".trim())
                    return null
                }
                if (value.size() < min) {
                    issue(name, "${min}개 이상 있어야 합니다")
                    return null
                }
                return value.map { it.textValue() }
            }

            fun ints(
                node: JsonNode,
                name: String,
            ): List<Int>? {
                val value = value(node, name, true, name) ?: return null
                if (!value.isArray || value.any { !it.isIntegralNumber || !it.canConvertToInt() }) {
                    issue(name, "따옴표 없는 정수 목록 [1, 2]로 적습니다")
                    return null
                }
                return value.map { it.intValue() }
            }
        }
    }

    /** memo를 뺀 레슨 JSON과 별자리 id, 미디어 주소로 계산한다. 칸 순서와 공백은 결과에 영향을 주지 않는다. */
    private fun hash(
        courseSlug: String,
        lesson: JsonNode,
    ): String {
        val canonical = mapper.createObjectNode()
        canonical.put("course", courseSlug)
        canonical.put("mediaBase", mediaBase)
        canonical.set<JsonNode>("lesson", canonical(lesson))
        val digest = MessageDigest.getInstance("SHA-256").digest(mapper.writeValueAsBytes(canonical))
        return digest.joinToString("") { "%02x".format(it) }
    }

    private fun canonical(node: JsonNode): JsonNode =
        when {
            node.isObject -> {
                mapper.createObjectNode().also { out ->
                    node
                        .fieldNames()
                        .asSequence()
                        .filter { it != "memo" }
                        .sorted()
                        .forEach { out.set<JsonNode>(it, canonical(node[it])) }
                }
            }

            node.isArray -> {
                mapper.createArrayNode().also { out -> node.forEach { out.add(canonical(it)) } }
            }

            node.isNumber -> {
                mapper.nodeFactory.numberNode(node.decimalValue().stripTrailingZeros())
            }

            else -> {
                node
            }
        }

    private class KindSpec(
        val fields: Set<String>,
        val instruction: String,
        val reviewOnly: Boolean = false,
    )

    companion object {
        private const val MAX_COURSE_SLUG = 100
        private const val MAX_LESSON_KEY = 100
        private const val MAX_ORDER = 10_000
        private val SLUG = Regex("^[a-z0-9]+(-[a-z0-9]+)*$")
        private val FILE = Regex("^[a-z0-9]+(-[a-z0-9]+)*\\.[a-z0-9]+$")
        private val WHITESPACE = Regex("\\s+")
        private val BRACKETED = Regex("^[^\\[\\]]*\\[([^\\[\\]]+)][^\\[\\]]*$")
        private val COMMON_QUIZ_FIELDS = setOf("type", "kind", "section", "source", "question", "explain")
        private val CHOICE = setOf("options", "answer")

        private val KINDS =
            mapOf(
                "ox" to KindSpec(setOf("answer"), "O 또는 X를 고르세요."),
                "single" to KindSpec(CHOICE, "하나를 고르세요."),
                "multi" to KindSpec(setOf("options", "answers"), "모두 고르세요."),
                "blank" to KindSpec(CHOICE + setOf("before", "after"), "빈칸에 알맞은 말을 고르세요."),
                "slider" to KindSpec(setOf("hint", "ticks", "answer", "tolerance"), "끌어서 고르세요."),
                "match" to KindSpec(setOf("pairs"), "짝을 이어 보세요."),
                "chosung" to KindSpec(setOf("hint", "answer"), "초성을 보고 낱말을 입력하세요."),
                "sound" to KindSpec(CHOICE + "audio", "소리를 듣고 하나를 고르세요."),
                "tile" to KindSpec(CHOICE + setOf("image", "rows", "columns"), "타일을 벗기며 맞혀 보세요.", reviewOnly = true),
                "zoomout" to KindSpec(CHOICE + setOf("image", "stages"), "그림을 누르며 맞혀 보세요.", reviewOnly = true),
                "sharpen" to KindSpec(CHOICE + setOf("image", "stages"), "그림을 누르며 맞혀 보세요.", reviewOnly = true),
                "wrongword" to KindSpec(setOf("sentence", "correct"), "틀린 낱말을 누르세요.", reviewOnly = true),
            )
    }
}

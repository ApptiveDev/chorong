package com.bawibase.chorong.domain.quiz.model

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonInclude
import io.swagger.v3.oas.annotations.media.Schema

/** 선택 속성의 null은 필드 생략을 나타낸다. 명시적 null 입력은 JSON 변환 단계에서 거절한다. */
@JsonInclude(JsonInclude.Include.NON_NULL)
sealed interface QuizConfig

// 필드가 없어도 빈 객체 {} 로 직렬화되도록 Jackson 애너테이션을 붙인다.
@JsonIgnoreProperties(ignoreUnknown = false)
@Schema(description = "O/X. 문제는 question에 있고 추가 구성은 없다.", additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
class OxConfig : QuizConfig {
    override fun equals(other: Any?) = other is OxConfig

    override fun hashCode() = OxConfig::class.hashCode()

    override fun toString() = "OxConfig()"
}

@Schema(requiredProperties = ["options"], additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
data class SingleConfig(
    @field:Schema(description = "보기 문구. 답안은 0부터 시작하는 순번으로 고른다.")
    val options: List<String>,
) : QuizConfig

@Schema(requiredProperties = ["options"], additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
data class MultiConfig(
    @field:Schema(description = "보기 문구. 답안은 0부터 시작하는 순번으로 고른다.")
    val options: List<String>,
) : QuizConfig

@Schema(requiredProperties = ["before", "after", "options"], additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
data class BlankConfig(
    @field:Schema(description = "빈칸 앞 문장")
    val before: String,
    @field:Schema(description = "빈칸 뒤 문장")
    val after: String,
    @field:Schema(description = "빈칸에 넣을 낱말. 답안은 0부터 시작하는 순번으로 고른다.")
    val options: List<String>,
) : QuizConfig

@Schema(requiredProperties = ["ticks"], additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
data class SliderConfig(
    @field:Schema(description = "트랙 왼쪽부터 같은 간격으로 놓는 눈금 문구. 값은 트랙 위치 0~1로 주고받는다.")
    val ticks: List<String>,
    @field:Schema(description = "안내 문구. 생략 시 앱 기본 문구를 쓴다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    val hint: String? = null,
) : QuizConfig

@Schema(requiredProperties = ["pairs"], additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
data class MatchConfig(
    @field:Schema(description = "[왼쪽, 오른쪽] 짝 목록. 정답이므로 앱이 오른쪽 열을 섞어 보여 주고 한 쌍씩 판정한다.")
    val pairs: List<List<String>>,
) : QuizConfig

@Schema(requiredProperties = ["hint"], additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
data class ChosungConfig(
    @field:Schema(description = "초성 힌트. 예: ㅇㅌㄹㅁㄹ")
    val hint: String,
) : QuizConfig

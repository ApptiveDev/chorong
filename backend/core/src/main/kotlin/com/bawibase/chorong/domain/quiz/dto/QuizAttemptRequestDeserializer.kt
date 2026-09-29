package com.bawibase.chorong.domain.quiz.dto

import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.databind.DeserializationContext
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.JsonDeserializer
import com.fasterxml.jackson.databind.JsonMappingException
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper

class QuizAttemptRequestDeserializer : JsonDeserializer<QuizAttemptRequest>() {
    override fun deserialize(
        parser: JsonParser,
        context: DeserializationContext,
    ): QuizAttemptRequest {
        parser.enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
        val body =
            (parser.codec as ObjectMapper)
                .reader()
                .with(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
                .readTree<JsonNode>(parser)
        if (!body.isObject || !body.has("response")) {
            throw JsonMappingException.from(parser, "response 필드가 필요합니다.")
        }
        return QuizAttemptRequest(body["response"])
    }
}

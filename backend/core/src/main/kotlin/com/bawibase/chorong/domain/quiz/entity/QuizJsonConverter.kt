package com.bawibase.chorong.domain.quiz.entity

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import jakarta.persistence.AttributeConverter
import jakarta.persistence.Converter

/** 퀴즈 JSON을 복사하거나 DB에서 읽을 때 소수를 Double로 축소하지 않는다. */
@Converter
class QuizJsonConverter : AttributeConverter<Map<String, Any?>, String> {
    private val mapper = jacksonObjectMapper().enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
    private val type = object : TypeReference<Map<String, Any?>>() {}

    override fun convertToDatabaseColumn(attribute: Map<String, Any?>?): String? = attribute?.let(mapper::writeValueAsString)

    override fun convertToEntityAttribute(dbData: String?): Map<String, Any?>? = dbData?.let { mapper.readValue(it, type) }
}

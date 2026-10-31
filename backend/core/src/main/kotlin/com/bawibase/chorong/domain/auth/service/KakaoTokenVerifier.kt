package com.bawibase.chorong.domain.auth.service

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.web.client.RestTemplateBuilder
import org.springframework.http.HttpEntity
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.client.HttpClientErrorException
import org.springframework.web.client.ResourceAccessException
import org.springframework.web.client.RestClientException
import java.time.Duration

@Component
class KakaoTokenVerifier(
    restTemplateBuilder: RestTemplateBuilder,
    private val mapper: ObjectMapper,
    @Value("\${app.oauth.kakao.app-id:}") private val appId: String,
    @Value("\${app.oauth.kakao.access-token-info-url:https://kapi.kakao.com/v1/user/access_token_info}") private val accessTokenInfoUrl:
        String,
    @Value("\${app.oauth.kakao.user-info-url:https://kapi.kakao.com/v2/user/me}") private val userInfoUrl: String,
) {
    private val rest =
        restTemplateBuilder
            .connectTimeout(Duration.ofSeconds(3))
            .readTimeout(Duration.ofSeconds(3))
            .build()

    fun verify(accessToken: String): String {
        val expectedAppId =
            appId.toLongOrNull()?.takeIf { it > 0 }
                ?: throw IllegalStateException("Kakao OAuth app ID is not configured")
        val headers =
            HttpHeaders().apply {
                setBearerAuth(accessToken)
                accept = listOf(MediaType.APPLICATION_JSON)
            }
        try {
            val tokenInfo = request(accessTokenInfoUrl, headers)
            val tokenUserId = tokenInfo.path("id")
            val tokenAppId = tokenInfo.path("app_id")
            if (!tokenUserId.isIntegralNumber || tokenUserId.asLong() <= 0 ||
                !tokenAppId.isIntegralNumber || tokenAppId.asLong() != expectedAppId
            ) {
                throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
            }
            val user = request(userInfoUrl, headers).path("id")
            if (!user.isIntegralNumber || user.asLong() != tokenUserId.asLong()) throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
            return tokenUserId.asText()
        } catch (e: HttpClientErrorException) {
            val errorCode = runCatching { mapper.readTree(e.responseBodyAsString).path("code").asInt() }.getOrDefault(0)
            if (e.statusCode.value() in setOf(400, 401, 403) && errorCode != -1) throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
            throw IllegalStateException("Kakao authentication service failed", e)
        } catch (e: ResourceAccessException) {
            throw IllegalStateException("Kakao authentication service unavailable", e)
        } catch (e: RestClientException) {
            throw IllegalStateException("Kakao authentication service failed", e)
        } catch (e: ApiV1Exception) {
            throw e
        } catch (e: Exception) {
            throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        }
    }

    private fun request(
        url: String,
        headers: HttpHeaders,
    ) = mapper.readTree(
        rest.exchange(url, HttpMethod.GET, HttpEntity<Void>(headers), String::class.java).body
            ?: throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED),
    )
}

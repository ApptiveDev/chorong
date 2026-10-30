package com.bawibase.chorong.config

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.domain.user.service.UserAccessService
import org.springframework.core.convert.converter.Converter
import org.springframework.security.authentication.AbstractAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.oauth2.core.OAuth2Error
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component

class AccountAuthenticationException(
    val legacyCode: ErrorCode,
) : OAuth2AuthenticationException(OAuth2Error("invalid_token"), "계정 인증에 실패했습니다.")

@Component
class UserJwtAuthenticationConverter(
    private val access: UserAccessService,
) : Converter<Jwt, AbstractAuthenticationToken> {
    override fun convert(jwt: Jwt): AbstractAuthenticationToken {
        val userId =
            jwt.subject?.toLongOrNull()?.takeIf { it > 0 }
                ?: throw AccountAuthenticationException(ErrorCode.UNAUTHORIZED)
        val role =
            try {
                access.role(userId)
            } catch (e: ApiException) {
                throw AccountAuthenticationException(e.code)
            }
        // role 없는 기존 JWT도 허용한다. 권한과 탈퇴 여부는 항상 현재 DB 상태로 결정한다.
        return JwtAuthenticationToken(jwt, listOf(SimpleGrantedAuthority("ROLE_${role.name}")), userId.toString())
    }
}

package com.bawibase.chorong.domain.auth.config

import com.nimbusds.jose.jwk.source.ImmutableSecret
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.oauth2.jose.jws.MacAlgorithm
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.oauth2.jwt.JwtEncoder
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder
import javax.crypto.spec.SecretKeySpec

@Configuration
@EnableConfigurationProperties(JwtProperties::class)
class JwtConfig(
    private val props: JwtProperties,
) {
    private val key = SecretKeySpec(props.secret.toByteArray(), "HmacSHA256")

    @Bean
    fun jwtEncoder(): JwtEncoder = NimbusJwtEncoder(ImmutableSecret(key))

    @Bean
    fun jwtDecoder(): JwtDecoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build()
}

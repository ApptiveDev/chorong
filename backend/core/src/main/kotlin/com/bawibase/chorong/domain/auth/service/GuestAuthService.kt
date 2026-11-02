package com.bawibase.chorong.domain.auth.service

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.common.api.FieldViolation
import com.bawibase.chorong.domain.auth.dto.DevicePlatform
import com.bawibase.chorong.domain.auth.dto.GuestAuthData
import com.bawibase.chorong.domain.auth.dto.GuestAuthRequest
import com.bawibase.chorong.domain.auth.dto.UserBrief
import com.bawibase.chorong.domain.auth.entity.GuestDeviceEntity
import com.bawibase.chorong.domain.auth.repository.GuestDeviceRepository
import com.bawibase.chorong.domain.housing.repository.HousingProfileRepository
import com.bawibase.chorong.domain.housing.service.HousingCatalogService
import com.bawibase.chorong.domain.housing.service.HousingService
import com.bawibase.chorong.domain.user.AuthProvider
import com.bawibase.chorong.domain.user.UserNicknamePolicy
import com.bawibase.chorong.domain.user.entity.UserAuthEntity
import com.bawibase.chorong.domain.user.entity.UserEntity
import com.bawibase.chorong.domain.user.repository.UserAuthRepository
import com.bawibase.chorong.domain.user.repository.UserRepository
import com.bawibase.chorong.domain.user.service.UserWalletService
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
@Transactional
class GuestAuthService(
    private val coordinator: GuestAccountCoordinator,
    private val users: UserRepository,
    private val auths: UserAuthRepository,
    private val devices: GuestDeviceRepository,
    private val profiles: HousingProfileRepository,
    private val catalog: HousingCatalogService,
    private val housing: HousingService,
    private val wallets: UserWalletService,
    private val tokens: TokenService,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    fun authenticate(
        deviceUuid: String,
        platform: DevicePlatform,
    ): GuestAuthData {
        if (!Regex(GuestAuthRequest.UUID_PATTERN).matches(deviceUuid)) {
            throw ApiV1Exception(
                ApiErrorCode.VALIDATION_FAILED,
                fields = listOf(FieldViolation("deviceUuid", "UUID 형식으로 입력하세요.")),
            )
        }
        val uuid = coordinator.normalize(deviceUuid)
        coordinator.lock(uuid)
        val existing = coordinator.find(uuid)
        val auth =
            existing ?: run {
                val user = users.saveAndFlush(UserEntity())
                auths.saveAndFlush(UserAuthEntity(checkNotNull(user.id), AuthProvider.GUEST, uuid))
            }
        val user = users.findByIdForUpdate(auth.userId) ?: throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        if (!user.status.available) throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        val authId = checkNotNull(auth.id)
        val device = devices.findById(authId).orElse(null)
        if (device == null) devices.save(GuestDeviceEntity(authId, platform)) else device.platform = platform
        if (!profiles.existsById(auth.userId)) {
            val snapshot = catalog.snapshot()
            if (!snapshot.rooms.any { it.isDefault } || !snapshot.backgrounds.any { it.isDefault } ||
                !snapshot.avatars.any { it.isDefault } || !snapshot.walls.any { it.isDefault } ||
                !snapshot.floors.any { it.isDefault }
            ) {
                throw ApiException(ErrorCode.CATALOG_DEFAULT_MISSING)
            }
            housing.ensureProfile(auth.userId, snapshot, logCreated = false)
        }
        wallets.ensureWallet(auth.userId)
        val token = tokens.issue(auth.userId, uuid)
        if (existing == null) log.info("user.created userId={} provider=GUEST", auth.userId)
        return GuestAuthData(
            token.accessToken,
            token.refreshToken,
            token.expiresIn,
            UserBrief(auth.userId, UserNicknamePolicy.displayName(user.nickname, user.status), user.status),
            isNew = existing == null,
        )
    }
}

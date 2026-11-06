package com.bawibase.chorong.domain.user

import com.bawibase.chorong.TestcontainersConfig
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.auth.service.AuthService
import com.bawibase.chorong.domain.user.entity.UserEntity
import com.bawibase.chorong.domain.user.repository.UserRepository
import com.bawibase.chorong.domain.user.repository.UserWalletRepository
import com.bawibase.chorong.domain.user.service.UserWalletService
import com.bawibase.chorong.domain.user.service.WalletCurrency
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.http.HttpHeaders
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

@SpringBootTest
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import(TestcontainersConfig::class)
class WalletApiTest {
    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var auth: AuthService

    @Autowired lateinit var decoder: JwtDecoder

    @Autowired lateinit var users: UserRepository

    @Autowired lateinit var wallets: UserWalletRepository

    @Autowired lateinit var walletService: UserWalletService

    @Test
    fun `API-904 returns independent new currencies and preserves legacy coin`() {
        val token = auth.guestSignUp(UUID.randomUUID().toString()).accessToken
        val userId = decoder.decode(token).subject.toLong()
        val wallet = walletService.ensureWallet(userId)
        wallet.coin = 437
        wallets.saveAndFlush(wallet)

        mvc.get("/api/v1/users/me/wallet") { header(HttpHeaders.AUTHORIZATION, "Bearer $token") }.andExpect {
            status { isOk() }
            jsonPath("$.data.star") { doesNotExist() }
            jsonPath("$.data.stardust") { value(0) }
            jsonPath("$.data.coin") { doesNotExist() }
        }
        mvc.get("/api/v1/users/me") { header(HttpHeaders.AUTHORIZATION, "Bearer $token") }.andExpect {
            status { isOk() }
            jsonPath("$.data.wallet.star") { doesNotExist() }
            jsonPath("$.data.wallet.stardust") { value(0) }
        }
        assertEquals(437L, wallets.findById(userId).orElseThrow().coin)
    }

    @Test
    fun `wallet initialization and credits serialize concurrent changes`() {
        val userId = checkNotNull(users.saveAndFlush(UserEntity()).id)
        val workerCount = 8
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(workerCount)
        try {
            val tasks =
                (1..workerCount).map {
                    executor.submit {
                        check(start.await(10, TimeUnit.SECONDS))
                        repeat(12) {
                            walletService.credit(userId, WalletCurrency.STARDUST, 3)
                        }
                    }
                }
            start.countDown()
            tasks.forEach { it.get(30, TimeUnit.SECONDS) }
        } finally {
            executor.shutdownNow()
        }
        val wallet = wallets.findById(userId).orElseThrow()
        assertEquals(0L, wallet.star)
        assertEquals(288L, wallet.stardust)
    }

    @Test
    fun `credit rejects nonpositive amounts and overflow without changing balance`() {
        val userId = checkNotNull(users.saveAndFlush(UserEntity()).id)
        walletService.ensureWallet(userId).apply { stardust = Long.MAX_VALUE }.also(wallets::saveAndFlush)

        assertFailsWith<ApiV1Exception> { walletService.credit(userId, WalletCurrency.STARDUST, 1) }
        assertFailsWith<ApiV1Exception> { walletService.credit(userId, WalletCurrency.STARDUST, 0) }
        val wallet = wallets.findById(userId).orElseThrow()
        assertEquals(0L, wallet.star)
        assertEquals(Long.MAX_VALUE, wallet.stardust)
    }

    @Test
    fun `currency debits remain independent and reject insufficient balance`() {
        val userId = checkNotNull(users.saveAndFlush(UserEntity()).id)
        walletService.credit(userId, WalletCurrency.STARDUST, 20)
        walletService.debit(userId, WalletCurrency.STARDUST, 5)

        assertFailsWith<ApiV1Exception> { walletService.debit(userId, WalletCurrency.STARDUST, 16) }
        assertFailsWith<ApiV1Exception> { walletService.debit(userId, WalletCurrency.STARDUST, -1) }
        val wallet = wallets.findById(userId).orElseThrow()
        assertEquals(0L, wallet.star)
        assertEquals(15L, wallet.stardust)
    }
}

package com.app.safexchange.data

import com.app.safexchange.BuildConfig
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import java.util.concurrent.TimeUnit

interface AdminApi {
    @POST("auth/admin/login")
    suspend fun adminLogin(@Body body: LoginBody): ApiEnvelope<LoginData>

    @GET("admin/notifications/summary")
    suspend fun notificationSummary(): ApiEnvelope<NotificationSummary>

    @GET("admin/deposits")
    suspend fun listDeposits(
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = 50,
        @Query("status") status: String? = "pending",
        @Query("sortBy") sortBy: String = "createdAt",
        @Query("sortDir") sortDir: String = "desc",
    ): ApiEnvelope<PaginatedRows<DepositRow>>

    @GET("admin/withdrawals")
    suspend fun listWithdrawals(
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = 50,
        @Query("status") status: String? = "pending",
        @Query("sortBy") sortBy: String = "createdAt",
        @Query("sortDir") sortDir: String = "desc",
    ): ApiEnvelope<PaginatedRows<WithdrawalRow>>

    @PATCH("admin/deposits/{id}/verify")
    suspend fun verifyDeposit(
        @Path("id") id: String,
        @Body body: VerifyBody,
    ): ApiEnvelope<DepositRow>

    @PATCH("admin/withdrawals/{id}/verify")
    suspend fun verifyWithdrawal(
        @Path("id") id: String,
        @Body body: VerifyBody,
    ): ApiEnvelope<WithdrawalRow>

    @POST("admin/notifications/device")
    suspend fun registerDevice(@Body body: DeviceTokenBody): ApiEnvelope<Any>

    @POST("admin/notifications/device/unregister")
    suspend fun unregisterDevice(@Body body: DeviceTokenBody): ApiEnvelope<Any>

    @GET("admin/notifications/fcm-status")
    suspend fun fcmStatus(): ApiEnvelope<Any>

    @POST("admin/notifications/test-push")
    suspend fun testPush(): ApiEnvelope<Any>
}

object ApiClient {
    private lateinit var authStore: AuthStore
    lateinit var api: AdminApi
        private set

    fun init(store: AuthStore) {
        authStore = store
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }
        val authInterceptor = Interceptor { chain ->
            val token = runBlocking { authStore.getToken() }
            val req = if (!token.isNullOrBlank()) {
                chain.request().newBuilder()
                    .header("Authorization", "Bearer $token")
                    .build()
            } else {
                chain.request()
            }
            chain.proceed(req)
        }
        val client = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .addInterceptor(authInterceptor)
            .addInterceptor(logging)
            .build()

        api = Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(AdminApi::class.java)
    }
}

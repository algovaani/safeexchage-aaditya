package com.app.safexchange.data

import com.google.gson.annotations.SerializedName

data class ApiEnvelope<T>(
    val success: Boolean? = null,
    val message: String? = null,
    val data: T? = null,
)

data class LoginBody(val email: String, val password: String)

data class LoginData(
    val token: String,
    val user: AdminUser?,
)

data class AdminUser(
    val id: String? = null,
    val email: String? = null,
    val name: String? = null,
    val role: String? = null,
)

data class PaginatedRows<T>(
    val rows: List<T> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val pageSize: Int = 20,
)

data class RequestUser(
    val id: String? = null,
    val email: String? = null,
    val mobile: String? = null,
    val name: String? = null,
)

data class DepositRow(
    val id: String? = null,
    @SerializedName("_id") val _id: String? = null,
    val type: String? = null,
    val amount: Double? = null,
    val currency: String? = null,
    val usdtAmount: Double? = null,
    val status: String? = null,
    val network: String? = null,
    val chain: String? = null,
    val txnHash: String? = null,
    val createdAt: String? = null,
    val user: RequestUser? = null,
    val userLabel: String? = null,
) {
    fun rowId(): String = id ?: _id ?: ""
    fun displayUser(): String =
        user?.mobile ?: user?.email ?: userLabel ?: user?.name ?: "User"
}

data class WithdrawalRow(
    val id: String? = null,
    @SerializedName("_id") val _id: String? = null,
    val type: String? = null,
    val amount: Double? = null,
    val currency: String? = null,
    val status: String? = null,
    val network: String? = null,
    val walletAddress: String? = null,
    val bankName: String? = null,
    val createdAt: String? = null,
    val user: RequestUser? = null,
    val userLabel: String? = null,
) {
    fun rowId(): String = id ?: _id ?: ""
    fun displayUser(): String =
        user?.mobile ?: user?.email ?: userLabel ?: user?.name ?: "User"
}

data class VerifyBody(
    val action: String,
    val note: String = "",
    @SerializedName("apply_bonus") val applyBonus: Boolean = false,
)

data class DeviceTokenBody(
    val token: String,
    val platform: String = "android",
    @SerializedName("device_label") val deviceLabel: String = "android",
)

data class NotificationSummary(
    val pendingDeposits: Int = 0,
    val pendingWithdrawals: Int = 0,
    val unread: Int = 0,
)

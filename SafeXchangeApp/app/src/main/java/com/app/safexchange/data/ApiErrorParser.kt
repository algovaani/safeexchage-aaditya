package com.app.safexchange.data

import com.google.gson.Gson
import retrofit2.HttpException
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException

object ApiErrorParser {
    private val gson = Gson()

    fun message(t: Throwable): String {
        if (t is HttpException) {
            parseServerMessage(t)?.let { return it }
            return when (t.code()) {
                401 -> "Invalid admin email or password"
                403 -> "Access denied — admin account may be blocked"
                404 -> "API not found — check app/server configuration"
                422 -> "Invalid request — check email format"
                429 -> "Too many attempts — wait a minute and try again"
                in 500..599 -> "Server error (${t.code()}). Try again shortly."
                else -> "Request failed (${t.code()})"
            }
        }
        return when (t) {
            is UnknownHostException -> "Cannot reach server. Check internet connection."
            is SocketTimeoutException -> "Connection timed out. Try again."
            is SSLException -> "Secure connection failed. Check device date/time."
            is IOException -> "Network error — ${t.message ?: "check connection"}"
            else -> t.message ?: "Something went wrong"
        }
    }

    private fun parseServerMessage(ex: HttpException): String? {
        val raw = ex.response()?.errorBody()?.string()?.trim().orEmpty()
        if (raw.isEmpty()) return null
        return try {
            gson.fromJson(raw, ApiEnvelope::class.java)?.message?.trim()?.takeIf { it.isNotEmpty() }
        } catch (_: Exception) {
            null
        }
    }
}

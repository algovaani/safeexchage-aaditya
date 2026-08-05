package com.app.safexchange

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.app.safexchange.data.AuthStore
import com.app.safexchange.data.ApiClient

class SafeXchangeApp : Application() {
    lateinit var authStore: AuthStore
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        authStore = AuthStore(this)
        ApiClient.init(authStore)
        createNotificationChannel()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Admin requests",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "New deposit and withdrawal requests"
            enableVibration(true)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    companion object {
        const val CHANNEL_ID = "admin_requests"
        lateinit var instance: SafeXchangeApp
            private set
    }
}

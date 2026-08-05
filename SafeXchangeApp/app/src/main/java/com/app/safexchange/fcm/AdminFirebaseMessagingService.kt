package com.app.safexchange.fcm

import android.app.PendingIntent
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.app.safexchange.BuildConfig
import com.app.safexchange.MainActivity
import com.app.safexchange.R
import com.app.safexchange.SafeXchangeApp
import com.app.safexchange.data.ApiClient
import com.app.safexchange.data.DeviceTokenBody
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class AdminFirebaseMessagingService : FirebaseMessagingService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        scope.launch {
            try {
                SafeXchangeApp.instance.authStore.saveFcmToken(token)
                val jwt = SafeXchangeApp.instance.authStore.getToken()
                if (!jwt.isNullOrBlank()) {
                    ApiClient.api.registerDevice(DeviceTokenBody(token = token))
                }
            } catch (e: Exception) {
                Log.w(TAG, "register token failed: ${e.message}")
            }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title
            ?: message.data["title"]
            ?: "SafeXchange Admin"
        val body = message.notification?.body
            ?: message.data["body"]
            ?: "New request"
        val section = message.data["section"] ?: "deposits"
        showNotification(title, body, section, message.data["refId"])
    }

    private fun showNotification(title: String, body: String, section: String, refId: String?) {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_SECTION, section)
            putExtra(EXTRA_REF_ID, refId)
            putExtra(EXTRA_OPEN_WEB, true)
        }
        val pending = PendingIntent.getActivity(
            this,
            System.currentTimeMillis().toInt(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, SafeXchangeApp.CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()

        try {
            NotificationManagerCompat.from(this).notify(
                (refId ?: title).hashCode(),
                notification
            )
        } catch (e: SecurityException) {
            Log.w(TAG, "notification permission missing: ${e.message}")
        }
    }

    companion object {
        private const val TAG = "AdminFCM"
        const val EXTRA_SECTION = "section"
        const val EXTRA_REF_ID = "refId"
        const val EXTRA_OPEN_WEB = "openWeb"

        fun adminWebUrl(section: String): String {
            val base = BuildConfig.ADMIN_WEB_BASE.trimEnd('/')
            return "$base/admin/panel?section=$section"
        }
    }
}

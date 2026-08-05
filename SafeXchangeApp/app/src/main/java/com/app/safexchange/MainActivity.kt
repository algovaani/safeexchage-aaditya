package com.app.safexchange

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.core.content.ContextCompat
import com.app.safexchange.fcm.AdminFirebaseMessagingService
import com.app.safexchange.ui.AdminRoot
import com.app.safexchange.ui.theme.SafeXchangeTheme

class MainActivity : ComponentActivity() {
    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* no-op */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestNotifPermission()
        enableEdgeToEdge()

        val section = intent?.getStringExtra(AdminFirebaseMessagingService.EXTRA_SECTION)
        val openWeb = intent?.getBooleanExtra(AdminFirebaseMessagingService.EXTRA_OPEN_WEB, false) == true

        setContent {
            SafeXchangeTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = Color(0xFF0B0E11)) {
                    AdminRoot(startSection = if (openWeb) section else section)
                }
            }
        }

        if (openWeb && !section.isNullOrBlank()) {
            val url = AdminFirebaseMessagingService.adminWebUrl(section)
            startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url)))
        }
    }

    private fun requestNotifPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED
        ) return
        permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
}

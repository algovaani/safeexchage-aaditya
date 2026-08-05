package com.app.safexchange.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColors = darkColorScheme(
    primary = Color(0xFFF0B90B),
    onPrimary = Color(0xFF0B0E11),
    secondary = Color(0xFF0ECB81),
    background = Color(0xFF0B0E11),
    surface = Color(0xFF1E2329),
    onBackground = Color(0xFFEAECEF),
    onSurface = Color(0xFFEAECEF),
    error = Color(0xFFF6465D),
)

@Composable
fun SafeXchangeTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColors,
        typography = Typography,
        content = content
    )
}

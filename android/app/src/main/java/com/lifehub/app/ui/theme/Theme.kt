package com.lifehub.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/** Цвета бренда — те же, что в веб-версии (tailwind brand.*). */
object Brand {
    val Deep = Color(0xFF051824)
    val Night = Color(0xFF162936)
    val Slate = Color(0xFF3B5265)
    val Mint = Color(0xFF27E9B5)
    val Card = Color(0xFF12222E)
    val CardHigh = Color(0xFF1A2E3C)
    val Text = Color(0xFFE9FCF6)
    val TextMuted = Color(0x99E9FCF6)
    val TextFaint = Color(0x66E9FCF6)
    val Amber = Color(0xFFFBBF24)
    val Rose = Color(0xFFFB7185)
    val Sky = Color(0xFF38BDF8)
    val Violet = Color(0xFFA78BFA)
    val Green = Color(0xFF58CC02)
    val GreenShadow = Color(0xFF46A302)
    val Danger = Color(0xFFEF4444)
}

private val scheme = darkColorScheme(
    primary = Brand.Mint,
    onPrimary = Brand.Deep,
    secondary = Brand.Sky,
    background = Brand.Deep,
    onBackground = Brand.Text,
    surface = Brand.Night,
    onSurface = Brand.Text,
    surfaceVariant = Brand.Card,
    onSurfaceVariant = Brand.TextMuted,
    surfaceContainer = Brand.Night,
    surfaceContainerHigh = Brand.CardHigh,
    error = Brand.Rose,
    outline = Brand.Slate,
)

private val typography = Typography(
    headlineMedium = TextStyle(fontSize = 26.sp, fontWeight = FontWeight.ExtraBold),
    titleLarge = TextStyle(fontSize = 21.sp, fontWeight = FontWeight.Bold),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 16.sp),
    bodyMedium = TextStyle(fontSize = 14.sp),
    labelSmall = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.6.sp),
)

@Composable
fun LifeHubTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = scheme, typography = typography, content = content)
}

fun rarityColor(rarity: String?): Color = when (rarity) {
    "rare" -> Brand.Sky
    "epic" -> Color(0xFFE879F9)
    "legendary" -> Brand.Amber
    else -> Color(0xFF94A3B8)
}

fun rarityLabel(rarity: String?): String = when (rarity) {
    "rare" -> "Редкая"
    "epic" -> "Эпическая"
    "legendary" -> "Легендарная"
    else -> "Обычная"
}

fun parseHex(hex: String?, fallback: Color): Color = try {
    if (hex.isNullOrBlank()) fallback else Color(android.graphics.Color.parseColor(hex))
} catch (_: Exception) {
    fallback
}

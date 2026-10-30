package com.lifehub.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.sp

/** Палитра, из которой собираются цвета интерфейса (тёмный и светлый варианты). */
data class Palette(
    val deep: Color, val night: Color, val card: Color, val cardHigh: Color, val slate: Color,
    val accent: Color, val text: Color, val textMuted: Color, val textFaint: Color,
    /** Цвет «чернил»: белый в тёмной теме и почти чёрный в светлой — для текста и полупрозрачных подложек. */
    val ink: Color, val light: Boolean,
)

/**
 * Цвета интерфейса. Значения читаются из текущей темы ([ThemeManager]) — смена темы
 * перерисовывает весь интерфейс без перезапуска.
 */
object Brand {
    private val p get() = ThemeManager.palette
    val Deep get() = p.deep
    val Night get() = p.night
    val Slate get() = p.slate
    val Mint get() = p.accent
    val Card get() = p.card
    val CardHigh get() = p.cardHigh
    val Text get() = p.text
    val TextMuted get() = p.textMuted
    val TextFaint get() = p.textFaint
    /** Белый в тёмной теме, тёмный в светлой: для подложек вроде `Brand.Ink.copy(alpha = 0.06f)`. */
    val Ink get() = p.ink
    val Light get() = p.light
    val Amber = Color(0xFFFBBF24)
    val Rose = Color(0xFFFB7185)
    val Sky = Color(0xFF38BDF8)
    val Violet = Color(0xFFA78BFA)
    val Green = Color(0xFF58CC02)
    val GreenShadow = Color(0xFF46A302)
    val Danger = Color(0xFFEF4444)
    /** Множитель скругления углов из настроек оформления (1 = 12 px, как в веб). */
    val RadiusScale get() = ThemeManager.settings.radius / 12f
}

private fun Color.mix(other: Color, t: Float) = lerp(this, other, t)

/** Строим палитру из цветов темы так же, как веб-версия (deep/night/slate/accent). */
fun buildPalette(colors: ThemeColors, accent: Color, light: Boolean): Palette =
    if (!light) {
        val text = Color(0xFFE9FCF6)
        Palette(
            deep = colors.deep, night = colors.night,
            card = colors.deep.mix(colors.night, 0.55f), cardHigh = colors.night.mix(colors.slate, 0.25f),
            slate = colors.slate, accent = accent,
            text = text, textMuted = text.copy(alpha = 0.6f), textFaint = text.copy(alpha = 0.4f),
            ink = Color.White, light = false,
        )
    } else {
        // Светлая: фон — почти белый с оттенком темы, акцент чуть темнее для контраста
        val text = Color(0xFF0F1A22)
        Palette(
            deep = Color(0xFFF3F5F7).mix(colors.night, 0.06f), night = Color.White,
            card = Color.White, cardHigh = Color(0xFFEDF1F4).mix(colors.slate, 0.08f),
            slate = Color(0xFFCBD5E1), accent = accent.mix(Color.Black, 0.18f),
            text = text, textMuted = text.copy(alpha = 0.62f), textFaint = text.copy(alpha = 0.42f),
            ink = Color(0xFF0F1A22), light = true,
        )
    }

@Composable
fun LifeHubTheme(content: @Composable () -> Unit) {
    val settings = ThemeManager.settings
    val systemDark = isSystemInDarkTheme()
    val light = when (settings.mode) { "light" -> true; "auto" -> !systemDark; else -> false }
    ThemeManager.updatePalette(light)
    val p = ThemeManager.palette
    val scheme = if (p.light) lightColorScheme(
        primary = p.accent, onPrimary = Color.White, secondary = Brand.Sky, background = p.deep, onBackground = p.text,
        surface = p.night, onSurface = p.text, surfaceVariant = p.card, onSurfaceVariant = p.textMuted,
        surfaceContainer = p.night, surfaceContainerHigh = p.cardHigh, error = Brand.Rose, outline = p.slate,
    ) else darkColorScheme(
        primary = p.accent, onPrimary = p.deep, secondary = Brand.Sky, background = p.deep, onBackground = p.text,
        surface = p.night, onSurface = p.text, surfaceVariant = p.card, onSurfaceVariant = p.textMuted,
        surfaceContainer = p.night, surfaceContainerHigh = p.cardHigh, error = Brand.Rose, outline = p.slate,
    )
    val family = when (settings.font) { "serif" -> FontFamily.Serif; "mono" -> FontFamily.Monospace; "cursive" -> FontFamily.Cursive; else -> FontFamily.Default }
    val typography = Typography(
        headlineMedium = TextStyle(fontSize = 26.sp, fontWeight = FontWeight.ExtraBold, fontFamily = family),
        titleLarge = TextStyle(fontSize = 21.sp, fontWeight = FontWeight.Bold, fontFamily = family),
        titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold, fontFamily = family),
        bodyLarge = TextStyle(fontSize = 16.sp, fontFamily = family),
        bodyMedium = TextStyle(fontSize = 14.sp, fontFamily = family),
        labelSmall = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.6.sp, fontFamily = family),
    )
    // Значки статус-бара и навигации: тёмные на светлой теме, светлые на тёмной
    val view = androidx.compose.ui.platform.LocalView.current
    androidx.compose.runtime.SideEffect {
        (view.context as? android.app.Activity)?.window?.let { w ->
            androidx.core.view.WindowCompat.getInsetsController(w, view).apply {
                isAppearanceLightStatusBars = p.light
                isAppearanceLightNavigationBars = p.light
            }
        }
    }
    // Плотность: чуть мельче или крупнее весь текст
    val base = LocalDensity.current
    val scale = when (settings.density) { "compact" -> 0.93f; "relaxed" -> 1.07f; else -> 1f }
    CompositionLocalProvider(LocalDensity provides Density(base.density, base.fontScale * scale)) {
        MaterialTheme(colorScheme = scheme, typography = typography) {
            CompositionLocalProvider(androidx.compose.material3.LocalTextStyle provides androidx.compose.material3.LocalTextStyle.current.copy(fontFamily = family)) {
                content()
            }
        }
    }
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

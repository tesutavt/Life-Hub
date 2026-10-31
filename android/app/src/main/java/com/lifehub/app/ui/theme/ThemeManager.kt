package com.lifehub.app.ui.theme

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import com.lifehub.app.data.Api
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject

/** Тема — тот же JSON, что у веб-версии (client/src/theme.ts), поэтому настройки общие. */
@Serializable
data class ThemePaletteDto(
    val id: String = "",
    val name: String = "",
    val deep: String = "#051824",
    val night: String = "#162936",
    val slate: String = "#3b5265",
    val accent: String = "#27e9b5",
    val custom: Boolean = false,
)

@Serializable
data class ThemeSettings(
    val mode: String = "dark",
    val preset: String = "lifehub",
    val accent: String? = null,
    val density: String = "standard",
    val font: String = "nunito",
    val radius: Int = 12,
    val animations: Boolean = true,
    val boldFocus: Boolean = false,
    /** Сезонные эффекты: auto — по дате, off — выключены, или spring/summer/autumn/halloween/winter/newyear */
    val seasonal: String = "auto",
    val customThemes: List<ThemePaletteDto> = emptyList(),
)

data class ThemeColors(val deep: Color, val night: Color, val slate: Color, val accent: Color)

val THEME_PRESETS = listOf(
    ThemePaletteDto("lifehub", "Life Hub", "#051824", "#162936", "#3b5265", "#27e9b5"),
    ThemePaletteDto("midnight", "Полночь", "#070b1a", "#141b34", "#33406b", "#818cf8"),
    ThemePaletteDto("ocean", "Океан", "#03151f", "#0b2a3a", "#1f5068", "#38bdf8"),
    ThemePaletteDto("forest", "Лес", "#06140d", "#12281b", "#2f5640", "#4ade80"),
    ThemePaletteDto("sakura", "Сакура", "#1a0b14", "#2c1424", "#5e3150", "#f472b6"),
    ThemePaletteDto("coral", "Коралл", "#160d0c", "#261716", "#4f322f", "#fb7185"),
    ThemePaletteDto("coffee", "Кофе", "#140f0a", "#241b13", "#4b3a2a", "#fbbf24"),
    ThemePaletteDto("graphite", "Графит", "#0b0c0e", "#1a1c20", "#3a3d44", "#e5e7eb"),
)
val THEME_ACCENTS = listOf("#3b82f6", "#22c55e", "#facc15", "#f97316", "#ef4444", "#d946ef", "#8b5cf6", "#22d3ee", "#fb7185", "#27e9b5")

fun hexColor(hex: String, fallback: Color = Color(0xFF27E9B5)): Color = parseHex(hex, fallback)

object ThemeManager {
    private const val KEY = "theme_settings"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var pushJob: Job? = null
    private var context: Context? = null

    var settings by mutableStateOf(ThemeSettings())
        private set
    var palette by mutableStateOf(buildPalette(colorsOf(ThemeSettings()), Color(0xFF27E9B5), false))
        private set
    private var light = false

    fun palettes(s: ThemeSettings = settings) = THEME_PRESETS + s.customThemes
    fun paletteDto(s: ThemeSettings = settings) = palettes(s).firstOrNull { it.id == s.preset } ?: THEME_PRESETS.first()

    private fun colorsOf(s: ThemeSettings): ThemeColors {
        val p = paletteDto(s)
        return ThemeColors(hexColor(p.deep), hexColor(p.night), hexColor(p.slate), hexColor(s.accent ?: p.accent))
    }

    private fun rebuild() {
        val c = colorsOf(settings)
        palette = buildPalette(c, c.accent, light)
    }

    /** Вызывается из темы Compose: светлый/тёмный режим зависит от системы при «Авто». */
    fun updatePalette(isLight: Boolean) {
        if (isLight != light || palette.light != isLight) { light = isLight; rebuild() }
    }

    fun init(ctx: Context) {
        context = ctx.applicationContext
        val raw = ctx.getSharedPreferences("lifehub", Context.MODE_PRIVATE).getString(KEY, null)
        settings = raw?.let { runCatching { Api.json.decodeFromString<ThemeSettings>(it) }.getOrNull() } ?: ThemeSettings()
        rebuild()
    }

    /** Применить и сохранить: сразу на телефоне, на сервер — через секунду после последнего изменения. */
    fun update(next: ThemeSettings, push: Boolean = true) {
        settings = next
        rebuild()
        context?.getSharedPreferences("lifehub", Context.MODE_PRIVATE)?.edit()?.putString(KEY, Api.json.encodeToString(ThemeSettings.serializer(), next))?.apply()
        if (push) {
            pushJob?.cancel()
            pushJob = scope.launch {
                delay(800)
                runCatching { Api.put("/api/life/ui-settings", buildJsonObject { put("theme", Api.json.encodeToJsonElement(next)) }) }
            }
        }
    }

    /** Забрать тему с сервера (её могли поменять на компьютере). */
    suspend fun sync() {
        val theme = runCatching { Api.request("GET", "/api/life/ui-settings").jsonObject["theme"] as? JsonObject }.getOrNull() ?: return
        val remote = runCatching { Api.json.decodeFromJsonElement<ThemeSettings>(theme) }.getOrNull() ?: return
        if (remote != settings) update(remote, push = false)
    }
}

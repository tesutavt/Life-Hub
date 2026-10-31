package com.lifehub.app.ui.screens

import androidx.compose.material.icons.filled.Extension
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Dns
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.OpenInBrowser
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.Watch
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lifehub.app.BuildConfig
import com.lifehub.app.data.Session
import com.lifehub.app.ui.components.BackTopBar
import com.lifehub.app.ui.components.LhCard
import com.lifehub.app.ui.theme.Brand
import com.lifehub.app.ui.theme.THEME_ACCENTS
import com.lifehub.app.ui.theme.ThemeManager
import com.lifehub.app.ui.theme.ThemePaletteDto
import com.lifehub.app.ui.theme.hexColor

private data class SettingsSection(val id: String, val title: String, val hint: String, val icon: ImageVector)

private val SECTIONS = listOf(
    SettingsSection("appearance", "Оформление", "тема, цвета, шрифт", Icons.Default.Palette),
    SettingsSection("notifications", "Уведомления", "напоминания и «не беспокоить»", Icons.Default.NotificationsActive),
    SettingsSection("health", "Браслет и здоровье", "Health Connect: шаги, сон, пульс", Icons.Default.Watch),
    SettingsSection("calendar", "Календарь телефона", "события Life Hub в календаре", Icons.Default.CalendarMonth),
    SettingsSection("integrations", "Интеграции", "Shikimori и Steam для полки", Icons.Default.Extension),
    SettingsSection("account", "Аккаунт и сервер", "сервер, веб-версия, выход", Icons.Default.Dns),
)

/** Настройки: список разделов → подстраница раздела (как боковое меню настроек на компьютере). */
@Composable
fun SettingsScreen(onBack: () -> Unit) {
    var section by remember { mutableStateOf<String?>(null) }
    BackHandler(enabled = section != null) { section = null }
    val current = SECTIONS.firstOrNull { it.id == section }
    Column(Modifier.fillMaxSize().background(Brand.Deep)) {
        BackTopBar(current?.title ?: "Настройки", { if (section != null) section = null else onBack() })
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            when (section) {
                null -> {
                    Text("Внешний вид, уведомления и подключения. Тема общая для компьютера и телефона.", color = Brand.TextMuted, fontSize = 13.sp)
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape((20 * Brand.RadiusScale).dp)).background(Brand.Card).border(1.dp, Brand.Ink.copy(alpha = 0.08f), RoundedCornerShape((20 * Brand.RadiusScale).dp))) {
                        SECTIONS.forEachIndexed { i, s ->
                            Row(Modifier.fillMaxWidth().clickable { section = s.id }.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(38.dp).clip(RoundedCornerShape(12.dp)).background(Brand.Mint.copy(alpha = 0.14f)), contentAlignment = Alignment.Center) {
                                    Icon(s.icon, null, tint = Brand.Mint, modifier = Modifier.size(20.dp))
                                }
                                Spacer(Modifier.width(14.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(s.title, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                                    Text(s.hint, color = Brand.TextMuted, fontSize = 12.sp)
                                }
                                Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = Brand.TextFaint)
                            }
                            if (i < SECTIONS.lastIndex) Box(Modifier.fillMaxWidth().padding(start = 68.dp).height(1.dp).background(Brand.Ink.copy(alpha = 0.06f)))
                        }
                    }
                    Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.Center) {
                        Icon(Icons.Default.Info, null, tint = Brand.TextFaint, modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Life Hub для Android · версия ${BuildConfig.VERSION_NAME}", color = Brand.TextFaint, fontSize = 12.sp)
                    }
                }
                "appearance" -> AppearanceSection()
                "notifications" -> RemindersSection()
                "health" -> HealthSection()
                "calendar" -> CalendarSyncSection()
                "account" -> AccountSection()
                "integrations" -> IntegrationsSection()
            }
        }
    }
}

@Composable
private fun AccountSection() {
    val context = LocalContext.current
    var confirmLogout by remember { mutableStateOf(false) }
    val server = Session.server.value.orEmpty()
    SettingRow(Icons.Default.Dns, "Сервер", server.removePrefix("http://").removePrefix("https://") + " · сменить") { Session.clearServer() }
    SettingRow(Icons.Default.OpenInBrowser, "Открыть веб-версию", "Отчёты, админка и всё остальное — в браузере") {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(server)))
    }
    SettingRow(Icons.AutoMirrored.Filled.Logout, "Выйти из аккаунта", "Данные останутся на сервере") { confirmLogout = true }
    if (confirmLogout) {
        AlertDialog(
            onDismissRequest = { confirmLogout = false },
            title = { Text("Выйти из аккаунта?") },
            confirmButton = { TextButton(onClick = { Session.logout() }) { Text("Выйти", color = Brand.Rose) } },
            dismissButton = { TextButton(onClick = { confirmLogout = false }) { Text("Отмена") } },
            containerColor = Brand.Night,
        )
    }
}

@Composable
private fun SettingRow(icon: ImageVector, title: String, subtitle: String, onClick: () -> Unit) {
    LhCard(Modifier.fillMaxWidth(), onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, tint = Brand.Mint)
            Spacer(Modifier.width(14.dp))
            Column {
                Text(title, fontWeight = FontWeight.SemiBold)
                Text(subtitle, color = Brand.TextMuted, fontSize = 13.sp)
            }
        }
    }
}

// ───────────── Оформление ─────────────

@Composable
private fun Group(title: String, content: @Composable () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape((22 * Brand.RadiusScale).dp)).background(Brand.Card)
            .border(1.dp, Brand.Ink.copy(alpha = 0.08f), RoundedCornerShape((22 * Brand.RadiusScale).dp)).padding(16.dp),
    ) {
        Text(title.uppercase(), color = Brand.TextMuted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.4.sp, modifier = Modifier.padding(bottom = 10.dp))
        content()
    }
}

@Composable
private fun Segmented(options: List<Pair<String, String>>, value: String, onChange: (String) -> Unit) {
    Row(Modifier.clip(CircleShape).background(Brand.Ink.copy(alpha = 0.06f)).padding(4.dp)) {
        options.forEach { (id, label) ->
            val on = id == value
            Text(label, fontSize = 14.sp, color = if (on) Brand.Deep else Brand.TextMuted, fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal,
                modifier = Modifier.clip(CircleShape).background(if (on) Brand.Mint else Color.Transparent).clickable { onChange(id) }.padding(horizontal = 16.dp, vertical = 8.dp))
        }
    }
}

/** Мини-превью темы. */
@Composable
private fun ThemeCard(p: ThemePaletteDto, active: Boolean, onClick: () -> Unit, onLongClick: (() -> Unit)?) {
    Column(
        Modifier.width(132.dp).clip(RoundedCornerShape(16.dp))
            .border(2.dp, if (active) Brand.Mint else Brand.Ink.copy(alpha = 0.1f), RoundedCornerShape(16.dp))
            .clickable(onClick = onClick).padding(6.dp),
    ) {
        Box(Modifier.fillMaxWidth().height(70.dp).clip(RoundedCornerShape(12.dp))
            .background(Brush.linearGradient(listOf(hexColor(p.deep), hexColor(p.night), hexColor(p.slate))))) {
            Column(Modifier.padding(8.dp)) {
                Box(Modifier.width(54.dp).height(7.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.7f)))
                Spacer(Modifier.height(6.dp))
                Row {
                    Box(Modifier.width(60.dp).height(22.dp).clip(RoundedCornerShape(6.dp)).background(hexColor(p.night)).border(1.dp, hexColor(p.slate), RoundedCornerShape(6.dp)))
                    Spacer(Modifier.width(6.dp))
                    Box(Modifier.size(22.dp).clip(RoundedCornerShape(6.dp)).background(hexColor(p.accent)))
                }
            }
        }
        Row(Modifier.padding(top = 6.dp, start = 2.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(10.dp).clip(CircleShape).background(hexColor(p.accent)))
            Spacer(Modifier.width(6.dp))
            Text(p.name, fontSize = 12.sp, maxLines = 1, modifier = Modifier.weight(1f))
            if (onLongClick != null) Text("✏️", fontSize = 11.sp, modifier = Modifier.clickable(onClick = onLongClick))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AppearanceSection() {
    val s = ThemeManager.settings
    val palette = ThemeManager.paletteDto()
    val accent = s.accent ?: palette.accent
    var editing by remember { mutableStateOf<ThemePaletteDto?>(null) }
    fun set(next: com.lifehub.app.ui.theme.ThemeSettings) = ThemeManager.update(next)

    Group("Режим") {
        Segmented(listOf("auto" to "Авто", "light" to "Светлая", "dark" to "Тёмная"), s.mode) { set(s.copy(mode = it)) }
        Text("«Авто» — как в настройках телефона.", color = Brand.TextFaint, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
    }
    Group("Тема") {
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            ThemeManager.palettes().forEach { p ->
                ThemeCard(p, p.id == s.preset, onClick = { set(s.copy(preset = p.id, accent = null)) }, onLongClick = if (p.custom) ({ editing = p }) else null)
            }
            Column(
                Modifier.width(132.dp).height(104.dp).clip(RoundedCornerShape(16.dp)).border(2.dp, Brand.Ink.copy(alpha = 0.15f), RoundedCornerShape(16.dp))
                    .clickable { editing = palette.copy(id = "custom-" + System.currentTimeMillis().toString(36), name = "Моя тема", custom = true) },
                verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("＋", fontSize = 24.sp, color = Brand.Mint)
                Text("Своя тема", fontSize = 12.sp, color = Brand.TextMuted)
            }
        }
    }
    Group("Акцентный цвет") {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            THEME_ACCENTS.forEach { c ->
                val on = accent.equals(c, true)
                Box(Modifier.size(if (on) 40.dp else 36.dp).clip(CircleShape)
                    .background(Brush.radialGradient(listOf(Color.White.copy(alpha = 0.6f), hexColor(c)), radius = 60f))
                    .border(2.dp, if (on) Brand.Ink else Color.Transparent, CircleShape)
                    .clickable { set(s.copy(accent = c)) })
            }
        }
        if (s.accent != null) Text("как в теме", color = Brand.TextMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp).clickable { set(s.copy(accent = null)) })
    }
    Group("Плотность") {
        val idx = when (s.density) { "relaxed" -> 0f; "compact" -> 2f; else -> 1f }
        Slider(idx, { set(s.copy(density = listOf("relaxed", "standard", "compact")[it.toInt()])) }, valueRange = 0f..2f, steps = 1,
            colors = SliderDefaults.colors(thumbColor = Brand.Mint, activeTrackColor = Brand.Mint))
        Row(Modifier.fillMaxWidth()) {
            Text("Свободно", color = Brand.TextMuted, fontSize = 12.sp, modifier = Modifier.weight(1f))
            Text("Обычно", color = Brand.TextMuted, fontSize = 12.sp)
            Text("Плотно", color = Brand.TextMuted, fontSize = 12.sp, modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.End)
        }
    }
    Group("Шрифт") {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("nunito" to "Стандартный", "serif" to "С засечками", "mono" to "Моноширинный", "cursive" to "Рукописный").forEach { (id, label) ->
                val on = s.font == id || (id == "nunito" && s.font !in listOf("serif", "mono", "cursive"))
                Text(label, fontSize = 13.sp, color = if (on) Brand.Deep else Brand.Text,
                    fontFamily = when (id) { "serif" -> androidx.compose.ui.text.font.FontFamily.Serif; "mono" -> androidx.compose.ui.text.font.FontFamily.Monospace; "cursive" -> androidx.compose.ui.text.font.FontFamily.Cursive; else -> null },
                    modifier = Modifier.clip(CircleShape).background(if (on) Brand.Mint else Brand.Ink.copy(alpha = 0.06f)).clickable { set(s.copy(font = id)) }.padding(horizontal = 14.dp, vertical = 8.dp))
            }
        }
        Text("На компьютере доступны и другие шрифты (Inter, Manrope…) — на телефоне вместо них стандартный.", color = Brand.TextFaint, fontSize = 11.sp, modifier = Modifier.padding(top = 8.dp))
    }
    Group("Скругление углов: ${s.radius}") {
        Slider(s.radius.toFloat(), { set(s.copy(radius = (it / 2).toInt() * 2)) }, valueRange = 4f..20f, steps = 7,
            colors = SliderDefaults.colors(thumbColor = Brand.Mint, activeTrackColor = Brand.Mint))
    }
    Group("Сезонная атмосфера") {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 8.dp)) {
            Column(Modifier.weight(1f)) {
                Text("Сезонные эффекты", fontSize = 14.sp)
                Text("Сакура, снег, листья, тыквы и гирлянды", color = Brand.TextMuted, fontSize = 12.sp)
            }
            Switch(s.seasonal != "off", { set(s.copy(seasonal = if (it) "auto" else "off")) }, colors = SwitchDefaults.colors(checkedTrackColor = Brand.Mint))
        }
        val seasons = listOf("auto" to "📅 По календарю", "spring" to "🌸 Сакура", "summer" to "✨ Светлячки", "autumn" to "🍂 Листопад",
            "halloween" to "🎃 Хэллоуин", "winter" to "❄️ Снег", "newyear" to "🎄 Новый год")
        if (s.seasonal != "off") FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            seasons.forEach { (id, label) ->
                val on = s.seasonal == id
                Text(label, fontSize = 13.sp, color = if (on) Brand.Deep else Brand.Text,
                    modifier = Modifier.clip(CircleShape).background(if (on) Brand.Mint else Brand.Ink.copy(alpha = 0.06f)).clickable { set(s.copy(seasonal = id)) }.padding(horizontal = 12.dp, vertical = 8.dp))
            }
        }
        Text("«Авто» меняет атмосферу по календарю: сейчас ${com.lifehub.app.ui.theme.seasonByDate()}.".replace("halloween", "Хэллоуин").replace("newyear", "Новый год").replace("winter", "зима").replace("spring", "весна").replace("summer", "лето").replace("autumn", "осень"),
            color = Brand.TextFaint, fontSize = 11.sp, modifier = Modifier.padding(top = 8.dp))
    }
    Group("Прочее") {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Плавные анимации", fontSize = 14.sp)
                Text("Переходы и анимации на компьютере", color = Brand.TextMuted, fontSize = 12.sp)
            }
            Switch(s.animations, { set(s.copy(animations = it)) }, colors = SwitchDefaults.colors(checkedTrackColor = Brand.Mint))
        }
    }

    editing?.let { p -> CustomThemeDialog(p, onDismiss = { editing = null }, onDelete = if (s.customThemes.any { it.id == p.id }) ({
        set(s.copy(customThemes = s.customThemes.filter { it.id != p.id }, preset = if (s.preset == p.id) "lifehub" else s.preset)); editing = null
    }) else null) { saved ->
        val list = if (s.customThemes.any { it.id == saved.id }) s.customThemes.map { if (it.id == saved.id) saved else it } else s.customThemes + saved
        set(s.copy(customThemes = list, preset = saved.id, accent = null)); editing = null
    } }
}

private val SWATCHES = listOf(
    "#051824", "#070b1a", "#0b0c0e", "#1a0b14", "#06140d", "#160d0c", "#162936", "#141b34", "#1a1c20", "#2c1424", "#12281b", "#261716",
    "#3b5265", "#33406b", "#3a3d44", "#5e3150", "#2f5640", "#4f322f",
)

/** Своя тема: имя, фон, карточки, рамки, акцент. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CustomThemeDialog(initial: ThemePaletteDto, onDismiss: () -> Unit, onDelete: (() -> Unit)?, onSave: (ThemePaletteDto) -> Unit) {
    var p by remember { mutableStateOf(initial) }
    var field by remember { mutableStateOf("deep") }
    AlertDialog(
        onDismissRequest = onDismiss, containerColor = Brand.Night,
        title = { Text(if (onDelete == null) "Новая тема" else "Своя тема") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(p.name, { p = p.copy(name = it) }, label = { Text("Название") }, singleLine = true)
                ThemeCard(p, true, {}, null)
                Segmented(listOf("deep" to "Фон", "night" to "Карточки", "slate" to "Рамки", "accent" to "Акцент"), field) { field = it }
                val value = when (field) { "deep" -> p.deep; "night" -> p.night; "slate" -> p.slate; else -> p.accent }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    (if (field == "accent") THEME_ACCENTS else SWATCHES).forEach { c ->
                        Box(Modifier.size(30.dp).clip(CircleShape).background(hexColor(c)).border(2.dp, if (value.equals(c, true)) Brand.Ink else Color.Transparent, CircleShape)
                            .clickable { p = when (field) { "deep" -> p.copy(deep = c); "night" -> p.copy(night = c); "slate" -> p.copy(slate = c); else -> p.copy(accent = c) } })
                    }
                }
                OutlinedTextField(value, { v ->
                    val hex = v.trim().let { if (it.startsWith("#")) it else "#$it" }.take(7)
                    p = when (field) { "deep" -> p.copy(deep = hex); "night" -> p.copy(night = hex); "slate" -> p.copy(slate = hex); else -> p.copy(accent = hex) }
                }, label = { Text("HEX-цвет") }, singleLine = true)
                onDelete?.let { Text("Удалить тему", color = Brand.Rose, fontSize = 13.sp, modifier = Modifier.clickable(onClick = it).padding(vertical = 6.dp)) }
            }
        },
        confirmButton = { TextButton({ onSave(p.copy(name = p.name.ifBlank { "Моя тема" }, custom = true)) }) { Text("Сохранить и применить", color = Brand.Mint) } },
        dismissButton = { TextButton(onDismiss) { Text("Отмена") } },
    )
}

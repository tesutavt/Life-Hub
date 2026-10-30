package com.lifehub.app.ui.screens

import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lifehub.app.data.Api
import com.lifehub.app.data.Session
import com.lifehub.app.notify.Notifications
import com.lifehub.app.notify.ReminderWorker
import com.lifehub.app.ui.components.LhCard
import com.lifehub.app.ui.components.SectionTitle
import com.lifehub.app.ui.theme.Brand
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

@Serializable
data class ReminderSettings(
    val enabled: Boolean = true,
    val categories: Map<String, Boolean> = emptyMap(),
    @SerialName("learning_hour") val learningHour: Int = 19,
    @SerialName("habits_hour") val habitsHour: Int = 20,
    @SerialName("quiet_start") val quietStart: Int = 23,
    @SerialName("quiet_end") val quietEnd: Int = 8,
)

private val CATEGORY_ROWS = listOf(
    Triple("learning", "🦉 Учёба и языки", "урок не пройден, серия в опасности"),
    Triple("habits", "✅ Привычки", "вечером — что не отмечено"),
    Triple("calendar", "📅 Календарь", "утром — сегодня, вечером — завтра"),
    Triple("missions", "🎁 Задания дня", "награды и дневная цель"),
    Triple("goals", "🎯 Цели на год", "нет отметки за сегодня"),
)

/** Напоминания: общие настройки (на сервере, действуют и на компьютере) + уведомления на этом телефоне. */
@Composable
fun RemindersSection() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var settings by remember { mutableStateOf<ReminderSettings?>(null) }
    var device by remember { mutableStateOf(Session.deviceNotifications) }
    var tested by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        settings = runCatching { Api.get<ReminderSettings>("/api/reminders/settings") }.getOrNull()
    }

    fun save(update: ReminderSettings, categoryPatch: Pair<String, Boolean>? = null) {
        settings = update
        scope.launch {
            runCatching {
                Api.put("/api/reminders/settings", buildJsonObject {
                    put("enabled", update.enabled)
                    put("learning_hour", update.learningHour)
                    put("habits_hour", update.habitsHour)
                    put("quiet_start", update.quietStart)
                    put("quiet_end", update.quietEnd)
                    if (categoryPatch != null) putJsonObject("categories") { put(categoryPatch.first, categoryPatch.second) }
                })
            }
        }
    }

    SectionTitle("Напоминания")
    LhCard(Modifier.fillMaxWidth()) {
        ToggleRow("📱 Уведомления на этом телефоне", "смешные напоминания от совы Хаби", device) {
            device = it
            Session.deviceNotifications = it
        }
        if (!Notifications.canPost(context)) {
            Text(
                "Уведомления запрещены в настройках Android — нажмите, чтобы разрешить",
                color = Brand.Amber, fontSize = 13.sp,
                modifier = Modifier.padding(top = 6.dp).clickable {
                    context.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName))
                },
            )
        }
        // Без этого многие прошивки «усыпляют» приложение, и напоминания не приходят
        if (!com.lifehub.app.notify.ReminderAlarm.ignoresBatteryOptimizations(context)) {
            Text(
                "⚡ Разрешить работу в фоне — иначе телефон может не присылать напоминания, пока приложение закрыто",
                color = Brand.Amber, fontSize = 13.sp,
                modifier = Modifier.padding(top = 6.dp).clickable {
                    runCatching {
                        context.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, android.net.Uri.parse("package:${context.packageName}")))
                    }.onFailure { context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
                },
            )
        }
        Session.lastReminderCheck?.let { raw ->
            val time = raw.substringBefore('|')
            val result = raw.substringAfter('|')
            Text(
                if (result == "ok") "Последняя фоновая проверка: $time — всё в порядке" else "Последняя фоновая проверка: $time — $result",
                color = if (result == "ok") Brand.TextMuted else Brand.Rose, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp),
            )
        }
    }
    val current = settings ?: return
    LhCard(Modifier.fillMaxWidth().padding(top = 10.dp)) {
        ToggleRow("🔔 Все напоминания", "общая настройка: телефон и компьютер", current.enabled) { save(current.copy(enabled = it)) }
        Column(Modifier.alpha(if (current.enabled) 1f else 0.4f)) {
            CATEGORY_ROWS.forEach { (id, title, subtitle) ->
                val checked = current.categories[id] ?: true
                ToggleRow(title, subtitle, checked, enabled = current.enabled) { save(current.copy(categories = current.categories + (id to it)), id to it) }
                when (id) {
                    "learning" -> HourRow("Напоминать после", current.learningHour, current.enabled) { save(current.copy(learningHour = it)) }
                    "habits" -> HourRow("Напоминать после", current.habitsHour, current.enabled) { save(current.copy(habitsHour = it)) }
                }
            }
            HourRow("🌙 Не беспокоить с", current.quietStart, current.enabled) { save(current.copy(quietStart = it)) }
            HourRow("до", current.quietEnd, current.enabled) { save(current.copy(quietEnd = it)) }
        }
        TextButton(onClick = {
            ReminderWorker.runNow(context, force = true)
            tested = true
        }) { Text(if (tested) "Отправлено — проверьте шторку уведомлений" else "🔔 Проверить, о чём напомнить сейчас") }
    }
}

@Composable
private fun ToggleRow(title: String, subtitle: String, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold)
            Text(subtitle, color = Brand.TextMuted, fontSize = 12.sp)
        }
        Switch(
            checked = checked, onCheckedChange = onChange, enabled = enabled,
            colors = SwitchDefaults.colors(checkedTrackColor = Brand.Mint, checkedThumbColor = Brand.Deep),
        )
    }
}

@Composable
private fun HourRow(label: String, hour: Int, enabled: Boolean, onChange: (Int) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth().padding(start = 12.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = Brand.TextMuted, fontSize = 13.sp)
        Spacer(Modifier.width(8.dp))
        Box {
            Text(
                "%02d:00".format(hour),
                fontWeight = FontWeight.Bold,
                modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(Brand.Ink.copy(alpha = 0.08f))
                    .clickable(enabled = enabled) { open = true }.padding(horizontal = 12.dp, vertical = 5.dp),
            )
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                (0..23).forEach { h ->
                    DropdownMenuItem(text = { Text("%02d:00".format(h)) }, onClick = { open = false; onChange(h) })
                }
            }
        }
    }
}

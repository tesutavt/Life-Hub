package com.lifehub.app.ui.screens

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lifehub.app.sync.DeviceCalendar
import com.lifehub.app.ui.components.LhCard
import com.lifehub.app.ui.components.SectionTitle
import com.lifehub.app.ui.theme.Brand
import kotlinx.coroutines.launch

/** Настройки → «Календарь телефона»: события Life Hub в Samsung Calendar / Google Календаре. */
@Composable
fun CalendarSyncSection() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var enabled by remember { mutableStateOf(DeviceCalendar.isEnabled(context) && DeviceCalendar.hasPermission(context)) }
    var status by remember { mutableStateOf(DeviceCalendar.lastStatus(context)) }
    var busy by remember { mutableStateOf(false) }

    fun syncNow() {
        busy = true
        scope.launch {
            status = DeviceCalendar.sync(context)
            busy = false
        }
    }

    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        if (result.values.all { it }) {
            DeviceCalendar.setEnabled(context, true)
            enabled = true
            syncNow()
        } else {
            status = "Без доступа к календарю синхронизация невозможна"
        }
    }

    SectionTitle("Календарь телефона")
    LhCard(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("📅 Показывать события Life Hub", fontWeight = FontWeight.SemiBold)
                Text("Смены, план учёбы, платежи и заметки появятся в календаре телефона отдельным календарём «Life Hub»", color = Brand.TextMuted, fontSize = 12.sp)
            }
            Switch(
                checked = enabled,
                onCheckedChange = { on ->
                    if (on) {
                        if (DeviceCalendar.hasPermission(context)) {
                            DeviceCalendar.setEnabled(context, true)
                            enabled = true
                            syncNow()
                        } else {
                            permission.launch(arrayOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR))
                        }
                    } else {
                        DeviceCalendar.setEnabled(context, false)
                        enabled = false
                        status = "Выключено — календарь «Life Hub» удалён с телефона"
                    }
                },
                colors = SwitchDefaults.colors(checkedTrackColor = Brand.Mint, checkedThumbColor = Brand.Deep),
            )
        }
        if (enabled) {
            Text("Обновляется сам раз в 3 часа и после изменений в календаре приложения.", color = Brand.TextFaint, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
            TextButton(onClick = ::syncNow, enabled = !busy) { Text(if (busy) "Синхронизируем…" else "🔄 Синхронизировать сейчас") }
        }
        status?.let { Text(it, color = if (it.contains("ошибка")) Brand.Rose else Brand.TextMuted, fontSize = 12.sp) }
    }
}

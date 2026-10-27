package com.lifehub.app.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.health.connect.client.PermissionController
import com.lifehub.app.health.HealthSync
import com.lifehub.app.ui.components.LhCard
import com.lifehub.app.ui.components.SectionTitle
import com.lifehub.app.ui.theme.Brand
import kotlinx.coroutines.launch

/** Настройки → «Браслет»: шаги, пульс и сон из Health Connect (Notify, Simple Health…). */
@Composable
fun HealthSection() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val availability = remember { HealthSync.availability(context) }
    var granted by remember { mutableStateOf(0) }
    var status by remember { mutableStateOf(HealthSync.lastStatus(context)) }
    var busy by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { granted = HealthSync.granted(context).size }

    fun syncNow() {
        busy = true
        scope.launch {
            HealthSync.sync(context, days = 30, force = true)
                .onSuccess { status = HealthSync.lastStatus(context) + " · отправлено дней: $it" }
                .onFailure { status = "Ошибка: ${it.message}" }
            busy = false
        }
    }

    val request = rememberLauncherForActivityResult(PermissionController.createRequestPermissionResultContract()) { result ->
        granted = result.size
        if (result.isNotEmpty()) syncNow() else status = "Доступ не выдан — откройте Health Connect и разрешите Life Hub чтение данных"
    }

    SectionTitle("Браслет и здоровье")
    LhCard(Modifier.fillMaxWidth()) {
        Text("⌚ Данные с браслета", fontWeight = FontWeight.SemiBold)
        Text(
            "Шаги, калории, пульс и сон берутся из Health Connect — туда их пишут Notify, Simple Health, Zepp и другие приложения. " +
                "Данные обновляются, когда вы тянете главную вниз или открываете приложение.",
            color = Brand.TextMuted, fontSize = 12.sp,
        )
        Spacer(Modifier.height(8.dp))
        when (availability) {
            HealthSync.Availability.UNAVAILABLE -> Text("Health Connect не поддерживается на этом телефоне", color = Brand.Rose, fontSize = 13.sp)
            HealthSync.Availability.NEEDS_UPDATE -> TextButton(onClick = { context.startActivity(HealthSync.installIntent()) }) {
                Text("Установить / обновить Health Connect", color = Brand.Mint)
            }
            HealthSync.Availability.READY -> {
                Text(
                    if (granted > 0) "✅ Подключено · доступ к $granted из ${HealthSync.PERMISSIONS.size} типов данных" else "Не подключено",
                    color = if (granted > 0) Brand.Mint else Brand.TextMuted, fontSize = 13.sp,
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = { request.launch(HealthSync.PERMISSIONS) }) {
                        Text(if (granted > 0) "Права доступа" else "Подключить", color = Brand.Mint)
                    }
                    if (granted > 0) {
                        Spacer(Modifier.width(4.dp))
                        TextButton(enabled = !busy, onClick = { syncNow() }) {
                            Text(if (busy) "Синхронизация…" else "Синхронизировать 30 дней", color = Brand.Mint)
                        }
                    }
                }
            }
        }
        status?.let { Text(it, color = Brand.TextFaint, fontSize = 12.sp, modifier = Modifier.padding(top = 2.dp)) }
        Text(
            "В Notify / Simple Health включите экспорт в Health Connect, если он ещё не включён.",
            color = Brand.TextFaint, fontSize = 11.sp, modifier = Modifier.padding(top = 6.dp),
        )
    }
}

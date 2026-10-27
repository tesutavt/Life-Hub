package com.lifehub.app.health

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lifehub.app.ui.theme.Brand
import com.lifehub.app.ui.theme.LifeHubTheme

/** Health Connect показывает этот экран из «Разрешения → Life Hub»: зачем приложению данные. */
class HealthRationaleActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            LifeHubTheme {
                Column(Modifier.fillMaxSize().background(Brand.Deep).statusBarsPadding().padding(24.dp)) {
                    Text("Данные здоровья в Life Hub", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Brand.Text)
                    Spacer(Modifier.height(12.dp))
                    Text(
                        "Life Hub только читает шаги, калории, дистанцию, тренировки, пульс и сон, которые ваш браслет " +
                            "записал в Health Connect (через Notify, Simple Health и другие приложения).\n\n" +
                            "Данные отправляются только на ваш сервер Life Hub — для дэшборда, заданий дня, отчётов и ачивок. " +
                            "Ничего не записывается обратно и не передаётся третьим лицам.\n\n" +
                            "Отключить доступ можно в любой момент в Health Connect или в настройках Life Hub.",
                        color = Brand.TextMuted, fontSize = 15.sp,
                    )
                    Spacer(Modifier.height(20.dp))
                    TextButton(onClick = { finish() }) { Text("Понятно", color = Brand.Mint) }
                }
            }
        }
    }
}

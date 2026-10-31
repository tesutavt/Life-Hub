package com.lifehub.app.ui

import com.lifehub.app.ui.theme.SeasonalOverlay
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import com.lifehub.app.data.Session
import com.lifehub.app.ui.screens.AuthScreen
import com.lifehub.app.ui.screens.ConnectScreen
import com.lifehub.app.ui.theme.Brand

/** Корень: выбор сервера → вход → основное приложение. */
@Composable
fun AppRoot() {
    val server by Session.server.collectAsState()
    val token by Session.token.collectAsState()
    // Без этого текст вне Scaffold (экраны подключения и входа) рисовался чёрным на тёмном фоне
    CompositionLocalProvider(LocalContentColor provides Brand.Text) {
        Box(Modifier.fillMaxSize().background(Brand.Deep)) {
            when {
                server == null -> ConnectScreen()
                token == null -> AuthScreen()
                else -> MainScaffold()
            }
            // Сезонная атмосфера поверх всего (сакура, снег, тыквы…)
            SeasonalOverlay()
        }
    }
}

package com.lifehub.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.lifehub.app.notify.AppVisibility
import com.lifehub.app.notify.Notifications
import com.lifehub.app.ui.AppRoot
import com.lifehub.app.ui.theme.LifeHubTheme
import kotlinx.coroutines.flow.MutableStateFlow
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

/** Раздел, который надо открыть (нажатие на уведомление). */
object DeepLink {
    val route = MutableStateFlow<String?>(null)
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
        )
        com.lifehub.app.widget.WidgetRefreshWorker.schedule(applicationContext)
        handleIntent(intent)
        setContent { LifeHubTheme { AppRoot() } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    override fun onStart() {
        super.onStart()
        AppVisibility.foreground = true
        // Тему могли поменять на компьютере — подтягиваем
        if (com.lifehub.app.data.Session.token.value != null) lifecycleScope.launch { com.lifehub.app.ui.theme.ThemeManager.sync() }
    }

    override fun onStop() {
        super.onStop()
        AppVisibility.foreground = false
        // Свернули приложение — обновляем виджеты на рабочем столе свежими данными
        com.lifehub.app.widget.WidgetRefreshWorker.runNow(applicationContext)
    }

    private fun handleIntent(intent: Intent?) {
        intent?.getStringExtra(Notifications.EXTRA_ROUTE)?.let { DeepLink.route.value = it }
    }
}

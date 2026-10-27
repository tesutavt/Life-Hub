package com.lifehub.app.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lifehub.app.ui.theme.Brand

/** Состояние асинхронной загрузки с перезапуском (pull-to-refresh, после действий). */
class Loadable<T> {
    var data by mutableStateOf<T?>(null)
    var error by mutableStateOf<String?>(null)
    var loading by mutableStateOf(true)
    internal var version by mutableIntStateOf(0)
    fun reload() {
        version += 1
    }
}

@Composable
fun <T> rememberLoadable(vararg keys: Any?, loader: suspend () -> T): Loadable<T> {
    val state = remember(*keys) { Loadable<T>() }
    LaunchedEffect(state, state.version) {
        state.loading = true
        try {
            state.data = loader()
            state.error = null
        } catch (e: Exception) {
            state.error = e.message ?: "Ошибка"
        } finally {
            state.loading = false
        }
    }
    return state
}

/** Показывает загрузку/ошибку, пока данных нет; дальше — содержимое. */
@Composable
fun <T> LoadableContent(state: Loadable<T>, content: @Composable (T) -> Unit) {
    val data = state.data
    when {
        data != null -> content(data)
        state.error != null -> ErrorBox(state.error!!) { state.reload() }
        else -> Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = Brand.Mint)
        }
    }
}

@Composable
fun ErrorBox(message: String, onRetry: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("😕", fontSize = 40.sp)
        Spacer(Modifier.height(8.dp))
        Text(message, color = Brand.TextMuted, textAlign = TextAlign.Center)
        TextButton(onClick = onRetry) {
            Icon(Icons.Default.Refresh, null)
            Spacer(Modifier.width(6.dp))
            Text("Повторить")
        }
    }
}

@Composable
fun LhCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    border: Color = Color.White.copy(alpha = 0.08f),
    background: Color = Brand.Card,
    padding: PaddingValues = PaddingValues(14.dp),
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier
            .clip(RoundedCornerShape(20.dp))
            .background(background)
            .border(1.dp, border, RoundedCornerShape(20.dp))
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(padding),
        content = content,
    )
}

@Composable
fun ProgressBar(fraction: Float, modifier: Modifier = Modifier, height: Dp = 8.dp, colors: List<Color> = listOf(Brand.Mint, Brand.Sky)) {
    val animated by animateFloatAsState(fraction.coerceIn(0f, 1f), tween(600), label = "progress")
    Box(modifier.fillMaxWidth().height(height).clip(CircleShape).background(Color.White.copy(alpha = 0.08f))) {
        Box(Modifier.fillMaxWidth(animated).height(height).clip(CircleShape).background(Brush.horizontalGradient(colors)))
    }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier, action: (@Composable () -> Unit)? = null) {
    Row(modifier.fillMaxWidth().padding(top = 8.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text.uppercase(), style = MaterialTheme.typography.labelSmall, color = Brand.TextFaint, modifier = Modifier.weight(1f))
        action?.invoke()
    }
}

@Composable
fun Chip(text: String, color: Color = Brand.Mint, modifier: Modifier = Modifier) {
    Text(
        text,
        modifier = modifier.clip(CircleShape).background(color.copy(alpha = 0.16f)).padding(horizontal = 9.dp, vertical = 3.dp),
        color = color,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        maxLines = 1,
    )
}

/** Объёмная кнопка в стиле Duolingo. */
@Composable
fun ChunkyButton(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = Brand.Green,
    shadow: Color = Brand.GreenShadow,
    textColor: Color = Color.White,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val bg = if (enabled) color else Color.White.copy(alpha = 0.1f)
    val sh = if (enabled) shadow else Color.Transparent
    Box(modifier.height(54.dp)) {
        Box(Modifier.fillMaxSize().offset(y = 4.dp).clip(RoundedCornerShape(16.dp)).background(sh))
        Box(
            Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(16.dp)).background(bg)
                .clickable(enabled = enabled, onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            Text(text.uppercase(), color = if (enabled) textColor else Color.White.copy(alpha = 0.3f), fontWeight = FontWeight.ExtraBold, letterSpacing = 0.8.sp)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BackTopBar(title: String, onBack: () -> Unit, actions: @Composable () -> Unit = {}) {
    TopAppBar(
        title = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Bold) },
        navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад") } },
        actions = { actions() },
        colors = TopAppBarDefaults.topAppBarColors(containerColor = Brand.Deep),
    )
}

@Composable
fun EmptyState(emoji: String, title: String, text: String) {
    Column(Modifier.fillMaxWidth().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(emoji, fontSize = 44.sp)
        Text(title, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        Text(text, color = Brand.TextMuted, textAlign = TextAlign.Center, fontSize = 14.sp)
    }
}

@Composable
fun IconBubble(emoji: String, color: Color = Brand.Mint, size: Dp = 42.dp) {
    Box(Modifier.size(size).clip(RoundedCornerShape(14.dp)).background(color.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
        Text(emoji, fontSize = (size.value * 0.48f).sp)
    }
}

fun plural(n: Int, one: String, few: String, many: String): String {
    val m10 = n % 10
    val m100 = n % 100
    return when {
        m10 == 1 && m100 != 11 -> one
        m10 in 2..4 && (m100 < 12 || m100 > 14) -> few
        else -> many
    }
}

package com.lifehub.app.ui.theme

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.offset
import androidx.compose.ui.draw.alpha
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalDate
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

/** Сезон по календарю — как seasonByDate() в веб-версии. */
fun seasonByDate(date: LocalDate = LocalDate.now()): String {
    val m = date.monthValue
    val d = date.dayOfMonth
    return when {
        (m == 10 && d >= 20) || (m == 11 && d <= 2) -> "halloween"
        (m == 12 && d >= 20) || (m == 1 && d <= 10) -> "newyear"
        m == 12 || m <= 2 -> "winter"
        m <= 5 -> "spring"
        m <= 8 -> "summer"
        else -> "autumn"
    }
}

fun activeSeason(s: ThemeSettings): String? = when (s.seasonal) {
    "off" -> null
    "auto", "" -> seasonByDate()
    else -> s.seasonal
}

private class Particle(var x: Float, var y: Float, var vx: Float, var vy: Float, val size: Float, var rot: Float, val vr: Float, var phase: Float, val hue: Float)

private fun spawn(season: String, w: Float, h: Float, anywhere: Boolean, density: Float): Particle {
    val snow = season == "winter" || season == "newyear"
    return Particle(
        x = Random.nextFloat() * w,
        y = if (anywhere) Random.nextFloat() * h else -20f * density - Random.nextFloat() * 60f,
        vx = (Random.nextFloat() - 0.3f) * 0.6f * density,
        vy = (if (snow) 0.5f + Random.nextFloat() * 1.1f else if (season == "summer") 0f else 0.6f + Random.nextFloat() * 0.9f) * density,
        size = (if (snow) 1.5f + Random.nextFloat() * 3f else if (season == "summer") 2f + Random.nextFloat() * 2f else 6f + Random.nextFloat() * 6f) * density,
        rot = Random.nextFloat() * 6.28f, vr = (Random.nextFloat() - 0.5f) * 0.04f, phase = Random.nextFloat() * 6.28f, hue = Random.nextFloat(),
    )
}

private val LEAVES = listOf(Color(0xFFF59E0B), Color(0xFFEA580C), Color(0xFFDC2626), Color(0xFFCA8A04), Color(0xFFB45309))

/**
 * Сезонная атмосфера поверх приложения: сакура, светлячки, листья, летучие мыши с паутиной и тыквами,
 * снег, гирлянда. Нажатия проходят насквозь (слой ничего не перехватывает).
 */
@Composable
fun BoxScope.SeasonalOverlay() {
    val settings = ThemeManager.settings
    val season = activeSeason(settings) ?: return
    val particles = remember(season) { mutableListOf<Particle>() }
    var frame by remember { mutableLongStateOf(0L) }
    LaunchedEffect(season, settings.animations) {
        if (!settings.animations) { frame = 1; return@LaunchedEffect }
        while (true) withFrameNanos { frame = it }
    }
    Canvas(Modifier.matchParentSize()) {
        val w = size.width; val h = size.height
        val count = when (season) { "winter" -> 55; "newyear" -> 40; "halloween" -> 7; "summer" -> 18; else -> 22 }
        if (particles.isEmpty()) repeat(count) { particles += spawn(season, w, h, true, density) }
        val t = frame / 1_000_000L
        particles.forEach { p ->
            p.phase += 0.02f
            when (season) {
                "summer" -> { p.x += sin(p.phase) * 0.4f * density; p.y += cos(p.phase * 0.7f) * 0.3f * density }
                "halloween" -> {
                    p.x += (1.2f + p.hue) * density; p.y += sin(p.phase * 2) * 0.8f * density
                    if (p.x > w + 30 * density) { p.x = -30f * density; p.y = Random.nextFloat() * h * 0.6f }
                }
                else -> {
                    p.x += p.vx + sin(p.phase) * 0.5f * density; p.y += p.vy; p.rot += p.vr
                    if (p.y > h + 20 * density) { val n = spawn(season, w, h, false, density); p.x = n.x; p.y = n.y }
                }
            }
            if (p.x > w + 30 * density) p.x = -30f * density
            if (p.x < -30 * density) p.x = w + 30 * density
            if (p.y < -60 * density && season == "summer") p.y = h
            when (season) {
                "spring" -> petal(p)
                "autumn" -> leaf(p)
                "summer" -> firefly(p, t)
                "halloween" -> bat(p, t)
                else -> drawCircle(Color.White.copy(alpha = 0.55f + p.hue * 0.4f), p.size, Offset(p.x, p.y))
            }
        }
        if (season == "halloween") { cobweb(false); cobweb(true) }
        if (season == "newyear") garland(t)
    }
    if (season == "halloween") {
        // Тыквы выглядывают из-за края и полупрозрачны — не закрывают суммы и кнопки
        Text("🎃", fontSize = 24.sp, modifier = Modifier.align(Alignment.BottomStart).offset(x = (-9).dp).padding(bottom = 92.dp).alpha(0.55f))
        Text("🎃", fontSize = 20.sp, modifier = Modifier.align(Alignment.BottomEnd).offset(x = 8.dp).padding(bottom = 96.dp).alpha(0.55f))
    }
}

private fun DrawScope.petal(p: Particle) = translate(p.x, p.y) {
    rotate(p.rot * 57.3f, Offset.Zero) {
        val s = p.size
        val squash = 0.55f + 0.45f * abs(sin(p.phase))
        val path = Path().apply {
            moveTo(0f, -s)
            cubicTo(s, -s * 0.6f * squash, s * 0.8f, s * 0.7f * squash, 0f, s * squash)
            cubicTo(-s * 0.8f, s * 0.7f * squash, -s, -s * 0.6f * squash, 0f, -s)
        }
        drawPath(path, Brush.radialGradient(listOf(Color(0xF2FFF0F5), Color(244 - (p.hue * 20).toInt(), 143 + (p.hue * 30).toInt(), 177 + (p.hue * 20).toInt(), 220)), Offset.Zero, s))
    }
}

private fun DrawScope.leaf(p: Particle) = translate(p.x, p.y) {
    rotate(p.rot * 57.3f, Offset.Zero) {
        val s = p.size
        val k = 0.5f + 0.5f * abs(cos(p.phase))
        val path = Path().apply {
            moveTo(0f, -s); quadraticTo(s * 0.9f * k, -s * 0.2f, 0f, s); quadraticTo(-s * 0.9f * k, -s * 0.2f, 0f, -s)
        }
        drawPath(path, LEAVES[(p.hue * LEAVES.size).toInt().coerceIn(0, LEAVES.lastIndex)].copy(alpha = 0.85f))
        drawLine(Color(0x66501E00), Offset(0f, -s), Offset(0f, s * 1.3f), 1f)
    }
}

private fun DrawScope.firefly(p: Particle, t: Long) {
    val a = 0.35f + 0.65f * abs(sin(t / 900f + p.phase))
    drawCircle(Brush.radialGradient(listOf(Color(253, 250, 180, (a * 255).toInt()), Color.Transparent), Offset(p.x, p.y), p.size * 5), p.size * 5, Offset(p.x, p.y))
}

private fun DrawScope.bat(p: Particle, t: Long) = translate(p.x, p.y) {
    val flap = sin(t / 120f + p.phase) * 0.6f
    val c = Color(0xBF140A1E)
    val d = density
    drawOval(c, Offset(-3 * d, -4 * d), Size(6 * d, 8 * d))
    listOf(-1f, 1f).forEach { side ->
        drawPath(Path().apply {
            moveTo(0f, 0f)
            quadraticTo(side * 9 * d, (-8 - flap * 8) * d, side * 16 * d, (-2 - flap * 6) * d)
            quadraticTo(side * 10 * d, 2 * d, 0f, 2 * d)
        }, c)
    }
}

private fun DrawScope.cobweb(right: Boolean) {
    val r = 120 * density
    val origin = Offset(if (right) size.width else 0f, 0f)
    val dir = if (right) -1f else 1f
    val c = Color.White.copy(alpha = 0.35f)
    for (deg in listOf(0, 18, 36, 54, 72, 90)) {
        val a = deg * PI.toFloat() / 180f
        drawLine(c, origin, Offset(origin.x + dir * cos(a) * r, sin(a) * r), 1f)
    }
    for (k in listOf(0.25f, 0.5f, 0.75f, 1f)) {
        val path = Path()
        for (i in 0..5) {
            val a = i * 18 * PI.toFloat() / 180f
            val pt = Offset(origin.x + dir * cos(a) * r * k, sin(a) * r * k)
            if (i == 0) path.moveTo(pt.x, pt.y) else path.quadraticTo(origin.x + dir * cos(a - 0.16f) * r * k * 0.85f, sin(a - 0.16f) * r * k * 0.85f, pt.x, pt.y)
        }
        drawPath(path, c, style = Stroke(1f))
    }
}

private fun DrawScope.garland(t: Long) {
    val colors = listOf(Color(0xFFF87171), Color(0xFFFACC15), Color(0xFF4ADE80), Color(0xFF60A5FA), Color(0xFFE879F9))
    val n = 14
    val y0 = 28 * density
    drawPath(Path().apply {
        moveTo(0f, y0)
        for (i in 0 until n) { val x1 = size.width * (i + 1) / n; quadraticTo(x1 - size.width / n / 2, y0 + 14 * density, x1, y0) }
    }, Color(0xB31E3C1E), style = Stroke(2f))
    for (i in 0 until n) {
        val x = size.width * (i + 0.5f) / n
        val a = 0.35f + 0.65f * abs(sin(t / 800f + i))
        val c = colors[i % colors.size]
        drawCircle(c.copy(alpha = a * 0.35f), 10 * density, Offset(x, y0 + 10 * density))
        drawCircle(c.copy(alpha = a), 4 * density, Offset(x, y0 + 10 * density))
    }
}

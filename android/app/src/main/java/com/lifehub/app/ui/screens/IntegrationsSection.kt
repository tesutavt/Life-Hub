package com.lifehub.app.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lifehub.app.data.Api
import com.lifehub.app.ui.components.LhCard
import com.lifehub.app.ui.theme.Brand
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

// Настройки → Интеграции: Shikimori (аниме, манга) и Steam (игры) наполняют полку сами. Общие с компьютером.

@Serializable data class ShikiInfo(val nickname: String? = null, @SerialName("synced_at") val syncedAt: String? = null)
@Serializable data class SteamInfo(@SerialName("steam_id") val steamId: String? = null, val profile: String? = null, @SerialName("has_key") val hasKey: Boolean = false, @SerialName("synced_at") val syncedAt: String? = null)
@Serializable data class ShelfIntegrations(val shikimori: ShikiInfo = ShikiInfo(), val steam: SteamInfo = SteamInfo())
@Serializable private data class SyncResult(val added: Int = 0, val updated: Int = 0, val total: Int = 0, val full: Boolean? = null, val error: String? = null)

private fun stamp(iso: String?) = iso?.let {
    runCatching {
        java.time.Instant.parse(it).atZone(java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("d MMM, HH:mm", java.util.Locale("ru")))
    }.getOrNull()
}

@Composable
fun IntegrationsSection() {
    val scope = rememberCoroutineScope()
    val uri = LocalUriHandler.current
    var state by remember { mutableStateOf(ShelfIntegrations()) }
    var version by remember { mutableStateOf(0) }
    var nick by remember { mutableStateOf("") }
    var profile by remember { mutableStateOf("") }
    var key by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf<String?>(null) }
    var shikiMsg by remember { mutableStateOf<String?>(null) }
    var steamMsg by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(version) {
        runCatching { Api.get<ShelfIntegrations>("/api/life/shelf/integrations") }.onSuccess {
            state = it
            if (nick.isBlank()) nick = it.shikimori.nickname.orEmpty()
            if (profile.isBlank()) profile = it.steam.profile.orEmpty()
        }
    }
    fun run(id: String, setMsg: (String?) -> Unit, call: suspend () -> kotlinx.serialization.json.JsonElement, ok: (SyncResult) -> String) = scope.launch {
        busy = id; setMsg(null)
        runCatching { Api.decode<SyncResult>(call()) }
            .onSuccess { setMsg(it.error ?: ok(it)); version++ }
            .onFailure { setMsg(it.message) }
        busy = null
    }
    val summary = { r: SyncResult -> "Готово: добавлено ${r.added}, обновлено ${r.updated} из ${r.total}." }

    Text("Списки аниме и игр сами появляются на полке со статусами, оценками и часами. Обновляются при открытии полки.", color = Brand.TextMuted, fontSize = 13.sp)

    LhCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("🌸 Shikimori", fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                if (state.shikimori.nickname != null) Text("подключён · ${stamp(state.shikimori.syncedAt) ?: "ещё не обновлялся"}", color = Brand.TextFaint, fontSize = 11.sp)
            }
            Text("Ник с открытым профилем: «Смотрю» → В процессе, «Просмотрено» → Готово, «Отложено», «Брошено», «Запланировано» → Хочу.", color = Brand.TextMuted, fontSize = 12.sp)
            OutlinedTextField(nick, { nick = it }, label = { Text("Ник на Shikimori") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(if (state.shikimori.nickname != null) "Сохранить" else "Подключить", color = Brand.Mint, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clickable(enabled = nick.isNotBlank() && busy == null) {
                        run("shiki", { shikiMsg = it }, { Api.put("/api/life/shelf/shikimori", buildJsonObject { put("nickname", nick.trim()) }) }, summary)
                    })
                if (state.shikimori.nickname != null) {
                    Text("↻ Обновить", color = Brand.Mint, modifier = Modifier.clickable(enabled = busy == null) {
                        run("shiki", { shikiMsg = it }, { Api.post("/api/life/shelf/shikimori/sync") }, summary)
                    })
                    Text("Отвязать", color = Brand.TextMuted, modifier = Modifier.clickable(enabled = busy == null) {
                        run("shiki", { shikiMsg = it }, { Api.put("/api/life/shelf/shikimori", buildJsonObject { put("nickname", "") }) }) { nick = ""; "Отвязано" }
                    })
                }
                if (busy == "shiki") CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = Brand.Mint)
            }
            shikiMsg?.let { Text(it, fontSize = 12.sp) }
        }
    }

    LhCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("🎮 Steam", fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                if (state.steam.steamId != null) Text((if (state.steam.hasKey) "вся библиотека" else "недавние игры") + " · " + (stamp(state.steam.syncedAt) ?: "ещё не обновлялся"), color = Brand.TextFaint, fontSize = 11.sp)
            }
            Text("Достаточно ссылки на открытый профиль — на полку попадут игры, в которые вы играли недавно, с часами. Для всей библиотеки нужен бесплатный ключ Steam Web API.", color = Brand.TextMuted, fontSize = 12.sp)
            Text("Получить ключ: steamcommunity.com/dev/apikey ↗", color = Brand.Mint, fontSize = 12.sp, modifier = Modifier.clickable { runCatching { uri.openUri("https://steamcommunity.com/dev/apikey") } })
            OutlinedTextField(profile, { profile = it }, label = { Text("Ссылка на профиль Steam") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(key, { key = it }, label = { Text(if (state.steam.hasKey) "Ключ сохранён — впишите новый, чтобы заменить" else "Ключ Web API (необязательно)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(if (state.steam.steamId != null) "Сохранить" else "Подключить", color = Brand.Mint, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clickable(enabled = profile.isNotBlank() && busy == null) {
                        val body: JsonObject = buildJsonObject { put("profile", profile.trim()); if (key.isNotBlank()) put("key", key.trim()) }
                        run("steam", { steamMsg = it }, { Api.put("/api/life/shelf/steam", body) }) { r -> key = ""; summary(r) + if (r.full == false) " Это недавние игры — с ключом будет вся библиотека." else "" }
                    })
                if (state.steam.steamId != null) {
                    Text("↻ Обновить", color = Brand.Mint, modifier = Modifier.clickable(enabled = busy == null) {
                        run("steam", { steamMsg = it }, { Api.post("/api/life/shelf/steam/sync") }, summary)
                    })
                    Text("Отвязать", color = Brand.TextMuted, modifier = Modifier.clickable(enabled = busy == null) {
                        run("steam", { steamMsg = it }, { Api.put("/api/life/shelf/steam", buildJsonObject { put("profile", "") }) }) { profile = ""; "Отвязано" }
                    })
                }
                if (busy == "steam") CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = Brand.Mint)
            }
            steamMsg?.let { Text(it, fontSize = 12.sp) }
        }
    }
    Text("Погода и Google подключаются на компьютере (Настройки → Интеграции) и работают здесь тоже.", color = Brand.TextFaint, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
}

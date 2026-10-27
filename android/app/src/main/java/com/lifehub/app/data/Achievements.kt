package com.lifehub.app.data

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Ачивки: клиентские действия, проверка новых и сигнал «проверь сейчас» после действий. */
object Achievements {
    private val _events = MutableSharedFlow<Unit>(extraBufferCapacity = 4)
    val events: SharedFlow<Unit> = _events

    /** Вызывать после действий пользователя — тост о новой ачивке появится сразу. */
    fun requestCheck() {
        _events.tryEmit(Unit)
    }

    suspend fun track(action: String) {
        runCatching { Api.post("/api/achievements/track", buildJsonObject { put("action", action) }) }
    }

    suspend fun pollUnseen(): List<UnseenAchievement> = runCatching {
        val items = Api.get<Items<UnseenAchievement>>("/api/achievements/unseen").items
        if (items.isNotEmpty()) {
            Api.post("/api/achievements/seen", buildJsonObject { put("ids", kotlinx.serialization.json.JsonArray(items.map { JsonPrimitive(it.id) })) })
        }
        items
    }.getOrDefault(emptyList())
}

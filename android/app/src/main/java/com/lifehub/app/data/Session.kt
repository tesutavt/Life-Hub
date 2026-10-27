package com.lifehub.app.data

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Адрес сервера, токен и недавние серверы. Хранится в SharedPreferences. */
object Session {
    private lateinit var prefs: SharedPreferences

    private val _server = MutableStateFlow<String?>(null)
    val server: StateFlow<String?> = _server.asStateFlow()

    private val _token = MutableStateFlow<String?>(null)
    val token: StateFlow<String?> = _token.asStateFlow()

    fun init(context: Context) {
        prefs = context.getSharedPreferences("lifehub", Context.MODE_PRIVATE)
        _server.value = prefs.getString("server", null)
        _token.value = prefs.getString("token", null)
    }

    val recentServers: List<String>
        get() = prefs.getString("recent", "")!!.split('\n').filter { it.isNotBlank() }

    fun setServer(url: String) {
        val recent = (listOf(url) + recentServers.filter { it != url }).take(5)
        prefs.edit().putString("server", url).putString("recent", recent.joinToString("\n")).remove("token").apply()
        _server.value = url
        _token.value = null
    }

    /** Уведомления на этом устройстве (общие настройки напоминаний — на сервере). */
    var deviceNotifications: Boolean
        get() = prefs.getBoolean("device_notifications", true)
        set(value) = prefs.edit().putBoolean("device_notifications", value).apply()

    /** Последняя фоновая проверка напоминаний: «время|ok» или «время|текст ошибки». */
    var lastReminderCheck: String?
        get() = prefs.getString("last_reminder_check", null)
        set(value) = prefs.edit().putString("last_reminder_check", value).apply()

    var askedNotificationPermission: Boolean
        get() = prefs.getBoolean("asked_notifications", false)
        set(value) = prefs.edit().putBoolean("asked_notifications", value).apply()

    /** Ключи уже показанных напоминаний за последние дни (строки «дата|ключ»). */
    fun shownReminders(): Set<String> =
        prefs.getStringSet("shown_reminders", emptySet())!!.map { it.substringAfter('|') }.toSet()

    fun markReminderShown(key: String, date: String) {
        val cutoff = java.time.LocalDate.parse(date).minusDays(3).toString()
        val kept = prefs.getStringSet("shown_reminders", emptySet())!!.filter { it.substringBefore('|') >= cutoff }.toSet()
        prefs.edit().putStringSet("shown_reminders", kept + "$date|$key").apply()
    }

    /** Вернуться к экрану выбора сервера. */
    fun clearServer() {
        prefs.edit().remove("server").remove("token").apply()
        _server.value = null
        _token.value = null
    }

    fun setToken(value: String?) {
        prefs.edit().apply { if (value == null) remove("token") else putString("token", value) }.apply()
        _token.value = value
    }

    fun logout() = setToken(null)

    /** «1.2.3.4» → http://1.2.3.4:4000; явный порт и https сохраняются. */
    fun normalize(input: String): String {
        var value = input.trim().trimEnd('/')
        if (value.isEmpty()) return value
        if (!value.startsWith("http://", true) && !value.startsWith("https://", true)) value = "http://$value"
        val afterScheme = value.substringAfter("://")
        val host = afterScheme.substringBefore('/')
        val hasPort = Regex(""":\d+$""").containsMatchIn(host)
        val scheme = value.substringBefore("://").lowercase()
        return if (!hasPort && scheme == "http") "$scheme://$host:4000" else "$scheme://$host"
    }
}

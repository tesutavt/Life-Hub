package com.lifehub.app.sync

import android.Manifest
import android.accounts.Account
import android.content.ContentResolver
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.CalendarContract
import androidx.core.content.ContextCompat
import com.lifehub.app.data.Api
import com.lifehub.app.data.CalendarEvent
import com.lifehub.app.data.Items
import com.lifehub.app.data.Session
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/**
 * Синхронизация с календарём телефона (Samsung Calendar, Google Календарь и др.).
 * На устройстве создаётся отдельный локальный календарь «Life Hub»; события сервера
 * за прошлый месяц и два следующих заливаются в него целиком (старые копии заменяются).
 * Направление одно: Life Hub → телефон, поэтому ничего в ваших календарях не теряется.
 */
object DeviceCalendar {
    private const val ACCOUNT_NAME = "Life Hub"
    private const val ACCOUNT_TYPE = CalendarContract.ACCOUNT_TYPE_LOCAL
    private const val PREFS = "lifehub"
    private const val SYNC_INTERVAL_MS = 3 * 3600_000L

    fun hasPermission(context: Context) =
        ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_CALENDAR) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun isEnabled(context: Context) = prefs(context).getBoolean("calendar_sync", false)
    fun lastStatus(context: Context): String? = prefs(context).getString("calendar_sync_status", null)
    private fun lastSync(context: Context) = prefs(context).getLong("calendar_sync_at", 0L)

    fun setEnabled(context: Context, enabled: Boolean) {
        prefs(context).edit().putBoolean("calendar_sync", enabled).apply()
        if (!enabled && hasPermission(context)) runCatching { removeCalendar(context) }
    }

    private fun asSyncAdapter(uri: Uri): Uri = uri.buildUpon()
        .appendQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER, "true")
        .appendQueryParameter(CalendarContract.Calendars.ACCOUNT_NAME, ACCOUNT_NAME)
        .appendQueryParameter(CalendarContract.Calendars.ACCOUNT_TYPE, ACCOUNT_TYPE)
        .build()

    private fun findCalendar(resolver: ContentResolver): Long? =
        resolver.query(
            CalendarContract.Calendars.CONTENT_URI, arrayOf(CalendarContract.Calendars._ID),
            "${CalendarContract.Calendars.ACCOUNT_NAME}=? AND ${CalendarContract.Calendars.ACCOUNT_TYPE}=?",
            arrayOf(ACCOUNT_NAME, ACCOUNT_TYPE), null,
        )?.use { if (it.moveToFirst()) it.getLong(0) else null }

    private fun ensureCalendar(resolver: ContentResolver): Long {
        findCalendar(resolver)?.let { return it }
        val values = ContentValues().apply {
            put(CalendarContract.Calendars.ACCOUNT_NAME, ACCOUNT_NAME)
            put(CalendarContract.Calendars.ACCOUNT_TYPE, ACCOUNT_TYPE)
            put(CalendarContract.Calendars.NAME, "lifehub")
            put(CalendarContract.Calendars.CALENDAR_DISPLAY_NAME, "Life Hub")
            put(CalendarContract.Calendars.CALENDAR_COLOR, 0xFF27E9B5.toInt())
            put(CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL, CalendarContract.Calendars.CAL_ACCESS_OWNER)
            put(CalendarContract.Calendars.OWNER_ACCOUNT, ACCOUNT_NAME)
            put(CalendarContract.Calendars.VISIBLE, 1)
            put(CalendarContract.Calendars.SYNC_EVENTS, 1)
            put(CalendarContract.Calendars.CALENDAR_TIME_ZONE, java.util.TimeZone.getDefault().id)
        }
        val uri = resolver.insert(asSyncAdapter(CalendarContract.Calendars.CONTENT_URI), values) ?: error("Телефон не дал создать календарь")
        return uri.lastPathSegment!!.toLong()
    }

    private fun removeCalendar(context: Context) {
        val resolver = context.contentResolver
        val id = findCalendar(resolver) ?: return
        resolver.delete(asSyncAdapter(CalendarContract.Calendars.CONTENT_URI), "${CalendarContract.Calendars._ID}=?", arrayOf(id.toString()))
    }

    private fun icon(type: String) = when (type) {
        "work" -> "💼 "
        "off" -> "🌴 "
        "study" -> "📚 "
        "loan_due" -> "💳 "
        "page" -> "📝 "
        else -> ""
    }

    /** Время в начале названия («19:00 · урок») — событие ставится на это время на час. */
    private val TIME_PREFIX = Regex("^(\\d{1,2}):(\\d{2})")

    /** Синхронизирует, если включено и прошло больше 3 часов (или force). Возвращает текст статуса. */
    suspend fun syncIfDue(context: Context, force: Boolean = false): String? {
        if (!isEnabled(context) || !hasPermission(context)) return null
        if (Session.server.value == null || Session.token.value == null) return null
        if (!force && System.currentTimeMillis() - lastSync(context) < SYNC_INTERVAL_MS) return lastStatus(context)
        return sync(context)
    }

    suspend fun sync(context: Context): String = withContext(Dispatchers.IO) {
        val stamp = LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm"))
        val status = try {
            val now = YearMonth.now()
            val months = (-1..2).map { now.plusMonths(it.toLong()) }
            val events = months.flatMap { m -> Api.get<Items<CalendarEvent>>("/api/life/calendar?y=${m.year}&m=${m.monthValue}").items }
                .filter { it.type != "mood" && it.title.isNotBlank() && it.date.isNotBlank() }
                .distinctBy { "${it.date}|${it.title}|${it.type}" }
            val resolver = context.contentResolver
            val calendarId = ensureCalendar(resolver)
            val rangeStart = months.first().atDay(1).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
            val rangeEnd = months.last().plusMonths(1).atDay(1).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli() + 86_400_000L
            resolver.delete(
                asSyncAdapter(CalendarContract.Events.CONTENT_URI),
                "${CalendarContract.Events.CALENDAR_ID}=? AND ${CalendarContract.Events.DTSTART}>=? AND ${CalendarContract.Events.DTSTART}<?",
                arrayOf(calendarId.toString(), (rangeStart - 86_400_000L).toString(), rangeEnd.toString()),
            )
            var added = 0
            for (event in events) {
                val date = runCatching { LocalDate.parse(event.date.take(10)) }.getOrNull() ?: continue
                val time = TIME_PREFIX.find(event.title)
                val values = ContentValues().apply {
                    put(CalendarContract.Events.CALENDAR_ID, calendarId)
                    put(CalendarContract.Events.TITLE, icon(event.type) + event.title)
                    put(CalendarContract.Events.DESCRIPTION, "Из Life Hub")
                    put(CalendarContract.Events.SYNC_DATA1, "${event.date}|${event.type}")
                    if (time != null) {
                        val start = date.atTime(time.groupValues[1].toInt().coerceIn(0, 23), time.groupValues[2].toInt().coerceIn(0, 59))
                            .atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
                        put(CalendarContract.Events.DTSTART, start)
                        put(CalendarContract.Events.DTEND, start + 3_600_000L)
                        put(CalendarContract.Events.EVENT_TIMEZONE, java.util.TimeZone.getDefault().id)
                    } else {
                        val start = date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
                        put(CalendarContract.Events.DTSTART, start)
                        put(CalendarContract.Events.DTEND, start + 86_400_000L)
                        put(CalendarContract.Events.ALL_DAY, 1)
                        put(CalendarContract.Events.EVENT_TIMEZONE, "UTC")
                    }
                }
                if (resolver.insert(asSyncAdapter(CalendarContract.Events.CONTENT_URI), values) != null) added += 1
            }
            prefs(context).edit().putLong("calendar_sync_at", System.currentTimeMillis()).apply()
            "$stamp — событий в календаре телефона: $added"
        } catch (e: Exception) {
            "$stamp — ошибка: ${e.message ?: "сервер недоступен"}"
        }
        prefs(context).edit().putString("calendar_sync_status", status).apply()
        status
    }

    /** Запрос на немедленную синхронизацию у системы (для календаря аккаунта не обязателен). */
    @Suppress("unused")
    private fun requestSystemSync() {
        ContentResolver.requestSync(Account(ACCOUNT_NAME, ACCOUNT_TYPE), CalendarContract.AUTHORITY, android.os.Bundle())
    }
}

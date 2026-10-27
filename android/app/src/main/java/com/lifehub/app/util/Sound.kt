package com.lifehub.app.util

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.ToneGenerator
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.os.Build
import com.lifehub.app.data.Api
import java.net.URLEncoder

/**
 * Озвучка слов: mp3 с сервера Life Hub (/api/tts — кэшируется на сервере) или своя
 * запись слова из курса. Тоны ответов и вибрация — как в веб-версии уроков.
 */
object Sound {
    private var player: MediaPlayer? = null
    private val tones by lazy { ToneGenerator(AudioManager.STREAM_MUSIC, 70) }

    fun speak(text: String, lang: String?, reading: String? = null, audio: String? = null, slow: Boolean = false) {
        if (text.isBlank()) return
        val url = Api.fileUrl(audio) ?: buildString {
            append(Api.url("/api/tts?text="))
            append(URLEncoder.encode(text, "UTF-8"))
            append("&lang=").append(URLEncoder.encode(lang ?: "en", "UTF-8"))
            if (!reading.isNullOrBlank()) append("&reading=").append(URLEncoder.encode(reading, "UTF-8"))
        }
        stop()
        player = MediaPlayer().apply {
            setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            try {
                setDataSource(url)
                setOnPreparedListener { mp ->
                    if (slow) mp.playbackParams = mp.playbackParams.setSpeed(0.65f)
                    mp.start()
                }
                setOnCompletionListener { it.release(); if (player === it) player = null }
                setOnErrorListener { mp, _, _ -> mp.release(); if (player === mp) player = null; true }
                prepareAsync()
            } catch (_: Exception) {
                release()
            }
        }
    }

    fun stop() {
        player?.let { runCatching { it.stop() }; it.release() }
        player = null
    }

    fun correct(context: Context) {
        tones.startTone(ToneGenerator.TONE_PROP_ACK, 120)
        vibrate(context, 25)
    }

    fun wrong(context: Context) {
        tones.startTone(ToneGenerator.TONE_PROP_NACK, 180)
        vibrate(context, 120)
    }

    fun finish(context: Context) {
        tones.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 300)
        vibrate(context, 60)
    }

    private fun vibrate(context: Context, ms: Long) {
        val vibrator = if (Build.VERSION.SDK_INT >= 31) {
            (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION") context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
        runCatching { vibrator.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE)) }
    }
}

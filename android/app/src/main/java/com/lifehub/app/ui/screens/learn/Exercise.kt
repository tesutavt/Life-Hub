package com.lifehub.app.ui.screens.learn

import com.lifehub.app.data.Api
import com.lifehub.app.data.Word
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive

/** Упражнение урока (формат lifehub-course@1, уже нормализованный сервером). */
sealed class Exercise(val graded: Boolean) {
    data class Learn(val word: Word) : Exercise(false)
    data class Theory(val title: String, val text: String) : Exercise(false)
    data class Choice(val prompt: String, val question: String?, val options: List<String>, val answer: String) : Exercise(true)
    data class Translate(val prompt: String, val answers: List<String>, val hint: String?, val direction: String) : Exercise(true)
    data class Match(val prompt: String, val pairs: List<Pair<String, String>>) : Exercise(true)
    data class Assemble(val prompt: String, val answerTokens: List<String>, val tokens: List<String>, val separator: String) : Exercise(true)
    data class Fill(val prompt: String, val sentence: String, val answer: String, val translation: String?, val options: List<String>?) : Exercise(true)
    data class Listen(val prompt: String, val text: String, val answers: List<String>) : Exercise(true)
}

private fun JsonObject.str(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
private fun JsonObject.strList(key: String): List<String> =
    (this[key] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull } ?: emptyList()

fun parseExercise(raw: JsonObject, words: List<Word>): Exercise? = runCatching {
    when (raw.str("type")) {
        "learn" -> {
            val wordEl = raw["word"]
            val word = when (wordEl) {
                is JsonPrimitive -> words.firstOrNull { it.term == wordEl.content }
                is JsonObject -> Api.decode<Word>(wordEl)
                else -> null
            }
            word?.let { Exercise.Learn(it) }
        }
        "theory" -> Exercise.Theory(raw.str("title") ?: "Подсказка", raw.str("text") ?: return null)
        "choice" -> Exercise.Choice(raw.str("prompt") ?: "Выберите вариант", raw.str("question"), raw.strList("options"), raw.str("answer") ?: return null)
        "translate" -> Exercise.Translate(raw.str("prompt") ?: return null, raw.strList("answers").ifEmpty { return null }, raw.str("hint"), raw.str("direction") ?: "to_native")
        "match" -> {
            val pairs = (raw["pairs"] as? JsonArray)?.mapNotNull { pair ->
                val list = pair.jsonArray
                if (list.size >= 2) list[0].jsonPrimitive.content to list[1].jsonPrimitive.content else null
            } ?: emptyList()
            if (pairs.size < 2) null else Exercise.Match(raw.str("prompt") ?: "Соедините пары", pairs)
        }
        "assemble" -> Exercise.Assemble(
            raw.str("prompt") ?: "Соберите фразу",
            raw.strList("answer_tokens").ifEmpty { return null },
            raw.strList("tokens"),
            (raw["separator"] as? JsonPrimitive)?.contentOrNull ?: " ",
        )
        "fill" -> Exercise.Fill(raw.str("prompt") ?: "Заполните пропуск", raw.str("sentence") ?: return null, raw.str("answer") ?: return null, raw.str("translation"), raw.strList("options").ifEmpty { null })
        "listen" -> Exercise.Listen(raw.str("prompt") ?: "Напишите, что услышали", raw.str("text") ?: return null, raw.strList("answers").ifEmpty { listOf(raw.str("text")!!) })
        else -> null
    }
}.getOrNull()

enum class Grade { Exact, Typo, Wrong }

private val PUNCT = Regex("""[.,!?¿¡;:"'«»“”„()\-–—…。、！？「」]""")

fun normalizeAnswer(value: String): String =
    value.lowercase().replace('ё', 'е').replace(PUNCT, " ").replace(Regex("""\s+"""), " ").trim()

private fun levenshtein(a: String, b: String): Int {
    if (a == b) return 0
    var prev = IntArray(b.length + 1) { it }
    for (i in 1..a.length) {
        val curr = IntArray(b.length + 1)
        curr[0] = i
        for (j in 1..b.length) {
            curr[j] = minOf(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + if (a[i - 1] == b[j - 1]) 0 else 1)
        }
        prev = curr
    }
    return prev[b.length]
}

/** Регистр, ё/е, пунктуация и лишние пробелы не важны; одна опечатка в длинном ответе засчитывается. */
fun gradeText(input: String, answers: List<String>): Grade {
    val value = normalizeAnswer(input)
    if (value.isEmpty()) return Grade.Wrong
    val normalized = answers.map(::normalizeAnswer).filter { it.isNotEmpty() }
    if (value in normalized) return Grade.Exact
    val compact = value.replace(" ", "")
    if (normalized.any { it.replace(" ", "") == compact }) return Grade.Exact
    if (normalized.any { it.length >= 5 && levenshtein(it, value) <= 1 }) return Grade.Typo
    return Grade.Wrong
}

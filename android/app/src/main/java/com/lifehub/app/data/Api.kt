package com.lifehub.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

class ApiException(message: String, val code: Int = 0) : Exception(message)

/** HTTP-клиент к серверу Life Hub (тот же API, что у веб-версии и десктопа). */
object Api {
    val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        isLenient = true
        explicitNulls = false
    }

    val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private val JSON_TYPE = "application/json; charset=utf-8".toMediaType()

    fun url(path: String): String {
        val base = Session.server.value ?: throw ApiException("Сервер не выбран")
        return if (path.startsWith("http")) path else base + path
    }

    /** Абсолютная ссылка на файл сервера (аватар, загрузки). */
    fun fileUrl(path: String?): String? = when {
        path.isNullOrBlank() -> null
        path.startsWith("http") -> path
        else -> (Session.server.value ?: "") + path
    }

    suspend fun request(method: String, path: String, body: JsonElement? = null, auth: Boolean = true): JsonElement =
        withContext(Dispatchers.IO) {
            val builder = Request.Builder().url(url(path))
            if (auth) Session.token.value?.let { builder.header("Authorization", "Bearer $it") }
            val requestBody = when {
                body != null -> body.toString().toRequestBody(JSON_TYPE)
                method == "GET" || method == "DELETE" -> null
                else -> "{}".toRequestBody(JSON_TYPE)
            }
            builder.method(method, requestBody)
            val response = try {
                http.newCall(builder.build()).execute()
            } catch (e: IOException) {
                throw ApiException("Нет связи с сервером: ${e.message ?: "проверьте интернет"}")
            }
            response.use {
                val text = it.body?.string().orEmpty()
                if (it.code == 401 && auth) {
                    Session.logout()
                    throw ApiException("Сессия истекла — войдите снова", 401)
                }
                if (!it.isSuccessful) throw ApiException(extractError(text) ?: "Ошибка сервера (${it.code})", it.code)
                if (text.isBlank()) JsonObject(emptyMap()) else json.parseToJsonElement(text)
            }
        }

    private fun extractError(text: String): String? = try {
        val obj = json.parseToJsonElement(text).jsonObject
        (obj["message"] ?: obj["error"])?.jsonPrimitive?.contentOrNull
    } catch (_: Exception) {
        text.takeIf { it.isNotBlank() && it.length < 200 }
    }

    /** Проверка, что по адресу работает сервер Life Hub (до выбора сервера). */
    suspend fun checkServer(baseUrl: String): Health = withContext(Dispatchers.IO) {
        val request = Request.Builder().url("$baseUrl/api/health").build()
        val quick = http.newBuilder().connectTimeout(6, TimeUnit.SECONDS).readTimeout(6, TimeUnit.SECONDS).build()
        val response = try {
            quick.newCall(request).execute()
        } catch (e: IOException) {
            throw ApiException("Не удалось подключиться: проверьте IP, порт и что сервер запущен")
        }
        response.use {
            val health = runCatching { json.decodeFromString<Health>(it.body?.string().orEmpty()) }.getOrNull()
            if (!it.isSuccessful || health?.app != "lifehub") throw ApiException("По этому адресу отвечает не сервер Life Hub")
            health
        }
    }

    /** Загрузка файла (multipart), например выписки банка. */
    suspend fun upload(path: String, field: String, fileName: String, bytes: ByteArray, extra: Map<String, String> = emptyMap(), mime: String = "text/csv"): JsonElement =
        uploadMany(path, listOf(UploadFile(field, fileName, bytes, mime)), extra)

    class UploadFile(val field: String, val fileName: String, val bytes: ByteArray, val mime: String)

    /** multipart/form-data: поля + любое число файлов (в том числе ни одного). */
    suspend fun uploadMany(path: String, files: List<UploadFile>, extra: Map<String, String> = emptyMap()): JsonElement =
        withContext(Dispatchers.IO) {
            val body = okhttp3.MultipartBody.Builder().setType(okhttp3.MultipartBody.FORM).apply {
                extra.forEach { (k, v) -> addFormDataPart(k, v) }
                files.forEach { f -> addFormDataPart(f.field, f.fileName, f.bytes.toRequestBody(f.mime.toMediaType())) }
                if (files.isEmpty() && extra.isEmpty()) addFormDataPart("_", "")
            }.build()
            val builder = Request.Builder().url(url(path)).post(body)
            Session.token.value?.let { builder.header("Authorization", "Bearer $it") }
            val response = try {
                http.newCall(builder.build()).execute()
            } catch (e: IOException) {
                throw ApiException("Нет связи с сервером: ${e.message ?: "проверьте интернет"}")
            }
            response.use {
                val text = it.body?.string().orEmpty()
                if (!it.isSuccessful) throw ApiException(extractError(text) ?: "Ошибка сервера (${it.code})", it.code)
                json.parseToJsonElement(text)
            }
        }

    suspend inline fun <reified T> get(path: String): T = json.decodeFromJsonElement<T>(request("GET", path))
    suspend fun post(path: String, body: JsonElement? = null, auth: Boolean = true) = request("POST", path, body, auth)
    suspend fun put(path: String, body: JsonElement? = null) = request("PUT", path, body)
    suspend fun patch(path: String, body: JsonElement? = null) = request("PATCH", path, body)
    suspend fun delete(path: String) = request("DELETE", path)
    inline fun <reified T> decode(element: JsonElement): T = json.decodeFromJsonElement<T>(element)
}

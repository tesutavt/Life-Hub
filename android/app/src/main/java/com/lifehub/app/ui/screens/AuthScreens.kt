package com.lifehub.app.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Dns
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lifehub.app.data.Api
import com.lifehub.app.data.AuthConfig
import com.lifehub.app.data.AuthResponse
import com.lifehub.app.data.Session
import com.lifehub.app.ui.theme.Brand
import kotlinx.coroutines.launch
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.material.icons.filled.QrCodeScanner
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@Composable
fun LogoMark(size: Int = 72) {
    Box(
        Modifier.size(size.dp).clip(RoundedCornerShape((size * 0.28).dp))
            .background(Brush.linearGradient(listOf(Brand.Mint, Brand.Sky, Color(0xFF6366F1)))),
        contentAlignment = Alignment.Center,
    ) {
        Text("L", color = Brand.Deep, fontSize = (size * 0.48).sp, fontWeight = FontWeight.Black)
    }
}

@Composable
private fun AuthBackground(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF0B3A3A), Brand.Deep, Color(0xFF1E1B4B))))) { content() }
}

@Composable
fun authFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = Brand.Mint,
    unfocusedBorderColor = Color.White.copy(alpha = 0.12f),
    focusedContainerColor = Color(0xFF0F1A21),
    unfocusedContainerColor = Color(0xFF0F1A21),
    cursorColor = Brand.Mint,
    focusedLabelColor = Brand.Mint,
)

/** Первый экран: адрес сервера (VDS по IP или домену). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ConnectScreen() {
    val scope = rememberCoroutineScope()
    var address by remember { mutableStateOf(Session.recentServers.firstOrNull()?.removePrefix("http://") ?: "") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun connect(input: String) {
        val url = Session.normalize(input)
        if (url.isBlank()) return
        busy = true
        error = null
        scope.launch {
            try {
                Api.checkServer(url)
                Session.setServer(url)
            } catch (e: Exception) {
                error = e.message
            } finally {
                busy = false
            }
        }
    }

    AuthBackground {
        Column(
            Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(48.dp))
            LogoMark(84)
            Spacer(Modifier.height(18.dp))
            Text("Life Hub", fontSize = 30.sp, fontWeight = FontWeight.Black)
            Text("Финансы, здоровье, учёба и цели — в кармане", color = Brand.TextMuted, textAlign = TextAlign.Center)
            Spacer(Modifier.height(32.dp))
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color(0xF21E2A33)).padding(20.dp)) {
                Text("Подключение к серверу", fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                Text("Укажите IP или домен вашего сервера Life Hub", color = Brand.TextMuted, fontSize = 14.sp)
                Spacer(Modifier.height(16.dp))
                OutlinedTextField(
                    value = address,
                    onValueChange = { address = it; error = null },
                    label = { Text("IP или домен") },
                    placeholder = { Text("95.105.76.39") },
                    leadingIcon = { Icon(Icons.Default.Dns, null) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go),
                    colors = authFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                )
                Text("Порт по умолчанию — 4000. Для HTTPS укажите адрес с https://", color = Brand.TextFaint, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
                error?.let { Text(it, color = Brand.Rose, fontSize = 13.sp, modifier = Modifier.padding(top = 10.dp)) }
                Spacer(Modifier.height(16.dp))
                Button(
                    onClick = { connect(address) },
                    enabled = address.isNotBlank() && !busy,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    shape = RoundedCornerShape(6.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Brand.Mint, contentColor = Brand.Deep),
                ) {
                    if (busy) CircularProgressIndicator(Modifier.size(20.dp), color = Brand.Deep, strokeWidth = 2.dp)
                    else Text("Подключиться", fontWeight = FontWeight.SemiBold)
                }
                Spacer(Modifier.height(10.dp))
                QrLoginButton()
                val recent = Session.recentServers
                if (recent.isNotEmpty()) {
                    Spacer(Modifier.height(14.dp))
                    Text("НЕДАВНИЕ", fontSize = 11.sp, color = Brand.TextFaint)
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.padding(top = 6.dp),
                    ) {
                        recent.forEach { url ->
                            Text(
                                "🌐 " + url.removePrefix("http://").removePrefix("https://"),
                                fontSize = 13.sp,
                                modifier = Modifier.clip(CircleShape).background(Color.White.copy(alpha = 0.06f)).clickable { connect(url) }
                                    .padding(horizontal = 12.dp, vertical = 6.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

/** Вход и регистрация в стиле Discord. */
@Composable
fun AuthScreen() {
    val scope = rememberCoroutineScope()
    var register by remember { mutableStateOf(false) }
    var login by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var registrationOpen by remember { mutableStateOf(true) }
    val server = Session.server.value.orEmpty()

    LaunchedEffect(server) {
        registrationOpen = runCatching { Api.decode<AuthConfig>(Api.request("GET", "/api/auth/config", auth = false)).registration }.getOrDefault(true)
    }

    fun submit() {
        busy = true
        error = null
        scope.launch {
            try {
                val body = if (register) {
                    buildJsonObject {
                        put("email", email.trim()); put("password", password); put("name", name.trim()); put("username", username.trim())
                    }
                } else {
                    buildJsonObject { put("email", login.trim()); put("password", password) }
                }
                val response = Api.post(if (register) "/api/auth/register" else "/api/auth/login", body, auth = false)
                Session.setToken(Api.decode<AuthResponse>(response).token)
            } catch (e: Exception) {
                error = when (e.message) {
                    "exists" -> "Этот email уже зарегистрирован"
                    "username_taken" -> "Это имя пользователя уже занято"
                    else -> e.message
                }
            } finally {
                busy = false
            }
        }
    }

    AuthBackground {
        Column(
            Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(36.dp))
            LogoMark(64)
            Spacer(Modifier.height(24.dp))
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color(0xF21E2A33)).padding(20.dp)) {
                AnimatedContent(register, label = "auth-title") { isRegister ->
                    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(if (isRegister) "Создать учётную запись" else "С возвращением!", fontSize = 24.sp, fontWeight = FontWeight.SemiBold)
                        if (!isRegister) Text("Мы так рады видеть вас снова! 👋", color = Brand.TextMuted)
                    }
                }
                Spacer(Modifier.height(18.dp))
                val field = Modifier.fillMaxWidth().padding(bottom = 12.dp)
                if (register) {
                    OutlinedTextField(email, { email = it }, label = { Text("Email") }, singleLine = true, colors = authFieldColors(), modifier = field,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next))
                    OutlinedTextField(name, { name = it }, label = { Text("Отображаемое имя") }, singleLine = true, colors = authFieldColors(), modifier = field)
                    OutlinedTextField(
                        username, { value -> username = value.lowercase().filter { it.isLetterOrDigit() || it in "_.-" } },
                        label = { Text("Имя пользователя") }, prefix = { Text("@") }, singleLine = true, colors = authFieldColors(), modifier = field,
                    )
                } else {
                    OutlinedTextField(login, { login = it }, label = { Text("Email или имя пользователя") }, singleLine = true, colors = authFieldColors(), modifier = field,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next))
                }
                OutlinedTextField(
                    password, { password = it }, label = { Text("Пароль") }, singleLine = true, colors = authFieldColors(), modifier = field,
                    visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                    trailingIcon = {
                        IconButton(onClick = { showPassword = !showPassword }) {
                            Icon(if (showPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility, "Показать пароль")
                        }
                    },
                )
                error?.let { Text(it, color = Brand.Rose, fontSize = 14.sp, modifier = Modifier.padding(bottom = 10.dp)) }
                Button(
                    onClick = { submit() },
                    enabled = !busy && password.isNotEmpty() && (if (register) email.isNotBlank() && username.isNotBlank() else login.isNotBlank()),
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    shape = RoundedCornerShape(6.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Brand.Mint, contentColor = Brand.Deep),
                ) {
                    if (busy) CircularProgressIndicator(Modifier.size(20.dp), color = Brand.Deep, strokeWidth = 2.dp)
                    else Text(if (register) "Продолжить" else "Вход", fontWeight = FontWeight.SemiBold)
                }
                if (registrationOpen || register) {
                    Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(if (register) "Уже есть аккаунт?" else "Нужна учётная запись?", color = Brand.TextMuted, fontSize = 14.sp)
                        TextButton(onClick = { register = !register; error = null }) {
                            Text(if (register) "Войти" else "Зарегистрироваться", color = Brand.Sky)
                        }
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            QrLoginButton()
            Spacer(Modifier.height(18.dp))
            Row(
                Modifier.clip(CircleShape).background(Color.Black.copy(alpha = 0.3f)).clickable { Session.clearServer() }.padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(Brand.Sky))
                Spacer(Modifier.size(8.dp))
                Text("Сервер: ${server.removePrefix("http://").removePrefix("https://")} · сменить", fontSize = 13.sp, color = Brand.TextMuted)
            }
        }
    }
}

/**
 * Вход по QR-коду с компьютера: «Профиль → Войти на телефоне (QR)» в веб-версии или exe.
 * В коде — адреса сервера в локальной сети и одноразовый код (2 минуты).
 */
@Composable
fun QrLoginButton() {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun handle(text: String) {
        val uri = runCatching { android.net.Uri.parse(text) }.getOrNull()
        val code = uri?.getQueryParameter("code")
        val servers = uri?.getQueryParameter("s")?.split('|')?.map { it.trim().trimEnd('/') }?.filter { it.isNotBlank() }.orEmpty()
        if (uri?.scheme != "lifehub" || code.isNullOrBlank() || servers.isEmpty()) {
            error = "Это не QR-код Life Hub"
            return
        }
        busy = true
        error = null
        scope.launch {
            try {
                // Пробуем адреса по очереди: компьютер может быть в нескольких сетях
                val reachable = servers.firstOrNull { runCatching { Api.checkServer(it) }.isSuccess }
                    ?: throw Exception("Не удалось достучаться до компьютера: телефон в той же Wi-Fi? Порт открыт в брандмауэре?")
                Session.setServer(reachable)
                val response = Api.post("/api/auth/qr/redeem", buildJsonObject { put("code", code) }, auth = false)
                Session.setToken(Api.decode<AuthResponse>(response).token)
            } catch (e: Exception) {
                error = e.message
            } finally {
                busy = false
            }
        }
    }

    val launcher = rememberLauncherForActivityResult(ScanContract()) { result -> result.contents?.let(::handle) }
    val scanOptions = ScanOptions()
        .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
        .setPrompt("Наведите камеру на QR-код в Life Hub на компьютере")
        .setBeepEnabled(false)
        .setOrientationLocked(false)
    // Без разрешения на камеру сканер падал с «the Android camera encountered a problem»
    val cameraPermission = rememberLauncherForActivityResult(androidx.activity.result.contract.ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) launcher.launch(scanOptions) else error = "Нужен доступ к камере, чтобы отсканировать QR-код"
    }
    val context = androidx.compose.ui.platform.LocalContext.current

    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        Button(
            onClick = {
                error = null
                val granted = androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.CAMERA) ==
                    android.content.pm.PackageManager.PERMISSION_GRANTED
                if (granted) launcher.launch(scanOptions) else cameraPermission.launch(android.Manifest.permission.CAMERA)
            },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth().height(48.dp),
            shape = RoundedCornerShape(6.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color.White.copy(alpha = 0.08f), contentColor = Brand.Text),
        ) {
            if (busy) CircularProgressIndicator(Modifier.size(20.dp), color = Brand.Mint, strokeWidth = 2.dp)
            else {
                Icon(Icons.Default.QrCodeScanner, null)
                Spacer(Modifier.size(8.dp))
                Text("Войти по QR-коду с компьютера")
            }
        }
        error?.let { Text(it, color = Brand.Rose, fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 6.dp)) }
    }
}

package com.lifehub.app.ui.screens

import android.content.Context
import android.graphics.Bitmap
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.drawable.BitmapDrawable
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.navigation.NavController
import com.lifehub.app.data.Api
import com.lifehub.app.data.GeoPlace
import com.lifehub.app.data.GeoReverse
import com.lifehub.app.data.Items
import com.lifehub.app.data.PageTag
import com.lifehub.app.data.RelatedItem
import com.lifehub.app.data.TravelPlan
import com.lifehub.app.ui.components.EmptyState
import com.lifehub.app.ui.components.BackTopBar
import com.lifehub.app.ui.components.LhCard
import com.lifehub.app.ui.components.LoadableContent
import com.lifehub.app.ui.components.RelatedSection
import com.lifehub.app.ui.components.SavingsBar
import com.lifehub.app.ui.components.TagPicker
import com.lifehub.app.ui.components.rememberLoadable
import com.lifehub.app.ui.components.rememberTagOptions
import com.lifehub.app.ui.theme.Brand
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import org.osmdroid.config.Configuration
import org.osmdroid.events.MapEventsReceiver
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.CustomZoomButtonsController
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.MapEventsOverlay
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polyline
import java.net.URLEncoder

// Путешествия — как на ПК: карта с булавками («Был», «Планирую», «Мечтаю»), красная нить по местам,
// где был, пунктир к планам и мечтам; копилки из вишлиста, связанные с поездкой.

private data class TripStatus(val id: String, val label: String, val emoji: String, val color: Color)

private val TRIP_STATUSES = listOf(
    TripStatus("done", "Был", "📍", Color(0xFFE11D48)),
    TripStatus("planned", "Планирую", "🧳", Color(0xFF3B82F6)),
    TripStatus("dream", "Мечтаю", "⭐", Color(0xFFF59E0B)),
    TripStatus("cancelled", "Отменено", "✖️", Color(0xFF94A3B8)),
)
private fun tripStatus(id: String?) = TRIP_STATUSES.firstOrNull { it.id == id } ?: TRIP_STATUSES[1]

/** Как ехали: поезд рисуется «шпалами» по железной дороге, авто — по трассе, самолёт и паром — дугой. */
private data class Transport(val id: String, val label: String, val emoji: String, val how: String)
private val TRANSPORTS = listOf(
    Transport("train", "Поезд", "🚆", "по железной дороге"), Transport("car", "Машина", "🚗", "по дорогам"),
    Transport("bus", "Автобус", "🚌", "по дорогам"), Transport("bike", "Велосипед", "🚲", "велодорогами"),
    Transport("walk", "Пешком", "🥾", "пешком"), Transport("plane", "Самолёт", "✈️", "по воздуху"), Transport("ship", "Паром", "⛴️", "по воде"),
)
@kotlinx.serialization.Serializable private data class RouteResult(val points: List<List<Double>> = emptyList(), val km: Double? = null, val minutes: Int? = null, val warning: String? = null)

@kotlinx.serialization.Serializable private data class TripsBulk(val items: Map<String, List<RelatedItem>> = emptyMap())

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TravelScreen(nav: NavController) {
    val scope = rememberCoroutineScope()
    val state = rememberLoadable { Api.get<Items<TravelPlan>>("/api/life/travel").items }
    val tagOptions = rememberTagOptions()
    var editing by remember { mutableStateOf<TravelPlan?>(null) }
    var draft by remember { mutableStateOf<TravelPlan?>(null) }
    var filter by remember { mutableStateOf<String?>(null) }
    var focus by remember { mutableStateOf<GeoPoint?>(null) }
    var wishes by remember { mutableStateOf<Map<String, List<RelatedItem>>>(emptyMap()) }
    LaunchedEffect(state.data) {
        wishes = runCatching { Api.decode<TripsBulk>(Api.request("GET", "/api/life/links/related-bulk?type=travel&target=wish")).items }.getOrDefault(emptyMap())
    }

    Column(Modifier.fillMaxSize().background(Brand.Deep)) {
        BackTopBar("Путешествия", { nav.popBackStack() }) {
            IconButton({ draft = TravelPlan(id = 0, status = "dream") }) { Icon(Icons.Default.Add, "Добавить", tint = Brand.Text) }
        }
        LoadableContent(state) { trips ->
            val done = trips.filter { it.status == "done" }
            Text(
                if (trips.isEmpty()) "Нажмите на карту, чтобы воткнуть булавку: где был, куда собираетесь, о чём мечтаете."
                else "Побывал: ${done.size} · стран: ${done.mapNotNull { it.country }.toSet().size} · в планах ${trips.count { it.status == "planned" }} · мечтаю ${trips.count { it.status == "dream" }}",
                color = Brand.TextMuted, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 2.dp),
            )
            Box(Modifier.padding(horizontal = 12.dp, vertical = 8.dp).fillMaxWidth().height(320.dp).clip(RoundedCornerShape(20.dp)).border(6.dp, Color(0xFF5B3820), RoundedCornerShape(20.dp))) {
                TravelMapView(
                    trips = trips, wishes = wishes, focus = focus,
                    onPick = { lat, lon ->
                        val newTrip = TravelPlan(id = 0, status = "dream", lat = lat, lon = lon)
                        draft = newTrip
                        scope.launch {
                            val place = runCatching { Api.get<GeoReverse>("/api/life/travel/reverse?lat=$lat&lon=$lon").place }.getOrNull()
                            if (place != null && place.name.isNotBlank() && draft?.lat == lat && draft?.title.isNullOrBlank()) {
                                draft = draft?.copy(title = place.city ?: place.name, location = placeLabel(place), country = place.country)
                            }
                        }
                    },
                    onSelect = { id -> editing = trips.firstOrNull { it.id == id } },
                    modifier = Modifier.fillMaxSize().padding(6.dp).clip(RoundedCornerShape(14.dp)),
                )
                Row(Modifier.align(Alignment.BottomStart).padding(12.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    TRIP_STATUSES.take(3).forEach { s ->
                        Row(Modifier.clip(CircleShape).background(Color(0xFFFDFBF6)).padding(horizontal = 7.dp, vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(8.dp).clip(CircleShape).background(s.color)); Spacer(Modifier.width(4.dp)); Text(s.label, fontSize = 10.sp, color = Color(0xFF334155))
                        }
                    }
                }
            }
            LazyRow(contentPadding = PaddingValues(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                item { TravelPill("🗺️ Все", filter == null) { filter = null } }
                items(TRIP_STATUSES) { s -> TravelPill("${s.emoji} ${s.label}", filter == s.id) { filter = if (filter == s.id) null else s.id } }
            }
            val shown = trips.filter { filter == null || (it.status ?: "planned") == filter }
            LazyColumn(contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (shown.isEmpty()) item { EmptyState("✈️", "Поездок пока нет", "Нажмите на карту или «+», чтобы добавить место.") }
                items(shown, key = { it.id }) { t ->
                    val st = tripStatus(t.status)
                    LhCard(Modifier.fillMaxWidth(), onClick = { editing = t }) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(t.title ?: "Поездка", fontWeight = FontWeight.SemiBold)
                                Text(listOfNotNull(t.location?.ifBlank { null }, listOfNotNull(t.dateFrom, t.dateTo).joinToString(" — ").ifBlank { null }).joinToString(" · "), color = Brand.TextMuted, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            }
                            Text("${st.emoji} ${st.label}", fontSize = 11.sp, color = Brand.Text,
                                modifier = Modifier.clip(CircleShape).background(st.color.copy(alpha = 0.3f)).border(1.dp, st.color, CircleShape).padding(horizontal = 8.dp, vertical = 3.dp))
                        }
                        t.notes?.takeIf { it.isNotBlank() }?.let { Text(it, color = Brand.TextMuted, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp)) }
                        wishes[t.id.toString()].orEmpty().filter { it.extra.status != "got" }.forEach { w ->
                            Column(Modifier.padding(top = 6.dp).fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Brand.Ink.copy(alpha = 0.05f)).padding(8.dp)) {
                                Text("🐷 ${w.title}", fontSize = 12.sp)
                                SavingsBar(w.extra.price, w.extra.saved, w.extra.currency)
                            }
                        }
                        if (t.tags.isNotEmpty()) FlowRow(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) { t.tags.forEach { TagBadge(it) } }
                        if (t.lat != null && t.lon != null) Text("📍 На карте", color = Brand.Mint, fontSize = 12.sp,
                            modifier = Modifier.padding(top = 6.dp).clip(CircleShape).clickable { focus = GeoPoint(t.lat, t.lon) }.padding(vertical = 3.dp))
                    }
                }
            }
        }
    }

    val current = editing ?: draft
    if (current != null) {
        TripSheet(current, tagOptions,
            onDismiss = { editing = null; draft = null },
            onDelete = if (current.id != 0) ({
                editing = null
                scope.launch { runCatching { Api.delete("/api/life/travel/${current.id}") }; state.reload() }
            }) else null,
            onOpen = { route -> editing = null; draft = null; nav.navigate(route) },
            onFocus = { focus = it },
        ) { body ->
            editing = null; draft = null
            scope.launch {
                runCatching { if (current.id == 0) Api.post("/api/life/travel", body) else Api.put("/api/life/travel/${current.id}", body) }
                state.reload()
            }
        }
    }
}

@Composable
private fun TravelPill(text: String, selected: Boolean, onClick: () -> Unit) {
    Text(
        text, fontSize = 13.sp, color = if (selected) Brand.Text else Brand.TextMuted,
        modifier = Modifier.clip(CircleShape).background(if (selected) Brand.Mint.copy(alpha = 0.22f) else Color.Transparent)
            .border(1.dp, if (selected) Brand.Mint else Brand.Ink.copy(alpha = 0.1f), CircleShape)
            .clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 7.dp),
    )
}

private fun placeLabel(p: GeoPlace) = listOfNotNull(p.name.takeIf { p.city != null && p.city != p.name }, p.city ?: p.name, p.country).joinToString(", ")

/** Булавка-гвоздик: игла и шляпка (у мечты — звёздочка). */
private fun pinBitmap(context: Context, color: Int, dream: Boolean): BitmapDrawable {
    val d = context.resources.displayMetrics.density
    val w = (28 * d).toInt(); val h = (40 * d).toInt()
    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val c = android.graphics.Canvas(bmp)
    val p = Paint(Paint.ANTI_ALIAS_FLAG)
    p.color = 0xFF9CA3AF.toInt(); p.strokeWidth = 2.2f * d; p.strokeCap = Paint.Cap.ROUND
    c.drawLine(w / 2f, 16 * d, w / 2f, h - 2 * d, p)
    p.style = Paint.Style.FILL; p.color = color
    p.setShadowLayer(3 * d, 1 * d, 2 * d, 0x66000000)
    if (dream) {
        val path = Path(); val cx = w / 2f; val cy = 11 * d; val r1 = 11 * d; val r2 = 4.8f * d
        for (i in 0 until 10) {
            val a = Math.toRadians((-90 + i * 36).toDouble()); val r = if (i % 2 == 0) r1 else r2
            val x = cx + (r * Math.cos(a)).toFloat(); val y = cy + (r * Math.sin(a)).toFloat()
            if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        path.close(); c.drawPath(path, p)
    } else c.drawCircle(w / 2f, 10 * d, 9 * d, p)
    p.clearShadowLayer(); p.color = 0x8CFFFFFF.toInt()
    c.drawCircle(w / 2f - 3 * d, 7 * d, 3 * d, p)
    return BitmapDrawable(context.resources, bmp)
}

/** Плавная дуга между точками — нить провисает, а не идёт по линейке. */
private fun arc(a: GeoPoint, b: GeoPoint, bend: Double = 0.18): List<GeoPoint> {
    val dx = b.longitude - a.longitude; val dy = b.latitude - a.latitude
    val mx = (a.longitude + b.longitude) / 2 - dy * bend; val my = (a.latitude + b.latitude) / 2 + dx * bend
    return (0..24).map { i ->
        val t = i / 24.0; val u = 1 - t
        GeoPoint(u * u * a.latitude + 2 * u * t * my + t * t * b.latitude, u * u * a.longitude + 2 * u * t * mx + t * t * b.longitude)
    }
}

@Composable
private fun TravelMapView(
    trips: List<TravelPlan>, wishes: Map<String, List<RelatedItem>>, focus: GeoPoint?,
    onPick: (Double, Double) -> Unit, onSelect: (Int) -> Unit, modifier: Modifier,
) {
    val context = LocalContext.current
    val pick by rememberUpdatedState(onPick)
    val select by rememberUpdatedState(onSelect)
    var fitted by remember { mutableStateOf(false) }
    val map = remember {
        Configuration.getInstance().userAgentValue = context.packageName
        MapView(context).apply {
            setTileSource(TileSourceFactory.MAPNIK)
            setMultiTouchControls(true)
            zoomController.setVisibility(CustomZoomButtonsController.Visibility.NEVER)
            minZoomLevel = 2.0
            controller.setZoom(3.0)
            controller.setCenter(GeoPoint(45.0, 40.0))
            isVerticalMapRepetitionEnabled = false
            // тёплые «старые» тона, как на ПК
            val sepia = ColorMatrix().apply { setSaturation(0.85f) }
            sepia.postConcat(ColorMatrix(floatArrayOf(1.05f, 0.05f, 0f, 0f, 8f, 0.02f, 1.0f, 0f, 0f, 4f, 0f, 0f, 0.9f, 0f, 0f, 0f, 0f, 0f, 1f, 0f)))
            overlayManager.tilesOverlay.setColorFilter(ColorMatrixColorFilter(sepia))
            // карта внутри прокручиваемого экрана — жесты достаются ей
            setOnTouchListener { v, _ -> v.parent?.requestDisallowInterceptTouchEvent(true); false }
        }
    }
    DisposableEffect(Unit) {
        map.onResume()
        onDispose { map.onPause(); map.onDetach() }
    }
    LaunchedEffect(focus) { focus?.let { map.controller.animateTo(it, maxOf(map.zoomLevelDouble, 6.0), 800L) } }

    AndroidView(factory = { map }, modifier = modifier, update = { m ->
        m.overlays.clear()
        m.overlays.add(MapEventsOverlay(object : MapEventsReceiver {
            override fun singleTapConfirmedHelper(p: GeoPoint): Boolean { pick(p.latitude, ((p.longitude + 540) % 360) - 180); return true }
            override fun longPressHelper(p: GeoPoint): Boolean = false
        }))
        val placed = trips.filter { it.lat != null && it.lon != null }
        val visited = placed.filter { it.status == "done" }.sortedBy { it.dateFrom ?: it.dateTo ?: "" }
        val d = context.resources.displayMetrics.density
        visited.zipWithNext().forEach { (a, b) ->
            if ((b.route?.size ?: 0) > 1) return@forEach // путь уже нарисован маршрутом
            val pts = arc(GeoPoint(a.lat!!, a.lon!!), GeoPoint(b.lat!!, b.lon!!))
            m.overlays.add(Polyline(m).apply { setPoints(pts); outlinePaint.color = 0x2E000000; outlinePaint.strokeWidth = 5 * d; isGeodesic = false })
            m.overlays.add(Polyline(m).apply { setPoints(pts); outlinePaint.color = 0xF2C81E3A.toInt(); outlinePaint.strokeWidth = 2.4f * d; outlinePaint.strokeCap = Paint.Cap.ROUND })
        }
        visited.lastOrNull()?.let { from ->
            placed.filter { it.status == "planned" || it.status == "dream" }.forEach { t ->
                m.overlays.add(Polyline(m).apply {
                    setPoints(arc(GeoPoint(from.lat!!, from.lon!!), GeoPoint(t.lat!!, t.lon!!), -0.15))
                    outlinePaint.color = tripStatus(t.status).color.toArgb(); outlinePaint.strokeWidth = 1.8f * d
                    outlinePaint.pathEffect = DashPathEffect(floatArrayOf(2 * d, 7 * d), 0f); outlinePaint.strokeCap = Paint.Cap.ROUND
                })
            }
        }
        placed.filter { (it.route?.size ?: 0) > 1 }.forEach { t ->
            val pts = t.route!!.mapNotNull { p -> if (p.size >= 2) GeoPoint(p[0], p[1]) else null }
            fun line(color: Int, width: Float, dash: FloatArray? = null) = m.overlays.add(Polyline(m).apply {
                setPoints(pts); outlinePaint.color = color; outlinePaint.strokeWidth = width * d; outlinePaint.strokeCap = Paint.Cap.ROUND
                dash?.let { outlinePaint.pathEffect = DashPathEffect(it.map { v -> v * d }.toFloatArray(), 0f); outlinePaint.strokeCap = Paint.Cap.BUTT }
            })
            when (t.transport) {
                "train" -> { line(0xE61F2937.toInt(), 5.5f); line(0xFFFFFFFF.toInt(), 2.2f, floatArrayOf(8f, 8f)) }
                "car", "bus" -> { line(0x8C7C2D12.toInt(), 5.5f); line(0xFFF97316.toInt(), 3.2f) }
                "bike" -> line(0xFF15803D.toInt(), 3.5f)
                "walk" -> line(0xFF15803D.toInt(), 3.2f, floatArrayOf(1.5f, 6f))
                "ship" -> line(0xFF1D4ED8.toInt(), 2.8f, floatArrayOf(4f, 8f))
                else -> line(0xFF0284C7.toInt(), 2.4f, floatArrayOf(9f, 7f))
            }
            if (t.originLat != null && t.originLon != null) m.overlays.add(Marker(m).apply {
                position = GeoPoint(t.originLat, t.originLon)
                icon = android.graphics.drawable.GradientDrawable().apply {
                    shape = android.graphics.drawable.GradientDrawable.OVAL; setColor(0xFFFFFFFF.toInt()); setStroke((2 * d).toInt(), 0xFF1F2937.toInt())
                    setSize((11 * d).toInt(), (11 * d).toInt())
                }
                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                title = "Откуда: ${t.originName.orEmpty()}"
            })
        }
        placed.forEach { t ->
            val st = tripStatus(t.status)
            val saving = wishes[t.id.toString()].orEmpty().firstOrNull { it.extra.price != null && it.extra.status != "got" }
            m.overlays.add(Marker(m).apply {
                position = GeoPoint(t.lat!!, t.lon!!)
                icon = pinBitmap(context, st.color.toArgb(), t.status == "dream")
                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                title = t.title
                snippet = listOfNotNull("${st.emoji} ${st.label}", saving?.let { "🐷 ${((it.extra.saved ?: 0.0) / it.extra.price!! * 100).toInt()}%" }).joinToString(" · ")
                setOnMarkerClickListener { _, _ -> select(t.id); true }
            })
        }
        if (!fitted && placed.isNotEmpty()) {
            fitted = true
            m.post {
                if (placed.size == 1) { m.controller.setZoom(5.0); m.controller.setCenter(GeoPoint(placed[0].lat!!, placed[0].lon!!)) }
                else runCatching { m.zoomToBoundingBox(BoundingBox.fromGeoPoints(placed.map { GeoPoint(it.lat!!, it.lon!!) }).increaseByScale(1.5f), false) }
            }
        }
        m.invalidate()
    })
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun TripSheet(
    trip: TravelPlan, tagOptions: List<PageTag>, onDismiss: () -> Unit, onDelete: (() -> Unit)?, onOpen: (String) -> Unit,
    onFocus: (GeoPoint) -> Unit, onSave: (JsonObject) -> Unit,
) {
    var title by remember(trip) { mutableStateOf(trip.title.orEmpty()) }
    var location by remember(trip) { mutableStateOf(trip.location.orEmpty()) }
    var lat by remember(trip) { mutableStateOf(trip.lat) }
    var lon by remember(trip) { mutableStateOf(trip.lon) }
    var country by remember(trip) { mutableStateOf(trip.country) }
    var from by remember(trip) { mutableStateOf(trip.dateFrom.orEmpty()) }
    var to by remember(trip) { mutableStateOf(trip.dateTo.orEmpty()) }
    var status by remember(trip) { mutableStateOf(trip.status ?: "planned") }
    var notes by remember(trip) { mutableStateOf(trip.notes.orEmpty()) }
    var tags by remember(trip) { mutableStateOf(trip.tags.map { it.id }.toSet()) }
    var originName by remember(trip) { mutableStateOf(trip.originName.orEmpty()) }
    var originLat by remember(trip) { mutableStateOf(trip.originLat) }
    var originLon by remember(trip) { mutableStateOf(trip.originLon) }
    var transport by remember(trip) { mutableStateOf(trip.transport) }
    var route by remember(trip) { mutableStateOf(trip.route) }
    var routeKm by remember(trip) { mutableStateOf(trip.routeKm) }
    var routeOpen by remember(trip) { mutableStateOf(trip.transport != null || !trip.originName.isNullOrBlank()) }
    var routeBusy by remember { mutableStateOf(false) }
    var routeMsg by remember { mutableStateOf<String?>(null) }
    var originResults by remember { mutableStateOf<List<GeoPlace>>(emptyList()) }
    var originTyped by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(originName, originTyped) {
        if (!originTyped || originName.trim().length < 2) { originResults = emptyList(); return@LaunchedEffect }
        delay(500)
        originResults = runCatching { Api.get<Items<GeoPlace>>("/api/life/travel/geocode?q=" + URLEncoder.encode(originName.trim(), "UTF-8")).items }.getOrDefault(emptyList())
    }
    var confirm by remember { mutableStateOf(false) }
    var results by remember { mutableStateOf<List<GeoPlace>>(emptyList()) }
    var searching by remember { mutableStateOf(false) }
    var typed by remember { mutableStateOf(false) }
    val dateOk = { v: String -> v.isBlank() || runCatching { java.time.LocalDate.parse(v) }.isSuccess }

    LaunchedEffect(location, typed) {
        if (!typed || location.trim().length < 2) { results = emptyList(); return@LaunchedEffect }
        delay(500)
        searching = true
        results = runCatching { Api.get<Items<GeoPlace>>("/api/life/travel/geocode?q=" + URLEncoder.encode(location.trim(), "UTF-8")).items }.getOrDefault(emptyList())
        searching = false
    }

    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Brand.Night, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 18.dp).padding(bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(if (trip.id == 0) "Новая булавка" else "Путешествие", fontSize = 19.sp, fontWeight = FontWeight.Bold)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                TRIP_STATUSES.forEach { s ->
                    Text("${s.emoji} ${s.label}", fontSize = 13.sp, color = Brand.Text,
                        modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(if (status == s.id) s.color.copy(alpha = 0.3f) else Color.Transparent)
                            .border(1.dp, if (status == s.id) s.color else Brand.Ink.copy(alpha = 0.1f), RoundedCornerShape(12.dp))
                            .clickable { status = s.id }.padding(horizontal = 12.dp, vertical = 8.dp))
                }
            }
            OutlinedTextField(title, { title = it }, label = { Text("Название: «Токио», «Байкал зимой»…") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(location, { location = it; typed = true }, label = { Text("Место — город, страна, достопримечательность") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                trailingIcon = { if (searching) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = Brand.Mint) else Text(if (lat != null) "📍" else "", fontSize = 16.sp) })
            results.forEach { p ->
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Brand.Ink.copy(alpha = 0.05f)).clickable {
                    lat = p.lat; lon = p.lon; country = p.country; location = placeLabel(p); typed = false; results = emptyList()
                    if (title.isBlank()) title = p.city ?: p.name
                    onFocus(GeoPoint(p.lat, p.lon))
                }.padding(10.dp)) {
                    Text(p.name, fontSize = 14.sp)
                    Text(p.label, color = Brand.TextFaint, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedTextField(from, { from = it.take(10) }, label = { Text("С (ГГГГ-ММ-ДД)") }, singleLine = true, isError = !dateOk(from), modifier = Modifier.weight(1f))
                OutlinedTextField(to, { to = it.take(10) }, label = { Text("По") }, singleLine = true, isError = !dateOk(to), modifier = Modifier.weight(1f))
            }
            if (!routeOpen) Text("🧭 Добавить маршрут: откуда и на чём", color = Brand.Mint, fontSize = 14.sp, modifier = Modifier.clickable { routeOpen = true }.padding(vertical = 4.dp))
            else Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Brand.Ink.copy(alpha = 0.04f)).padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("🧭 МАРШРУТ", color = Brand.TextMuted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                OutlinedTextField(originName, { originName = it; originTyped = true }, label = { Text("Откуда: город, вокзал, аэропорт") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                    trailingIcon = { Text(if (originLat != null) "📍" else "", fontSize = 16.sp) })
                originResults.forEach { p ->
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Brand.Ink.copy(alpha = 0.05f)).clickable {
                        originLat = p.lat; originLon = p.lon; originName = placeLabel(p); originTyped = false; originResults = emptyList(); route = null; routeKm = null
                    }.padding(10.dp)) {
                        Text(p.name, fontSize = 14.sp)
                        Text(p.label, color = Brand.TextFaint, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    TRANSPORTS.forEach { tr -> TravelPill("${tr.emoji} ${tr.label}", transport == tr.id) { transport = tr.id; route = null; routeKm = null } }
                }
                val canBuild = originLat != null && lat != null && transport != null
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (route != null) "Перестроить" else "Построить маршрут", color = if (canBuild) Brand.Mint else Brand.TextFaint, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clickable(enabled = canBuild && !routeBusy) {
                            scope.launch {
                                routeBusy = true; routeMsg = null
                                runCatching {
                                    Api.decode<RouteResult>(Api.post("/api/life/travel/route", buildJsonObject {
                                        put("transport", transport)
                                        put("from", buildJsonObject { put("lat", originLat!!); put("lon", originLon!!) })
                                        put("to", buildJsonObject { put("lat", lat!!); put("lon", lon!!) })
                                    }))
                                }.onSuccess { r ->
                                    route = r.points; routeKm = r.km
                                    routeMsg = r.warning ?: listOfNotNull(r.km?.let { "${it.toInt()} км" }, r.minutes?.let { "~${it / 60} ч ${it % 60} мин" }, TRANSPORTS.firstOrNull { it.id == transport }?.how).joinToString(" · ")
                                }.onFailure { routeMsg = it.message }
                                routeBusy = false
                            }
                        })
                    if (routeBusy) { Spacer(Modifier.width(8.dp)); CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = Brand.Mint) }
                    Spacer(Modifier.weight(1f))
                    if (route != null) Text("убрать", color = Brand.TextFaint, fontSize = 12.sp, modifier = Modifier.clickable { route = null; routeKm = null; routeMsg = null })
                }
                if (!canBuild) Text("выберите, откуда, куда (место выше) и транспорт", color = Brand.TextFaint, fontSize = 11.sp)
                (routeMsg ?: routeKm?.let { "${it.toInt()} км · ${TRANSPORTS.firstOrNull { t -> t.id == transport }?.how.orEmpty()}" })?.let { Text(it, color = Brand.TextMuted, fontSize = 12.sp) }
            }
            OutlinedTextField(notes, { notes = it }, label = { Text("Заметки: что посмотреть, впечатления…") }, minLines = 2, modifier = Modifier.fillMaxWidth())
            Text("ТЕГИ", color = Brand.TextMuted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
            TagPicker(tagOptions, tags) { id -> tags = if (id in tags) tags - id else tags + id }
            if (trip.id != 0) RelatedSection("travel", trip.id, onOpen)
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (onDelete != null) Text(if (confirm) "Точно удалить?" else "🗑 Удалить", color = Brand.Rose, fontSize = 14.sp,
                    modifier = Modifier.clip(CircleShape).clickable { if (confirm) onDelete() else confirm = true }.padding(vertical = 6.dp))
                Spacer(Modifier.weight(1f))
                val ok = title.isNotBlank() && dateOk(from) && dateOk(to)
                Text("Сохранить", color = Brand.Deep, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(if (ok) Brand.Mint else Brand.Mint.copy(alpha = 0.4f)).clickable(enabled = ok) {
                        onSave(buildJsonObject {
                            put("title", title.trim()); put("location", location.trim()); put("status", status); put("notes", notes.trim())
                            put("date_from", from.ifBlank { null }); put("date_to", to.ifBlank { null })
                            lat?.let { put("lat", it) } ?: put("lat", JsonNull)
                            lon?.let { put("lon", it) } ?: put("lon", JsonNull)
                            put("country", country)
                            put("origin_name", originName.trim().ifBlank { null }); put("transport", transport)
                            originLat?.let { put("origin_lat", it) } ?: put("origin_lat", JsonNull)
                            originLon?.let { put("origin_lon", it) } ?: put("origin_lon", JsonNull)
                            routeKm?.let { put("route_km", it) } ?: put("route_km", JsonNull)
                            route?.let { r -> putJsonArray("route") { r.forEach { p -> add(kotlinx.serialization.json.JsonArray(p.map { kotlinx.serialization.json.JsonPrimitive(it) })) } } } ?: put("route", JsonNull)
                            putJsonArray("tags") { tags.forEach { add(it) } }
                        })
                    }.padding(horizontal = 18.dp, vertical = 10.dp))
            }
        }
    }
}

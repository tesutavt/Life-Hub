import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Карта путешествий: булавки-гвоздики и «верёвочки», как на доске детектива.
// Красная нить связывает места, где был, по порядку дат; пунктир тянется к планам и мечтам.

export type MapTrip = {
  id: number;
  title: string;
  location?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  status?: string | null;
  lat?: number | null;
  lon?: number | null;
  /** накопления на поездку из связанного желания */
  savings?: { price: number; saved: number } | null;
  origin_name?: string | null;
  origin_lat?: number | null;
  origin_lon?: number | null;
  transport?: string | null;
  route?: [number, number][] | null;
  route_km?: number | null;
};

/** Как рисуется путь: поезд — «шпалы» как на картах железных дорог, авто — трасса, самолёт — пунктир-дуга. */
export const TRANSPORT: Record<string, { label: string; emoji: string; how: string }> = {
  train: { label: 'Поезд', emoji: '🚆', how: 'по железной дороге' },
  car: { label: 'Машина', emoji: '🚗', how: 'по дорогам' },
  bus: { label: 'Автобус', emoji: '🚌', how: 'по дорогам' },
  bike: { label: 'Велосипед', emoji: '🚲', how: 'велодорогами' },
  walk: { label: 'Пешком', emoji: '🥾', how: 'пешком' },
  plane: { label: 'Самолёт', emoji: '✈️', how: 'по воздуху' },
  ship: { label: 'Паром', emoji: '⛴️', how: 'по воде' },
};
export const TRANSPORT_LIST = Object.keys(TRANSPORT);

const drawRoute = (layer: L.LayerGroup, t: MapTrip) => {
  const pts = t.route as L.LatLngExpression[];
  const tip = `${TRANSPORT[t.transport || '']?.emoji || ''} ${t.origin_name || ''} → ${t.title}${t.route_km ? ` · ${t.route_km.toLocaleString('ru-RU')} км` : ''}`;
  const add = (opts: L.PolylineOptions) => L.polyline(pts, { interactive: false, lineCap: 'round', lineJoin: 'round', ...opts }).addTo(layer);
  switch (t.transport) {
    case 'train':
      add({ color: '#1f2937', weight: 6, opacity: 0.9 });
      add({ color: '#ffffff', weight: 2.5, dashArray: '9 9', lineCap: 'butt' });
      break;
    case 'car':
    case 'bus':
      add({ color: '#7c2d12', weight: 6, opacity: 0.55 });
      add({ color: '#f97316', weight: 3.5 });
      break;
    case 'bike':
      add({ color: '#15803d', weight: 4 });
      break;
    case 'walk':
      add({ color: '#15803d', weight: 3.5, dashArray: '1 7' });
      break;
    case 'ship':
      add({ color: '#1d4ed8', weight: 3, dashArray: '4 9' });
      break;
    default:
      add({ color: '#0284c7', weight: 2.5, dashArray: '10 8' });
  }
  // невидимая широкая линия — для подсказки при наведении
  L.polyline(pts, { color: '#000', opacity: 0, weight: 14 }).bindTooltip(tip, { sticky: true, className: 'lh-pin-tooltip' }).addTo(layer);
  if (t.transport === 'plane' && pts.length > 2) {
    const mid = t.route![Math.floor(t.route!.length / 2)]!;
    L.marker(mid, { interactive: false, icon: L.divIcon({ className: 'lh-pin', html: '<div style="font-size:18px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))">✈️</div>', iconSize: [20, 20], iconAnchor: [10, 10] }) }).addTo(layer);
  }
  if (t.origin_lat != null && t.origin_lon != null) {
    L.circleMarker([t.origin_lat, t.origin_lon], { radius: 5, color: '#1f2937', weight: 2, fillColor: '#fff', fillOpacity: 1 })
      .bindTooltip(`Откуда: ${t.origin_name || ''}`, { className: 'lh-pin-tooltip', direction: 'top' })
      .addTo(layer);
  }
};

export const TRAVEL_STATUS: Record<string, { label: string; color: string; emoji: string }> = {
  done: { label: 'Был', color: '#e11d48', emoji: '📍' },
  planned: { label: 'Планирую', color: '#3b82f6', emoji: '🧳' },
  dream: { label: 'Мечтаю', color: '#f59e0b', emoji: '⭐' },
  cancelled: { label: 'Отменено', color: '#94a3b8', emoji: '✖️' },
};

export const travelStatus = (s?: string | null) => TRAVEL_STATUS[s || 'planned'] ?? { label: 'Планирую', color: '#3b82f6', emoji: '🧳' };

const pinIcon = (color: string, dream: boolean) =>
  L.divIcon({
    className: 'lh-pin',
    iconSize: [26, 38],
    iconAnchor: [13, 36],
    tooltipAnchor: [0, -34],
    html: `<svg width="26" height="38" viewBox="0 0 26 38" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;filter:drop-shadow(2px 4px 2px rgba(0,0,0,.45))">
      <line x1="13" y1="16" x2="13" y2="36" stroke="#9ca3af" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="13.6" y1="16" x2="13.6" y2="35" stroke="#e5e7eb" stroke-width=".7"/>
      ${dream
        ? `<path d="M13 1.5l3.4 6.9 7.6 1.1-5.5 5.4 1.3 7.6L13 18.9l-6.8 3.6 1.3-7.6L2 9.5l7.6-1.1z" fill="${color}" stroke="rgba(0,0,0,.35)" stroke-width="1"/>`
        : `<circle cx="13" cy="10" r="9" fill="${color}" stroke="rgba(0,0,0,.35)" stroke-width="1"/>`}
      <circle cx="10" cy="7" r="3" fill="rgba(255,255,255,.55)"/>
    </svg>`,
  });

/** Плавная дуга между двумя точками — нить провисает, а не идёт по линейке. */
const arc = (a: L.LatLng, b: L.LatLng, bend = 0.18): L.LatLngExpression[] => {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  const mx = (a.lng + b.lng) / 2 - dy * bend;
  const my = (a.lat + b.lat) / 2 + dx * bend;
  const pts: L.LatLngExpression[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const u = 1 - t;
    pts.push([u * u * a.lat + 2 * u * t * my + t * t * b.lat, u * u * a.lng + 2 * u * t * mx + t * t * b.lng]);
  }
  return pts;
};

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export default function TravelMap({
  trips,
  onPick,
  onSelect,
  focus,
  className,
}: {
  trips: MapTrip[];
  onPick?: (lat: number, lon: number) => void;
  onSelect?: (id: number) => void;
  focus?: { lat: number; lon: number } | null;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const fittedRef = useRef(false);
  const handlers = useRef({ onPick, onSelect });
  handlers.current = { onPick, onSelect };

  useEffect(() => {
    if (!boxRef.current || mapRef.current) return;
    const map = L.map(boxRef.current, { worldCopyJump: true, minZoom: 2, zoomControl: true, attributionControl: true }).setView([45, 40], 3);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
      className: 'lh-vintage-tiles',
    }).addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => handlers.current.onPick?.(e.latlng.lat, ((e.latlng.lng + 540) % 360) - 180));
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // карта внутри анимированных контейнеров — пересчитать размер, когда раскладка устоится
    const t = window.setTimeout(() => map.invalidateSize(), 300);
    return () => {
      window.clearTimeout(t);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const placed = trips.filter((t) => Number.isFinite(t.lat) && Number.isFinite(t.lon) && t.lat !== null && t.lon !== null);

    const visited = placed
      .filter((t) => t.status === 'done')
      .sort((a, b) => String(a.date_from || a.date_to || '').localeCompare(String(b.date_from || b.date_to || '')));
    // нить «где был»: тень + красная пряжа
    for (let i = 1; i < visited.length; i++) {
      const a = visited[i - 1]!;
      const b = visited[i]!;
      // к поездке с настоящим маршрутом нить не тянем — путь уже нарисован
      if (Array.isArray(b.route) && b.route.length > 1) continue;
      const pts = arc(L.latLng(a.lat!, a.lon!), L.latLng(b.lat!, b.lon!));
      L.polyline(pts, { color: '#000', weight: 5, opacity: 0.18, interactive: false }).addTo(layer);
      L.polyline(pts, { color: '#c81e3a', weight: 2.4, opacity: 0.95, interactive: false, lineCap: 'round' }).addTo(layer);
    }
    // пунктир к планам и мечтам — от последнего места, где был
    const from = visited[visited.length - 1];
    if (from) {
      placed
        .filter((t) => t.status === 'planned' || t.status === 'dream')
        .forEach((t) => {
          const pts = arc(L.latLng(from.lat!, from.lon!), L.latLng(t.lat!, t.lon!), -0.15);
          L.polyline(pts, { color: travelStatus(t.status!).color, weight: 1.8, opacity: 0.85, dashArray: '2 7', lineCap: 'round', interactive: false }).addTo(layer);
        });
    }

    // сначала маршруты — булавки ложатся поверх
    placed.filter((t) => Array.isArray(t.route) && t.route.length > 1).forEach((t) => drawRoute(layer, t));

    placed.forEach((t) => {
      const st = travelStatus(t.status || 'planned');
      const dates = [fmt(t.date_from), fmt(t.date_to)].filter(Boolean).join(' — ');
      const marker = L.marker([t.lat!, t.lon!], { icon: pinIcon(st.color, t.status === 'dream'), riseOnHover: true }).addTo(layer);
      marker.bindTooltip(
        `<div class="lh-pin-note"><b>${escapeHtml(t.title || t.location || '')}</b>${t.location && t.location !== t.title ? `<div>${escapeHtml(t.location)}</div>` : ''}<div class="lh-pin-meta">${st.emoji} ${st.label}${dates ? ' · ' + dates : ''}</div>${t.savings ? `<div class="lh-pin-meta">🐷 накоплено ${Math.min(100, Math.round((t.savings.saved / t.savings.price) * 100))}%</div>` : ''}</div>`,
        { direction: 'top', className: 'lh-pin-tooltip', opacity: 1 }
      );
      marker.on('click', () => handlers.current.onSelect?.(t.id));
    });

    if (!fittedRef.current && placed.length) {
      fittedRef.current = true;
      const bounds = L.latLngBounds(placed.map((t) => [t.lat!, t.lon!] as [number, number]));
      map.fitBounds(bounds.pad(0.35), { maxZoom: 6 });
    }
  }, [trips]);

  useEffect(() => {
    if (focus && mapRef.current) mapRef.current.flyTo([focus.lat, focus.lon], Math.max(mapRef.current.getZoom(), 6), { duration: 0.8 });
  }, [focus]);

  return <div ref={boxRef} className={className} data-no-invert />;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

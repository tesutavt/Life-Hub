import React, { useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { Loader2, MapPin, Search } from 'lucide-react';
import Shell from '../components/Shell';
import { api } from '../api';
import TagBadge from '../components/tags/TagBadge';
import { Modal } from '../components/ui/Modal';
import TagSelector from '../components/tags/TagSelector';

import TravelMap, { TRANSPORT, TRANSPORT_LIST, travelStatus } from '../components/travel/TravelMap';
import { useReorderableList } from '../hooks/useReorderableList';
import RelatedPanel, { RelatedItem, SavingsBar } from '../components/links/RelatedPanel';

type TagOption = { id: number; label: string; color: string };

type Travel = {
  id:number;
  title:string;
  location?:string;
  date_from?:string;
  date_to?:string;
  status?:string;
  notes?:string|null;
  lat?:number|null;
  lon?:number|null;
  country?:string|null;
  origin_name?:string|null;
  origin_lat?:number|null;
  origin_lon?:number|null;
  transport?:string|null;
  route?:[number, number][]|null;
  route_km?:number|null;
  tags: TagOption[];
};

type Place = { name: string; label: string; lat: number; lon: number; country: string | null; city: string | null };

const STATUS_ORDER = ['done', 'planned', 'dream', 'cancelled'];

export default function Travel(){
  const [items, setItems] = useState<Travel[]>([]);
  const [editing, setEditing] = useState<Partial<Travel>|null>(null);
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  const [editingTagIds, setEditingTagIds] = useState<number[]>([]);
  const [focus, setFocus] = useState<{ lat: number; lon: number } | null>(null);
  const [filter, setFilter] = useState<string>('all');
  // Копилки из вишлиста, связанные с поездками (общим тегом или вручную)
  const [wishes, setWishes] = useState<Record<number, RelatedItem[]>>({});
  const loadWishes = () => api.get('/api/life/links/related-bulk?type=travel&target=wish', { silentError: true }).then((res) => setWishes(res?.items || {})).catch(() => {});
  const mapTrips = useMemo(() => items.map((t) => {
    const w = (wishes[t.id] || []).find((x) => x.extra?.price && x.extra?.status !== 'got');
    return w ? { ...t, savings: { price: w.extra!.price!, saved: w.extra!.saved || 0 } } : t;
  }), [items, wishes]);

  const shown = useMemo(() => (filter === 'all' ? items : items.filter((t) => (t.status || 'planned') === filter)), [items, filter]);
  const travelLayout = useReorderableList<Travel>('travel:items', shown, (travel) => travel.id);

  const mapTravel = (row: any): Travel => ({
    id: row.id,
    title: row.title,
    location: row.location,
    date_from: row.date_from,
    date_to: row.date_to,
    status: row.status,
    notes: row.notes,
    lat: row.lat,
    lon: row.lon,
    country: row.country,
    origin_name: row.origin_name,
    origin_lat: row.origin_lat,
    origin_lon: row.origin_lon,
    transport: row.transport,
    route: row.route,
    route_km: row.route_km,
    tags: Array.isArray(row?.tags)
      ? row.tags.map((tag: any) => ({ id: tag.id, label: tag.label, color: tag.color }))
      : [],
  });

  const load = async()=>{
    const r = await api.get('/api/life/travel');
    const list = Array.isArray(r?.items) ? r.items : Array.isArray(r) ? r : [];
    setItems(list.map(mapTravel));
  };

  const loadTagOptions = async () => {
    const res = await api.get('/api/life/pages/tags', { silentError: true });
    const options = (res.items || []).map((tag: any) => ({
      id: tag.id,
      label: tag.label,
      color: tag.color,
    }));
    setTagOptions(options);
  };

  useEffect(()=>{ load(); loadTagOptions(); loadWishes(); },[]);

  const stats = useMemo(() => {
    const done = items.filter((t) => t.status === 'done');
    const countries = new Set(done.map((t) => t.country).filter(Boolean));
    return { done: done.length, countries: countries.size, planned: items.filter((t) => t.status === 'planned').length, dream: items.filter((t) => t.status === 'dream').length };
  }, [items]);

  const openEditor = (t: Partial<Travel>) => {
    setEditing(t);
    setEditingTagIds((t.tags || []).map((tag) => tag.id));
  };

  // Клик по карте — новая булавка: сразу узнаём, что это за место
  const pickOnMap = async (lat: number, lon: number) => {
    openEditor({ title: '', location: '', lat, lon, status: 'dream', tags: [] });
    try {
      const res = await api.get(`/api/life/travel/reverse?lat=${lat}&lon=${lon}`, { silentError: true });
      const p: Place | undefined = res?.place;
      if (p?.name) setEditing((cur) => (cur && !cur.id && cur.lat === lat ? { ...cur, title: cur.title || p.city || p.name, location: placeLabel(p), country: p.country } : cur));
    } catch {
      // без названия — пользователь впишет сам
    }
  };

  const save = async()=>{
    if(!editing || !editing.title?.trim()) return;
    const body = { ...editing, tags: editingTagIds };
    if (editing.id) await api.put('/api/life/travel/'+editing.id, body);
    else await api.post('/api/life/travel', body, { notifySuccess: 'Булавка на карте 📍' });
    setEditing(null);
    setEditingTagIds([]);
    await load();
    loadWishes();
  };

  const del = async(id:number)=>{ if(!confirm('Удалить поездку?')) return; await api.del('/api/life/travel/'+id); setEditing(null); await load(); };

  return (
    <Shell>
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="text-2xl font-semibold">Путешествия</div>
          <div className="text-sm text-white/55">
            {stats.done || stats.planned || stats.dream
              ? `Побывал: ${stats.done} ${stats.countries ? `· стран: ${stats.countries}` : ''} · в планах ${stats.planned} · мечтаю ${stats.dream}`
              : 'Нажмите на карту, чтобы воткнуть булавку: где был, куда собираетесь, о чём мечтаете.'}
          </div>
        </div>
        <button type="button" onClick={() => openEditor({ title: '', location: '', status: 'planned', tags: [] })} className="rounded-2xl bg-brand-mint px-4 py-2 text-sm font-semibold text-brand-deep shadow-brand-glow">
          + Добавить место
        </button>
      </div>

      {/* Карта-доска */}
      {/* isolate: слои Leaflet (z-index 400–1000) не должны перекрывать окна редактирования */}
      <div className="relative isolate z-0 mb-6 overflow-hidden rounded-[28px] shadow-[0_25px_60px_rgba(0,0,0,0.45)]" style={{ border: '10px solid #5b3820' }}>
        <TravelMap trips={mapTrips} focus={focus} onPick={pickOnMap} onSelect={(id) => { const t = items.find((x) => x.id === id); if (t) openEditor(t); }} className="h-[520px] w-full" />
        <div className="pointer-events-none absolute bottom-3 left-3 z-[400] flex flex-wrap gap-2 text-xs">
          {['done', 'planned', 'dream'].map((s) => (
            <span key={s} className="flex items-center gap-1.5 rounded-full bg-[#fdfbf6]/95 px-2.5 py-1 font-medium text-slate-700 shadow" data-no-invert>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: travelStatus(s).color }} /> {travelStatus(s).label}
            </span>
          ))}
          <span className="rounded-full bg-[#fdfbf6]/95 px-2.5 py-1 text-slate-500 shadow" data-no-invert>клик по карте — новая булавка</span>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {['all', ...STATUS_ORDER].map((s) => (
          <button key={s} type="button" onClick={() => setFilter(s)} className={classNames('rounded-full border px-3 py-1.5 text-sm transition', filter === s ? 'border-brand-mint bg-brand-mint/20 text-white' : 'border-white/10 text-white/70 hover:bg-white/5')}>
            {s === 'all' ? '🗺️ Все' : `${travelStatus(s).emoji} ${travelStatus(s).label}`}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4" {...travelLayout.getContainerProps()}>
        {travelLayout.items.map(t => {
          const dragProps = travelLayout.getDraggableProps(t.id);
          const isDragging = travelLayout.activeId === String(t.id);
          const isDropTarget = travelLayout.overId === String(t.id) && !isDragging;
          const st = travelStatus(t.status || 'planned');
          return (
            <div
              key={t.id}
              {...dragProps}
              data-dragging={isDragging ? 'true' : undefined}
              data-drop-target={isDropTarget ? 'true' : undefined}
              className={classNames(
                'p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2 transition-all duration-200 ease-out select-none',
                { 'cursor-grab active:cursor-grabbing': dragProps.draggable },
                {
                  'ring-2 ring-white/70 border-white/40 scale-[0.99] shadow-lg shadow-black/40': isDragging,
                  'border-white/30 ring-1 ring-white/40': isDropTarget,
                },
              )}
            >
            <div className="flex items-center justify-between gap-2">
              <div className="text-lg font-semibold">{t.title}</div>
              <span className="shrink-0 rounded-full px-2 py-0.5 text-xs text-white" style={{ background: `${st.color}55`, border: `1px solid ${st.color}` }}>{st.emoji} {st.label}</span>
            </div>
            <div className="text-sm opacity-80">{t.location}</div>
            {t.date_from || t.date_to ? <div className="text-xs opacity-70">{t.date_from} — {t.date_to}</div> : null}
            {t.notes ? <div className="line-clamp-2 text-xs text-white/60">{t.notes}</div> : null}
            {(wishes[t.id] || []).filter((w) => w.extra?.status !== 'got').map((w) => (
              <div key={w.id} className="rounded-lg bg-white/[0.04] px-2 py-1.5 text-xs text-white/75">
                🐷 {w.title}
                <SavingsBar price={w.extra?.price} saved={w.extra?.saved} currency={w.extra?.currency} compact />
              </div>
            ))}
            {t.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 text-xs">
                {t.tags.map((tag) => (
                  <TagBadge key={tag.id} tag={tag} compact />
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 text-xs">
              {t.lat !== null && t.lat !== undefined ? (
                <button onClick={() => setFocus({ lat: t.lat!, lon: t.lon! })} className="flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/20" title="Показать на карте">
                  <MapPin className="h-3.5 w-3.5" /> На карте
                </button>
              ) : (
                <span className="text-white/40">нет на карте</span>
              )}
              <button onClick={() => openEditor(t)} className="ml-auto px-2 py-1 rounded bg-white/10 hover:bg-white/20">✎</button>
              <button onClick={()=>del(t.id)} className="px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/40">Удалить</button>
            </div>
            </div>
          );
        })}
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => { setEditing(null); setEditingTagIds([]); }}
        showCloseButton
        contentClassName="w-full max-w-md space-y-3 rounded-2xl border border-white/20 bg-brand-night p-6 shadow-2xl max-h-[90vh] overflow-auto"
      >
        {editing && (
          <>
            <div className="pr-8 text-lg font-medium">{editing.id ? 'Путешествие' : 'Новая булавка'}</div>
            <div className="grid grid-cols-3 gap-2">
              {['done', 'planned', 'dream'].map((s) => (
                <button key={s} type="button" onClick={() => setEditing({ ...editing, status: s })} className={classNames('rounded-xl border px-2 py-2 text-sm', (editing.status || 'planned') === s ? 'text-white' : 'border-white/10 text-white/60 hover:bg-white/5')} style={(editing.status || 'planned') === s ? { borderColor: travelStatus(s).color, background: `${travelStatus(s).color}33` } : undefined}>
                  {travelStatus(s).emoji} {travelStatus(s).label}
                </button>
              ))}
            </div>
            <input
              className="px-3 py-2 rounded bg-white/10 w-full"
              placeholder="Название: «Токио», «Байкал зимой»…"
              value={editing.title || ''}
              onChange={e => setEditing({ ...editing, title:e.target.value })}
            />
            <PlaceSearch
              value={editing.location || ''}
              hasCoords={editing.lat !== null && editing.lat !== undefined}
              onText={(location) => setEditing({ ...editing, location })}
              onPlace={(p) => {
                setEditing({ ...editing, title: editing.title || p.city || p.name, location: placeLabel(p), lat: p.lat, lon: p.lon, country: p.country });
                setFocus({ lat: p.lat, lon: p.lon });
              }}
            />
            <RouteSection trip={editing} onChange={(patch) => setEditing((cur) => (cur ? { ...cur, ...patch } : cur))} />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                className="px-3 py-2 rounded bg-white/10 w-full"
                value={editing.date_from||''}
                onChange={e => setEditing({ ...editing, date_from:e.target.value })}
              />
              <input
                type="date"
                className="px-3 py-2 rounded bg-white/10 w-full"
                value={editing.date_to||''}
                onChange={e => setEditing({ ...editing, date_to:e.target.value })}
              />
            </div>
            <textarea
              className="h-20 px-3 py-2 rounded bg-white/10 w-full"
              placeholder="Заметки: что посмотреть, впечатления…"
              value={editing.notes || ''}
              onChange={e => setEditing({ ...editing, notes: e.target.value })}
            />
            {editing.status === 'cancelled' ? <div className="text-xs text-white/50">Поездка отмечена как отменённая.</div> : null}
            <TagSelector
              tags={tagOptions}
              selectedIds={editingTagIds}
              onChange={setEditingTagIds}
              label="Теги путешествия"
              emptyState="Нет доступных тэгов. Создайте их на странице Страницы."
              onManageTags={() => window.open('/pages', '_blank')}
            />
            {editing.id ? <RelatedPanel type="travel" id={editing.id} /> : null}
            <div className="flex justify-between gap-2">
              {editing.id ? (
                <button onClick={() => del(editing.id!)} className="px-3 py-2 rounded bg-red-500/20 hover:bg-red-500/40">Удалить</button>
              ) : (
                <button onClick={() => { setEditing(null); setEditingTagIds([]); }} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20">Отмена</button>
              )}
              <button disabled={!editing.title?.trim()} onClick={save} className="px-4 py-2 rounded bg-brand-mint font-semibold text-brand-deep disabled:opacity-40">Сохранить</button>
            </div>
          </>
        )}
      </Modal>
    </Shell>
  );
}

const placeLabel = (p: Place) => [p.city && p.city !== p.name ? p.name : null, p.city || p.name, p.country].filter(Boolean).join(', ');

/** Откуда и как добирались: маршрут рисуется на карте — поезд по железной дороге, авто по трассе, самолёт дугой. */
function RouteSection({ trip, onChange }: { trip: Partial<Travel>; onChange: (patch: Partial<Travel>) => void }) {
  const [open, setOpen] = useState(!!trip.transport || !!trip.origin_name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const canBuild = trip.origin_lat != null && trip.lat != null && !!trip.transport;
  const build = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post('/api/life/travel/route', { transport: trip.transport, from: { lat: trip.origin_lat, lon: trip.origin_lon }, to: { lat: trip.lat, lon: trip.lon } }, { silentSuccess: true, silentError: true });
      onChange({ route: res.points, route_km: res.km });
      setEta(res.minutes ?? null);
      if (res.warning) setError(res.warning);
    } catch (e: any) {
      setError(e?.message || 'Не удалось построить маршрут');
    } finally {
      setBusy(false);
    }
  };
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-left text-sm text-brand-mint hover:underline">
        🧭 Добавить маршрут: откуда и на чём
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-white/50">🧭 Маршрут</div>
      <PlaceSearch
        value={trip.origin_name || ''}
        hasCoords={trip.origin_lat != null}
        placeholder="Откуда: город, вокзал, аэропорт"
        onText={(origin_name) => onChange({ origin_name })}
        onPlace={(p) => onChange({ origin_name: placeLabel(p), origin_lat: p.lat, origin_lon: p.lon, route: null, route_km: null })}
      />
      <div className="flex flex-wrap gap-1.5">
        {TRANSPORT_LIST.map((t) => (
          <button key={t} type="button" onClick={() => onChange({ transport: t, route: null, route_km: null })} className={classNames('rounded-full px-2.5 py-1 text-xs transition', trip.transport === t ? 'bg-brand-mint text-brand-deep' : 'bg-white/5 text-white/70 hover:bg-white/10')}>
            {TRANSPORT[t]?.emoji} {TRANSPORT[t]?.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" disabled={!canBuild || busy} onClick={build} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20 disabled:opacity-40">
          {busy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : trip.route ? 'Перестроить' : 'Построить маршрут'}
        </button>
        {trip.route && trip.route_km ? (
          <span className="text-xs text-white/60">
            {trip.route_km.toLocaleString('ru-RU')} км{eta ? ` · ~${Math.floor(eta / 60)} ч ${eta % 60} мин` : ''} · {TRANSPORT[trip.transport || 'car']?.how}
          </span>
        ) : !canBuild ? (
          <span className="text-xs text-white/40">выберите откуда, куда (место выше) и транспорт</span>
        ) : null}
        {trip.route ? <button type="button" onClick={() => onChange({ route: null, route_km: null })} className="ml-auto text-xs text-white/40 hover:text-rose-300">убрать</button> : null}
      </div>
      {error ? <div className="text-xs text-rose-300">{error}</div> : null}
    </div>
  );
}

function PlaceSearch({ value, hasCoords, onText, onPlace, placeholder }: { value: string; hasCoords: boolean; onText: (v: string) => void; onPlace: (p: Place) => void; placeholder?: string }) {
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);

  const search = (q: string) => {
    onText(q);
    setOpen(true);
    if (timer.current) window.clearTimeout(timer.current);
    if (q.trim().length < 2) return setResults([]);
    timer.current = window.setTimeout(async () => {
      setBusy(true);
      setError(null);
      try {
        const res = await api.get(`/api/life/travel/geocode?q=${encodeURIComponent(q.trim())}`, { silentError: true });
        setResults(Array.isArray(res?.items) ? res.items : []);
      } catch (e: any) {
        setError(e?.message || 'Карта не ответила');
      } finally {
        setBusy(false);
      }
    }, 500);
  };

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
      <input
        className="w-full rounded bg-white/10 px-3 py-2 pl-9 pr-9"
        placeholder={placeholder || "Куда: город, страна, достопримечательность"}
        value={value}
        onChange={(e) => search(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2" title={hasCoords ? 'Место отмечено на карте' : 'Пока не на карте'}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-white/50" /> : <MapPin className={classNames('h-4 w-4', hasCoords ? 'text-rose-400' : 'text-white/25')} />}
      </span>
      {open && (results.length || error) ? (
        <div className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-white/10 bg-brand-night shadow-xl">
          {error ? <div className="px-3 py-2 text-xs text-rose-300">{error}</div> : null}
          {results.map((p, i) => (
            <button
              key={`${p.lat}-${p.lon}-${i}`}
              type="button"
              onClick={() => {
                onPlace(p);
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-white/10"
            >
              <div className="text-white">{p.name}</div>
              <div className="truncate text-xs text-white/45">{p.label}</div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Loader2, Plus, RefreshCw, Search, Star, Trash2, X } from 'lucide-react';
import Shell from '../components/Shell';
import { api } from '../api';
import { Modal } from '../components/ui/Modal';
import FallbackImg from '../components/FallbackImg';
import TagSelector from '../components/tags/TagSelector';
import { useTagOptions, TagOption } from '../components/tags/useTagOptions';
import RelatedPanel from '../components/links/RelatedPanel';
import { useShelfIntegrations } from './settings/sections/ShelfIntegrations';
import { useNavigate } from 'react-router-dom';

// Полка: книги и манга стоят корешками, фильмы/аниме/сериалы/игры — коробками, музыка — CD.
// Нажатие на предмет открывает карточку со сведениями из открытых баз (Shikimori, Open Library, TVMaze, Steam, Википедия).

export type ShelfKind = 'book' | 'manga' | 'anime' | 'movie' | 'series' | 'game' | 'music';
export type ShelfStatus = 'planned' | 'active' | 'paused' | 'done' | 'dropped';

export type ShelfItem = {
  id: number;
  kind: ShelfKind;
  title: string;
  author?: string | null;
  year?: number | null;
  cover_url?: string | null;
  description?: string | null;
  source?: string | null;
  external_id?: string | null;
  external_url?: string | null;
  status: ShelfStatus;
  rating?: number | null;
  notes?: string | null;
  meta?: { score?: number | null; episodes?: number | null; chapters?: number | null; volumes?: number | null; pages?: number | null; progress?: number | null; hours?: number | null; last_played?: string | null; genres?: string[]; type?: string | null; original_title?: string };
  tags?: TagOption[];
};

type SearchResult = Omit<ShelfItem, 'id' | 'status'> & { original_title?: string; summary_en?: string | null };

export const KINDS: { id: ShelfKind; label: string; emoji: string; verb: string }[] = [
  { id: 'book', label: 'Книги', emoji: '📚', verb: 'читаю' },
  { id: 'manga', label: 'Манга', emoji: '📖', verb: 'читаю' },
  { id: 'anime', label: 'Аниме', emoji: '🌸', verb: 'смотрю' },
  { id: 'movie', label: 'Фильмы', emoji: '🎬', verb: 'смотрю' },
  { id: 'series', label: 'Сериалы', emoji: '📺', verb: 'смотрю' },
  { id: 'game', label: 'Игры', emoji: '🎮', verb: 'играю' },
  { id: 'music', label: 'Музыка', emoji: '💿', verb: 'слушаю' },
];

const STATUS: { id: ShelfStatus; label: string; badge: string }[] = [
  { id: 'planned', label: 'Хочу', badge: '🔖' },
  { id: 'active', label: 'В процессе', badge: '⏳' },
  { id: 'paused', label: 'Отложено', badge: '⏸️' },
  { id: 'done', label: 'Готово', badge: '✅' },
  { id: 'dropped', label: 'Брошено', badge: '💤' },
];

const SPINE_COLORS = ['#7f1d1d', '#1e3a8a', '#14532d', '#713f12', '#4a044e', '#0f766e', '#7c2d12', '#334155', '#831843', '#3f6212', '#1e1b4b', '#78350f'];

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const isSpine = (kind: ShelfKind) => kind === 'book' || kind === 'manga';

/** Корешок книги или тома манги. */
function Spine({ item, onClick }: { item: ShelfItem; onClick: () => void }) {
  const h = hash(item.title);
  const color = SPINE_COLORS[h % SPINE_COLORS.length];
  const height = 168 + (h % 36);
  const width = item.kind === 'manga' ? 34 : 36 + Math.min(22, Math.round((item.meta?.pages || 200 + (h % 300)) / 40));
  const manga = item.kind === 'manga';
  return (
    <button
      type="button"
      onClick={onClick}
      title={item.title}
      className="group relative shrink-0 transition-transform duration-200 hover:-translate-y-4 hover:-rotate-2 focus:-translate-y-4"
      style={{ width, height }}
    >
      <div
        className="absolute inset-0 overflow-hidden rounded-[3px] shadow-[inset_-6px_0_10px_rgba(0,0,0,0.35),inset_3px_0_4px_rgba(255,255,255,0.12),2px_0_6px_rgba(0,0,0,0.4)]"
        style={{ background: manga ? `linear-gradient(90deg, #f5f0e6 0%, #fffaf0 40%, #e9e1d2 100%)` : `linear-gradient(90deg, ${color} 0%, ${color}dd 45%, ${color} 100%)` }}
      >
        {manga ? <FallbackImg src={item.cover_url} className="absolute inset-x-0 top-0 h-14 w-full object-cover opacity-90" fallback={null} /> : null}
        {!manga ? (
          <>
            <div className="absolute inset-x-0 top-3 h-[3px] bg-amber-300/70" />
            <div className="absolute inset-x-0 top-[18px] h-[1px] bg-amber-300/50" />
            <div className="absolute inset-x-0 bottom-4 h-[3px] bg-amber-300/70" />
          </>
        ) : null}
        <div
          className={`absolute left-1/2 top-1/2 max-h-[72%] -translate-x-1/2 -translate-y-1/2 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-semibold tracking-wide ${manga ? 'text-slate-800' : 'text-amber-50/90'}`}
          style={{ writingMode: 'vertical-rl', marginTop: manga ? 16 : 0 }}
        >
          {item.title}
        </div>
      </div>
      <StatusSticker status={item.status} />
    </button>
  );
}

/** Коробка фильма/аниме/сериала/игры или CD с музыкой. */
function Case({ item, onClick }: { item: ShelfItem; onClick: () => void }) {
  const cd = item.kind === 'music';
  const [broken, setBroken] = useState(false);
  const w = cd ? 150 : 124;
  const hgt = cd ? 150 : 176;
  return (
    <button type="button" onClick={onClick} title={item.title} className="group relative shrink-0 transition-transform duration-200 hover:-translate-y-3 focus:-translate-y-3" style={{ width: w, height: hgt }}>
      {cd ? (
        <div className="absolute right-[-26px] top-[8px] h-[134px] w-[134px] rounded-full bg-[conic-gradient(from_0deg,#e5e7eb,#a5b4fc,#f0abfc,#fde68a,#a7f3d0,#e5e7eb)] opacity-0 shadow-lg transition-all duration-300 group-hover:right-[-56px] group-hover:opacity-100">
          <div className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-200 ring-4 ring-neutral-400/60" />
        </div>
      ) : null}
      <div className="absolute inset-0 overflow-hidden rounded-[4px] bg-neutral-900 shadow-[4px_4px_10px_rgba(0,0,0,0.5)]">
        {item.cover_url && !broken ? (
          <img src={item.cover_url} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-3 text-center text-xs text-white/70" style={{ background: SPINE_COLORS[hash(item.title) % SPINE_COLORS.length] }}>
            {item.title}
          </div>
        )}
        {/* пластиковый корешок и блик */}
        {!cd ? <div className="absolute inset-y-0 left-0 w-[9px] bg-gradient-to-r from-black/70 via-black/40 to-black/10" /> : null}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-transparent" />
      </div>
      <StatusSticker status={item.status} />
    </button>
  );
}

function StatusSticker({ status }: { status: ShelfStatus }) {
  if (status === 'planned') return null;
  const s = STATUS.find((x) => x.id === status);
  return <span className="absolute -right-1 -top-2 z-10 rounded-full bg-black/60 px-1 text-xs shadow">{s?.badge}</span>;
}

const MODAL_CONTENT = 'w-full max-w-3xl max-h-[88vh] overflow-auto rounded-3xl border border-white/10 bg-brand-night p-6 shadow-2xl';

const DECOR = ['🪴', '🕯️', '☕', '🧸', '🌵', '🍵', '🦉', '🎐'];

export default function Shelf() {
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<ShelfKind | 'all'>('all');
  const [status, setStatus] = useState<ShelfStatus | 'all'>('all');
  const [tagFilter, setTagFilter] = useState<number | null>(null);
  const tagOptions = useTagOptions();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<ShelfItem | null>(null);
  const [adding, setAdding] = useState(false);
  const { state: integrations, reload: reloadIntegrations } = useShelfIntegrations();
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState(false);
  const [expanded, setExpanded] = useState<ShelfKind[]>([]);

  const load = async () => {
    try {
      const res = await api.get('/api/life/shelf');
      setItems(Array.isArray(res?.items) ? res.items : []);
    } finally {
      setLoading(false);
    }
  };

  // Shikimori и Steam (подключаются в Настройках → Интеграции) — обновить всё подключённое разом
  const connected = [integrations.shikimori.nickname ? 'Shikimori' : null, integrations.steam.steam_id ? 'Steam' : null].filter(Boolean) as string[];
  const syncAll = async (silent: boolean) => {
    setSyncing(true);
    try {
      const res = await api.post('/api/life/shelf/integrations/sync', undefined, silent ? { silentSuccess: true, silentError: true } : { notifySuccess: 'Полка обновлена' });
      const changed = ['shikimori', 'steam'].some((k) => res?.[k]?.added || res?.[k]?.updated);
      if (changed) await load();
      reloadIntegrations();
    } catch {
      // нет связи с сайтами — полка остаётся как есть
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);
  // Списки на Shikimori и в Steam меняются вне Life Hub — подтягиваем, если давно не обновляли
  const autoSynced = React.useRef(false);
  useEffect(() => {
    if (autoSynced.current || !connected.length) return;
    autoSynced.current = true;
    const stamps = [integrations.shikimori.nickname ? integrations.shikimori.synced_at : null, integrations.steam.steam_id ? integrations.steam.synced_at : null];
    const stale = stamps.some((t, i) => (i === 0 ? integrations.shikimori.nickname : integrations.steam.steam_id) && (!t || Date.now() - new Date(t).getTime() > 15 * 60 * 1000));
    if (stale) syncAll(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected.length]);

  const filtered = useMemo(
    () =>
      items.filter(
        (x) =>
          (kind === 'all' || x.kind === kind) &&
          (status === 'all' || x.status === status) &&
          (!tagFilter || (x.tags || []).some((t) => t.id === tagFilter)) &&
          (!query.trim() || `${x.title} ${x.author || ''}`.toLowerCase().includes(query.trim().toLowerCase()))
      ),
    [items, kind, status, query, tagFilter]
  );
  const usedTags = useMemo(() => tagOptions.filter((t) => items.some((x) => (x.tags || []).some((xt) => xt.id === t.id))), [items, tagOptions]);

  // Ряды полки: книги и манга отдельно от коробок, чтобы стеллаж выглядел аккуратно
  const groups = useMemo(() => {
    const order = KINDS.map((k) => k.id);
    // то, чем занят сейчас, — на виду, в начале полки
    const rank: Record<ShelfStatus, number> = { active: 0, paused: 1, planned: 2, done: 3, dropped: 4 };
    return order
      .map((k) => ({ kind: k, list: filtered.filter((x) => x.kind === k).sort((a, b) => rank[a.status] - rank[b.status]) }))
      .filter((g) => g.list.length);
  }, [filtered]);

  const stats = useMemo(() => {
    const year = new Date().getFullYear();
    return { total: items.length, done: items.filter((x) => x.status === 'done').length, active: items.filter((x) => x.status === 'active').length, year };
  }, [items]);

  const update = async (id: number, patch: Partial<ShelfItem>) => {
    setItems((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    setOpen((cur) => (cur && cur.id === id ? { ...cur, ...patch } : cur));
    await api.put(`/api/life/shelf/${id}`, patch, { silentSuccess: true });
  };

  // Теги — общие для всего приложения; сервер возвращает вещь с уже разрешёнными тегами
  const setTags = async (id: number, ids: number[]) => {
    const res = await api.put(`/api/life/shelf/${id}`, { tags: ids }, { silentSuccess: true });
    if (!res?.item) return;
    setItems((list) => list.map((x) => (x.id === id ? { ...x, tags: res.item.tags } : x)));
    setOpen((cur) => (cur && cur.id === id ? { ...cur, tags: res.item.tags } : cur));
  };

  const remove = async (id: number) => {
    if (!window.confirm('Убрать с полки?')) return;
    await api.del(`/api/life/shelf/${id}`, { silentSuccess: true });
    setItems((list) => list.filter((x) => x.id !== id));
    setOpen(null);
  };

  return (
    <Shell>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold">Полка</div>
          <div className="text-sm text-white/55">
            {stats.total ? `${stats.total} на полке · ${stats.active} в процессе · ${stats.done} готово` : 'Книги, манга, аниме, фильмы, игры и музыка — всё, что любишь и хочешь.'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connected.length ? (
            <button type="button" disabled={syncing} onClick={() => syncAll(false)} className="flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/5" title="Обновить списки с подключённых сайтов">
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} /> {connected.join(' · ')}
            </button>
          ) : null}
          <button type="button" onClick={() => navigate('/settings?tab=integrations')} className="rounded-2xl border border-white/10 px-3 py-2 text-sm text-white/60 hover:bg-white/5 hover:text-white" title="Подключить Shikimori и Steam">
            {connected.length ? '⚙' : '🌸🎮 Подключить Shikimori / Steam'}
          </button>
          <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-2 rounded-2xl bg-brand-mint px-4 py-2 text-sm font-semibold text-brand-deep shadow-brand-glow">
            <Plus className="h-4 w-4" /> Добавить
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[{ id: 'all', label: 'Всё', emoji: '✨' }, ...KINDS].map((k) => (
          <button key={k.id} type="button" onClick={() => setKind(k.id as ShelfKind | 'all')} className={`rounded-full border px-3 py-1.5 text-sm transition ${kind === k.id ? 'border-brand-mint bg-brand-mint/20 text-white' : 'border-white/10 text-white/70 hover:bg-white/5'}`}>
            {k.emoji} {k.label}
          </button>
        ))}
        <div className="mx-1 h-6 w-px bg-white/10" />
        {[{ id: 'all', label: 'Любой статус', badge: '' }, ...STATUS].map((s) => (
          <button key={s.id} type="button" onClick={() => setStatus(s.id as ShelfStatus | 'all')} className={`rounded-full px-3 py-1.5 text-xs transition ${status === s.id ? 'bg-white/15 text-white' : 'text-white/55 hover:text-white'}`}>
            {s.badge} {s.label}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти на полке" className="w-56 rounded-full border border-white/10 bg-black/20 py-2 pl-9 pr-3 text-sm text-white outline-none" />
        </div>
      </div>
      {usedTags.length ? (
        <div className="-mt-2 mb-4 flex flex-wrap gap-1.5">
          {usedTags.map((t) => (
            <button key={t.id} type="button" onClick={() => setTagFilter(tagFilter === t.id ? null : t.id)} className="rounded-full border px-2.5 py-1 text-xs transition" style={{ borderColor: tagFilter === t.id ? t.color : 'rgba(255,255,255,0.1)', background: tagFilter === t.id ? `${t.color}33` : 'transparent', color: tagFilter === t.id ? '#fff' : t.color }}>
              #{t.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Стеллаж */}
      <div
        className="relative overflow-hidden rounded-[28px] p-5 pb-3 shadow-[inset_0_0_60px_rgba(0,0,0,0.55)]"
        style={{ background: 'linear-gradient(180deg, #3b2416 0%, #2a180e 100%)', border: '10px solid #5b3820', boxShadow: '0 25px 60px rgba(0,0,0,0.45), inset 0 0 60px rgba(0,0,0,0.55)' }}
        data-no-invert
      >
        {loading ? (
          <div className="flex h-60 items-center justify-center text-amber-100/60"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : groups.length === 0 ? (
          <div className="flex h-60 flex-col items-center justify-center gap-2 text-center text-amber-100/70">
            <div className="text-5xl">📚🪴</div>
            <div>{items.length ? 'Ничего не нашлось по фильтрам' : 'Полка пока пустая — добавьте первую книгу, аниме или игру'}</div>
          </div>
        ) : (
          groups.map((g, gi) => (
            <div key={g.kind} className="relative mb-4">
              <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-100/45">
                {KINDS.find((k) => k.id === g.kind)?.emoji} {KINDS.find((k) => k.id === g.kind)?.label} · {g.list.length}
              </div>
              <div className="flex flex-wrap items-end gap-x-[3px] gap-y-0" style={{ rowGap: 0 }}>
                {g.list.slice(0, kind !== 'all' || expanded.includes(g.kind) ? undefined : isSpine(g.kind) ? 40 : 24).map((item) => (
                  <div key={item.id} className="flex h-[226px] items-end pb-[14px]">
                    {isSpine(item.kind) ? <Spine item={item} onClick={() => setOpen(item)} /> : <div className="mr-3"><Case item={item} onClick={() => setOpen(item)} /></div>}
                  </div>
                ))}
                {kind === 'all' && !expanded.includes(g.kind) && g.list.length > (isSpine(g.kind) ? 40 : 24) ? (
                  <div className="flex h-[226px] items-end pb-[22px] pl-2">
                    <button type="button" onClick={() => setExpanded((list) => [...list, g.kind])} className="rounded-lg border border-amber-200/20 bg-[#6b4426] px-3 py-2 text-sm font-semibold text-amber-50 shadow-[2px_3px_0_rgba(0,0,0,0.35)] transition hover:-rotate-2">
                      Ещё {g.list.length - (isSpine(g.kind) ? 40 : 24)} →
                    </button>
                  </div>
                ) : null}
                <div className="flex h-[226px] items-end pb-[14px] pl-3 text-4xl opacity-90">{DECOR[(gi * 3 + g.list.length) % DECOR.length]}</div>
              </div>
              {/* доски полок: повторяются под каждым рядом */}
              <div
                className="pointer-events-none absolute inset-x-[-20px] bottom-0 top-5"
                style={{ background: 'repeating-linear-gradient(180deg, transparent 0 212px, #8a5a34 212px 222px, #5e3b20 222px 226px)', zIndex: -0 }}
              />
            </div>
          ))
        )}
      </div>

      {open ? <ItemModal item={open} tagOptions={tagOptions} onClose={() => setOpen(null)} onUpdate={(patch) => update(open.id, patch)} onTags={(ids) => setTags(open.id, ids)} onDelete={() => remove(open.id)} /> : null}
      {adding ? (
        <AddModal
          defaultKind={kind === 'all' ? 'book' : kind}
          onClose={() => setAdding(false)}
          onAdded={(item) => {
            setItems((list) => [...list, item]);
            setAdding(false);
          }}
        />
      ) : null}
    </Shell>
  );
}

function Stars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 10 }).map((_, i) => (
        <button key={i} type="button" onClick={() => onChange(i + 1 === value ? 0 : i + 1)} title={`${i + 1}/10`}>
          <Star className={`h-5 w-5 ${i < value ? 'fill-amber-300 text-amber-300' : 'text-white/25'}`} />
        </button>
      ))}
      <span className="ml-2 text-sm text-white/60">{value ? `${value}/10` : 'без оценки'}</span>
    </div>
  );
}

function ItemModal({ item, tagOptions, onClose, onUpdate, onTags, onDelete }: { item: ShelfItem; tagOptions: TagOption[]; onClose: () => void; onUpdate: (p: Partial<ShelfItem>) => void; onTags: (ids: number[]) => void; onDelete: () => void }) {
  const [notes, setNotes] = useState(item.notes || '');
  const kindInfo = KINDS.find((k) => k.id === item.kind);

  // Сведения с сайта (описание, жанры) сохраняются в Life Hub; у добавленного без описания
  // (например, из списка Shikimori) они подтягиваются при первом открытии карточки
  const [details, setDetails] = useState<'idle' | 'loading' | 'failed' | 'empty'>('idle');
  const canFetch = !!item.source && !!item.external_id && !item.source.startsWith('wikipedia');
  const loadDetails = async () => {
    if (!canFetch) return;
    setDetails('loading');
    try {
      const d = await api.get(
        `/api/life/shelf/details?kind=${item.kind}&source=${encodeURIComponent(item.source!)}&external_id=${encodeURIComponent(item.external_id!)}&title=${encodeURIComponent(item.title)}&year=${item.year || ''}`,
        { silentError: true }
      );
      if (d?.error) return setDetails('failed');
      if (!d?.description) return setDetails('empty');
      onUpdate({ description: d.description, author: item.author || d.author || null, cover_url: item.cover_url || d.cover_url || null, meta: { ...(item.meta || {}), ...(d.meta || {}) } });
      setDetails('idle');
    } catch {
      setDetails('failed');
    }
  };
  useEffect(() => {
    if (!item.description) loadDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const total = item.kind === 'anime' ? item.meta?.episodes : item.meta?.chapters;
  const unit = item.kind === 'anime' ? 'эп.' : 'гл.';
  const facts = [
    item.year ? `${item.year}` : null,
    item.author,
    item.meta?.progress && item.status !== 'done' ? `${kindInfo?.verb === 'смотрю' ? 'просмотрено' : 'прочитано'} ${item.meta.progress}${total ? `/${total}` : ''} ${unit}` : null,
    item.meta?.episodes ? `${item.meta.episodes} эп.` : null,
    item.meta?.chapters ? `${item.meta.chapters} гл.` : null,
    item.meta?.volumes ? `${item.meta.volumes} т.` : null,
    item.meta?.pages ? `${item.meta.pages} стр.` : null,
    item.meta?.hours ? `🎮 ${item.meta.hours} ч в игре` : null,
    item.meta?.last_played ? `последний запуск ${new Date(item.meta.last_played).toLocaleDateString('ru-RU')}` : null,
    item.meta?.score ? `★ ${item.meta.score}` : null,
  ].filter(Boolean);
  return (
    <Modal showCloseButton open onClose={onClose} contentClassName={MODAL_CONTENT}>
      <div className="mb-4 pr-8 text-xl font-semibold text-white">{kindInfo?.emoji} {item.title}</div>
      <div className="grid gap-5 sm:grid-cols-[180px_minmax(0,1fr)]">
        <div>
          <FallbackImg src={item.cover_url} className="w-full rounded-2xl shadow-brand-soft" fallback={<div className="flex aspect-[2/3] items-center justify-center rounded-2xl bg-white/5 text-5xl">{kindInfo?.emoji}</div>} />
          {item.external_url ? (
            <a href={item.external_url} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-1.5 text-xs text-brand-mint hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> Подробнее на сайте
            </a>
          ) : null}
        </div>
        <div className="min-w-0 space-y-4">
          {item.meta?.original_title && item.meta.original_title !== item.title ? <div className="text-sm text-white/50">{item.meta.original_title}</div> : null}
          {facts.length ? <div className="text-sm text-white/70">{facts.join(' · ')}</div> : null}
          {item.meta?.genres?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {item.meta.genres.slice(0, 6).map((g) => (
                <span key={g} className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-white/70">{g}</span>
              ))}
            </div>
          ) : null}
          {details === 'loading' ? (
            <p className="flex items-center gap-2 text-sm text-white/50"><Loader2 className="h-4 w-4 animate-spin" /> Загружаю описание…</p>
          ) : item.description ? (
            <div>
              <p className="max-h-48 overflow-auto whitespace-pre-line text-sm leading-6 text-white/80">{item.description}</p>
              {canFetch ? (
                <button type="button" onClick={loadDetails} className="mt-1 flex items-center gap-1 text-[11px] text-white/35 hover:text-white/70">
                  <RefreshCw className="h-3 w-3" /> обновить сведения с сайта
                </button>
              ) : null}
            </div>
          ) : details === 'failed' ? (
            <p className="text-sm text-white/45">
              Сайт сейчас не ответил.{' '}
              <button type="button" onClick={loadDetails} className="text-brand-mint hover:underline">Повторить</button>
            </p>
          ) : (
            <p className="text-sm text-white/40">Описания нет.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {STATUS.map((s) => (
              <button key={s.id} type="button" onClick={() => onUpdate({ status: s.id })} className={`rounded-full border px-3 py-1.5 text-sm ${item.status === s.id ? 'border-brand-mint bg-brand-mint/20 text-white' : 'border-white/10 text-white/70 hover:bg-white/5'}`}>
                {s.badge} {s.id === 'active' ? kindInfo?.verb.replace(/^./, (c) => c.toUpperCase()) : s.label}
              </button>
            ))}
          </div>
          <Stars value={item.rating || 0} onChange={(rating) => onUpdate({ rating })} />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (item.notes || '') && onUpdate({ notes })} placeholder="Мои впечатления, любимые моменты, цитаты…" className="h-24 w-full rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white outline-none" />
          <TagSelector tags={tagOptions} selectedIds={(item.tags || []).map((t) => t.id)} onChange={onTags} label="Теги" emptyState="Тегов пока нет — создайте их на странице «Страницы»." onManageTags={() => window.open('/pages', '_blank')} />
          <RelatedPanel type="shelf" id={item.id} />
          <button type="button" onClick={onDelete} className="flex items-center gap-1.5 text-sm text-white/45 hover:text-rose-300">
            <Trash2 className="h-4 w-4" /> Убрать с полки
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AddModal({ defaultKind, onClose, onAdded }: { defaultKind: ShelfKind; onClose: () => void; onAdded: (item: ShelfItem) => void }) {
  const [kind, setKind] = useState<ShelfKind>(defaultKind);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<SearchResult | null>(null);
  const [status, setStatus] = useState<ShelfStatus>('planned');
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    timer.current = window.setTimeout(async () => {
      setBusy(true);
      setError(null);
      try {
        const res = await api.get(`/api/life/shelf/search?kind=${kind}&q=${encodeURIComponent(q.trim())}`, { silentError: true });
        setResults(Array.isArray(res?.items) ? res.items : []);
      } catch (e: any) {
        setError(e?.message || 'Поиск не удался');
        setResults([]);
      } finally {
        setBusy(false);
      }
    }, 450);
  }, [q, kind]);

  const pick = async (r: SearchResult) => {
    setPicked(r);
    if (r.description || !r.source || !r.external_id) return;
    try {
      const d = await api.get(
        `/api/life/shelf/details?kind=${kind}&source=${encodeURIComponent(r.source)}&external_id=${encodeURIComponent(r.external_id)}&title=${encodeURIComponent(r.title)}&year=${r.year || ''}`,
        { silentError: true }
      );
      setPicked((cur) => (cur === r ? { ...r, description: d?.description || r.summary_en || null, cover_url: r.cover_url || d?.cover_url || null, author: r.author || d?.author || null, year: r.year || d?.year || null, meta: { ...(r.meta || {}), ...(d?.meta || {}) } } : cur));
    } catch {
      // без описания тоже можно добавить
    }
  };

  const add = async (r: SearchResult | null) => {
    const body = r
      ? { ...r, kind, status, meta: { ...(r.meta || {}), original_title: r.original_title } }
      : { kind, status, title: q.trim() };
    const res = await api.post('/api/life/shelf', body, { notifySuccess: 'На полке! 📚' });
    if (res?.item) onAdded(res.item);
  };

  return (
    <Modal showCloseButton open onClose={onClose} contentClassName={MODAL_CONTENT}>
      <div className="space-y-4">
        <div className="pr-8 text-xl font-semibold text-white">Добавить на полку</div>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button key={k.id} type="button" onClick={() => { setKind(k.id); setPicked(null); }} className={`rounded-full border px-3 py-1.5 text-sm ${kind === k.id ? 'border-brand-mint bg-brand-mint/20 text-white' : 'border-white/10 text-white/70 hover:bg-white/5'}`}>
              {k.emoji} {k.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название…" className="w-full rounded-2xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-10 text-white outline-none" />
          {busy ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-white/50" /> : null}
        </div>
        {error ? <div className="text-sm text-rose-300">{error}</div> : null}

        {picked ? (
          <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-[120px_minmax(0,1fr)]">
            <FallbackImg src={picked.cover_url} className="w-full rounded-xl" fallback={<div className="flex aspect-[2/3] items-center justify-center rounded-xl bg-white/5 text-4xl">{KINDS.find((k) => k.id === kind)?.emoji}</div>} />
            <div className="min-w-0 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-white">{picked.title}</div>
                  <div className="text-xs text-white/50">{[picked.original_title !== picked.title ? picked.original_title : null, picked.year, picked.author].filter(Boolean).join(' · ')}</div>
                </div>
                <button type="button" onClick={() => setPicked(null)} className="text-white/40 hover:text-white"><X className="h-4 w-4" /></button>
              </div>
              <p className="max-h-32 overflow-auto text-sm leading-6 text-white/75">{picked.description || 'Загружаю описание…'}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {STATUS.filter((s) => s.id === 'planned' || s.id === 'active' || s.id === 'done').map((s) => (
                  <button key={s.id} type="button" onClick={() => setStatus(s.id)} className={`rounded-full border px-3 py-1 text-xs ${status === s.id ? 'border-brand-mint bg-brand-mint/20 text-white' : 'border-white/10 text-white/60'}`}>
                    {s.badge} {s.label}
                  </button>
                ))}
                <button type="button" onClick={() => add(picked)} className="ml-auto rounded-xl bg-brand-mint px-4 py-2 text-sm font-semibold text-brand-deep">Поставить на полку</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid max-h-[50vh] grid-cols-2 gap-3 overflow-auto sm:grid-cols-4">
            {results.map((r, i) => (
              <button key={`${r.external_id}-${i}`} type="button" onClick={() => pick(r)} className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] text-left transition hover:border-brand-mint/50">
                <div className="aspect-[2/3] w-full overflow-hidden bg-white/5">
                  <FallbackImg src={r.cover_url} className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" fallback={<div className="flex h-full items-center justify-center text-3xl">{KINDS.find((k) => k.id === kind)?.emoji}</div>} />
                </div>
                <div className="p-2">
                  <div className="line-clamp-2 text-xs font-medium text-white">{r.title}</div>
                  <div className="text-[11px] text-white/45">{[r.year, r.author].filter(Boolean).join(' · ')}</div>
                </div>
              </button>
            ))}
            {q.trim() && !busy && results.length === 0 && !error ? (
              <div className="col-span-full space-y-2 py-6 text-center text-sm text-white/50">
                <div>Ничего не нашлось.</div>
                <button type="button" onClick={() => add(null)} className="rounded-xl border border-white/15 px-3 py-1.5 text-white/80 hover:bg-white/10">Добавить «{q.trim()}» вручную</button>
              </div>
            ) : null}
          </div>
        )}
        <div className="text-[11px] text-white/35">Сведения: Shikimori (аниме, манга), Open Library (книги), TVMaze (сериалы), Steam (игры), Википедия (фильмы, музыка).</div>
      </div>
    </Modal>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Gift, Heart, ImagePlus, Link2, Loader2, PiggyBank, Plus, Trash2, Wand2 } from 'lucide-react';
import Shell from '../components/Shell';
import { api, resolveApiUrl } from '../api';
import { Modal } from '../components/ui/Modal';
import FallbackImg from '../components/FallbackImg';
import TagSelector from '../components/tags/TagSelector';
import { useTagOptions, TagOption } from '../components/tags/useTagOptions';
import RelatedPanel, { RelatedItem } from '../components/links/RelatedPanel';

// Вишлист — доска желаний: карточки-полароиды на кнопках, у каждого желания своя копилка.

type WishStatus = 'want' | 'got';

type Wish = {
  id: number;
  title: string;
  image_url?: string | null;
  link?: string | null;
  price?: number | null;
  saved: number;
  currency: string;
  priority: 1 | 2 | 3;
  category?: string | null;
  note?: string | null;
  status: WishStatus;
  got_at?: string | null;
  tags?: TagOption[];
};

const CURRENCY_SIGN: Record<string, string> = { RUB: '₽', USD: '$', EUR: '€', KZT: '₸', BYN: 'Br', UAH: '₴', JPY: '¥', CNY: '¥' };
const PIN_COLORS = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#c084fc', '#f472b6'];
const TILTS = [-2.5, 1.5, -1, 2, -1.8, 1];

const money = (v: number | null | undefined, currency: string) =>
  v === null || v === undefined ? '' : `${Math.round(v).toLocaleString('ru-RU')} ${CURRENCY_SIGN[currency] || currency}`;

const imgSrc = (url?: string | null) => (url ? (url.startsWith('/') ? resolveApiUrl(url) : url) : null);

const EMPTY: Omit<Wish, 'id'> = { title: '', image_url: '', link: '', price: null, saved: 0, currency: 'RUB', priority: 2, category: '', note: '', status: 'want' };

export default function Wishlist() {
  const [items, setItems] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<WishStatus>('want');
  const [category, setCategory] = useState<string>('');
  const [editing, setEditing] = useState<Partial<Wish> | null>(null);
  const [saving, setSaving] = useState<Wish | null>(null);
  const tagOptions = useTagOptions();
  // К каким поездкам относятся желания (по общему тегу или ручной привязке) — показываем на карточке
  const [trips, setTrips] = useState<Record<number, RelatedItem[]>>({});
  useEffect(() => {
    api.get('/api/life/links/related-bulk?type=wish&target=travel', { silentError: true }).then((res) => setTrips(res?.items || {})).catch(() => {});
  }, [items.length]);

  useEffect(() => {
    api
      .get('/api/life/wishlist')
      .then((res) => setItems(Array.isArray(res?.items) ? res.items : []))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => [...new Set(items.map((x) => x.category).filter(Boolean) as string[])].sort(), [items]);
  const list = useMemo(
    () =>
      items
        .filter((x) => x.status === tab && (!category || x.category === category))
        .sort((a, b) => (tab === 'got' ? String(b.got_at || '').localeCompare(String(a.got_at || '')) : b.priority - a.priority)),
    [items, tab, category]
  );

  const totals = useMemo(() => {
    const want = items.filter((x) => x.status === 'want');
    const byCur: Record<string, { price: number; saved: number }> = {};
    want.forEach((x) => {
      const t = (byCur[x.currency] ||= { price: 0, saved: 0 });
      t.price += x.price || 0;
      t.saved += Math.min(x.saved || 0, x.price || x.saved || 0);
    });
    return { count: want.length, got: items.length - want.length, byCur };
  }, [items]);

  const patch = async (id: number, p: Partial<Wish>) => {
    setItems((all) => all.map((x) => (x.id === id ? { ...x, ...p } : x)));
    const res = await api.put(`/api/life/wishlist/${id}`, p, { silentSuccess: true });
    if (res?.item) setItems((all) => all.map((x) => (x.id === id ? res.item : x)));
  };

  const save = async (draft: Partial<Wish>) => {
    if (!draft.title?.trim()) return;
    if (draft.id) {
      await patch(draft.id, { ...draft, tags: (draft.tags || []).map((t) => t.id) as any });
    } else {
      const res = await api.post('/api/life/wishlist', { ...draft, tags: (draft.tags || []).map((t) => t.id) }, { notifySuccess: 'Желание загадано ✨' });
      if (res?.item) setItems((all) => [res.item, ...all]);
    }
    setEditing(null);
  };

  const remove = async (id: number) => {
    if (!window.confirm('Удалить желание?')) return;
    await api.del(`/api/life/wishlist/${id}`, { silentSuccess: true });
    setItems((all) => all.filter((x) => x.id !== id));
    setEditing(null);
  };

  const fulfil = (w: Wish) => patch(w.id, { status: w.status === 'got' ? 'want' : 'got' });

  return (
    <Shell>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold">Вишлист</div>
          <div className="text-sm text-white/55">
            {totals.count ? `${totals.count} желаний · ${totals.got} сбылось` : 'Загадывайте, копите и отмечайте, что сбылось.'}
            {Object.entries(totals.byCur)
              .filter(([, t]) => t.price)
              .map(([cur, t]) => ` · отложено ${money(t.saved, cur)} из ${money(t.price, cur)}`)
              .join('')}
          </div>
        </div>
        <button type="button" onClick={() => setEditing({ ...EMPTY })} className="flex items-center gap-2 rounded-2xl bg-brand-mint px-4 py-2 text-sm font-semibold text-brand-deep shadow-brand-glow">
          <Plus className="h-4 w-4" /> Загадать
        </button>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(['want', 'got'] as WishStatus[]).map((s) => (
          <button key={s} type="button" onClick={() => setTab(s)} className={`rounded-full border px-4 py-1.5 text-sm transition ${tab === s ? 'border-brand-mint bg-brand-mint/20 text-white' : 'border-white/10 text-white/70 hover:bg-white/5'}`}>
            {s === 'want' ? '✨ Хочу' : '🎁 Сбылось'}
          </button>
        ))}
        {categories.length ? <div className="mx-1 h-6 w-px bg-white/10" /> : null}
        {categories.length ? (
          <>
            <button type="button" onClick={() => setCategory('')} className={`rounded-full px-3 py-1.5 text-xs ${!category ? 'bg-white/15 text-white' : 'text-white/55 hover:text-white'}`}>Все</button>
            {categories.map((c) => (
              <button key={c} type="button" onClick={() => setCategory(c)} className={`rounded-full px-3 py-1.5 text-xs ${category === c ? 'bg-white/15 text-white' : 'text-white/55 hover:text-white'}`}>{c}</button>
            ))}
          </>
        ) : null}
      </div>

      {/* Пробковая доска */}
      <div
        className="min-h-[420px] rounded-[28px] p-6 shadow-[inset_0_0_50px_rgba(0,0,0,0.45)]"
        style={{ background: 'radial-gradient(circle at 20% 20%, #b07a4a 0 1px, transparent 2px) 0 0/14px 14px, radial-gradient(circle at 70% 60%, #8d5a30 0 1px, transparent 2px) 0 0/11px 11px, linear-gradient(135deg, #a0693b, #7f5029)', border: '10px solid #5b3820' }}
        data-no-invert
      >
        {loading ? (
          <div className="flex h-80 items-center justify-center text-amber-50/70"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : list.length === 0 ? (
          <div className="flex h-80 flex-col items-center justify-center gap-2 text-center text-amber-50/85">
            <div className="text-5xl">{tab === 'want' ? '🌠' : '🎁'}</div>
            <div className="font-medium">{tab === 'want' ? 'Доска пока пустая — загадайте первое желание' : 'Здесь появятся сбывшиеся желания'}</div>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-6 gap-y-8">
            {list.map((w, i) => (
              <WishCard key={w.id} wish={w} index={i} trips={trips[w.id] || []} onOpen={() => setEditing(w)} onSave={() => setSaving(w)} onFulfil={() => fulfil(w)} onPriority={(p) => patch(w.id, { priority: p })} />
            ))}
          </div>
        )}
      </div>

      {editing ? <WishEditor draft={editing} categories={categories} tagOptions={tagOptions} onClose={() => setEditing(null)} onSave={save} onDelete={editing.id ? () => remove(editing.id!) : undefined} /> : null}
      {saving ? (
        <PiggyModal
          wish={saving}
          onClose={() => setSaving(null)}
          onApply={async (saved) => {
            await patch(saving.id, { saved });
            setSaving(null);
          }}
        />
      ) : null}
    </Shell>
  );
}

function Hearts({ value, onChange }: { value: number; onChange: (v: 1 | 2 | 3) => void }) {
  return (
    <div className="flex items-center gap-0.5" title="Насколько хочется">
      {[1, 2, 3].map((v) => (
        <button
          key={v}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange(v as 1 | 2 | 3);
          }}
        >
          <Heart className={`h-4 w-4 ${v <= value ? 'fill-rose-500 text-rose-500' : 'text-slate-400'}`} />
        </button>
      ))}
    </div>
  );
}

function WishCard({ wish, index, trips, onOpen, onSave, onFulfil, onPriority }: { wish: Wish; index: number; trips: RelatedItem[]; onOpen: () => void; onSave: () => void; onFulfil: () => void; onPriority: (p: 1 | 2 | 3) => void }) {
  const tilt = TILTS[(wish.id + index) % TILTS.length];
  const pin = PIN_COLORS[wish.id % PIN_COLORS.length];
  const progress = wish.price ? Math.min(100, Math.round(((wish.saved || 0) / wish.price) * 100)) : 0;
  const got = wish.status === 'got';
  const src = imgSrc(wish.image_url);
  return (
    <div className="group relative transition-transform duration-200 hover:z-10 hover:scale-[1.03]" style={{ transform: `rotate(${tilt}deg)` }}>
      {/* кнопка-гвоздик */}
      <div className="absolute left-1/2 top-[-9px] z-10 h-5 w-5 -translate-x-1/2 rounded-full shadow-[0_3px_4px_rgba(0,0,0,0.45)]" style={{ background: `radial-gradient(circle at 35% 35%, #fff8 0 2px, ${pin} 3px)` }} />
      <div onClick={onOpen} className="cursor-pointer rounded-[4px] bg-[#fdfbf6] p-2.5 pb-3 text-slate-800 shadow-[0_10px_20px_rgba(0,0,0,0.35)]">
        <div className="relative aspect-square w-full overflow-hidden bg-slate-200">
          <FallbackImg src={src} className={`h-full w-full object-cover ${got ? 'saturate-50' : ''}`} loading="lazy" fallback={<div className="flex h-full items-center justify-center text-5xl">🎁</div>} />
          {got ? <div className="absolute right-2 top-2 rotate-12 rounded border-2 border-emerald-600 bg-white/85 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-emerald-700">Сбылось</div> : null}
        </div>
        <div className="mt-2 line-clamp-2 min-h-[2.5rem] font-[cursive] text-[15px] leading-5" style={{ fontFamily: '"Comic Sans MS", "Segoe Print", cursive' }}>{wish.title}</div>
        <div className="mt-1 flex items-center justify-between gap-2 text-sm">
          <span className="font-semibold">{wish.price ? money(wish.price, wish.currency) : <span className="text-slate-400">без цены</span>}</span>
          {!got ? <Hearts value={wish.priority} onChange={onPriority} /> : <span className="text-xs text-slate-500">{wish.got_at ? new Date(wish.got_at).toLocaleDateString('ru-RU') : ''}</span>}
        </div>
        {!got && wish.price ? (
          <div className="mt-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-500" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">{progress >= 100 ? 'Накоплено! 🎉' : `отложено ${money(wish.saved, wish.currency)} · ${progress}%`}</div>
          </div>
        ) : null}
        {trips.length || wish.tags?.length ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {trips.map((t) => (
              <span key={t.id} className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800" title="Связанная поездка">🗺️ {t.title}</span>
            ))}
            {(wish.tags || []).map((t) => (
              <span key={t.id} className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ background: `${t.color}26`, color: t.color }}>#{t.label}</span>
            ))}
          </div>
        ) : null}
        <div className="mt-2 flex items-center gap-1 opacity-70 transition group-hover:opacity-100">
          {!got ? (
            <button type="button" onClick={(e) => { e.stopPropagation(); onSave(); }} className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs hover:bg-slate-200" title="Копилка">
              <PiggyBank className="h-3.5 w-3.5" /> Копилка
            </button>
          ) : null}
          <button type="button" onClick={(e) => { e.stopPropagation(); onFulfil(); }} className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs hover:bg-slate-200" title={got ? 'Вернуть в желания' : 'Отметить, что сбылось'}>
            <Gift className="h-3.5 w-3.5" /> {got ? 'Вернуть' : 'Сбылось'}
          </button>
          {wish.link ? (
            <a href={wish.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="ml-auto rounded-md p-1 hover:bg-slate-200" title="Открыть ссылку">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PiggyModal({ wish, onClose, onApply }: { wish: Wish; onClose: () => void; onApply: (saved: number) => void }) {
  const [amount, setAmount] = useState('');
  const sign = CURRENCY_SIGN[wish.currency] || wish.currency;
  const left = wish.price ? Math.max(0, wish.price - (wish.saved || 0)) : null;
  const value = Number(amount.replace(',', '.')) || 0;
  return (
    <Modal showCloseButton open onClose={onClose} contentClassName="w-full max-w-sm rounded-3xl border border-white/10 bg-brand-night p-6 shadow-2xl">
      <div className="space-y-4">
        <div className="pr-8 text-lg font-semibold text-white">🐷 Копилка: {wish.title}</div>
        <div className="text-sm text-white/65">
          Отложено {money(wish.saved, wish.currency)}
          {left !== null ? ` · осталось ${money(left, wish.currency)}` : ''}
        </div>
        <div className="flex flex-wrap gap-2">
          {[500, 1000, 5000].map((v) => (
            <button key={v} type="button" onClick={() => setAmount(String(v))} className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/75 hover:bg-white/5">+{v.toLocaleString('ru-RU')} {sign}</button>
          ))}
          {left ? <button type="button" onClick={() => setAmount(String(left))} className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/75 hover:bg-white/5">Всё до цели</button> : null}
        </div>
        <input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Сумма, ${sign}`} className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none" />
        <div className="flex justify-end gap-2">
          <button type="button" disabled={!value} onClick={() => onApply(Math.max(0, (wish.saved || 0) - value))} className="rounded-xl border border-white/15 px-3 py-2 text-sm text-white/80 disabled:opacity-40">Взять</button>
          <button type="button" disabled={!value} onClick={() => onApply((wish.saved || 0) + value)} className="rounded-xl bg-brand-mint px-4 py-2 text-sm font-semibold text-brand-deep disabled:opacity-40">Отложить</button>
        </div>
      </div>
    </Modal>
  );
}

function WishEditor({ draft, categories, tagOptions, onClose, onSave, onDelete }: { draft: Partial<Wish>; categories: string[]; tagOptions: TagOption[]; onClose: () => void; onSave: (w: Partial<Wish>) => void; onDelete?: () => void }) {
  const [w, setW] = useState<Partial<Wish>>(draft);
  const [fetching, setFetching] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const set = (p: Partial<Wish>) => setW((cur) => ({ ...cur, ...p }));

  const fromLink = async () => {
    if (!w.link?.trim()) return;
    setFetching(true);
    setHint(null);
    try {
      const res = await api.get(`/api/life/wishlist/preview?url=${encodeURIComponent(w.link.trim())}`, { silentError: true });
      if (res?.error) setHint(res.error);
      else {
        set({ title: w.title || res.title || '', image_url: w.image_url || res.image_url || '', price: w.price ?? res.price ?? null, currency: res.currency || w.currency });
        setHint(res.title || res.image_url ? 'Заполнено со страницы — проверьте' : 'Магазин не отдал данные, заполните вручную');
      }
    } catch (e: any) {
      setHint(e?.message || 'Не удалось открыть ссылку');
    } finally {
      setFetching(false);
    }
  };

  const upload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post('/api/life/uploads/image', formData, { silentSuccess: true });
    if (res?.url) set({ image_url: res.url });
  };

  const field = 'w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none';
  const src = imgSrc(w.image_url);
  return (
    <Modal showCloseButton open onClose={onClose} contentClassName="w-full max-w-2xl max-h-[88vh] overflow-auto rounded-3xl border border-white/10 bg-brand-night p-6 shadow-2xl">
      <div className="space-y-4">
        <div className="pr-8 text-xl font-semibold text-white">{w.id ? 'Желание' : 'Загадать желание'}</div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input value={w.link || ''} onChange={(e) => set({ link: e.target.value })} onBlur={() => !w.title && fromLink()} placeholder="Ссылка на товар (необязательно)" className={`${field} pl-9`} />
          </div>
          <button type="button" disabled={!w.link?.trim() || fetching} onClick={fromLink} className="flex items-center gap-1.5 rounded-2xl border border-white/15 px-3 text-sm text-white/80 hover:bg-white/5 disabled:opacity-40" title="Заполнить по ссылке">
            {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} По ссылке
          </button>
        </div>
        {hint ? <div className="text-xs text-white/55">{hint}</div> : null}

        <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
          <button type="button" onClick={() => fileRef.current?.click()} className="group relative aspect-square overflow-hidden rounded-2xl border border-dashed border-white/20 bg-white/[0.03]" title="Выбрать картинку">
            <FallbackImg src={src} className="h-full w-full object-cover" fallback={<div className="flex h-full flex-col items-center justify-center gap-1 text-white/45"><ImagePlus className="h-7 w-7" /><span className="text-xs">Картинка</span></div>} />
            <div className="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-center text-xs text-white opacity-0 transition group-hover:opacity-100">Сменить</div>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <div className="space-y-3">
            <input autoFocus value={w.title || ''} onChange={(e) => set({ title: e.target.value })} placeholder="Чего хочется?" className={field} />
            <div className="grid grid-cols-[1fr_1fr_90px] gap-2">
              <input inputMode="decimal" value={w.price ?? ''} onChange={(e) => set({ price: e.target.value === '' ? null : Number(e.target.value.replace(',', '.')) || 0 })} placeholder="Цена" className={field} />
              <input inputMode="decimal" value={w.saved || ''} onChange={(e) => set({ saved: Number(e.target.value.replace(',', '.')) || 0 })} placeholder="Отложено" className={field} />
              <select value={w.currency || 'RUB'} onChange={(e) => set({ currency: e.target.value })} className={field}>
                {Object.keys(CURRENCY_SIGN).map((c) => <option key={c} value={c}>{CURRENCY_SIGN[c]} {c}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <input list="wish-cats" value={w.category || ''} onChange={(e) => set({ category: e.target.value })} placeholder="Категория: техника, одежда, хобби…" className={field} />
              <datalist id="wish-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              <div className="shrink-0 rounded-2xl border border-white/10 px-3 py-2.5"><Hearts value={w.priority || 2} onChange={(priority) => set({ priority })} /></div>
            </div>
            <input value={w.image_url || ''} onChange={(e) => set({ image_url: e.target.value })} placeholder="…или ссылка на картинку" className={`${field} text-sm`} />
          </div>
        </div>
        <textarea value={w.note || ''} onChange={(e) => set({ note: e.target.value })} placeholder="Заметка: размер, цвет, зачем хочется…" className={`${field} h-20`} />
        <TagSelector tags={tagOptions} selectedIds={(w.tags || []).map((t) => t.id)} onChange={(ids) => set({ tags: tagOptions.filter((t) => ids.includes(t.id)) })} label="Теги" emptyState="Тегов пока нет — создайте их на странице «Страницы»." onManageTags={() => window.open('/pages', '_blank')} />
        {w.id ? <RelatedPanel type="wish" id={w.id} /> : <div className="text-xs text-white/40">После сохранения желание можно связать с поездкой, страницей или целью — общим тегом или вручную.</div>}
        <div className="flex items-center justify-between">
          {onDelete ? (
            <button type="button" onClick={onDelete} className="flex items-center gap-1.5 text-sm text-white/45 hover:text-rose-300"><Trash2 className="h-4 w-4" /> Удалить</button>
          ) : <span />}
          <button type="button" disabled={!w.title?.trim()} onClick={() => onSave(w)} className="rounded-xl bg-brand-mint px-5 py-2 text-sm font-semibold text-brand-deep disabled:opacity-40">Сохранить</button>
        </div>
      </div>
    </Modal>
  );
}

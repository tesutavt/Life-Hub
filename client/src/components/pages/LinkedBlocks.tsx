import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, Loader2, Plus, X } from 'lucide-react';
import { api, resolveApiUrl } from '../../api';
import FallbackImg from '../FallbackImg';
import { RelatedItem, SavingsBar } from '../links/RelatedPanel';

// Блоки страниц, связанные с разделами приложения:
//  • «Список задач» — пункт можно привязать к аниме/книге с полки, желанию или поездке; галочка = статус «готово» там;
//  • «Карточка» — вещь из любого раздела прямо на странице (обложка, статус, копилка).

export type EntityRef = { type: string; id: number };
export type ChecklistItem = { id: string; text: string; done: boolean; ref?: EntityRef | null };
type Described = RelatedItem & { done: boolean | null };

const TYPE_EMOJI: Record<string, string> = {
  page: '📄', travel: '🗺️', wish: '🎁', shelf: '📚', goal: '🎯', habit: '🔁', course: '🎓', language: '🗣️', calendar_event: '📅', loan: '💳',
};
const DONE_LABEL: Record<string, string> = { shelf: 'готово на полке', wish: 'сбылось', travel: 'побывал' };
const STATUS_LABEL: Record<string, string> = {
  planned: 'Хочу', active: 'В процессе', paused: 'Отложено', done: 'Готово', dropped: 'Брошено', want: 'Хочу', got: 'Сбылось', dream: 'Мечтаю', cancelled: 'Отменено',
};

const uid = () => Math.random().toString(36).slice(2, 10);
const imgSrc = (url?: string | null) => (url ? (url.startsWith('/') ? resolveApiUrl(url) : url) : null);
const keyOf = (r: EntityRef) => `${r.type}:${r.id}`;

/** Свежие сведения о привязанных вещах (статус меняется в других разделах — перечитываем при возврате на вкладку). */
function useDescribed(refs: EntityRef[]) {
  const [map, setMap] = useState<Record<string, Described>>({});
  const sig = refs.map(keyOf).sort().join(',');
  const load = useCallback(async () => {
    if (!sig) return setMap({});
    try {
      const res = await api.post('/api/life/links/describe', { refs }, { silentSuccess: true, silentError: true });
      const next: Record<string, Described> = {};
      (res?.items || []).forEach((it: Described) => (next[`${it.type}:${it.id}`] = it));
      setMap(next);
    } catch {
      // нет связи — показываем то, что сохранено в блоке
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);
  return { map, setMap, reload: load };
}

/** Поиск вещи для привязки по всем разделам. */
export function EntityPicker({ onPick, onClose, placeholder }: { onPick: (it: RelatedItem) => void; onClose: () => void; placeholder?: string }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<RelatedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (!q.trim()) return setItems([]);
    timer.current = window.setTimeout(async () => {
      setBusy(true);
      try {
        const res = await api.get(`/api/life/links/candidates?q=${encodeURIComponent(q.trim())}`, { silentError: true });
        setItems(res?.items || []);
      } finally {
        setBusy(false);
      }
    }, 300);
  }, [q]);
  return (
    <div className="rounded-xl border border-white/10 bg-brand-night p-2 shadow-xl" onPointerDown={(e) => e.stopPropagation()}>
      <div className="relative">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onClose()} placeholder={placeholder || 'Аниме, книга, желание, поездка, цель…'} className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white outline-none" />
        {busy ? <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-white/40" /> : null}
      </div>
      <div className="mt-1 max-h-52 overflow-auto">
        {items.map((it) => (
          <button key={`${it.type}-${it.id}`} type="button" onClick={() => onPick(it)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/10">
            <span>{TYPE_EMOJI[it.type] || '•'}</span>
            <span className="min-w-0 flex-1 truncate text-white">{it.title}</span>
            <span className="shrink-0 text-[11px] text-white/40">{it.type_label}</span>
          </button>
        ))}
      </div>
      <button type="button" onClick={onClose} className="mt-1 text-xs text-white/40 hover:text-white">Отмена</button>
    </div>
  );
}

export function ChecklistBlock({ items, onChange }: { items: ChecklistItem[]; onChange: (next: ChecklistItem[]) => void }) {
  const navigate = useNavigate();
  const refs = items.map((i) => i.ref).filter(Boolean) as EntityRef[];
  const { map, setMap } = useDescribed(refs);
  const [draft, setDraft] = useState('');
  const [linking, setLinking] = useState<string | 'new' | null>(null);

  const isDone = (it: ChecklistItem) => {
    const d = it.ref ? map[keyOf(it.ref)] : null;
    return d && d.done !== null ? d.done : it.done;
  };
  const toggle = async (it: ChecklistItem) => {
    const next = !isDone(it);
    onChange(items.map((x) => (x.id === it.id ? { ...x, done: next } : x)));
    const d = it.ref ? map[keyOf(it.ref)] : null;
    if (it.ref && d && d.done !== null) {
      // статус там же, где вещь живёт: на полке, в вишлисте, у поездки
      setMap((m) => ({ ...m, [keyOf(it.ref!)]: { ...d, done: next } }));
      const res = await api.post('/api/life/links/toggle', { ...it.ref, done: next }, { silentSuccess: true, silentError: true }).catch(() => null);
      if (res?.item) setMap((m) => ({ ...m, [keyOf(it.ref!)]: res.item }));
    }
  };
  const add = (text: string, ref?: EntityRef | null) => {
    if (!text.trim() && !ref) return;
    onChange([...items, { id: uid(), text: text.trim(), done: false, ref: ref || null }]);
    setDraft('');
  };
  const done = items.filter(isDone).length;

  return (
    <div className="flex h-full flex-col gap-1 p-3" onPointerDown={(e) => e.stopPropagation()}>
      {items.length ? <div className="px-1 text-[11px] text-white/40">{done} из {items.length}</div> : null}
      {items.map((it) => {
        const d = it.ref ? map[keyOf(it.ref)] : null;
        const checked = isDone(it);
        return (
          <div key={it.id} className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-white/[0.04]">
            <input type="checkbox" checked={checked} onChange={() => toggle(it)} className="h-4 w-4 shrink-0 rounded" title={d && d.done !== null ? `Отметится как «${DONE_LABEL[d.type]}»` : undefined} />
            {it.ref ? (
              <>
                <FallbackImg src={imgSrc(d?.image)} className="h-7 w-5 shrink-0 rounded object-cover" fallback={<span className="w-5 shrink-0 text-center text-sm">{TYPE_EMOJI[it.ref.type] || '•'}</span>} />
                <button type="button" onClick={() => d && navigate(d.url)} className={`min-w-0 flex-1 truncate text-left text-sm ${checked ? 'text-white/40 line-through' : 'text-white'}`} title="Открыть">
                  {it.text || d?.title || '…'}
                </button>
                {d?.extra?.status ? <span className="shrink-0 rounded-full bg-white/10 px-1.5 text-[10px] text-white/60">{STATUS_LABEL[d.extra.status] || d.extra.status}</span> : null}
              </>
            ) : (
              <input value={it.text} onChange={(e) => onChange(items.map((x) => (x.id === it.id ? { ...x, text: e.target.value } : x)))} className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${checked ? 'text-white/40 line-through' : 'text-white'}`} />
            )}
            <button type="button" onClick={() => setLinking(it.id)} className="shrink-0 text-white/30 opacity-0 transition hover:text-brand-mint group-hover:opacity-100" title="Привязать к аниме, книге, желанию, поездке">
              <Link2 className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => onChange(items.filter((x) => x.id !== it.id))} className="shrink-0 text-white/30 opacity-0 transition hover:text-rose-300 group-hover:opacity-100" title="Удалить">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
      {linking ? (
        <EntityPicker
          onClose={() => setLinking(null)}
          onPick={(picked) => {
            const ref = { type: picked.type, id: picked.id };
            if (linking === 'new') add('', ref);
            else onChange(items.map((x) => (x.id === linking ? { ...x, ref, text: x.text || '' } : x)));
            setMap((m) => ({ ...m, [keyOf(ref)]: { ...(picked as Described), done: null } }));
            setLinking(null);
          }}
        />
      ) : null}
      <div className="flex items-center gap-2 px-1 pt-1">
        <Plus className="h-4 w-4 shrink-0 text-white/30" />
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add(draft)} placeholder="Новая задача — Enter" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30" />
        <button type="button" onClick={() => setLinking('new')} className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-brand-mint hover:bg-white/10" title="Добавить аниме, книгу, желание или поездку">
          + из разделов
        </button>
      </div>
    </div>
  );
}

export function EmbedBlock({ entity, onChange }: { entity: EntityRef | null; onChange: (ref: EntityRef | null) => void }) {
  const navigate = useNavigate();
  const { map, setMap } = useDescribed(entity ? [entity] : []);
  const [picking, setPicking] = useState(!entity);
  const d = entity ? map[keyOf(entity)] : null;

  if (!entity || picking) {
    return (
      <div className="flex h-full flex-col justify-center gap-2 p-3" onPointerDown={(e) => e.stopPropagation()}>
        <div className="text-center text-xs text-white/45">Выберите, что показать на странице</div>
        <EntityPicker
          onClose={() => entity && setPicking(false)}
          onPick={(it) => {
            onChange({ type: it.type, id: it.id });
            setMap({ [`${it.type}:${it.id}`]: { ...(it as Described), done: null } });
            setPicking(false);
          }}
        />
      </div>
    );
  }
  const toggle = async () => {
    if (!d || d.done === null) return;
    const res = await api.post('/api/life/links/toggle', { ...entity, done: !d.done }, { silentSuccess: true, silentError: true }).catch(() => null);
    if (res?.item) setMap({ [keyOf(entity)]: res.item });
  };
  return (
    <div className="group relative flex h-full gap-3 p-3" onPointerDown={(e) => e.stopPropagation()}>
      <FallbackImg src={imgSrc(d?.image)} className="h-full max-h-40 w-auto max-w-[40%] shrink-0 rounded-xl object-cover" fallback={<div className="flex aspect-[2/3] h-full max-h-40 items-center justify-center rounded-xl bg-white/5 text-3xl">{TYPE_EMOJI[entity.type] || '•'}</div>} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="text-[11px] uppercase tracking-wider text-white/40">{d?.type_label || '…'}</div>
        <button type="button" onClick={() => d && navigate(d.url)} className="block text-left text-base font-semibold text-white hover:underline">{d?.title || 'Загрузка…'}</button>
        {d?.subtitle ? <div className="text-xs text-white/55">{d.subtitle}</div> : null}
        {d?.extra?.status ? <span className="inline-block rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/70">{STATUS_LABEL[d.extra.status] || d.extra.status}</span> : null}
        {d?.type === 'wish' && d.extra?.status !== 'got' ? <SavingsBar price={d.extra?.price} saved={d.extra?.saved} currency={d.extra?.currency} /> : null}
        {d && d.done !== null ? (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-white/70">
            <input type="checkbox" checked={!!d.done} onChange={toggle} className="h-4 w-4 rounded" /> {DONE_LABEL[d.type]}
          </label>
        ) : null}
      </div>
      <button type="button" onClick={() => setPicking(true)} className="absolute right-2 top-2 rounded-md bg-black/40 px-2 py-0.5 text-[11px] text-white/60 opacity-0 transition hover:text-white group-hover:opacity-100">Сменить</button>
    </div>
  );
}

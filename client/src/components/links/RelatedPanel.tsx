import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, Loader2, Plus, X } from 'lucide-react';
import { api, resolveApiUrl } from '../../api';
import FallbackImg from '../FallbackImg';

// «Связано»: всё, что относится к вещи, из любых разделов — по общим тегам и по ручным привязкам.

export type LinkType = 'page' | 'travel' | 'wish' | 'shelf' | 'goal' | 'habit' | 'course' | 'language' | 'calendar_event' | 'loan';

export type RelatedItem = {
  type: LinkType;
  type_label: string;
  id: number;
  title: string;
  subtitle?: string;
  image?: string | null;
  url: string;
  extra?: { price?: number | null; saved?: number; currency?: string; status?: string; kind?: string };
  via_tags?: { id: number; label: string; color: string }[];
  linked?: boolean;
};

const TYPE_EMOJI: Record<string, string> = {
  page: '📄', travel: '🗺️', wish: '🎁', shelf: '📚', goal: '🎯', habit: '🔁', course: '🎓', language: '🗣️', calendar_event: '📅', loan: '💳',
};

const imgSrc = (url?: string | null) => (url ? (url.startsWith('/') ? resolveApiUrl(url) : url) : null);

/** Полоска копилки — у желаний с ценой (например, накопления на поездку). */
export function SavingsBar({ price, saved, currency, compact }: { price?: number | null; saved?: number; currency?: string; compact?: boolean }) {
  if (!price) return null;
  const pct = Math.min(100, Math.round(((saved || 0) / price) * 100));
  const sign = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'RUB' || !currency ? '₽' : currency;
  return (
    <div className={compact ? 'mt-1' : 'mt-1.5'}>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-0.5 text-[11px] text-white/55">
        {pct >= 100 ? 'Накоплено! 🎉' : `${Math.round(saved || 0).toLocaleString('ru-RU')} из ${Math.round(price).toLocaleString('ru-RU')} ${sign} · ${pct}%`}
      </div>
    </div>
  );
}

export default function RelatedPanel({ type, id, className = '' }: { type: LinkType; id: number; className?: string }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<RelatedItem[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [candidates, setCandidates] = useState<RelatedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  const load = async () => {
    try {
      const res = await api.get(`/api/life/links/related?type=${type}&id=${id}`, { silentError: true });
      setItems(Array.isArray(res?.items) ? res.items : []);
    } catch {
      setItems([]);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, id]);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (!q.trim()) return setCandidates([]);
    timer.current = window.setTimeout(async () => {
      setBusy(true);
      try {
        const res = await api.get(`/api/life/links/candidates?q=${encodeURIComponent(q.trim())}`, { silentError: true });
        setCandidates((res?.items || []).filter((x: RelatedItem) => !(x.type === type && x.id === id)));
      } finally {
        setBusy(false);
      }
    }, 300);
  }, [q, type, id]);

  const link = async (target: RelatedItem) => {
    await api.post('/api/life/links', { a_type: type, a_id: id, b_type: target.type, b_id: target.id }, { silentSuccess: true });
    setAdding(false);
    setQ('');
    await load();
  };
  const unlink = async (target: RelatedItem) => {
    await api.del(`/api/life/links?a_type=${type}&a_id=${id}&b_type=${target.type}&b_id=${target.id}`, { silentSuccess: true });
    await load();
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
          <Link2 className="h-3.5 w-3.5" /> Связано
        </div>
        <button type="button" onClick={() => setAdding((v) => !v)} className="flex items-center gap-1 text-xs text-brand-mint hover:underline">
          <Plus className="h-3.5 w-3.5" /> Привязать
        </button>
      </div>

      {adding ? (
        <div className="relative">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти страницу, поездку, желание, книгу, цель…" className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" />
          {busy ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-white/40" /> : null}
          {candidates.length ? (
            <div className="mt-1 max-h-56 overflow-auto rounded-xl border border-white/10 bg-brand-night">
              {candidates.map((c) => (
                <button key={`${c.type}-${c.id}`} type="button" onClick={() => link(c)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/10">
                  <span>{TYPE_EMOJI[c.type] || '•'}</span>
                  <span className="min-w-0 flex-1 truncate text-white">{c.title}</span>
                  <span className="shrink-0 text-[11px] text-white/40">{c.type_label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {items === null ? (
        <div className="text-xs text-white/35">…</div>
      ) : items.length === 0 ? (
        <div className="text-xs leading-5 text-white/40">Пока ничего. Поставьте такой же тег, как у страницы, поездки или цели, — или привяжите вручную.</div>
      ) : (
        <div className="grid gap-1.5">
          {items.map((it) => (
            <div key={`${it.type}-${it.id}`} className="group flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-2 transition hover:bg-white/[0.07]">
              <button type="button" onClick={() => navigate(it.url)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                <FallbackImg src={imgSrc(it.image)} className="h-9 w-9 shrink-0 rounded-lg object-cover" fallback={<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-lg">{TYPE_EMOJI[it.type] || '•'}</span>} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-white">{it.title}</span>
                  <span className="flex flex-wrap items-center gap-1 text-[11px] text-white/45">
                    {it.type_label}
                    {it.subtitle ? ` · ${it.subtitle}` : ''}
                    {it.linked ? <span title="Привязано вручную">· 🔗</span> : null}
                    {(it.via_tags || []).map((t) => (
                      <span key={t.id} className="rounded-full px-1.5" style={{ background: `${t.color}33`, color: t.color }}>#{t.label}</span>
                    ))}
                  </span>
                  {it.type === 'wish' && it.extra?.status !== 'got' ? <SavingsBar price={it.extra?.price} saved={it.extra?.saved} currency={it.extra?.currency} compact /> : null}
                </span>
              </button>
              {it.linked ? (
                <button type="button" onClick={() => unlink(it)} className="shrink-0 rounded p-1 text-white/30 opacity-0 transition hover:text-rose-300 group-hover:opacity-100" title="Отвязать">
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

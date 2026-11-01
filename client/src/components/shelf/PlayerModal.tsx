import React, { useEffect, useState } from 'react';
import { Check, ExternalLink, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { api } from '../../api';
import { Modal } from '../ui/Modal';

// Плеер на полке: сервер ищет тайтл на сайте (адрес — «Настройки → Интеграции → Плеер»), открывает найденную
// страницу, выбирает озвучку и серию и отдаёт адрес плеера. «Это то аниме?» — «Да» запоминает страницу в карточке.

type PlayerItem = { id: number; title: string; status: string; meta?: { progress?: number | null; episodes?: number | null; player_url?: string; [k: string]: any } };
type Candidate = { href: string; title: string; image?: string | null };
type Result = {
  dubs?: string[]; dub?: number; episodes?: string[]; ep?: number; src?: string; page?: string; error?: string; steps?: string[];
  candidates?: Candidate[]; candidate?: number; confirmed?: boolean;
};

export default function PlayerModal({ item, onClose, onUpdate }: { item: PlayerItem; onClose: () => void; onUpdate: (patch: any) => void }) {
  const [data, setData] = useState<Result | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [index, setIndex] = useState(0);
  const [confirmed, setConfirmed] = useState(!!item.meta?.player_url);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marked, setMarked] = useState<string | null>(null);

  // search — искать на сайте и открыть результат № candidate; url — открыть эту страницу с другой озвучкой/серией
  const load = async (opts: { dub?: number | ''; ep?: number | ''; search?: boolean; candidate?: number; url?: string }) => {
    setLoading(true);
    setError(null);
    setMarked(null);
    try {
      const res: Result = await api.post(
        '/api/life/shelf/player',
        { item_id: item.id, dub: opts.dub ?? '', ep: opts.ep ?? '', search: opts.search, candidate: opts.candidate, url: opts.url },
        { silentSuccess: true, silentError: true }
      );
      setData(res);
      if (res?.error) setError(res.error);
      if (res?.candidates) {
        setCandidates(res.candidates);
        setIndex(res.candidate ?? 0);
        setConfirmed(false);
      } else if (res?.confirmed) setConfirmed(true);
    } catch (e: any) {
      setError(e?.message || 'Не удалось открыть страницу');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    // есть подтверждённая страница — сразу её; нет — поиск на сайте
    load(item.meta?.player_url ? {} : { search: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const current = candidates[index];
  const page = data?.page || current?.href;
  // смена озвучки/серии — на той же странице, без нового поиска
  const reload = (dub: number | '', ep: number | '') => load({ dub, ep, url: confirmed ? undefined : page });

  const yes = async () => {
    if (!page) return;
    await api.post('/api/life/shelf/player/confirm', { item_id: item.id, url: page }, { silentSuccess: true, silentError: true });
    onUpdate({ meta: { ...(item.meta || {}), player_url: page } });
    setConfirmed(true);
    setCandidates([]);
  };
  const next = () => load({ search: true, candidate: index + 1 });
  const researchFromScratch = async () => {
    await api.post('/api/life/shelf/player/confirm', { item_id: item.id, url: '' }, { silentSuccess: true, silentError: true });
    const meta = { ...(item.meta || {}) };
    delete meta.player_url;
    onUpdate({ meta });
    setConfirmed(false);
    load({ search: true, candidate: 0 });
  };

  // «Серия просмотрена»: прогресс на полке = номер серии; после последней — «Готово»
  const markWatched = () => {
    if (!data?.episodes?.length) return;
    const label = data.episodes[data.ep ?? 0] || '';
    const num = Number(label.match(/\d+/)?.[0]) || (data.ep ?? 0) + 1;
    const progress = Math.max(item.meta?.progress || 0, num);
    const total = item.meta?.episodes || data.episodes.length || null;
    const done = !!total && progress >= total;
    onUpdate({ meta: { ...(item.meta || {}), progress }, status: done ? 'done' : item.status === 'done' ? 'done' : 'active' });
    setMarked(done ? 'Все серии просмотрены — тайтл отмечен «Готово» 🎉' : `Отмечено: просмотрено ${progress}${total ? ` из ${total}` : ''}`);
  };

  const select = 'rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none';
  return (
    <Modal open onClose={onClose} showCloseButton contentClassName="w-full max-w-5xl rounded-3xl border border-white/10 bg-brand-night p-5 shadow-2xl">
      <div className="space-y-3">
        <div className="pr-8 text-lg font-semibold text-white">▶ {item.title}</div>

        {/* «Это то аниме?» — пока результат поиска не подтверждён */}
        {!confirmed && current ? (
          <div className="flex items-center gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-3">
            {current.image ? <img src={current.image} alt="" className="h-16 w-12 shrink-0 rounded-lg object-cover" referrerPolicy="no-referrer" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} /> : null}
            <div className="min-w-0 flex-1">
              <div className="text-sm text-white">Это то аниме?</div>
              <div className="truncate text-sm font-semibold text-amber-100">{current.title || current.href}</div>
              <div className="text-[11px] text-white/45">результат {index + 1} из {candidates.length}</div>
            </div>
            <button type="button" disabled={loading} onClick={yes} className="flex items-center gap-1.5 rounded-xl bg-brand-mint px-3 py-2 text-sm font-semibold text-brand-deep disabled:opacity-50">
              <Check className="h-4 w-4" /> Да
            </button>
            <button type="button" disabled={loading || index + 1 >= candidates.length} onClick={next} className="flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-40">
              <X className="h-4 w-4" /> {index + 1 >= candidates.length ? 'Больше нет' : 'Нет — следующее'}
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {data?.dubs?.length ? (
            <select className={select} value={data.dub ?? 0} disabled={loading} onChange={(e) => reload(Number(e.target.value), '')}>
              {data.dubs.map((d, i) => (
                <option key={i} value={i}>{d}</option>
              ))}
            </select>
          ) : null}
          {data?.episodes?.length ? (
            <select className={select} value={data.ep ?? 0} disabled={loading} onChange={(e) => reload(data.dub ?? '', Number(e.target.value))}>
              {data.episodes.map((x, i) => (
                <option key={i} value={i}>Серия {x}</option>
              ))}
            </select>
          ) : null}
          {loading ? (
            <span className="flex items-center gap-2 text-sm text-white/60"><Loader2 className="h-4 w-4 animate-spin" /> {data ? 'Открываю…' : 'Ищу на сайте…'}</span>
          ) : (
            <button type="button" onClick={() => reload(data?.dub ?? '', data?.ep ?? '')} className="flex items-center gap-1 text-sm text-white/50 hover:text-white" title="Загрузить заново">
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
          <div className="ml-auto flex items-center gap-3">
            {confirmed ? (
              <button type="button" disabled={loading} onClick={researchFromScratch} className="flex items-center gap-1 text-xs text-white/45 hover:text-white" title="Найти заново на сайте">
                <Search className="h-3.5 w-3.5" /> Не то аниме?
              </button>
            ) : null}
            {page ? (
              <a href={page} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-white/45 hover:text-white">
                <ExternalLink className="h-3.5 w-3.5" /> страница
              </a>
            ) : null}
            {data?.episodes?.length ? (
              <button type="button" onClick={markWatched} className="flex items-center gap-1.5 rounded-xl bg-brand-mint px-3 py-2 text-sm font-semibold text-brand-deep">
                <Check className="h-4 w-4" /> Серия просмотрена
              </button>
            ) : null}
          </div>
        </div>
        {data && !data.dubs?.length && data.steps?.length ? <div className="text-xs text-white/45">Озвучки не найдены: {data.steps.join(' → ')}</div> : null}
        {marked ? <div className="text-sm text-brand-mint">{marked}</div> : null}
        {error ? (
          <div className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
            {page ? <div className="mt-1 break-all text-xs text-rose-200/70">Адрес: {page}</div> : null}
          </div>
        ) : null}
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
          {data?.src ? (
            <iframe key={data.src} src={data.src} className="absolute inset-0 h-full w-full" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen referrerPolicy="no-referrer-when-downgrade" title={item.title} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-white/40">{loading ? 'Загрузка плеера…' : 'Плеер не загружен'}</div>
          )}
        </div>
      </div>
    </Modal>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import { Link } from 'react-router-dom';
import { ChevronDown, Loader2, Search, Trophy } from 'lucide-react';
import Shell from '../components/Shell';
import { api, resolveApiUrl } from '../api';
import { rarityStyle } from '../achievements';
import { presetCss } from '../components/profile/profileStyle';

type Achievement = {
  id: number;
  title: string;
  description: string | null;
  icon: string;
  rarity: string;
  category: string | null;
  xp_reward: number;
  earned: boolean;
  earned_at?: string | null;
  progress: number;
  threshold: number;
  unit?: string | null;
  hidden?: boolean;
  global_pct?: number;
};

type Filter = 'all' | 'earned' | 'locked';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Все достижения' },
  { id: 'earned', label: 'Полученные' },
  { id: 'locked', label: 'Неполученные' },
];

const fmt = new Intl.NumberFormat('ru-RU');
const unlockedAt = (iso?: string | null) =>
  iso
    ? `Разблокировано ${new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}, ${new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
    : 'Разблокировано';

/** Страница ачивок в стиле Steam: шапка с прогрессом, список полученных и неполученных. */
export default function Achievements() {
  const [items, setItems] = useState<Achievement[]>([]);
  const [usersTotal, setUsersTotal] = useState(1);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [globalStats, setGlobalStats] = useState(() => {
    try {
      return localStorage.getItem('lifehub:ach-global') === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    Promise.all([api.get('/api/achievements'), api.get('/api/life/profile', { silentError: true }).catch(() => null)])
      .then(([payload, prof]) => {
        setItems(Array.isArray(payload?.items) ? payload.items : []);
        setUsersTotal(payload?.users_total || 1);
        setProfile(prof);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('lifehub:ach-global', globalStats ? '1' : '0');
    } catch {
      // приватный режим — просто не запоминаем
    }
  }, [globalStats]);

  const categories = useMemo(() => Array.from(new Set(items.filter((i) => !i.hidden).map((i) => i.category || 'Разное'))).sort(), [items]);
  const earned = items.filter((i) => i.earned);
  const xpTotal = earned.reduce((sum, i) => sum + (i.xp_reward || 0), 0);
  const pct = items.length ? Math.round((earned.length * 1000) / items.length) / 10 : 0;

  const matches = (i: Achievement) => {
    if (category !== 'all' && (i.category || 'Разное') !== category) return false;
    const q = query.trim().toLowerCase();
    return !q || `${i.title} ${i.description || ''}`.toLowerCase().includes(q);
  };
  const unlocked = earned.filter(matches).sort((a, b) => (b.earned_at || '').localeCompare(a.earned_at || ''));
  const lockedAll = items.filter((i) => !i.earned);
  const hiddenLeft = lockedAll.filter((i) => i.hidden).length;
  const locked = lockedAll
    .filter((i) => !i.hidden && matches(i))
    .sort((a, b) => b.progress / Math.max(1, b.threshold) - a.progress / Math.max(1, a.threshold));

  const style = profile?.style;
  const background = style?.background_url
    ? `url(${resolveApiUrl(style.background_url)}) center / cover no-repeat`
    : presetCss(style?.background_preset || 'steam');
  const user = profile?.user;

  return (
    <Shell>
      <div className="mx-auto w-full max-w-6xl">
        {/* Шапка с размытым фоном профиля */}
        <div className="relative overflow-hidden rounded-t-2xl">
          <div className="absolute inset-0 scale-110 blur-xl" style={{ background }} />
          <div className="absolute inset-0 bg-gradient-to-b from-brand-night/40 via-brand-night/70 to-brand-night" />
          <div className="relative px-4 pb-6 pt-4 sm:px-8">
            <div className="flex items-center gap-3 rounded-lg bg-black/40 px-4 py-3 shadow-lg">
              {user?.avatar_url ? (
                <img src={resolveApiUrl(user.avatar_url)} alt="" className="h-12 w-12 rounded object-cover ring-1 ring-white/20" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded bg-white/10 text-lg">👤</div>
              )}
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm text-[#c6d4df]">
                <Link to="/profile-full" className="text-xl font-semibold text-white hover:text-brand-mint">
                  {user?.name || 'Профиль'}
                </Link>
                <span className="text-white/40">»</span>
                <span>Достижения (Life Hub)</span>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-end">
              <div
                className="flex h-44 w-32 shrink-0 flex-col items-center justify-center gap-2 rounded border-2 border-white/80 shadow-2xl"
                style={{ background: 'linear-gradient(160deg, rgb(var(--brand-slate-rgb)) 0%, rgb(var(--brand-night-rgb)) 55%, rgb(var(--brand-mint-rgb)) 160%)' }}
              >
                <Trophy size={48} className="text-amber-300 drop-shadow" />
                <span className="text-xs font-bold uppercase tracking-widest text-white/80">Life Hub</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-2xl font-semibold text-white sm:text-3xl">Достижения Life Hub</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-[#c6d4df]">
                  <span>
                    Достижения: {earned.length} / {items.length}
                  </span>
                  <span className="h-3 w-px bg-white/30" />
                  <span>Опыт за достижения: {fmt.format(xpTotal)} XP</span>
                </div>
                <div className="mt-4 rounded bg-black/40 px-4 py-3">
                  <div className="text-sm text-white">
                    Разблокировано достижений: <b>{earned.length}/{items.length}</b> <span className="text-[#8f98a0]">({fmt.format(pct)} %)</span>
                  </div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-black/60">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand-mint to-brand-slate" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-b-2xl bg-brand-night px-3 pb-6 pt-2 sm:px-8">
          {/* Панель фильтров */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-white">
              Глобальная статистика
              <button
                type="button"
                role="switch"
                aria-checked={globalStats}
                onClick={() => setGlobalStats((v) => !v)}
                className={classNames('relative h-5 w-9 rounded-full transition', globalStats ? 'bg-brand-mint' : 'bg-white/20')}
              >
                <span className={classNames('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', globalStats ? 'left-[18px]' : 'left-0.5')} />
              </button>
            </label>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded border-none bg-brand-deep px-3 py-2 text-sm text-white outline-none"
              >
                <option value="all">Все категории</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <div className="relative">
                <button type="button" onClick={() => setFilterOpen((v) => !v)} className="inline-flex items-center gap-1 px-2 py-2 text-sm text-white hover:text-brand-mint">
                  {FILTERS.find((f) => f.id === filter)!.label} <ChevronDown size={14} />
                </button>
                {filterOpen && (
                  <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded bg-brand-slate shadow-xl">
                    {FILTERS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                          setFilter(f.id);
                          setFilterOpen(false);
                        }}
                        className={classNames('block w-full px-3 py-2 text-left text-sm hover:bg-[#dcdedf] hover:text-brand-deep', filter === f.id ? 'text-white' : 'text-[#c6d4df]')}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск…"
                  className="w-48 rounded bg-brand-deep py-2 pl-3 pr-8 text-sm text-white outline-none placeholder:text-[#8f98a0] focus:ring-1 focus:ring-brand-mint"
                />
                <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/70" />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-white/60">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Загружаем…
            </div>
          ) : (
            <>
              {filter !== 'locked' && (
                <Section title={`Разблокированные достижения (${unlocked.length})`}>
                  {unlocked.length === 0 && <Empty>Пока ничего — первые достижения придут сами, просто пользуйтесь Life Hub.</Empty>}
                  {unlocked.map((item) => (
                    <Row key={item.id} item={item} globalStats={globalStats} usersTotal={usersTotal} right={<span className="text-xs text-[#8f98a0] sm:text-[13px]">{unlockedAt(item.earned_at)}</span>} />
                  ))}
                </Section>
              )}

              {filter !== 'earned' && (
                <Section title={`Заблокированные достижения (${locked.length + hiddenLeft})`}>
                  {locked.map((item) => {
                    const progressPct = Math.min(100, Math.round((item.progress * 100) / Math.max(1, item.threshold)));
                    return (
                      <Row
                        key={item.id}
                        item={item}
                        globalStats={globalStats}
                        usersTotal={usersTotal}
                        right={
                          item.threshold > 1 ? (
                            <div className="w-40 text-right sm:w-56">
                              <div className="text-xs text-[#8f98a0]">
                                {fmt.format(Math.min(item.progress, item.threshold))} / {fmt.format(item.threshold)} {item.unit || ''}
                              </div>
                              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/50">
                                <div className="h-full bg-gradient-to-r from-brand-mint to-brand-slate" style={{ width: `${progressPct}%` }} />
                              </div>
                            </div>
                          ) : null
                        }
                      />
                    );
                  })}
                  {hiddenLeft > 0 && !query && category === 'all' && (
                    <div className="flex items-center gap-3 px-2 py-3">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center bg-black/40 text-2xl">❔</div>
                      <div>
                        <div className="font-semibold text-white">Осталось скрытых достижений: {hiddenLeft}</div>
                        <div className="text-sm text-[#8f98a0]">Подробности о каждом достижении будут показаны после его получения</div>
                      </div>
                    </div>
                  )}
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded bg-brand-night/80 px-2 pb-2 pt-3 sm:px-4">
      <div className="mb-2 px-1 text-sm font-medium uppercase tracking-wide text-[#c6d4df]">{title}</div>
      <div className="divide-y divide-white/5">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-2 py-6 text-center text-sm text-[#8f98a0]">{children}</div>;
}

function Row({ item, right, globalStats, usersTotal }: { item: Achievement; right: React.ReactNode; globalStats: boolean; usersTotal: number }) {
  const r = rarityStyle(item.rarity);
  return (
    <div className="flex items-center gap-3 px-1 py-2.5 sm:px-2">
      <div
        className={classNames(
          'flex h-14 w-14 shrink-0 items-center justify-center border text-3xl',
          item.earned ? classNames('bg-gradient-to-br', r.bg, r.ring) : 'border-white/10 bg-black/40 opacity-50 grayscale'
        )}
        title={r.label}
      >
        {item.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className={classNames('font-semibold', item.earned ? 'text-white' : 'text-[#c6d4df]')}>{item.title}</div>
        <div className="text-sm text-[#acb2b8]">{item.description}</div>
        {globalStats && (
          <div className="mt-1 flex items-center gap-2 text-[11px] text-[#8f98a0]">
            <div className="h-1 w-24 overflow-hidden rounded-full bg-black/50">
              <div className="h-full bg-brand-mint" style={{ width: `${Math.min(100, item.global_pct || 0)}%` }} />
            </div>
            {fmt.format(item.global_pct || 0)} % пользователей{usersTotal > 1 ? '' : ' (вы единственный)'} · +{item.xp_reward} XP
          </div>
        )}
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  );
}

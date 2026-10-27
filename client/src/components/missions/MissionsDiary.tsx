import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import classNames from 'classnames';
import { Loader2, X } from 'lucide-react';
import { api } from '../../api';
import type { WeeklyMissionSummary } from '../WeeklyMissionsOverlay';
import './missionsDiary.css';

type DailyMission = {
  id: number;
  title: string;
  description: string | null;
  points: number;
  xp_reward: number;
  sort_order: number;
  progress_value: number;
  target_value: number;
  progress_unit: string | null;
  completed: boolean;
  claimable: boolean;
  reward_claimed: boolean;
};

type Summary = {
  date: string;
  target_points: number;
  total_points: number;
  remaining_points: number;
  completed_count: number;
  claimed_count: number;
  total_count: number;
  xp_earned: number;
  missions: DailyMission[];
};

type Filter = 'all' | 'claimable' | 'active' | 'done';

const fmt = (value: number) => new Intl.NumberFormat('ru-RU').format(Math.max(0, Math.round(value || 0)));

const doodle = (mission: DailyMission) => {
  const t = `${mission.title} ${mission.progress_unit || ''}`.toLowerCase();
  if (t.includes('шаг')) return '👣';
  if (t.includes('сон') || t.includes('сна') || t.includes('выспит')) return '🌙';
  if (t.includes('дневник') || t.includes('мысл') || t.includes('запиш')) return '🖋️';
  if (t.includes('урок') || t.includes('обучен')) return '🎓';
  if (t.includes('язык') || t.includes('слов')) return '📖';
  if (t.includes('трен') || t.includes('ккал') || t.includes('мин')) return '🏃';
  if (t.includes('привыч')) return '🌱';
  if (t.includes('цел')) return '🎯';
  if (t.includes('вод')) return '🫖';
  return '✦';
};

const statusRank = (m: DailyMission) => (m.claimable ? 0 : !m.completed ? 1 : 2);

/** Ежедневные задания в виде потёртого дневника (cozy): разворот книги, страницы в линейку, сургучные печати. */
export default function MissionsDiary({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  // Разворот «неделя» — вторая глава того же дневника
  const [view, setView] = useState<'day' | 'week'>('day');
  const [week, setWeek] = useState<WeeklyMissionSummary | null>(null);
  const [stamped, setStamped] = useState<number | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setSummary((await api.get('/api/life/daily-missions')) as Summary);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setView('day');
    load().catch(() => {});
    api.get('/api/life/weekly-missions', { silentError: true }).then((res) => setWeek(res as WeeklyMissionSummary)).catch(() => {});
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (view === 'week') setView('day');
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, view]);

  const claim = async (mission: DailyMission) => {
    if (!mission.claimable || claimingId) return;
    setClaimingId(mission.id);
    try {
      const res = await api.post(
        `/api/life/daily-missions/${mission.id}/complete`,
        { date: summary?.date },
        { notifySuccess: `+${fmt(mission.points)} очков и +${fmt(mission.xp_reward)} XP` }
      );
      setStamped(mission.id);
      window.setTimeout(() => setStamped(null), 900);
      if (res?.summary) setSummary(res.summary as Summary);
      else await load(true);
    } catch {
      await load(true).catch(() => {});
    } finally {
      setClaimingId(null);
    }
  };

  const missions = useMemo(() => {
    const list = [...(summary?.missions ?? [])].sort((a, b) => statusRank(a) - statusRank(b) || a.sort_order - b.sort_order);
    return list.filter((m) => (filter === 'claimable' ? m.claimable : filter === 'active' ? !m.completed : filter === 'done' ? m.reward_claimed : true));
  }, [summary, filter]);

  if (!open) return null;

  const target = summary?.target_points ?? 500;
  const total = summary?.total_points ?? 0;
  const pct = target > 0 ? Math.min(100, Math.round((total * 100) / target)) : 0;
  const claimable = (summary?.missions ?? []).filter((m) => m.claimable).length;
  const date = summary?.date ? new Date(`${summary.date}T00:00:00`) : new Date();
  const weekday = date.toLocaleDateString('ru-RU', { weekday: 'long' });
  const dayMonth = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const milestones = Array.from({ length: Math.max(1, Math.floor(target / 100)) }, (_, i) => (i + 1) * 100);
  const mood = pct >= 100 ? 'День прожит не зря. Можно заварить чай и отдыхать ☕' : pct >= 50 ? 'Больше половины позади — так держать!' : total > 0 ? 'Хорошее начало. Шаг за шагом.' : 'Чистая страница. С чего начнём сегодня?';

  const tabs: { id: Filter; label: string; count?: number }[] = [
    { id: 'all', label: 'Все' },
    { id: 'claimable', label: 'Забрать', count: claimable },
    { id: 'active', label: 'В пути' },
    { id: 'done', label: 'Готово' },
  ];

  return createPortal(
    <div className="diary-overlay fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="diary-book relative w-full max-w-5xl sm:mt-8">
        {/* Закладка-ленточка */}
        <div className="diary-ribbon" aria-hidden />

        {/* Вкладки-стикеры сверху */}
        <div className="absolute -top-8 right-16 z-0 hidden gap-1 sm:flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setView('day');
                setFilter(tab.id);
              }}
              className={classNames('diary-tab', view === 'day' && filter === tab.id && 'diary-tab--active')}
            >
              {tab.label}
              {tab.count ? <span className="ml-1 rounded-full bg-[#8b3a2f] px-1.5 text-[10px] text-[#fbeee0]">{tab.count}</span> : null}
            </button>
          ))}
          <button type="button" onClick={() => setView('week')} className={classNames('diary-tab', view === 'week' && 'diary-tab--active')}>
            Неделя
          </button>
        </div>

        <button type="button" onClick={onClose} className="diary-close" aria-label="Закрыть дневник">
          <X size={18} />
        </button>

        <div className="diary-cover">
          <div className="diary-spread">
            {view === 'week' ? (
              <DiaryWeek week={week} onBack={() => setView('day')} />
            ) : (
            <>
            {/* Левая страница — день */}
            <section className="diary-page diary-page--left">
              <div className="diary-hand text-[15px] text-[#8b6a4a]">Дневник заданий</div>
              <div className="diary-hand mt-1 text-4xl leading-none text-[#3b2a1c] first-letter:uppercase sm:text-5xl">{weekday}</div>
              <div className="diary-serif mt-1 text-sm italic text-[#7a5c40]">{dayMonth}</div>

              <div className="mt-6">
                <div className="diary-serif mb-1 flex justify-between text-xs text-[#7a5c40]">
                  <span>Собрано очков</span>
                  <span>
                    <b className="text-[#3b2a1c]">{fmt(total)}</b> из {fmt(target)}
                  </span>
                </div>
                {/* «Чернильная» дорожка с отметками каждые 100 очков */}
                <div className="diary-track">
                  <div className="diary-track__ink" style={{ width: `${pct}%` }} />
                  {milestones.map((value) => (
                    <span
                      key={value}
                      className={classNames('diary-track__mark', total >= value && 'diary-track__mark--done')}
                      style={{ left: `${Math.min(100, (value * 100) / target)}%` }}
                      title={`${fmt(value)} очков`}
                    >
                      {value === milestones[milestones.length - 1] ? '🎁' : '✦'}
                    </span>
                  ))}
                </div>
              </div>

              <ul className="diary-serif mt-7 space-y-2 text-[15px] text-[#4a3524]">
                <li className="diary-line">
                  ✔ Выполнено: <b>{summary?.completed_count ?? 0}</b> из {summary?.total_count ?? 0}
                </li>
                <li className="diary-line">
                  ✉ Наград получено: <b>{summary?.claimed_count ?? 0}</b>
                </li>
                <li className="diary-line">
                  ✧ Опыта за день: <b>+{fmt(summary?.xp_earned ?? 0)} XP</b>
                </li>
                <li className="diary-line">
                  ⌛ Осталось до цели: <b>{fmt(summary?.remaining_points ?? Math.max(0, target - total))}</b>
                </li>
              </ul>

              <div className="diary-note diary-hand mt-6 text-xl leading-snug text-[#5b3f2a]">{mood}</div>

              <button type="button" onClick={() => setView('week')} className="diary-sticker mt-6">
                📜 Задания недели →
              </button>

              {/* Мобильные вкладки */}
              <div className="mt-5 flex flex-wrap gap-1.5 sm:hidden">
                {tabs.map((tab) => (
                  <button key={tab.id} type="button" onClick={() => setFilter(tab.id)} className={classNames('diary-chip', filter === tab.id && 'diary-chip--active')}>
                    {tab.label}
                    {tab.count ? ` · ${tab.count}` : ''}
                  </button>
                ))}
              </div>
            </section>

            {/* Правая страница — список заданий */}
            <section className="diary-page diary-page--right">
              <div className="diary-hand mb-2 text-2xl text-[#3b2a1c]">Что сделать сегодня</div>
              {loading && !summary ? (
                <div className="diary-serif flex items-center gap-2 py-10 text-[#7a5c40]">
                  <Loader2 className="h-4 w-4 animate-spin" /> Листаем страницы…
                </div>
              ) : missions.length === 0 ? (
                <div className="diary-hand py-10 text-center text-2xl text-[#8b6a4a]">{filter === 'all' ? 'Сегодня страница пуста…' : 'Здесь пока ничего нет'}</div>
              ) : (
                <ol className="diary-list">
                  {missions.map((m) => {
                    const goal = Math.max(1, Math.round(m.target_value || 0));
                    const cur = Math.max(0, Math.min(goal, Math.round(m.progress_value || 0)));
                    const mpct = Math.round((cur * 100) / goal);
                    return (
                      <li key={m.id} className={classNames('diary-item', m.reward_claimed && 'diary-item--done', stamped === m.id && 'diary-item--stamp')}>
                        <span className={classNames('diary-check', m.completed && 'diary-check--on')} aria-hidden>
                          {m.completed ? '✓' : ''}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-base">{doodle(m)}</span>
                            <span className="diary-serif diary-title text-[15px] font-semibold text-[#3b2a1c]">{m.title}</span>
                          </div>
                          {m.description && <div className="diary-serif text-xs italic text-[#8b6a4a]">{m.description}</div>}
                          <div className="mt-1 flex items-center gap-2">
                            <div className="diary-mini-track">
                              <div style={{ width: `${mpct}%` }} />
                            </div>
                            <span className="diary-hand whitespace-nowrap text-base text-[#6b4c33]">
                              {fmt(cur)}/{fmt(goal)} {m.progress_unit || ''}
                            </span>
                          </div>
                          <div className="diary-serif mt-0.5 text-[11px] text-[#9a7a5a]">
                            +{fmt(m.points)} ✦ · +{fmt(m.xp_reward)} XP
                          </div>
                        </div>
                        {m.reward_claimed ? (
                          <span className="diary-stamp" title="Награда получена">
                            ГОТОВО
                          </span>
                        ) : m.claimable ? (
                          <button type="button" onClick={() => claim(m)} disabled={claimingId === m.id} className="diary-seal" title="Забрать награду">
                            {claimingId === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Забрать'}
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              )}
              <div className="diary-serif mt-4 text-right text-[11px] italic text-[#a58866]">— страница {date.getDate()} —</div>
            </section>
            </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

const WEEK_UNITS: Record<string, string> = { missions: 'заданий', points: 'очков', days: 'дней' };

/** Разворот недели: итоги слева, недельные задания справа — в том же стиле дневника. */
function DiaryWeek({ week, onBack }: { week: WeeklyMissionSummary | null; onBack: () => void }) {
  const dm = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const range = week ? `${dm(week.week_start)} — ${dm(week.week_end)}` : '';
  const done = week?.completed_count ?? 0;
  const total = week?.total_count ?? 0;
  const note =
    total > 0 && done >= total ? 'Неделя закрыта целиком. Можно гордиться собой ✨' : done > 0 ? 'Хорошая неделя складывается из хороших дней.' : 'Новая неделя — новая глава.';
  return (
    <>
      <section className="diary-page diary-page--left">
        <div className="diary-hand text-[15px] text-[#8b6a4a]">Глава недели</div>
        <div className="diary-hand mt-1 text-4xl leading-none text-[#3b2a1c] sm:text-5xl">Эта неделя</div>
        <div className="diary-serif mt-1 text-sm italic text-[#7a5c40]">{range}</div>
        {!week ? (
          <div className="diary-serif flex items-center gap-2 py-10 text-[#7a5c40]">
            <Loader2 className="h-4 w-4 animate-spin" /> Листаем страницы…
          </div>
        ) : (
          <>
            <div className="mt-6">
              <div className="diary-serif mb-1 flex justify-between text-xs text-[#7a5c40]">
                <span>Закрыто заданий недели</span>
                <span>
                  <b className="text-[#3b2a1c]">{done}</b> из {total}
                </span>
              </div>
              <div className="diary-track">
                <div className="diary-track__ink" style={{ width: `${total ? Math.round((done * 100) / total) : 0}%` }} />
              </div>
            </div>
            <ul className="diary-serif mt-7 space-y-2 text-[15px] text-[#4a3524]">
              <li className="diary-line">
                ✦ Очков за неделю: <b>{fmt(week.total_points)}</b>
              </li>
              <li className="diary-line">
                ☀ Активных дней: <b>{week.active_days}</b> · идеальных: <b>{week.perfect_days}</b>
              </li>
              <li className="diary-line">
                ✔ Заданий дня выполнено: <b>{week.total_completions}</b>
              </li>
              <li className="diary-line">
                ✧ Награды недели: <b>+{fmt(week.reward_points_earned)} ✦ · +{fmt(week.reward_xp_earned)} XP</b>
              </li>
            </ul>
            <div className="diary-note diary-hand mt-6 text-xl leading-snug text-[#5b3f2a]">{note}</div>
          </>
        )}
        <button type="button" onClick={onBack} className="diary-sticker mt-6">
          ← К сегодняшней странице
        </button>
      </section>

      <section className="diary-page diary-page--right">
        <div className="diary-hand mb-1 text-2xl text-[#3b2a1c]">Задания недели</div>
        <div className="diary-serif mb-2 text-xs italic text-[#8b6a4a]">Награда начисляется сама, как только задание выполнено.</div>
        {!week ? null : week.missions.length === 0 ? (
          <div className="diary-hand py-10 text-center text-2xl text-[#8b6a4a]">На этой неделе заданий нет…</div>
        ) : (
          <ol className="diary-list">
            {week.missions.map((m) => {
              const goal = Math.max(1, Math.round(m.target_value || 0));
              const cur = Math.max(0, Math.min(goal, Math.round(m.progress_value || 0)));
              return (
                <li key={m.key} className={classNames('diary-item', m.completed && 'diary-item--done')}>
                  <span className={classNames('diary-check', m.completed && 'diary-check--on')} aria-hidden>
                    {m.completed ? '✓' : ''}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="diary-serif diary-title text-[15px] font-semibold text-[#3b2a1c]">📜 {m.title}</div>
                    {m.description && <div className="diary-serif text-xs italic text-[#8b6a4a]">{m.description}</div>}
                    <div className="mt-1 flex items-center gap-2">
                      <div className="diary-mini-track">
                        <div style={{ width: `${Math.round((cur * 100) / goal)}%` }} />
                      </div>
                      <span className="diary-hand whitespace-nowrap text-base text-[#6b4c33]">
                        {fmt(cur)}/{fmt(goal)} {WEEK_UNITS[m.progress_unit] || ''}
                      </span>
                    </div>
                    <div className="diary-serif mt-0.5 text-[11px] text-[#9a7a5a]">
                      +{fmt(m.reward_points)} ✦ · +{fmt(m.reward_xp)} XP
                    </div>
                  </div>
                  {m.completed && <span className="diary-stamp">ГОТОВО</span>}
                </li>
              );
            })}
          </ol>
        )}
        <div className="diary-serif mt-4 text-right text-[11px] italic text-[#a58866]">— глава недели —</div>
      </section>
    </>
  );
}

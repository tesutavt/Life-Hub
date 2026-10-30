import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import classNames from 'classnames';
import { BookOpen, CheckSquare, Flame, GraduationCap, Loader2, Send, Sparkles, Trophy, type LucideIcon } from 'lucide-react';
import { api } from '../../api';
import { rarityStyle, requestAchievementCheck } from '../../achievements';
import { openMissionsDiary } from '../missions/missionsBus';

type ActivityPayload = {
  days: { date: string; count: number }[];
  active_days: number;
  streak: number;
  level: { level: number; xp: number; current_floor: number; next_at: number; xp_today: number };
};
type DayDetails = { date: string; actions: { action: string; label: string; count: number }[]; achievements: { id: number; title: string; icon: string }[] };
export type ShowcaseAchievement = { id: number; title: string; icon: string; rarity: string; description?: string | null };

const WEEKS = 26;
const MOODS = ['😢', '😕', '😐', '🙂', '😄'];
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const intensity = (count: number) => {
  if (count <= 0) return 'bg-white/[0.06]';
  if (count < 3) return 'bg-brand-mint/25';
  if (count < 7) return 'bg-brand-mint/45';
  if (count < 15) return 'bg-brand-mint/70';
  return 'bg-brand-mint';
};

/** Живая часть профиля: уровень, карта активности, настроение, быстрые действия и витрина ачивок. */
export default function ProfileActivity({ showcase = [], hideSide = false }: { showcase?: ShowcaseAchievement[]; hideSide?: boolean }) {
  const [data, setData] = useState<ActivityPayload | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [details, setDetails] = useState<DayDetails | null>(null);
  const [mood, setMood] = useState<number | null>(null);
  const [thought, setThought] = useState('');
  const [sending, setSending] = useState(false);
  const [continueCourse, setContinueCourse] = useState<{ id: number; title: string; progress_pct: number } | null>(null);
  const [claimable, setClaimable] = useState(0);

  const load = () => api.get('/api/achievements/activity?days=' + WEEKS * 7, { silentError: true }).then(setData);

  useEffect(() => {
    load();
    api.get('/api/learn/courses', { silentError: true }).then((res) => {
      const items = Array.isArray(res?.items) ? res.items : [];
      setContinueCourse(items.find((c: any) => c.progress_pct < 100 && !c.locked) || null);
    });
    api.get('/api/life/daily-missions', { silentError: true }).then((res) => {
      setClaimable((res?.missions || []).filter((m: any) => m.claimable).length);
    });
  }, []);

  useEffect(() => {
    if (!selected) return;
    setDetails(null);
    api.get(`/api/achievements/activity/day?date=${selected}`, { silentError: true }).then(setDetails);
  }, [selected]);

  // Сетка: колонки — недели (последняя — текущая), строки — дни Пн..Вс
  const grid = useMemo(() => {
    const counts = new Map((data?.days || []).map((d) => [d.date, d.count]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - ((today.getDay() + 6) % 7)));
    const start = new Date(end);
    start.setDate(start.getDate() - WEEKS * 7 + 1);
    const weeks: { date: string; count: number; future: boolean; month: number }[][] = [];
    for (let w = 0; w < WEEKS; w += 1) {
      const week = [];
      for (let d = 0; d < 7; d += 1) {
        const day = new Date(start);
        day.setDate(start.getDate() + w * 7 + d);
        const key = iso(day);
        week.push({ date: key, count: counts.get(key) || 0, future: day > today, month: day.getMonth() });
      }
      weeks.push(week);
    }
    return weeks;
  }, [data]);

  const saveMood = async (value: number) => {
    setMood(value);
    await api.post(
      '/api/life/calendar',
      { date: iso(new Date()), title: `Настроение ${MOODS[value]}`, type: 'mood', mood: value + 1 },
      { notifySuccess: 'Настроение записано в календарь' }
    );
    requestAchievementCheck();
    load();
  };

  const sendThought = async () => {
    if (!thought.trim()) return;
    setSending(true);
    try {
      await api.post('/api/life/journal', { date: iso(new Date()), text: thought.trim() }, { notifySuccess: 'Мысль сохранена ✍️' });
      setThought('');
      requestAchievementCheck();
      load();
    } finally {
      setSending(false);
    }
  };

  const level = data?.level;
  const levelPct = level ? Math.min(100, Math.round(((level.xp - level.current_floor) * 100) / Math.max(1, level.next_at - level.current_floor))) : 0;
  const total = (data?.days || []).reduce((sum, d) => sum + d.count, 0);

  return (
    <section className={classNames('grid gap-3', !hideSide && 'mt-4 lg:grid-cols-[minmax(0,1fr)_320px]')}>
      <div className="space-y-3">
        {/* Активность */}
        <div className="card !p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-white">Активность за полгода</div>
              <div className="text-xs text-white/50">
                {total} действий · {data?.active_days ?? 0} активных дней — нажмите на день, чтобы увидеть, что было
              </div>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-white/40">
              меньше
              {[0, 2, 5, 10, 20].map((n) => (
                <span key={n} className={classNames('h-2.5 w-2.5 rounded-[3px]', intensity(n))} />
              ))}
              больше
            </div>
          </div>
          <div className="pb-1">
            <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}>
              {grid.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((day) => (
                    <button
                      key={day.date}
                      type="button"
                      disabled={day.future}
                      onClick={() => setSelected(selected === day.date ? null : day.date)}
                      title={`${new Date(`${day.date}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}: ${day.count} действий`}
                      className={classNames(
                        'aspect-square w-full max-w-[22px] rounded-[4px] transition hover:scale-125 hover:ring-1 hover:ring-white/60',
                        day.future ? 'bg-transparent' : intensity(day.count),
                        selected === day.date && 'ring-2 ring-amber-300'
                      )}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          {selected && (
            <div className="mt-3 rounded-2xl bg-black/25 p-3 text-sm">
              <div className="mb-1 font-semibold text-white first-letter:uppercase">
                {new Date(`${selected}T00:00:00`).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              {!details ? (
                <Loader2 className="h-4 w-4 animate-spin text-white/50" />
              ) : details.actions.length === 0 && details.achievements.length === 0 ? (
                <div className="text-white/50">В этот день было тихо 🌙</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {details.achievements.map((a) => (
                    <span key={a.id} className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs text-amber-100">
                      {a.icon} {a.title}
                    </span>
                  ))}
                  {details.actions.map((a) => (
                    <span key={a.action} className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/75">
                      {a.label}
                      {a.count > 1 ? ` ×${a.count}` : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Быстрые действия */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="card !p-4">
            <div className="mb-2 text-sm font-semibold text-white">Как настроение сегодня?</div>
            <div className="flex justify-between">
              {MOODS.map((emoji, index) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => saveMood(index)}
                  className={classNames(
                    'flex h-11 w-11 items-center justify-center rounded-2xl text-2xl transition hover:-translate-y-1 hover:bg-white/10',
                    mood === index ? 'scale-110 bg-amber-300/25 ring-2 ring-amber-300' : 'bg-white/5'
                  )}
                  aria-label={`Настроение ${index + 1} из 5`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          <div className="card !p-4">
            <div className="mb-2 text-sm font-semibold text-white">Мысль дня</div>
            <div className="flex gap-2">
              <input
                value={thought}
                onChange={(e) => setThought(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendThought()}
                placeholder="Что сегодня получилось?"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-brand-mint/60"
              />
              <button type="button" disabled={!thought.trim() || sending} onClick={sendThought} className="rounded-xl bg-brand-mint px-3 text-brand-deep disabled:opacity-40" aria-label="Сохранить">
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <QuickLink to={continueCourse ? `/learn/${continueCourse.id}` : '/courses'} icon={GraduationCap} color="text-[#89e219]" title={continueCourse ? 'Продолжить урок' : 'Начать курс'} sub={continueCourse ? `${continueCourse.title} · ${continueCourse.progress_pct}%` : 'Импортируйте курс'} />
          <QuickLink to="/daily-missions" onClick={openMissionsDiary} icon={Sparkles} color="text-amber-300" title="Задания дня" sub={claimable ? `Можно забрать: ${claimable} 🎁` : 'Посмотреть прогресс'} highlight={claimable > 0} />
          <QuickLink to="/habits" icon={CheckSquare} color="text-brand-mint" title="Привычки" sub="Отметить за сегодня" />
          <QuickLink to="/languages" icon={BookOpen} color="text-violet-300" title="Словарь" sub="Повторить слова" />
        </div>
      </div>

      {/* Уровень и витрина */}
      {!hideSide && (
      <div className="space-y-3">
        <div className="card !p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(#27e9b5 ${levelPct * 3.6}deg, rgba(255,255,255,0.08) 0deg)` }}>
              <div className="flex h-16 w-16 flex-col items-center justify-center rounded-full bg-brand-night">
                <span className="text-[10px] uppercase text-white/50">ур.</span>
                <span className="text-2xl font-extrabold leading-none text-white">{level?.level ?? '—'}</span>
              </div>
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-semibold text-white">{level ? `${level.xp} XP` : '…'}</div>
              <div className="text-xs text-white/50">до {level ? level.level + 1 : '—'} уровня: {level ? Math.max(0, level.next_at - level.xp) : '—'} XP</div>
              <div className="mt-2 flex gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-orange-400/15 px-2 py-0.5 text-orange-200">
                  <Flame size={12} /> {data?.streak ?? 0} дн.
                </span>
                <span className="rounded-full bg-brand-mint/15 px-2 py-0.5 text-brand-mint/90">+{level?.xp_today ?? 0} XP сегодня</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card !p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-white">Витрина</div>
            <Link to="/achievements" className="inline-flex items-center gap-1 text-xs text-white/50 hover:text-brand-mint">
              <Trophy size={12} /> все ачивки
            </Link>
          </div>
          {showcase.length ? (
            <div className="grid grid-cols-3 gap-2">
              {showcase.map((item) => {
                const style = rarityStyle(item.rarity);
                return (
                  <div key={item.id} title={item.description || item.title} className={classNames('flex flex-col items-center rounded-2xl border bg-gradient-to-br p-2 text-center transition hover:-translate-y-0.5', style.ring, style.bg)}>
                    <span className="text-3xl">{item.icon}</span>
                    <span className="mt-1 line-clamp-2 text-[10px] leading-tight text-white/80">{item.title}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-white/50">Закрепите любимые ачивки на вкладке «Ачивки» ниже — они будут красоваться здесь.</div>
          )}
        </div>
      </div>
      )}
    </section>
  );
}

function QuickLink({ to, icon: Icon, color, title, sub, highlight, onClick }: { to: string; icon: LucideIcon; color: string; title: string; sub: string; highlight?: boolean; onClick?: () => void }) {
  return (
    <Link
      to={to}
      onClick={(e) => {
        if (!onClick) return;
        e.preventDefault();
        onClick();
      }}
      className={classNames(
        'group flex items-center gap-2.5 rounded-2xl border p-3 transition hover:-translate-y-0.5',
        highlight ? 'border-amber-300/50 bg-amber-400/10' : 'border-white/10 bg-white/5 hover:border-white/20'
      )}
    >
      <Icon size={20} className={classNames('shrink-0 transition group-hover:scale-110', color)} />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-white">{title}</div>
        <div className="truncate text-[11px] text-white/50">{sub}</div>
      </div>
    </Link>
  );
}


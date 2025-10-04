import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Flame, Loader2, Sparkles } from 'lucide-react';
import Shell from '../components/Shell';
import { api } from '../api';

type DailyMission = {
  id: number;
  title: string;
  description: string | null;
  points: number;
  xp_reward: number;
  sort_order: number;
  is_active: boolean;
  progress_value: number;
  target_value: number;
  progress_pct: number;
  progress_unit: string | null;
  completed: boolean;
  claimable: boolean;
  reward_claimed: boolean;
  reward_claimed_at: string | null;
};

type DailyMissionSummary = {
  date: string;
  target_points: number;
  total_points: number;
  remaining_points: number;
  progress_pct: number;
  completed_count: number;
  claimed_count: number;
  total_count: number;
  xp_earned: number;
  missions: DailyMission[];
};

const numberFormatter = new Intl.NumberFormat('ru-RU');

const formatProgressLabel = (mission: DailyMission) => {
  const target = Math.max(1, Math.round(mission.target_value ?? 0));
  const current = Math.max(0, Math.round(Math.min(mission.progress_value ?? 0, target)));
  const unit = mission.progress_unit?.trim();
  return unit
    ? `Прогресс ${numberFormatter.format(current)}/${numberFormatter.format(target)} ${unit}`
    : `Прогресс ${numberFormatter.format(current)}/${numberFormatter.format(target)}`;
};

const formatActivity = (value: number) => numberFormatter.format(Math.max(0, Math.round(value)));

export default function DailyMissions() {
  const [summary, setSummary] = useState<DailyMissionSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const missionsContainerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const node = missionsContainerRef.current;
    if (!node) {
      setCanScrollRight(false);
      return;
    }
    const { scrollLeft, scrollWidth, clientWidth } = node;
    const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);
    setCanScrollRight(maxScrollLeft - scrollLeft > 8);
  }, []);

  const loadMissions = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) setLoading(true);
      try {
        const payload = (await api.get('/api/life/daily-missions')) as DailyMissionSummary;
        setSummary(payload);
        return payload;
      } finally {
        if (!silent) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadMissions().catch(() => {
      // Ошибки отображаются глобальным обработчиком api
    });
  }, [loadMissions]);

  const missions = summary?.missions ?? [];

  const handleClaimReward = useCallback(
    async (mission: DailyMission) => {
      if (!mission.claimable || claimingId === mission.id) return;
      setClaimingId(mission.id);
      try {
        const response = await api.post(`/api/life/daily-missions/${mission.id}/complete`, {
          date: summary?.date,
        });
        if (response?.summary) {
          setSummary(response.summary as DailyMissionSummary);
        } else {
          await loadMissions({ silent: true });
        }
      } catch (error) {
        await loadMissions({ silent: true }).catch(() => {});
        throw error;
      } finally {
        setClaimingId(null);
      }
    },
    [claimingId, loadMissions, summary?.date]
  );

  const targetPoints = summary?.target_points ?? 500;
  const totalPoints = summary?.total_points ?? 0;
  const remainingPoints = summary?.remaining_points ?? Math.max(0, targetPoints - totalPoints);

  useEffect(() => {
    const node = missionsContainerRef.current;
    if (!node) {
      setCanScrollRight(false);
      return;
    }

    updateScrollState();
    const handleScroll = () => updateScrollState();
    const handleResize = () => updateScrollState();

    node.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    return () => {
      node.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [missions.length, updateScrollState]);

  const handleScrollRight = useCallback(() => {
    const node = missionsContainerRef.current;
    if (!node) return;
    const scrollAmount = Math.max(280, Math.round(node.clientWidth * 0.8));
    node.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    window.requestAnimationFrame(updateScrollState);
  }, [updateScrollState]);

  const milestoneValues = useMemo(() => {
    const step = 100;
    const target = Math.max(step, Math.round(targetPoints));
    const values: number[] = [];
    for (let value = step; value < target; value += step) {
      values.push(value);
    }
    if (!values.includes(target)) {
      values.push(target);
    }
    return values;
  }, [targetPoints]);

  const leadingProgress = useMemo(() => {
    if (milestoneValues.length === 0) return 0;
    const first = milestoneValues[0];
    if (first <= 0) return 0;
    return Math.max(0, Math.min(1, totalPoints / first));
  }, [milestoneValues, totalPoints]);

  return (
    <Shell>
      <div className="flex flex-wrap items-center justify-between gap-6 rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm uppercase tracking-wide text-slate-300/80">
            <Sparkles size={18} className="text-amber-300" />
            Ежедневные задания
          </div>
          <div className="flex flex-col gap-1 text-lg font-semibold text-white/90">
            <span>
              {summary?.date
                ? new Date(`${summary.date}T00:00:00`).toLocaleDateString('ru-RU', {
                    day: 'numeric',
                    month: 'long',
                  })
                : 'Сегодня'}
            </span>
            <span className="flex flex-wrap items-center gap-2 text-sm font-normal text-slate-200/80">
              Заберите награды на {formatActivity(targetPoints)}
              <Flame size={16} className="text-amber-300" />
              за день.
            </span>
          </div>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-200/80">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold text-white/90">
                <span className="uppercase tracking-wide text-slate-200/70">Собрано</span>
                <span className="inline-flex items-center gap-1 text-base">
                  {formatActivity(totalPoints)}
                  <Flame size={16} className="text-amber-300" />
                </span>
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1">
                Цель {formatActivity(targetPoints)}
                <Flame size={14} className="text-amber-300" />
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1">
                Осталось {formatActivity(remainingPoints)}
                <Flame size={14} className="text-amber-300" />
              </span>
            </div>
            {milestoneValues.length > 0 ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <div className="relative h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="absolute left-0 top-0 h-full bg-gradient-to-r from-amber-300 via-rose-400 to-purple-500 transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.round(leadingProgress * 100))}%` }}
                    />
                  </div>
                  {milestoneValues.map((value, index) => {
                    const prevValue = index === 0 ? 0 : milestoneValues[index - 1];
                    const segmentTotal = Math.max(1, value - prevValue);
                    const circleProgress = Math.max(
                      0,
                      Math.min(1, (totalPoints - prevValue) / segmentTotal)
                    );
                    const achieved = totalPoints >= value;
                    const nextValue = milestoneValues[index + 1];
                    const connectorFill = nextValue
                      ? Math.max(0, Math.min(1, (totalPoints - value) / Math.max(1, nextValue - value)))
                      : 0;

                    return (
                      <React.Fragment key={value}>
                        <div
                          className={`relative flex h-16 w-16 flex-col items-center justify-center overflow-hidden rounded-full border-2 text-xs font-semibold transition ${
                            achieved
                              ? 'border-amber-300/80 bg-white/20 text-white shadow-[0_0_18px_rgba(251,191,36,0.35)]'
                              : 'border-white/15 bg-white/5 text-slate-200/70'
                          }`}
                        >
                          <div
                            className="absolute inset-1 rounded-full bg-gradient-to-br from-amber-300/40 via-rose-400/30 to-purple-500/30 transition-opacity"
                            style={{ opacity: circleProgress }}
                            aria-hidden="true"
                          />
                          <span className="text-[11px] font-semibold tracking-wide">
                            +{formatActivity(value)}
                          </span>
                          <Flame
                            size={18}
                            className={achieved ? 'text-amber-300 drop-shadow' : 'text-slate-200/70'}
                          />
                        </div>
                        {nextValue ? (
                          <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="absolute left-0 top-0 h-full bg-gradient-to-r from-amber-300 via-rose-400 to-purple-500 transition-all duration-500"
                              style={{ width: `${Math.min(100, Math.round(connectorFill * 100))}%` }}
                            />
                          </div>
                        ) : null}
                      </React.Fragment>
                    );
                  })}
                </div>
                <div className="text-xs uppercase tracking-wide text-slate-300/60">
                  Мини-награды каждые 100 очков
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-200/80">
              <span className="rounded-full bg-white/10 px-3 py-1">
                Выполнено {summary?.completed_count ?? 0} из {summary?.total_count ?? 0}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1">
                Наград получено {summary?.claimed_count ?? 0}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1">
                Получено XP {formatActivity(summary?.xp_earned ?? 0)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 flex items-center justify-center rounded-3xl border border-white/10 bg-white/5 py-16 text-slate-200/80">
          <Loader2 className="mr-3 h-5 w-5 animate-spin" /> Загружаем задания…
        </div>
      ) : missions.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-10 text-center text-slate-200/70">
          На сегодня нет заданий. Загляните позже!
        </div>
      ) : (
        <div className="relative mt-6 overflow-hidden">
          <div
            ref={missionsContainerRef}
            className="flex w-full gap-4 overflow-x-hidden pb-4 pr-16 scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            {missions.map((mission) => {
              const claiming = claimingId === mission.id;
              const progressLabel = formatProgressLabel(mission);
              const statusColor = mission.reward_claimed
                ? 'bg-emerald-400/10 text-emerald-200'
                : mission.completed
                ? 'bg-amber-400/10 text-amber-200'
                : 'bg-white/10 text-slate-200/70';

              return (
                <div
                  key={mission.id}
                  className="relative flex w-[280px] min-w-[260px] flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 text-white shadow-lg shadow-brand-night/20 transition hover:border-amber-300/60 hover:bg-white/10"
                >
                  <div className={`inline-flex items-center justify-center rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-wide ${statusColor}`}>
                    {progressLabel}
                  </div>
                  <div className="min-h-[72px] flex-1 text-center">
                    <h3 className="text-lg font-semibold text-white/90">{mission.title}</h3>
                    {mission.description ? (
                      <p className="mt-2 text-sm text-slate-200/70">{mission.description}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-center gap-2 text-sm font-medium text-amber-200">
                    +{formatActivity(mission.points)}
                    <Flame size={16} className="text-amber-300" />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleClaimReward(mission).catch(() => {})}
                    disabled={!mission.claimable || claiming}
                    className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-rose-400 to-purple-500 px-4 py-2 text-sm font-semibold text-brand-night transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {claiming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {mission.reward_claimed
                      ? 'Награда получена'
                      : mission.claimable
                      ? 'Забрать награду'
                      : 'Выполняется'}
                  </button>
                </div>
              );
            })}
          </div>
          {canScrollRight ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-brand-night via-brand-night/40 to-transparent"
            />
          ) : null}
          {canScrollRight ? (
            <button
              type="button"
              onClick={handleScrollRight}
              className="absolute right-4 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-full bg-white/10 p-3 text-white shadow-lg transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-amber-300"
              aria-label="Показать следующие задания"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          ) : null}
        </div>
      )}
    </Shell>
  );
}

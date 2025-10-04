import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Sparkles } from 'lucide-react';
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
  const unitSuffix = unit ? ` ${unit}` : '';
  return `Прогресс ${numberFormatter.format(current)}/${numberFormatter.format(target)}${unitSuffix}`;
};

const formatActivity = (value: number) => numberFormatter.format(Math.max(0, Math.round(value)));

export default function DailyMissions() {
  const [summary, setSummary] = useState<DailyMissionSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [claimingId, setClaimingId] = useState<number | null>(null);

  const dispatchWeeklyRefresh = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('life-weekly-missions-refresh'));
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
  const progressWidth = useMemo(() => {
    const pct = summary?.progress_pct ?? 0;
    if (!Number.isFinite(pct) || pct <= 0) return '0%';
    return `${Math.min(100, Math.max(0, Math.round(pct)))}%`;
  }, [summary?.progress_pct]);

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
        dispatchWeeklyRefresh();
      } catch (error) {
        await loadMissions({ silent: true }).catch(() => {});
        throw error;
      } finally {
        setClaimingId(null);
      }
    },
    [claimingId, dispatchWeeklyRefresh, loadMissions, summary?.date]
  );

  const targetPoints = summary?.target_points ?? 500;
  const totalPoints = summary?.total_points ?? 0;
  const remainingPoints = summary?.remaining_points ?? Math.max(0, targetPoints - totalPoints);

  return (
    <Shell>
      <div className="flex flex-wrap items-center justify-between gap-6 rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="space-y-3">
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
            <span className="text-sm font-normal text-slate-200/80">
              Заберите наград на {formatActivity(targetPoints)} активности, чтобы закрыть дневную планку.
            </span>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-slate-200/80">
              <span>Прогресс активности</span>
              <span>
                {formatActivity(totalPoints)} / {formatActivity(targetPoints)}
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-300 via-orange-400 to-rose-500 transition-all duration-500"
                style={{ width: progressWidth }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-200/80">
              <span className="rounded-full bg-white/10 px-3 py-1">Осталось {formatActivity(remainingPoints)} очков</span>
              <span className="rounded-full bg-white/10 px-3 py-1">
                Выполнено {summary?.completed_count ?? 0} из {summary?.total_count ?? 0}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1">
                Наград получено {summary?.claimed_count ?? 0}
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
        <div className="mt-6">
          <div className="flex gap-4 overflow-x-auto pb-4">
            {missions.map((mission) => {
              const claiming = claimingId === mission.id;
              const progressLabel = formatProgressLabel(mission);
              const activityLabel = `+${formatActivity(mission.points)} активности`;
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
                  <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${statusColor}`}>
                    <CheckCircle2 size={16} />
                    {progressLabel}
                  </div>
                  <div className="min-h-[72px] flex-1 text-center">
                    <h3 className="text-lg font-semibold text-white/90">{mission.title}</h3>
                    {mission.description ? (
                      <p className="mt-2 text-sm text-slate-200/70">{mission.description}</p>
                    ) : null}
                  </div>
                  <div className="text-center text-sm font-medium text-amber-200">{activityLabel}</div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-300 via-rose-400 to-purple-500 transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, Math.round(mission.progress_pct ?? 0)))}%` }}
                    />
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
        </div>
      )}
    </Shell>
  );
}

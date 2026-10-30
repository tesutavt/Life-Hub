import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarRange, CheckCircle2, Loader2, RefreshCcw, Sparkles, Trophy, X } from 'lucide-react';
import { api } from '../api';
import { Modal } from './ui/Modal';

export type WeeklyMission = {
  key: string;
  title: string;
  description: string | null;
  target_value: number;
  progress_value: number;
  progress_pct: number;
  progress_unit: 'missions' | 'points' | 'days';
  reward_points: number;
  reward_xp: number;
  completed: boolean;
  completed_at: string | null;
};

export type WeeklyMissionSummary = {
  week_start: string;
  week_end: string;
  updated_at: string;
  total_points: number;
  total_completions: number;
  perfect_days: number;
  active_days: number;
  reward_points_earned: number;
  reward_xp_earned: number;
  completed_count: number;
  total_count: number;
  missions: WeeklyMission[];
  daily_target_points: number;
};

type WeeklyMissionsOverlayProps = {
  open: boolean;
  onClose: () => void;
  onSummaryLoaded?: (summary: WeeklyMissionSummary) => void;
};

const clampDisplayValue = (value: number) => Math.max(0, Math.round(value));

const formatNumber = (value: number) => new Intl.NumberFormat('ru-RU').format(clampDisplayValue(value));

const formatWeekRange = (start: string, end: string) => {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return '';
  }
  const startLabel = startDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const endLabel = endDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  return `${startLabel} — ${endLabel}`;
};

const formatUpdatedAt = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatProgressLabel = (mission: WeeklyMission) => {
  const current = clampDisplayValue(Math.min(mission.progress_value, mission.target_value));
  const target = clampDisplayValue(mission.target_value);
  switch (mission.progress_unit) {
    case 'points':
      return `${formatNumber(current)} / ${formatNumber(target)} очков`;
    case 'days':
      return `${current} / ${target} дней`;
    case 'missions':
    default:
      return `${current} / ${target} заданий`;
  }
};

const formatUnitSummary = (value: number, unit: WeeklyMission['progress_unit']) => {
  const normalized = clampDisplayValue(value);
  switch (unit) {
    case 'points':
      return `${formatNumber(normalized)} очков`;
    case 'days':
      return `${normalized} дней`;
    default:
      return `${normalized} заданий`;
  }
};

export function WeeklyMissionsOverlay({ open, onClose, onSummaryLoaded }: WeeklyMissionsOverlayProps) {
  const [summary, setSummary] = useState<WeeklyMissionSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const summaryRef = useRef<WeeklyMissionSummary | null>(null);

  useEffect(() => {
    summaryRef.current = summary;
  }, [summary]);

  const loadSummary = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const payload = (await api.get('/api/life/weekly-missions')) as WeeklyMissionSummary;
        setSummary(payload);
        summaryRef.current = payload;
        setError(null);
        if (onSummaryLoaded) {
          onSummaryLoaded(payload);
        }
      } catch (err) {
        setError('Не удалось загрузить еженедельные задания. Попробуйте обновить позже.');
      } finally {
        setLoading(false);
      }
    },
    [onSummaryLoaded]
  );

  useEffect(() => {
    if (open) {
      loadSummary({ silent: summaryRef.current != null });
    }
  }, [open, loadSummary]);

  useEffect(() => {
    const handleRefresh = () => {
      if (open) {
        loadSummary({ silent: summaryRef.current != null });
      }
    };
    window.addEventListener('life-weekly-missions-refresh', handleRefresh);
    return () => window.removeEventListener('life-weekly-missions-refresh', handleRefresh);
  }, [open, loadSummary]);

  const weekRange = useMemo(() => {
    if (!summary) return '';
    return formatWeekRange(summary.week_start, summary.week_end);
  }, [summary]);

  const updatedAt = useMemo(() => formatUpdatedAt(summary?.updated_at ?? null), [summary?.updated_at]);

  const missions = summary?.missions ?? [];
  const completedCount = summary?.completed_count ?? 0;
  const totalCount = summary?.total_count ?? missions.length;
  const completionPct = totalCount > 0 ? Math.min(100, Math.round((completedCount * 100) / totalCount)) : 0;
  const totalPoints = summary?.total_points ?? 0;
  const totalCompletions = summary?.total_completions ?? 0;
  const perfectDays = summary?.perfect_days ?? 0;
  const activeDays = summary?.active_days ?? 0;
  const rewardPointsEarned = summary?.reward_points_earned ?? 0;
  const rewardXpEarned = summary?.reward_xp_earned ?? 0;
  const dailyTargetPoints = summary?.daily_target_points ?? 0;

  const showLoader = loading && !summary;

  return (
    <Modal
      open={open}
      onClose={onClose}
      overlayClassName="bg-brand-deep/80 backdrop-blur-xl"
      contentClassName="w-full max-w-5xl max-h-[85vh] overflow-y-auto rounded-3xl border border-white/10 bg-gradient-to-br from-brand-night/95 via-brand-night/90 to-brand-deep/90 shadow-brand-soft"
      containerClassName="items-center justify-center"
      closeOnOverlayClick
    >
      <div className="relative">
        <div className="absolute inset-0 opacity-60" aria-hidden="true">
          <div className="absolute -right-32 -top-32 h-80 w-80 rounded-full bg-rose-500/30 blur-3xl" />
          <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-sky-500/20 blur-3xl" />
        </div>
        <div className="relative z-10">
          <div className="flex flex-col gap-4 border-b border-white/10 px-8 py-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm uppercase tracking-wide text-amber-200/80">
                <Sparkles size={18} className="text-amber-200" />
                Еженедельные задания
              </div>
              <div className="space-y-1">
                <h2 className="text-2xl font-semibold text-white/95">{weekRange || 'Текущая неделя'}</h2>
                <p className="max-w-xl text-sm text-slate-200/80">
                  Прогресс обновляется автоматически по мере выполнения ежедневных заданий. Закрывайте активности в течение
                  недели и собирайте награды.
                </p>
                {updatedAt ? (
                  <p className="text-xs text-slate-200/60">Обновлено: {updatedAt}</p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-start">
              <button
                type="button"
                onClick={() => loadSummary({ silent: false })}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-white/80 transition hover:border-amber-300 hover:text-white"
                disabled={loading}
              >
                <RefreshCcw size={18} className={loading ? 'animate-spin text-amber-200' : 'text-amber-200'} />
                Обновить
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white/70 transition hover:border-rose-400 hover:text-white"
                aria-label="Закрыть"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="space-y-6 px-8 py-6">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="relative overflow-hidden rounded-2xl border border-brand-mint/20 bg-brand-mint/10 p-5 text-brand-mint/90">
                <div className="flex items-center gap-3 text-sm font-semibold">
                  <CheckCircle2 size={20} className="text-brand-mint/90" />
                  {completedCount} из {totalCount} задач недели
                </div>
                <div className="mt-4 h-2 w-full rounded-full bg-brand-mint/20">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-mint via-brand-mint to-sky-300"
                    style={{ width: `${completionPct}%` }}
                  />
                </div>
                <p className="mt-3 text-xs text-brand-mint/80">
                  Еженедельные задачи автоматически отмечаются, когда достигается цель.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-slate-100">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                  <CalendarRange size={18} className="text-sky-200" />
                  Статистика недели
                </div>
                <ul className="mt-3 space-y-2 text-sm text-slate-200/80">
                  <li>Очки активности: {formatNumber(totalPoints)}</li>
                  <li>Выполнено ежедневных заданий: {formatNumber(totalCompletions)}</li>
                  <li>Полных дней ({dailyTargetPoints} очков): {formatNumber(perfectDays)}</li>
                  <li>Активных дней: {formatNumber(activeDays)}</li>
                </ul>
              </div>

              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/20 via-rose-500/20 to-amber-400/20 p-5 text-white">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Trophy size={18} className="text-amber-200" />
                  Полученные награды
                </div>
                <div className="mt-3 space-y-2 text-sm text-white/90">
                  <div>+{formatNumber(rewardPointsEarned)} очков активности</div>
                  <div>+{formatNumber(rewardXpEarned)} XP</div>
                </div>
                <p className="mt-3 text-xs text-white/70">
                  Награды начисляются один раз за каждую задачу и попадают в ленту активности.
                </p>
              </div>
            </div>

            {error ? (
              <div className="rounded-2xl border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>
            ) : null}

            {showLoader ? (
              <div className="flex items-center justify-center rounded-3xl border border-white/10 bg-white/5 py-16 text-slate-200/80">
                <Loader2 className="mr-3 h-5 w-5 animate-spin" /> Загружаем еженедельные задания…
              </div>
            ) : missions.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center text-slate-200/70">
                Пока нет еженедельных задач для отображения.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {missions.map((mission) => {
                  const progressLabel = formatProgressLabel(mission);
                  const statusClass = mission.completed
                    ? 'border-brand-mint/50 bg-brand-mint/10'
                    : 'border-white/10 bg-white/5';
                  const barClass = mission.completed
                    ? 'from-brand-mint via-brand-mint to-sky-300'
                    : 'from-amber-300 via-orange-400 to-rose-500';
                  const completedAt = mission.completed_at ? formatUpdatedAt(mission.completed_at) : '';

                  return (
                    <div
                      key={mission.key}
                      className={`relative flex h-full flex-col justify-between gap-4 overflow-hidden rounded-3xl border ${statusClass} p-5`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-white/95">{mission.title}</h3>
                            {mission.description ? (
                              <p className="text-sm text-slate-200/80">{mission.description}</p>
                            ) : null}
                          </div>
                          <div className="text-right text-xs text-slate-200/70">
                            Награда:
                            <div className="text-sm font-semibold text-white">
                              +{formatNumber(mission.reward_points)} очков · +{formatNumber(mission.reward_xp)} XP
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-slate-200/70">
                            <span>Прогресс</span>
                            <span>{progressLabel}</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${barClass}`}
                              style={{
                                width:
                                  mission.progress_pct > 0
                                    ? `${Math.max(6, mission.progress_pct)}%`
                                    : '0%',
                              }}
                            />
                          </div>
                          <div className="text-xs text-slate-200/60">
                            {mission.completed
                              ? completedAt
                                ? `Автоматически выполнено ${completedAt}`
                                : 'Задача выполнена.'
                              : `Сделайте ${formatUnitSummary(
                                  Math.max(0, mission.target_value - mission.progress_value),
                                  mission.progress_unit
                                )} до конца недели.`}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default WeeklyMissionsOverlay;

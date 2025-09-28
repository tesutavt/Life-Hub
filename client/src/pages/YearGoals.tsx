import React, { useEffect, useMemo, useState } from 'react';
import Shell from '../components/Shell';
import { api } from '../api';
import { requestMenuCountersRefresh } from '../menuBus';
import SiteSearch from '../components/SiteSearch';
import YearGoalMaster from '../components/master/YearGoalMaster';

const todayISO = () => new Date().toISOString().slice(0, 10);

type Goal = {
  id: number;
  title: string;
  target: number;
  completed: number;
  status: 'active' | 'archived' | string;
  streak_current: number;
  streak_best: number;
  archived_at?: string | null;
  created_at?: string | null;
  completion_pct: number;
  today_done: boolean;
  recent_logs: { date: string }[];
};

type GoalsResponse = {
  active: Goal[];
  archived: Goal[];
};

function formatDate(date: string | null | undefined) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('ru-RU');
}

function streakLabel(goal: Goal) {
  if (goal.streak_current <= 0) return 'Стрик: 0 дней';
  return `Стрик: ${goal.streak_current} дн. (рекорд ${goal.streak_best})`;
}

export default function YearGoals() {
  const [goals, setGoals] = useState<GoalsResponse>({ active: [], archived: [] });
  const [loading, setLoading] = useState(false);
  const [processingGoalId, setProcessingGoalId] = useState<number | null>(null);

  const load = async () => {
    const response = await api.get('/api/life/yearly-goals');
    setGoals(response || { active: [], archived: [] });
    requestMenuCountersRefresh();
  };

  useEffect(() => { load(); }, []);

  const markToday = async (goal: Goal, checked: boolean) => {
    setLoading(true);
    setProcessingGoalId(goal.id);
    try {
      await api.post(`/api/life/yearly-goals/${goal.id}/check`, { date: todayISO(), checked });
      await load();
    } finally {
      setLoading(false);
      setProcessingGoalId(null);
    }
  };

  const updateTarget = async (goal: Goal, target: number) => {
    setLoading(true);
    setProcessingGoalId(goal.id);
    try {
      await api.patch(`/api/life/yearly-goals/${goal.id}`, { target });
      await load();
    } finally {
      setLoading(false);
      setProcessingGoalId(null);
    }
  };

  const deleteGoal = async (goal: Goal) => {
    if (!window.confirm('Удалить цель?')) return;
    setLoading(true);
    setProcessingGoalId(goal.id);
    try {
      await api.del(`/api/life/yearly-goals/${goal.id}`);
      await load();
    } finally {
      setLoading(false);
      setProcessingGoalId(null);
    }
  };

  const activeGoals = goals.active;
  const archivedGoals = goals.archived;

  const totalProgress = useMemo(() => {
    if (!activeGoals.length) return 0;
    const sum = activeGoals.reduce((acc, goal) => acc + goal.completion_pct, 0);
    return Math.round(sum / activeGoals.length);
  }, [activeGoals]);

  return (
    <Shell>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold">Годовые цели</div>
          <p className="text-sm text-white/70">
            Отмечайте прогресс каждый день — при достижении 100% цель автоматически перемещается в архив.
          </p>
        </div>
        <YearGoalMaster onCreated={load} />
      </div>

      <SiteSearch
        sections={['goals', 'pages']}
        className="mb-6 border border-white/15 bg-black/30"
        placeholder="Поиск по целям или страницам..."
      />

      {activeGoals.length > 0 && (
        <div className="mb-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-lg font-semibold">Текущие цели</div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/70">
              Средний прогресс: {totalProgress}%
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {activeGoals.map(goal => (
              <GoalCard
                key={goal.id}
                goal={goal}
                busy={loading && processingGoalId === goal.id}
                onToggleToday={() => markToday(goal, !goal.today_done)}
                onUpdateTarget={(target) => updateTarget(goal, target)}
                onDelete={() => deleteGoal(goal)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="text-lg font-semibold">Архив</div>
          <div className="text-xs uppercase tracking-[0.2em] text-white/50">Завершённые цели</div>
        </div>
        {archivedGoals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-6 text-center text-sm text-white/60">
            Пока нет завершённых целей.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {archivedGoals.map(goal => (
              <div key={goal.id} className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/40 p-4">
                <div className="text-base font-semibold">{goal.title}</div>
                <div className="text-xs text-white/60">
                  Завершена: {formatDate(goal.archived_at)} • {goal.completed}/{goal.target}
                </div>
                <div className="text-xs text-white/50">Рекордный стрик: {goal.streak_best}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}

const GOAL_GRADIENTS = [
  'from-emerald-500/60 via-teal-500/40 to-cyan-500/60',
  'from-violet-500/60 via-indigo-500/40 to-sky-500/60',
  'from-amber-500/60 via-orange-500/40 to-rose-500/60',
  'from-blue-500/60 via-sky-500/40 to-emerald-500/60',
  'from-pink-500/60 via-rose-500/40 to-purple-500/60',
];

const Badge = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-xs text-white/70">
    {children}
  </span>
);

function GoalCard({ goal, busy, onToggleToday, onUpdateTarget, onDelete }: {
  goal: Goal;
  busy: boolean;
  onToggleToday: () => void;
  onUpdateTarget: (target: number) => void;
  onDelete: () => void;
}) {
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetValue, setTargetValue] = useState(goal.target);

  useEffect(() => { setTargetValue(goal.target); }, [goal.target]);

  const confirmTarget = () => {
    setEditingTarget(false);
    if (targetValue !== goal.target) {
      onUpdateTarget(targetValue);
    }
  };

  const gradient = GOAL_GRADIENTS[goal.id % GOAL_GRADIENTS.length];
  const completion = Math.min(100, Math.max(0, goal.completion_pct));
  const recentDates = goal.recent_logs?.slice(0, 6) ?? [];

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5">
      <div className="relative h-32 overflow-hidden">
        <div className={`absolute inset-0 bg-gradient-to-r ${gradient}`} />
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative z-10 flex h-full flex-col justify-between p-4 text-white">
          <div className="text-lg font-semibold leading-tight line-clamp-2 drop-shadow">{goal.title}</div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/80">
            <Badge>Создана: {formatDate(goal.created_at)}</Badge>
            <Badge>{streakLabel(goal)}</Badge>
            {goal.today_done && <Badge>Сегодня выполнено</Badge>}
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="space-y-2">
          <div className="h-2 w-full overflow-hidden rounded bg-white/10">
            <div className="h-full rounded bg-emerald-400 transition-all duration-500" style={{ width: `${completion}%` }} />
          </div>
          <div className="flex flex-wrap items-center justify-between text-xs text-white/70">
            <span>
              {goal.completed} из {goal.target}
            </span>
            <span>{completion}%</span>
          </div>
        </div>

        {recentDates.length > 0 && (
          <div className="flex flex-wrap gap-1 text-[11px] text-white/60">
            {recentDates.map((log, index) => (
              <span key={`${goal.id}-log-${index}`} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                {formatDate(log.date)}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 text-sm">
          <button
            onClick={onToggleToday}
            disabled={busy}
            className={`rounded-lg px-3 py-1 font-medium transition ${
              goal.today_done
                ? 'bg-emerald-500/30 text-emerald-100 hover:bg-emerald-500/40'
                : 'bg-white/10 text-white hover:bg-white/20'
            } ${busy ? 'cursor-wait opacity-70' : ''}`}
          >
            {goal.today_done ? 'Снять отметку' : 'Отметить сегодня'}
          </button>

          {editingTarget ? (
            <div className="flex items-center gap-2 text-xs">
              <input
                type="number"
                min={1}
                value={targetValue}
                onChange={e => setTargetValue(Math.max(1, +e.target.value || 1))}
                className="w-24 rounded-lg border border-white/10 bg-white/10 px-2 py-1"
              />
              <button
                onClick={confirmTarget}
                disabled={busy}
                className="rounded-lg border border-white/20 px-3 py-1 text-xs text-white/80 transition hover:border-white/40 disabled:opacity-60"
              >
                OK
              </button>
              <button
                onClick={() => {
                  setEditingTarget(false);
                  setTargetValue(goal.target);
                }}
                className="rounded-lg border border-transparent px-2 py-1 text-xs text-white/60 hover:text-white"
              >
                Отмена
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditingTarget(true)}
              className="text-xs text-white/70 underline-offset-4 hover:underline"
            >
              Цель: {goal.target}
            </button>
          )}

          <button
            onClick={onDelete}
            disabled={busy}
            className="ml-auto rounded-lg bg-red-500/20 px-3 py-1 text-xs font-semibold text-red-100 transition hover:bg-red-500/40 disabled:opacity-60"
          >
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}

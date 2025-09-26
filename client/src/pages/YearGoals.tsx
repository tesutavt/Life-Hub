import React, { useEffect, useMemo, useState } from 'react';
import Shell from '../components/Shell';
import { api } from '../api';
import { requestMenuCountersRefresh } from '../menuBus';
import SiteSearch from '../components/SiteSearch';

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
  const [form, setForm] = useState({ title: '', target: 30 });
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const response = await api.get('/api/life/yearly-goals');
    setGoals(response || { active: [], archived: [] });
    requestMenuCountersRefresh();
  };

  useEffect(() => { load(); }, []);

  const addGoal = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    setLoading(true);
    try {
      await api.post('/api/life/yearly-goals', form);
      setForm({ title: '', target: 30 });
      await load();
    } finally {
      setLoading(false);
    }
  };

  const markToday = async (goal: Goal, checked: boolean) => {
    setLoading(true);
    try {
      await api.post(`/api/life/yearly-goals/${goal.id}/check`, { date: todayISO(), checked });
      await load();
    } finally {
      setLoading(false);
    }
  };

  const updateTarget = async (goal: Goal, target: number) => {
    setLoading(true);
    try {
      await api.patch(`/api/life/yearly-goals/${goal.id}`, { target });
      await load();
    } finally {
      setLoading(false);
    }
  };

  const deleteGoal = async (goal: Goal) => {
    if (!window.confirm('Удалить цель?')) return;
    setLoading(true);
    try {
      await api.del(`/api/life/yearly-goals/${goal.id}`);
      await load();
    } finally {
      setLoading(false);
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
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="text-2xl font-semibold">Годовые цели</div>
          <p className="text-xs opacity-70">Отмечайте прогресс каждый день. При достижении 100% цель автоматически архивируется.</p>
        </div>
        <form onSubmit={addGoal} className="card flex flex-wrap items-center gap-2">
          <input
            placeholder="Новая цель"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            className="px-3 py-2 rounded bg-white/10"
          />
          <input
            type="number"
            min={1}
            placeholder="Целевой прогресс"
            value={form.target}
            onChange={e => setForm({ ...form, target: Math.max(1, +e.target.value || 1) })}
            className="px-3 py-2 rounded bg-white/10 w-32"
          />
          <button disabled={loading} className="px-4 py-2 rounded bg-white text-black">
            {loading ? 'Сохранение…' : 'Добавить'}
          </button>
        </form>
      </div>

      <SiteSearch
        sections={['goals', 'pages']}
        className="mb-6 bg-black/30 border-white/15"
        placeholder="Поиск по целям или страницам..."
      />

      {activeGoals.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="font-medium">Текущие цели</div>
            <div className="text-sm opacity-80">Средний прогресс: {totalProgress}%</div>
          </div>
          <div className="grid gap-4">
            {activeGoals.map(goal => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onToggleToday={() => markToday(goal, !goal.today_done)}
                onUpdateTarget={(target) => updateTarget(goal, target)}
                onDelete={() => deleteGoal(goal)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="font-medium mb-3">Архив</div>
        {archivedGoals.length === 0 ? (
          <div className="text-sm opacity-70">Пока нет завершённых целей.</div>
        ) : (
          <div className="space-y-2">
            {archivedGoals.map(goal => (
              <div key={goal.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border border-white/10 rounded-xl p-3 bg-white/5">
                <div>
                  <div className="font-medium">{goal.title}</div>
                  <div className="text-xs opacity-70">Завершена: {formatDate(goal.archived_at)} • Прогресс {goal.completed}/{goal.target}</div>
                </div>
                <div className="text-xs opacity-60">Рекордный стрик: {goal.streak_best}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}

function GoalCard({ goal, onToggleToday, onUpdateTarget, onDelete }: {
  goal: Goal;
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

  return (
    <div className="border border-white/10 rounded-xl bg-white/5 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">{goal.title}</div>
          <div className="text-xs opacity-70">Создана: {formatDate(goal.created_at)}</div>
          <div className="text-xs opacity-70">{streakLabel(goal)}</div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {editingTarget ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={targetValue}
                onChange={e => setTargetValue(Math.max(1, +e.target.value || 1))}
                className="px-2 py-1 w-20 rounded bg-white/10"
              />
              <button onClick={confirmTarget} className="px-3 py-1 rounded bg-white/10 border border-white/20 text-xs">OK</button>
            </div>
          ) : (
            <button onClick={() => setEditingTarget(true)} className="text-xs underline opacity-80">Цель: {goal.target}</button>
          )}
          <button onClick={onDelete} className="px-3 py-1 rounded bg-red-500/20 hover:bg-red-500/40 text-xs">Удалить</button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="w-full h-2 bg-white/10 rounded">
          <div className="h-2 bg-emerald-400 rounded" style={{ width: `${goal.completion_pct}%` }} />
        </div>
        <div className="text-xs opacity-70">{goal.completed} из {goal.target} • {goal.completion_pct}%</div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={onToggleToday}
          className={`px-3 py-2 rounded text-sm ${goal.today_done ? 'bg-emerald-500/30 border border-emerald-400/60' : 'bg-white/10 hover:bg-white/20'}`}
        >
          {goal.today_done ? 'Отменить за сегодня' : 'Отметить сегодня'}
        </button>
        <div className="text-xs opacity-60">Последние отметки:</div>
        <div className="flex gap-1 text-xs">
          {goal.recent_logs.length === 0 ? (
            <span className="opacity-50">—</span>
          ) : goal.recent_logs.map(log => (
            <span key={log.date} className="px-2 py-1 rounded bg-white/10">{log.date.slice(5)}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

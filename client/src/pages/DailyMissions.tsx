import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Circle,
  Edit3,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import Shell from '../components/Shell';
import { api } from '../api';
import { Modal } from '../components/ui/Modal';

type DailyMission = {
  id: number;
  title: string;
  description: string | null;
  points: number;
  xp_reward: number;
  sort_order: number;
  is_active: boolean;
  completed: boolean;
  completed_at: string | null;
};

type DailyMissionSummary = {
  date: string;
  target_points: number;
  total_points: number;
  remaining_points: number;
  progress_pct: number;
  completed_count: number;
  total_count: number;
  xp_earned: number;
  missions: DailyMission[];
};

type MissionEditorState = {
  title: string;
  description: string;
  points: number;
  xp_reward: number;
  sort_order: number;
  is_active: boolean;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const shiftDate = (isoDate: string, days: number) => {
  const reference = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(reference.getTime())) {
    return todayISO();
  }
  reference.setDate(reference.getDate() + days);
  return reference.toISOString().slice(0, 10);
};

const defaultEditorState = (): MissionEditorState => ({
  title: '',
  description: '',
  points: 100,
  xp_reward: 50,
  sort_order: 0,
  is_active: true,
});

export default function DailyMissions() {
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [summary, setSummary] = useState<DailyMissionSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState<boolean>(false);
  const [editorState, setEditorState] = useState<MissionEditorState>(defaultEditorState);
  const [editorSaving, setEditorSaving] = useState<boolean>(false);
  const [editingMission, setEditingMission] = useState<DailyMission | null>(null);

  const dispatchWeeklyRefresh = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('life-weekly-missions-refresh'));
  }, []);

  const loadMissions = useCallback(
    async (date: string, { silent = false }: { silent?: boolean } = {}) => {
      if (!silent) setLoading(true);
      try {
        const response = await api.get(`/api/life/daily-missions?date=${date}`);
        setSummary(response as DailyMissionSummary);
        if (response?.date && response.date !== date) {
          setSelectedDate(response.date);
        }
        return response as DailyMissionSummary;
      } catch (error) {
        if (!silent) {
          setSummary(null);
        }
        throw error;
      } finally {
        if (!silent) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadMissions(selectedDate).catch(() => {
      // Ошибки уже обработаны уведомлениями api
    });
  }, [selectedDate, loadMissions]);

  const progressWidth = useMemo(() => {
    const pct = summary?.progress_pct ?? 0;
    if (!Number.isFinite(pct) || pct <= 0) return '0%';
    return `${Math.min(100, Math.max(0, Math.round(pct)))}%`;
  }, [summary?.progress_pct]);

  const missions = summary?.missions ?? [];
  const activeMissions = useMemo(() => missions.filter((mission) => mission.is_active), [missions]);

  const handleToggleMission = async (mission: DailyMission) => {
    const date = summary?.date || selectedDate;
    setTogglingId(mission.id);
    try {
      if (mission.completed) {
        await api.del(`/api/life/daily-missions/${mission.id}/complete?date=${date}`, { silentSuccess: true });
      } else {
        await api.post(
          `/api/life/daily-missions/${mission.id}/complete`,
          { date },
          { silentSuccess: true }
        );
      }
      await loadMissions(date, { silent: true });
      dispatchWeeklyRefresh();
    } finally {
      setTogglingId(null);
    }
  };

  const openCreateModal = () => {
    setEditingMission(null);
    setEditorState({
      ...defaultEditorState(),
      sort_order: missions.length,
    });
    setEditorOpen(true);
  };

  const openEditModal = (mission: DailyMission) => {
    setEditingMission(mission);
    setEditorState({
      title: mission.title,
      description: mission.description ?? '',
      points: mission.points,
      xp_reward: mission.xp_reward,
      sort_order: mission.sort_order,
      is_active: mission.is_active,
    });
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (editorSaving) return;
    setEditorOpen(false);
    setEditingMission(null);
    setEditorState(defaultEditorState());
  };

  const handleEditorSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (editorSaving) return;
    setEditorSaving(true);
    const payload = {
      title: editorState.title.trim() || 'Без названия',
      description: editorState.description.trim() ? editorState.description.trim() : null,
      points: editorState.points,
      xp_reward: editorState.xp_reward,
      sort_order: editorState.sort_order,
      is_active: editorState.is_active,
    };

    try {
      if (editingMission) {
        await api.put(`/api/life/daily-missions/${editingMission.id}`, payload, {
          notifySuccess: 'Задание обновлено',
        });
      } else {
        await api.post('/api/life/daily-missions', payload, {
          notifySuccess: 'Задание добавлено',
        });
      }
      setEditorOpen(false);
      setEditingMission(null);
      setEditorState(defaultEditorState());
      await loadMissions(selectedDate);
    } finally {
      setEditorSaving(false);
    }
  };

  const handleDeleteMission = async (mission: DailyMission) => {
    if (!window.confirm('Удалить задание?')) return;
    await api.del(`/api/life/daily-missions/${mission.id}`, {
      notifySuccess: 'Задание удалено',
    });
    await loadMissions(selectedDate);
    dispatchWeeklyRefresh();
  };

  const handlePrevDay = () => {
    setSelectedDate((prev) => shiftDate(prev, -1));
  };

  const handleNextDay = () => {
    setSelectedDate((prev) => shiftDate(prev, 1));
  };

  const handleDateInputChange = (value: string) => {
    if (!value) return;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      setSelectedDate(value);
    }
  };

  const targetPoints = summary?.target_points ?? 500;
  const totalPoints = summary?.total_points ?? 0;
  const remainingPoints = summary?.remaining_points ?? Math.max(0, targetPoints - totalPoints);
  const xpEarned = summary?.xp_earned ?? 0;

  const completedToday = summary?.completed_count ?? 0;
  const totalToday = summary?.total_count ?? 0;

  return (
    <Shell>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm uppercase tracking-wide text-slate-300/80">
            <Sparkles size={18} className="text-amber-300" />
            Ежедневные задания
          </div>
          <div className="flex items-center gap-3 text-lg font-semibold text-white/90">
            <CalendarDays size={20} className="text-slate-200" />
            {summary?.date
              ? new Date(`${summary.date}T00:00:00`).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                })
              : 'Сегодня'}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-slate-200/80">
              <span>Прогресс активности</span>
              <span>
                {totalPoints} / {targetPoints}
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-300 via-orange-400 to-rose-500 transition-all duration-500"
                style={{ width: progressWidth }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-200/80">
              <span className="rounded-full bg-white/10 px-3 py-1">
                Осталось {Math.max(0, remainingPoints)} очков
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1">
                Выполнено {completedToday} из {totalToday}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1">Получено XP: {xpEarned}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevDay}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/80 transition hover:border-amber-300 hover:text-white"
            >
              <ArrowLeft size={18} />
              Назад
            </button>
            <input
              type="date"
              value={summary?.date ?? selectedDate}
              onChange={(event) => handleDateInputChange(event.target.value)}
              className="rounded-full border border-white/10 bg-brand-night/80 px-3 py-1 text-sm text-white/80 focus:border-amber-300 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleNextDay}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/80 transition hover:border-amber-300 hover:text-white"
            >
              Вперёд
              <ArrowRight size={18} />
            </button>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-400 via-rose-400 to-purple-500 px-4 py-2 text-sm font-medium text-brand-night shadow-brand-soft transition hover:brightness-110"
          >
            <Plus size={18} />
            Новое задание
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center rounded-3xl border border-white/10 bg-white/5 py-16 text-slate-200/80">
            <Loader2 className="mr-3 h-5 w-5 animate-spin" /> Загружаем задания…
          </div>
        ) : activeMissions.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center text-slate-200/70">
            Пока нет активных заданий. Создайте первое, чтобы начать получать очки.
          </div>
        ) : (
          activeMissions.map((mission) => {
            const isProcessing = togglingId === mission.id;
            return (
              <div
                key={mission.id}
                className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 transition hover:border-amber-300/60 hover:bg-white/10 sm:flex-row sm:items-start"
              >
                <button
                  type="button"
                  onClick={() => handleToggleMission(mission)}
                  className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-brand-night/70 text-white transition hover:border-amber-300 hover:text-amber-200"
                  aria-label={mission.completed ? 'Отменить выполнение' : 'Отметить выполненным'}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : mission.completed ? (
                    <CheckCircle2 className="h-6 w-6 text-emerald-300" />
                  ) : (
                    <Circle className="h-6 w-6" />
                  )}
                </button>
                <div className="flex-1 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-white/90">{mission.title}</h3>
                      {mission.description ? (
                        <p className="mt-1 text-sm text-slate-200/80">{mission.description}</p>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(mission)}
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80 transition hover:border-amber-300 hover:text-white"
                      >
                        <Edit3 size={16} /> Редактировать
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteMission(mission)}
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-red-200/80 transition hover:border-red-400 hover:text-red-100"
                      >
                        <Trash2 size={16} /> Удалить
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-3 py-1 text-amber-200">
                      +{mission.points} очков
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-400/20 px-3 py-1 text-sky-200">
                      +{mission.xp_reward} XP
                    </span>
                    {mission.completed && mission.completed_at ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/20 px-3 py-1 text-emerald-200">
                        Выполнено {new Date(mission.completed_at).toLocaleTimeString('ru-RU', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Modal open={editorOpen} onClose={closeEditor}>
        <form onSubmit={handleEditorSubmit} className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-white/90">
              {editingMission ? 'Редактирование задания' : 'Новое ежедневное задание'}
            </h2>
            <p className="text-sm text-slate-200/70">
              Настройте описание задания, награды и порядок отображения. Каждое выполненное задание приносит очки активности и XP.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-100" htmlFor="mission-title">
                Название
              </label>
              <input
                id="mission-title"
                type="text"
                required
                value={editorState.title}
                onChange={(event) => setEditorState((prev) => ({ ...prev, title: event.target.value }))}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-white focus:border-amber-300 focus:outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-100" htmlFor="mission-description">
                Описание (необязательно)
              </label>
              <textarea
                id="mission-description"
                value={editorState.description}
                onChange={(event) => setEditorState((prev) => ({ ...prev, description: event.target.value }))}
                rows={3}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-white focus:border-amber-300 focus:outline-none"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-100" htmlFor="mission-points">
                  Очки за выполнение
                </label>
                <input
                  id="mission-points"
                  type="number"
                  min={0}
                  max={500}
                  value={editorState.points}
                  onChange={(event) => {
                    const numeric = Number(event.target.value);
                    setEditorState((prev) => ({
                      ...prev,
                      points: Number.isFinite(numeric) ? numeric : prev.points,
                    }));
                  }}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-white focus:border-amber-300 focus:outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-100" htmlFor="mission-xp">
                  XP за выполнение
                </label>
                <input
                  id="mission-xp"
                  type="number"
                  min={0}
                  max={500}
                  value={editorState.xp_reward}
                  onChange={(event) => {
                    const numeric = Number(event.target.value);
                    setEditorState((prev) => ({
                      ...prev,
                      xp_reward: Number.isFinite(numeric) ? numeric : prev.xp_reward,
                    }));
                  }}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-white focus:border-amber-300 focus:outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-100" htmlFor="mission-order">
                  Порядок
                </label>
                <input
                  id="mission-order"
                  type="number"
                  value={editorState.sort_order}
                  onChange={(event) => {
                    const numeric = Number(event.target.value);
                    setEditorState((prev) => ({
                      ...prev,
                      sort_order: Number.isFinite(numeric) ? numeric : prev.sort_order,
                    }));
                  }}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-white focus:border-amber-300 focus:outline-none"
                />
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium text-slate-100">Статус задания</span>
                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white">
                  <input
                    type="checkbox"
                    checked={editorState.is_active}
                    onChange={(event) =>
                      setEditorState((prev) => ({ ...prev, is_active: event.target.checked }))
                    }
                    className="h-4 w-4 rounded border-white/20 bg-transparent"
                  />
                  Активно
                </label>
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeEditor}
              className="inline-flex items-center justify-center rounded-full border border-white/10 px-4 py-2 text-sm text-white/80 transition hover:border-white/40 hover:text-white"
              disabled={editorSaving}
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={editorSaving}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-400 via-rose-400 to-purple-500 px-5 py-2 text-sm font-semibold text-brand-night transition hover:brightness-110 disabled:opacity-60"
            >
              {editorSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingMission ? 'Сохранить изменения' : 'Создать задание'}
            </button>
          </div>
        </form>
      </Modal>
    </Shell>
  );
}

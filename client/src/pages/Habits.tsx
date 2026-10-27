import React, { useEffect, useMemo, useState } from 'react';
import Shell from '../components/Shell';
import { api } from '../api';
import TagBadge from '../components/tags/TagBadge';
import TagSelector from '../components/tags/TagSelector';
import { Modal } from '../components/ui/Modal';
import HabitMaster from '../components/master/HabitMaster';

type TagOption = { id: number; label: string; color: string };
type Habit = { id: number; title: string; target_per_week?: number; tags: TagOption[] };
type ChecksMap = Record<number, boolean>;
type WeekMap = Record<string, ChecksMap>;

// Местная дата YYYY-MM-DD: toISOString() даёт UTC и сдвигает день назад в часовых поясах восточнее Гринвича
const localISO = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const todayISO = () => localISO(new Date());

function startOfWeek(date: Date) {
  const clone = new Date(date);
  const diff = (clone.getDay() + 6) % 7; // Monday start
  clone.setDate(clone.getDate() - diff);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function weekDates(base: Date) {
  const monday = startOfWeek(base);
  return [...Array(7)].map((_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return localISO(date);
  });
}

function buildMap(rows: { habit_id: number; date: string }[]): WeekMap {
  const map: WeekMap = {};
  for (const row of rows) {
    if (!map[row.date]) map[row.date] = {};
    map[row.date][row.habit_id] = true;
  }
  return map;
}

export default function Habits() {
  const [items, setItems] = useState<Habit[]>([]);
  const [checkMap, setCheckMap] = useState<WeekMap>({});
  const [weekOffset, setWeekOffset] = useState(0);
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  const [tagEditorHabit, setTagEditorHabit] = useState<Habit | null>(null);
  const [tagEditorIds, setTagEditorIds] = useState<number[]>([]);

  const currentWeekDates = useMemo(() => {
    const base = new Date();
    base.setDate(base.getDate() + weekOffset * 7);
    return weekDates(base);
  }, [weekOffset]);

  const loadHabits = async () => {
    const response = await api.get('/api/life/habits');
    const normalized = (response.items || []).map((habit: any) => ({
      id: habit.id,
      title: habit.title,
      target_per_week: habit.target_per_week,
      tags: Array.isArray(habit?.tags)
        ? habit.tags.map((tag: any) => ({ id: tag.id, label: tag.label, color: tag.color }))
        : [],
    }));
    setItems(normalized);
  };

  const loadChecks = async () => {
    const from = currentWeekDates[0];
    const to = currentWeekDates[currentWeekDates.length - 1];
    const response = await api.get(`/api/life/habits/checks?from=${from}&to=${to}`);
    setCheckMap(buildMap(response.items || []));
  };

  const loadTagOptions = async () => {
    const res = await api.get('/api/life/pages/tags', { silentError: true });
    const options = (res.items || []).map((tag: any) => ({
      id: tag.id,
      label: tag.label,
      color: tag.color,
    }));
    setTagOptions(options);
  };

  useEffect(() => {
    loadHabits();
    loadTagOptions();
  }, []);
  useEffect(() => { loadChecks(); }, [currentWeekDates[0]]);

  const removeHabit = async (id: number) => {
    if (!window.confirm('Удалить привычку?')) return;
    await api.del(`/api/life/habits/${id}`);
    await loadHabits();
    await loadChecks();
    if (tagEditorHabit?.id === id) {
      setTagEditorHabit(null);
      setTagEditorIds([]);
    }
  };

  const toggle = async (date: string, habitId: number) => {
    const current = !!checkMap[date]?.[habitId];
    setCheckMap(prev => {
      const next = { ...prev };
      next[date] = next[date] ? { ...next[date] } : {};
      if (current) delete next[date][habitId]; else next[date][habitId] = true;
      return next;
    });
    await api.post('/api/life/habits/checks', { habit_id: habitId, date, done: !current });
  };

  const progress = (habit: Habit) => {
    const doneCount = currentWeekDates.filter(date => checkMap[date]?.[habit.id]).length;
    const target = habit.target_per_week || 0;
    const pct = target ? Math.min(100, Math.round((doneCount * 100) / target)) : 0;
    return { done: doneCount, target, pct };
  };

  const openTagEditor = (habit: Habit) => {
    setTagEditorHabit(habit);
    setTagEditorIds((habit.tags || []).map((tag) => tag.id));
  };

  const closeTagEditor = () => {
    setTagEditorHabit(null);
    setTagEditorIds([]);
  };

  const saveHabitTags = async () => {
    if (!tagEditorHabit) return;
    await api.put(`/api/life/habits/${tagEditorHabit.id}`, { tags: tagEditorIds });
    closeTagEditor();
    await loadHabits();
  };

  return (
    <Shell>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="text-2xl font-semibold">Привычки</div>
          <div className="mt-2 flex items-center gap-2 text-sm opacity-80">
            <button onClick={() => setWeekOffset(weekOffset - 1)} className="px-3 py-1 rounded bg-white/10">←</button>
            <div>
              Неделя {currentWeekDates[0].slice(5)} — {currentWeekDates[6].slice(5)}
            </div>
            <button onClick={() => setWeekOffset(weekOffset + 1)} className="px-3 py-1 rounded bg-white/10">→</button>
          </div>
        </div>
        <HabitMaster
          tagOptions={tagOptions}
          onCreated={async () => {
            await loadHabits();
            await loadChecks();
          }}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="text-left p-2">Привычка</th>
              {currentWeekDates.map(date => (
                <th key={date} className="p-2 text-center">{date.slice(5)}</th>
              ))}
              <th className="p-2 text-center w-48">Прогресс</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {items.map(habit => {
              const { done, target, pct } = progress(habit);
              return (
                <tr key={habit.id} className="border-t border-white/10 align-top">
                  <td className="p-2 align-top">
                    <div className="flex flex-col gap-1">
                      <div className="font-medium">{habit.title}</div>
                      {habit.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 text-[10px]">
                          {habit.tags.map((tag) => (
                            <TagBadge key={tag.id} tag={tag} compact />
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => openTagEditor(habit)}
                        className="text-[10px] uppercase tracking-wide text-white/60 hover:text-white"
                      >
                        Теги
                      </button>
                    </div>
                  </td>
                  {currentWeekDates.map(date => {
                    const active = !!checkMap[date]?.[habit.id];
                    return (
                      <td key={`${habit.id}-${date}`} className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => toggle(date, habit.id)}
                          className={`px-2 py-1 rounded transition-colors ${active ? 'bg-emerald-500/30 border border-emerald-400/60' : 'bg-white/10 hover:bg-white/20'}`}
                        >
                          {active ? '✓' : ''}
                        </button>
                      </td>
                    );
                  })}
                  <td className="p-2">
                    <div className="w-full h-2 bg-white/10 rounded">
                      <div className="h-2 bg-white rounded" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-xs opacity-70 mt-1">{done} / {target}</div>
                  </td>
                  <td className="p-2 text-right">
                    <button onClick={() => removeHabit(habit.id)} className="px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/40">Удалить</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs opacity-70 mt-3">Клик по ячейке фиксирует выполнение привычки за выбранную дату. Данные автоматически сохраняются.</p>

      <Modal
        open={Boolean(tagEditorHabit)}
        onClose={closeTagEditor}
        contentClassName="w-full max-w-lg space-y-4 rounded-2xl border border-white/20 bg-black p-6 shadow-2xl"
      >
        {tagEditorHabit && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">Теги привычки</div>
                <div className="text-sm opacity-70 truncate">{tagEditorHabit.title}</div>
              </div>
              <button
                onClick={closeTagEditor}
                className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-xs"
              >
                Закрыть
              </button>
            </div>
            <TagSelector
              tags={tagOptions}
              selectedIds={tagEditorIds}
              onChange={setTagEditorIds}
              label=""
              emptyState="Нет доступных тэгов. Создайте их на странице Страницы."
              onManageTags={() => window.open('/pages', '_blank')}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={closeTagEditor}
                className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm"
              >
                Отмена
              </button>
              <button
                onClick={saveHabitTags}
                className="px-3 py-2 rounded bg-green-600 hover:bg-green-700 text-sm"
              >
                Сохранить
              </button>
            </div>
          </>
        )}
      </Modal>
    </Shell>
  );
}

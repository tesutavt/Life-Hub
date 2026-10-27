import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api';

export type WidgetId =
  | 'weather'
  | 'missions'
  | 'learn'
  | 'habits'
  | 'languages'
  | 'courses'
  | 'goals'
  | 'calendar'
  | 'fitness'
  | 'spend'
  | 'loans'
  | 'achievements';

export type WidgetConfig = { id: WidgetId; hidden?: boolean; view?: string };

export type WidgetMeta = { title: string; emoji: string; description: string; views: { id: string; label: string }[] };

/** Все доступные блоки Дэшборда и варианты их вида. */
export const WIDGETS: Record<WidgetId, WidgetMeta> = {
  weather: { title: 'Погода', emoji: '⛅', description: 'погода в вашем городе', views: [{ id: 'card', label: 'Карточка' }] },
  missions: { title: 'Задания дня', emoji: '🔥', description: 'очки и награды за сегодня', views: [{ id: 'ring', label: 'Кольцо' }, { id: 'bar', label: 'Полоса' }] },
  learn: { title: 'Продолжить обучение', emoji: '🦉', description: 'следующий урок курса-тренировки', views: [{ id: 'card', label: 'Карточка' }] },
  habits: { title: 'Привычки сегодня', emoji: '✅', description: 'отметить прямо отсюда', views: [{ id: 'list', label: 'Список' }, { id: 'ring', label: 'Кольцо' }] },
  languages: { title: 'Языки', emoji: '🗣️', description: 'прогресс и минуты за сегодня', views: [{ id: 'list', label: 'Полосы' }, { id: 'ring', label: 'Кольца' }] },
  courses: { title: 'Курсы', emoji: '🎓', description: 'курсы в работе', views: [{ id: 'list', label: 'Полосы' }, { id: 'ring', label: 'Кольца' }] },
  goals: { title: 'Цели на год', emoji: '🎯', description: 'прогресс и серии', views: [{ id: 'list', label: 'Полосы' }, { id: 'ring', label: 'Кольца' }] },
  calendar: { title: 'Календарь', emoji: '📅', description: 'месяц или ближайшие события', views: [{ id: 'month', label: 'Месяц' }, { id: 'upcoming', label: 'Ближайшее' }] },
  fitness: { title: 'Фитнес', emoji: '💪', description: 'шаги, сон, калории', views: [{ id: 'chart', label: 'С графиком' }, { id: 'tiles', label: 'Только цифры' }] },
  spend: { title: 'Расходы', emoji: '💸', description: 'добавить расход, категории, динамика', views: [{ id: 'pie', label: 'Круг' }, { id: 'line', label: 'График' }, { id: 'list', label: 'Список' }] },
  loans: { title: 'Кредиты', emoji: '💳', description: 'платежи и остаток', views: [{ id: 'list', label: 'Список' }, { id: 'summary', label: 'Итог' }] },
  achievements: { title: 'Ачивки', emoji: '🏆', description: 'последние полученные', views: [{ id: 'recent', label: 'Последние' }] },
};

export const DEFAULT_LAYOUT: WidgetConfig[] = [
  { id: 'weather' },
  { id: 'missions' },
  { id: 'learn' },
  { id: 'habits' },
  { id: 'languages' },
  { id: 'calendar' },
  { id: 'goals' },
  { id: 'courses' },
  { id: 'spend' },
  { id: 'fitness' },
  { id: 'loans' },
  { id: 'achievements', hidden: true },
];

const STORAGE_KEY = 'lifehub:dashboard-layout';

/** Дополняет сохранённую раскладку новыми блоками и выкидывает неизвестные. */
function normalize(layout: unknown): WidgetConfig[] {
  const list = Array.isArray(layout) ? (layout as WidgetConfig[]).filter((w) => w && w.id in WIDGETS) : [];
  const seen = new Set(list.map((w) => w.id));
  return [...list, ...DEFAULT_LAYOUT.filter((w) => !seen.has(w.id)).map((w) => ({ ...w, hidden: true }))];
}

const readLocal = (): WidgetConfig[] | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
};

/** Раскладка: сразу из localStorage, затем с сервера (общая для всех устройств). */
export function useDashboardLayout() {
  const [layout, setLayoutState] = useState<WidgetConfig[]>(() => readLocal() ?? DEFAULT_LAYOUT);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    api
      .get('/api/life/dashboard-layout', { silentError: true })
      .then((res) => {
        if (Array.isArray(res?.layout)) setLayoutState(normalize(res.layout));
      })
      .catch(() => {});
  }, []);

  const setLayout = useCallback((next: WidgetConfig[]) => {
    setLayoutState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // хранилище недоступно
    }
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      api.put('/api/life/dashboard-layout', { layout: next }, { silentSuccess: true, silentError: true }).catch(() => {});
    }, 600);
  }, []);

  return [layout, setLayout] as const;
}

export const viewOf = (config: WidgetConfig) => config.view || WIDGETS[config.id].views[0]!.id;

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { Link } from 'react-router-dom';
import Shell from '../components/Shell';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import TagBadge from '../components/tags/TagBadge';
import TagSelector from '../components/tags/TagSelector';
import { Modal } from '../components/ui/Modal';
import CollapseToggle from '../components/ui/CollapseToggle';
import { usePersistentCollapse } from '../hooks/usePersistentCollapse';
import { DEFAULT_LAYOUT, useDashboardLayout, viewOf, WidgetConfig, WidgetId, WIDGETS } from '../components/dashboard/dashboardLayout';
import ExpenseModal from '../components/finance/ExpenseModal';
import { openMissionsDiary } from '../components/missions/missionsBus';
import {
  loadWeatherBackgrounds,
  loadWeatherEffects,
  StoredWeatherBackgrounds,
  StoredWeatherEffects,
  WEATHER_ASSETS_EVENT,
  WEATHER_BACKGROUNDS_STORAGE_KEY,
  WEATHER_EFFECTS_STORAGE_KEY,
} from '../utils/customAssets';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Activity,
  Banknote,
  BookOpen,
  CalendarDays,
  Flame,
  Footprints,
  HeartPulse,
  Moon,
  PieChart as PieChartIcon,
  Loader2,
  RefreshCcw,
  Plus,
  Target,
  TrendingUp,
  Check,
  LayoutGrid,
  GripVertical,
  ArrowUp,
  ArrowDown,
  EyeOff,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const numberFormatter = new Intl.NumberFormat('ru-RU');
const currencyFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
});

const CATEGORY_COLOR_POOL = [
  '#8b5cf6',
  '#38bdf8',
  '#f97316',
  '#34d399',
  '#f472b6',
  '#facc15',
  '#22d3ee',
  '#f87171',
];
const categoryColorMap = new Map<string, string>();
let categoryColorIndex = 0;

const MCC_CATEGORY_PRESETS: { codes: number[]; label: string }[] = [
  { codes: [5411, 5422, 5441, 5451, 5499], label: 'Продукты' },
  { codes: [5811, 5812, 5814], label: 'Кафе и рестораны' },
  { codes: [4111, 4121, 4789, 4511], label: 'Транспорт' },
  { codes: [4812, 4814, 4899], label: 'Подписки и связь' },
  { codes: [5200, 5211, 5712, 5719, 5722, 5732], label: 'Дом' },
  { codes: [5942, 5943, 5944, 5945, 5947, 7999], label: 'Хобби и развлечения' },
  { codes: [5999, 5691, 5651], label: 'Магазины' },
];

const KEYWORD_PRESETS: { keywords: string[]; label: string }[] = [
  { keywords: ['яндекс', 'netflix', 'spotify', 'ivi'], label: 'Подписки и связь' },
  { keywords: ['перекрест', 'пятероч', 'магнит', 'lenta'], label: 'Продукты' },
  { keywords: ['uber', 'яндекс го', 'yandex go', 'такси'], label: 'Транспорт' },
  { keywords: ['озон', 'wildberries', 'wb'], label: 'Магазины' },
  { keywords: ['спорт', 'gym', 'fitness'], label: 'Хобби и развлечения' },
];

const mccPresetMap = new Map<number, string>();
MCC_CATEGORY_PRESETS.forEach((preset) => {
  preset.codes.forEach((code) => mccPresetMap.set(code, preset.label));
});

const fmtDateKey = (date: Date) =>
  date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });

const formatCurrency = (value: number) => {
  if (!Number.isFinite(value)) return '0 ₽';
  return currencyFormatter.format(Math.round(value));
};

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) return '0';
  return numberFormatter.format(Math.round(value));
};

const clampProgress = (value: number | null | undefined) => {
  if (!Number.isFinite(Number(value))) return 0;
  const numeric = Number(value);
  if (numeric < 0) return 0;
  if (numeric > 100) return 100;
  return Math.round(numeric);
};

const assignCategoryColor = (label: string) => {
  if (!categoryColorMap.has(label)) {
    const color = CATEGORY_COLOR_POOL[categoryColorIndex % CATEGORY_COLOR_POOL.length];
    categoryColorMap.set(label, color);
    categoryColorIndex += 1;
  }
  return categoryColorMap.get(label)!;
};
const pad = (n: number) => n.toString().padStart(2, '0');
const toISODate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const monthMatrix = (date: Date) => {
  const y = date.getFullYear();
  const m = date.getMonth();
  const firstDay = new Date(y, m, 1);
  const start = new Date(firstDay);
  const offset = (firstDay.getDay() + 6) % 7;
  start.setDate(firstDay.getDate() - offset);

  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w += 1) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d += 1) {
      week.push(new Date(start));
      start.setDate(start.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
};

type TagOption = { id: number; label: string; color: string };

type LoanSummary = {
  id: number;
  bank: string;
  payment_monthly: number;
  remaining: number;
  due_day?: string;
  tags: TagOption[];
};

type LoanFormValue = { bank: string; payment_monthly: number; remaining: number; due_day: string };

type LoanFormModalProps = {
  mode: 'create' | 'edit';
  open: boolean;
  onClose: () => void;
  form: LoanFormValue;
  onFormChange: (next: LoanFormValue) => void;
  tagOptions: TagOption[];
  selectedTagIds: number[];
  onTagsChange: (next: number[]) => void;
  onSubmit: () => void;
};

function LoanFormModal({
  mode,
  open,
  onClose,
  form,
  onFormChange,
  tagOptions,
  selectedTagIds,
  onTagsChange,
  onSubmit,
}: LoanFormModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      contentClassName="w-full max-w-sm space-y-3 rounded-2xl border border-white/20 bg-black p-6 shadow-2xl"
    >
      <div className="text-lg font-medium mb-2">{mode === 'edit' ? 'Редактировать кредит' : 'Добавить кредит'}</div>
      <input
        placeholder="Банк"
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2"
        value={form.bank}
        onChange={(e) => onFormChange({ ...form, bank: e.target.value })}
      />
      <input
        placeholder="Ежемесячный платёж"
        type="number"
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2"
        value={form.payment_monthly}
        onChange={(e) => onFormChange({ ...form, payment_monthly: Number(e.target.value) })}
      />
      <input
        placeholder="Остаток"
        type="number"
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2"
        value={form.remaining}
        onChange={(e) => onFormChange({ ...form, remaining: Number(e.target.value) })}
      />
      <input
        placeholder="День платежа"
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2"
        value={form.due_day}
        onChange={(e) => onFormChange({ ...form, due_day: e.target.value })}
      />
      <TagSelector
        tags={tagOptions}
        selectedIds={selectedTagIds}
        onChange={onTagsChange}
        label="Теги кредита"
        className="mt-2"
        emptyState="Нет доступных тэгов. Создайте их на странице Страницы."
        onManageTags={() => window.open('/pages', '_blank')}
      />
      <div className="mt-4 flex justify-between">
        <button onClick={onClose} className="rounded-full bg-white/10 px-4 py-2 hover:bg-white/20">
          Отмена
        </button>
        <button onClick={onSubmit} className="rounded-full bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400">
          {mode === 'edit' ? 'Сохранить' : 'Добавить'}
        </button>
      </div>
    </Modal>
  );
}

type LanguageSummary = {
  id: number;
  name: string;
  level?: string | null;
  minutesToday: number;
  courseProgressPct: number;
};

type CourseSummary = {
  id: number;
  title: string;
  progress: number;
  status?: string | null;
  provider?: string | null;
};

type GoalSummary = {
  id: number;
  title: string;
  completion_pct: number;
  streak_current: number;
};

type FitnessPoint = { date: string; steps: number; hr: number; sleep: number; activeCalories: number };

type SpendPoint = { date: string; out: number };

type CategorySpend = { label: string; amount: number; color: string };

type CalendarEvent = {
  id: string | number;
  date: string;
  title: string;
  type?: string;
  mood?: number | null;
};

type BankTransaction = {
  id: number;
  amount: number;
  description?: string;
  category?: string | null;
  mcc?: number | null;
  ts: number;
};

type DashMissions = {
  total_points: number;
  target_points: number;
  completed_count: number;
  total_count: number;
  xp_earned: number;
  missions: { claimable: boolean }[];
};
type DashLearnCourse = { id: number; title: string; icon: string | null; lessons_done: number; lessons_total: number; progress_pct: number; locked?: boolean };
type DashAchievement = { id: number; title: string; icon: string; description?: string | null };

type FitnessMetrics = { steps: number; hr: number; sleepH: number; activeCalories: number };

type WeatherTimeOfDay = 'morning' | 'day' | 'evening' | 'night';
type WeatherMood = 'clear' | 'clouds' | 'rain' | 'snow' | 'storm' | 'mist' | 'default';

type WeatherVisual = {
  gradient: string;
  overlay: string;
  accent: string;
  backgroundImage?: string;
  effectImage?: string;
};

type WeatherInfo = {
  city: string;
  country?: string;
  description: string;
  temperature: number;
  localDate: Date;
  localDateLabel: string;
  timeOfDay: WeatherTimeOfDay;
  mood: WeatherMood;
};

type WeatherErrorState = 'profile' | 'missing-key' | 'not-found' | 'fetch' | null;

const weatherDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

const WEATHER_VISUALS: Record<WeatherMood, Record<WeatherTimeOfDay, WeatherVisual>> = {
  clear: {
    morning: { gradient: 'linear-gradient(135deg, #fde68a 0%, #f97316 45%, #f472b6 100%)', overlay: 'rgba(15,23,42,0.18)', accent: '#fee2b3' },
    day: { gradient: 'linear-gradient(135deg, #38bdf8 0%, #60a5fa 50%, #c4b5fd 100%)', overlay: 'rgba(15,23,42,0.22)', accent: '#fef3c7' },
    evening: { gradient: 'linear-gradient(135deg, #c4b5fd 0%, #f472b6 55%, #fb7185 100%)', overlay: 'rgba(15,23,42,0.28)', accent: '#fee2b3' },
    night: { gradient: 'linear-gradient(135deg, #312e81 0%, #1e3a8a 55%, #0f172a 100%)', overlay: 'rgba(8,47,73,0.45)', accent: '#facc15' },
  },
  clouds: {
    morning: { gradient: 'linear-gradient(135deg, #cbd5f5 0%, #94a3b8 55%, #64748b 100%)', overlay: 'rgba(15,23,42,0.3)', accent: '#e0e7ff' },
    day: { gradient: 'linear-gradient(135deg, #94a3b8 0%, #64748b 50%, #334155 100%)', overlay: 'rgba(15,23,42,0.32)', accent: '#e2e8f0' },
    evening: { gradient: 'linear-gradient(135deg, #a5b4fc 0%, #818cf8 45%, #475569 100%)', overlay: 'rgba(15,23,42,0.34)', accent: '#e0e7ff' },
    night: { gradient: 'linear-gradient(135deg, #1f2937 0%, #111827 60%, #0f172a 100%)', overlay: 'rgba(15,23,42,0.45)', accent: '#f8fafc' },
  },
  rain: {
    morning: { gradient: 'linear-gradient(135deg, #60a5fa 0%, #4f46e5 55%, #312e81 100%)', overlay: 'rgba(15,23,42,0.36)', accent: '#c7d2fe' },
    day: { gradient: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 55%, #1e3a8a 100%)', overlay: 'rgba(15,23,42,0.4)', accent: '#c7d2fe' },
    evening: { gradient: 'linear-gradient(135deg, #4338ca 0%, #312e81 50%, #111827 100%)', overlay: 'rgba(15,23,42,0.45)', accent: '#c7d2fe' },
    night: { gradient: 'linear-gradient(135deg, #1e1b4b 0%, #1e293b 50%, #0f172a 100%)', overlay: 'rgba(15,23,42,0.48)', accent: '#c7d2fe' },
  },
  snow: {
    morning: { gradient: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 50%, #7dd3fc 100%)', overlay: 'rgba(15,23,42,0.18)', accent: '#0ea5e9' },
    day: { gradient: 'linear-gradient(135deg, #bae6fd 0%, #7dd3fc 55%, #38bdf8 100%)', overlay: 'rgba(15,23,42,0.22)', accent: '#0ea5e9' },
    evening: { gradient: 'linear-gradient(135deg, #bfdbfe 0%, #93c5fd 55%, #60a5fa 100%)', overlay: 'rgba(15,23,42,0.26)', accent: '#2563eb' },
    night: { gradient: 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 55%, #1e293b 100%)', overlay: 'rgba(15,23,42,0.45)', accent: '#bfdbfe' },
  },
  storm: {
    morning: { gradient: 'linear-gradient(135deg, #7c3aed 0%, #4c1d95 55%, #312e81 100%)', overlay: 'rgba(15,23,42,0.38)', accent: '#c4b5fd' },
    day: { gradient: 'linear-gradient(135deg, #4c1d95 0%, #312e81 55%, #111827 100%)', overlay: 'rgba(15,23,42,0.45)', accent: '#c4b5fd' },
    evening: { gradient: 'linear-gradient(135deg, #3730a3 0%, #1e3a8a 55%, #0f172a 100%)', overlay: 'rgba(15,23,42,0.48)', accent: '#c7d2fe' },
    night: { gradient: 'linear-gradient(135deg, #1e1b4b 0%, #1e293b 55%, #0b1120 100%)', overlay: 'rgba(15,23,42,0.52)', accent: '#facc15' },
  },
  mist: {
    morning: { gradient: 'linear-gradient(135deg, #cbd5f5 0%, #a5b4fc 55%, #94a3b8 100%)', overlay: 'rgba(15,23,42,0.26)', accent: '#f1f5f9' },
    day: { gradient: 'linear-gradient(135deg, #94a3b8 0%, #64748b 55%, #475569 100%)', overlay: 'rgba(15,23,42,0.32)', accent: '#e2e8f0' },
    evening: { gradient: 'linear-gradient(135deg, #818cf8 0%, #6366f1 55%, #475569 100%)', overlay: 'rgba(15,23,42,0.34)', accent: '#ede9fe' },
    night: { gradient: 'linear-gradient(135deg, #3730a3 0%, #312e81 55%, #1e293b 100%)', overlay: 'rgba(15,23,42,0.46)', accent: '#c7d2fe' },
  },
  default: {
    morning: { gradient: 'linear-gradient(135deg, #a855f7 0%, #6366f1 50%, #0f172a 100%)', overlay: 'rgba(15,23,42,0.32)', accent: '#fef3c7' },
    day: { gradient: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 55%, #0f172a 100%)', overlay: 'rgba(15,23,42,0.34)', accent: '#fef3c7' },
    evening: { gradient: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 55%, #312e81 100%)', overlay: 'rgba(15,23,42,0.36)', accent: '#fde68a' },
    night: { gradient: 'linear-gradient(135deg, #312e81 0%, #1e293b 55%, #0b1120 100%)', overlay: 'rgba(15,23,42,0.5)', accent: '#facc15' },
  },
};

const resolveWeatherMood = (input: string): WeatherMood => {
  const normalized = input.toLowerCase();
  if (normalized.includes('thunder')) return 'storm';
  if (normalized.includes('storm')) return 'storm';
  if (normalized.includes('snow') || normalized.includes('sleet') || normalized.includes('ice')) return 'snow';
  if (normalized.includes('rain') || normalized.includes('drizzle')) return 'rain';
  if (normalized.includes('mist') || normalized.includes('fog') || normalized.includes('haze') || normalized.includes('smoke')) return 'mist';
  if (normalized.includes('cloud')) return 'clouds';
  if (normalized.includes('clear')) return 'clear';
  return 'default';
};

const getWeatherTimeOfDay = (date: Date): WeatherTimeOfDay => {
  const hour = date.getUTCHours();
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'day';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
};

const normalizeWeatherResponse = (payload: any, requestedCity: string): WeatherInfo => {
  const timezoneOffset = Number.isFinite(Number(payload?.timezone)) ? Number(payload.timezone) : 0;
  const dt = Number.isFinite(Number(payload?.dt)) ? Number(payload.dt) : Math.floor(Date.now() / 1000);
  const localDate = new Date((dt + timezoneOffset) * 1000);
  const weatherEntry = Array.isArray(payload?.weather) && payload.weather.length > 0 ? payload.weather[0] : {};
  const rawMain = typeof weatherEntry?.main === 'string' ? weatherEntry.main : '';
  const rawDescription = typeof weatherEntry?.description === 'string' ? weatherEntry.description : rawMain;
  const description = rawDescription ? rawDescription.charAt(0).toUpperCase() + rawDescription.slice(1) : '';
  const mood = resolveWeatherMood(`${rawMain} ${rawDescription}`);
  const temperatureRaw = Number(payload?.main?.temp);

  const cityName = typeof payload?.name === 'string' && payload.name.trim().length > 0 ? payload.name : requestedCity;
  const country = typeof payload?.sys?.country === 'string' ? payload.sys.country : undefined;

  return {
    city: cityName,
    country,
    description,
    temperature: Number.isFinite(temperatureRaw) ? Math.round(temperatureRaw) : 0,
    localDate,
    localDateLabel: weatherDateFormatter.format(localDate),
    timeOfDay: getWeatherTimeOfDay(localDate),
    mood,
  };
};

const getWeatherVisuals = (
  info: WeatherInfo | null | undefined,
  backgrounds: StoredWeatherBackgrounds,
  effects: StoredWeatherEffects,
): WeatherVisual => {
  const mood = info?.mood ?? 'default';
  const time = info?.timeOfDay ?? 'day';
  const palette = WEATHER_VISUALS[mood] ?? WEATHER_VISUALS.default;
  const base = palette[time] ?? WEATHER_VISUALS.default.day;

  let backgroundImage: string | undefined;
  if (backgrounds) {
    if (time === 'morning' || time === 'day' || time === 'evening') {
      backgroundImage = backgrounds[time] || undefined;
    } else if (time === 'night') {
      backgroundImage = backgrounds.evening || backgrounds.day;
    }
  }

  const effectMap: Partial<Record<WeatherMood, keyof StoredWeatherEffects>> = {
    rain: 'rain',
    storm: 'rain',
    snow: 'snow',
    mist: 'mist',
  };
  const effectKey = info ? effectMap[info.mood] : undefined;
  const effectImage = effectKey ? effects[effectKey] : undefined;

  return {
    ...base,
    backgroundImage,
    effectImage,
  };
};

const TopStat = ({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
}) => (
  <div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10">
      <Icon className="h-4 w-4 text-white" />
    </div>
    <div className="min-w-0">
      <div className="truncate text-[10px] uppercase tracking-wide text-white/50">{label}</div>
      <div className="truncate text-sm font-semibold leading-tight text-white">{value}</div>
      {sub && <div className="truncate text-[10px] text-white/45">{sub}</div>}
    </div>
  </div>
);

const ProgressBar = ({ value, color = 'from-indigo-400 to-sky-400' }: { value: number; color?: string }) => (
  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
    <div
      className={classNames('h-full rounded-full bg-gradient-to-r', color)}
      style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
    />
  </div>
);

const CircleProgress = ({ value, size = 112, thickness = 14 }: { value: number; size?: number; thickness?: number }) => {
  const clamped = Math.max(0, Math.min(100, value));
  const compact = size < 90;
  return (
    <div className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }} title="Средний прогресс">
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: `conic-gradient(#8b5cf6 ${clamped * 3.6}deg, rgba(255,255,255,0.08) ${clamped * 3.6}deg)` }}
      />
      <div
        className="absolute rounded-full bg-brand-night"
        style={{ width: size - thickness * 2, height: size - thickness * 2 }}
      />
      <div className="relative text-center text-white">
        <div className={classNames('font-semibold leading-none', compact ? 'text-[11px]' : 'text-3xl')}>{clamped}%</div>
        {!compact && <div className="mt-2 text-xs uppercase tracking-wide text-white/50">Средний прогресс</div>}
      </div>
    </div>
  );
};

const MiniSparkline = ({ data, color }: { data: { value: number }[]; color: string }) => (
  <ResponsiveContainer width="100%" height={28}>
    <LineChart data={data} margin={{ top: 6, bottom: 0, left: 0, right: 0 }}>
      <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
    </LineChart>
  </ResponsiveContainer>
);

const FitnessStatCard = ({
  icon: Icon,
  label,
  value,
  unit,
  data,
  color,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  data: { value: number }[];
  color: string;
}) => (
  <div className="rounded-xl bg-black/25 px-2.5 py-2">
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
      <div className="min-w-0 flex-1 truncate text-[10px] uppercase tracking-wide text-white/50">{label}</div>
      <div className="text-sm font-semibold text-white">
        {value}
        {unit && <span className="ml-0.5 text-[10px] font-normal text-white/60">{unit}</span>}
      </div>
    </div>
    <div className="mt-1 h-7">
      <MiniSparkline data={data} color={color} />
    </div>
  </div>
);

const WeatherCard = ({
  weather,
  status,
  city,
  error,
  onRetry,
  backgrounds,
  effects,
}: {
  weather: WeatherInfo | null;
  status: 'idle' | 'loading' | 'error';
  city: string;
  error: WeatherErrorState;
  onRetry: () => void;
  backgrounds: StoredWeatherBackgrounds;
  effects: StoredWeatherEffects;
}) => {
  const visuals = getWeatherVisuals(weather, backgrounds, effects);
  const locationLabel = weather
    ? weather.country
      ? `${weather.city}, ${weather.country}`
      : weather.city
    : city;

  let content: React.ReactNode;

  if (status === 'error') {
    const showRetry = error === 'fetch' || error === 'profile';
    const showProfileLink = error === 'not-found';
    const showSettingsLink = error === 'missing-key';
    let message = 'Не удалось загрузить погоду. Попробуйте обновить страницу.';
    if (error === 'missing-key') {
      message = 'Не задан ключ API OpenWeather. Добавьте его в настройках или задайте переменную VITE_OPENWEATHER_API_KEY.';
    } else if (error === 'profile') {
      message = 'Не удалось загрузить профиль пользователя. Попробуйте обновить страницу.';
    } else if (error === 'not-found' && city) {
      message = `Город «${city}» не найден. Проверьте название в настройках профиля.`;
    }

    content = (
      <div className="space-y-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-white/70">Погода</div>
          {locationLabel && (
            <div className="text-lg font-semibold leading-tight text-white">{locationLabel}</div>
          )}
        </div>
        <div className="text-sm text-white/80 leading-relaxed">{message}</div>
        <div className="flex flex-wrap gap-2">
          {showRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/30"
            >
              <RefreshCcw className="h-4 w-4" />
              Повторить
            </button>
          )}
          {showProfileLink && (
            <Link
              to="/profile-full"
              className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/30"
            >
              Настроить город
            </Link>
          )}
          {showSettingsLink && (
            <Link
              to="/settings"
              className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/30"
            >
              Добавить ключ
            </Link>
          )}
        </div>
      </div>
    );
  } else if (!city) {
    content = (
      <div className="space-y-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-white/70">Погода</div>
          <div className="text-lg font-semibold leading-tight text-white">Добавьте город</div>
        </div>
        <div className="text-sm text-white/80 leading-relaxed">
          Укажите ваш город в профиле, чтобы видеть актуальную погоду на дашборде.
        </div>
        <Link
          to="/profile-full"
          className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/30"
        >
          Перейти в профиль
        </Link>
      </div>
    );
  } else if (status === 'loading') {
    content = (
      <div className="space-y-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-white/70">Погода</div>
          {locationLabel && (
            <div className="text-lg font-semibold leading-tight text-white">{locationLabel}</div>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-white/80">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Загружаем погоду…</span>
        </div>
      </div>
    );
  } else if (weather) {
    content = (
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-medium text-white/85">{weather.description || 'Weather'}</div>
          <div className="mt-1 text-4xl font-semibold leading-none text-white">
            {weather.temperature}°
          </div>
          <div className="mt-1 flex items-center gap-4 text-sm text-white/85">
            <div className="h-8 w-px bg-white/20" />
            <div className="min-w-0">
              <div className="truncate font-medium text-white">{weather.localDateLabel}</div>
              <div className="mt-1 truncate text-white/80">{locationLabel}</div>
            </div>
          </div>
        </div>
        <div className="relative h-16 w-16 shrink-0">
          <div
            className="absolute inset-0 rounded-full opacity-90 blur-2xl"
            style={{ backgroundColor: 'rgba(255, 214, 102, 0.45)' }}
          />
          <div
            className="absolute inset-2 rounded-full shadow-[0_12px_24px_rgba(255,140,0,0.25)]"
            style={{ background: 'radial-gradient(circle at 35% 35%, #fff8bf 0%, #ffd35a 45%, #ff8a00 100%)' }}
          />
          <div className="absolute inset-[22%] rounded-full bg-white/25 blur-xl" />
        </div>
      </div>
    );
  } else {
    content = (
      <div className="space-y-4">
        <div className="text-xs uppercase tracking-wide text-white/70">Погода</div>
        <div className="text-sm text-white/80">Нет данных о погоде.</div>
      </div>
    );
  }

  const backgroundStyle = visuals.backgroundImage
    ? {
        backgroundImage: `url(${visuals.backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }
    : { background: visuals.gradient };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 text-white shadow-xl shadow-black/20">
      <div className="absolute inset-0 transition-all duration-500" style={backgroundStyle} />
      <div className="absolute inset-0" style={{ background: visuals.overlay }} />
      <div className="absolute left-[-18%] top-[-10%] h-36 w-36 rounded-full bg-white/10" />
      <div className="absolute left-[55%] top-[-40%] h-48 w-48 rounded-full bg-cyan-300/15" />
      <div className="absolute left-[65%] top-[-20%] h-40 w-40 rounded-full bg-teal-200/15" />
      {visuals.effectImage ? (
        <div
          className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-35 mix-blend-screen weather-effect-layer"
          style={{ backgroundImage: `url(${visuals.effectImage})` }}
        />
      ) : null}
      <div className="relative z-10 p-3.5">{content}</div>
    </div>
  );
};

const categorizeTransaction = (tx: BankTransaction) => {
  if (!tx || !Number.isFinite(Number(tx.amount)) || tx.amount >= 0) return null;
  if (tx.category) return { label: tx.category, color: assignCategoryColor(tx.category) };
  if (typeof tx.mcc === 'number' && mccPresetMap.has(tx.mcc)) {
    const label = mccPresetMap.get(tx.mcc)!;
    return { label, color: assignCategoryColor(label) };
  }
  const description = (tx.description || '').toLowerCase();
  for (const preset of KEYWORD_PRESETS) {
    if (preset.keywords.some((keyword) => description.includes(keyword))) {
      const label = preset.label;
      return { label, color: assignCategoryColor(label) };
    }
  }
  const label = 'Прочее';
  return { label, color: assignCategoryColor(label) };
};

const mapLanguage = (entry: any): LanguageSummary => {
  const courses = Array.isArray(entry?.courses) ? entry.courses : [];
  const apiTotal = entry?.courses_total ?? entry?.coursesTotal;
  const apiCompleted = entry?.courses_completed ?? entry?.coursesCompleted;
  const apiPct = entry?.courses_progress_pct ?? entry?.coursesProgressPct;
  const total = Number.isFinite(Number(apiTotal)) ? Number(apiTotal) : courses.length;
  const completed = Number.isFinite(Number(apiCompleted))
    ? Number(apiCompleted)
    : courses.filter((course: any) => clampProgress(course?.progress) >= 100).length;
  const progressPct = Number.isFinite(Number(apiPct))
    ? clampProgress(apiPct)
    : total > 0
    ? Math.round((completed * 100) / total)
    : 0;

  return {
    id: entry.id,
    name: entry.name,
    level: entry.level ?? null,
    minutesToday: Number(entry.minutes_today ?? entry.minutesToday ?? 0),
    courseProgressPct: progressPct,
  };
};

const mapCourse = (entry: any): CourseSummary => ({
  id: entry.id,
  title: entry.title,
  progress: clampProgress(entry.progress),
  status: entry.status ?? null,
  provider: entry.provider ?? null,
});

const mapGoal = (entry: any): GoalSummary => ({
  id: entry.id,
  title: entry.title,
  completion_pct: clampProgress(entry.completion_pct ?? entry.completionPct ?? 0),
  streak_current: Number(entry.streak_current ?? entry.streakCurrent ?? 0),
});

const mapLoan = (entry: any): LoanSummary => ({
  id: entry.id,
  bank: entry.bank,
  payment_monthly: Number(entry.payment_monthly || 0),
  remaining: Number(entry.remaining || 0),
  due_day: entry.due_day,
  tags: Array.isArray(entry?.tags)
    ? entry.tags.map((tag: any) => ({ id: tag.id, label: tag.label, color: tag.color }))
    : [],
});
export default function Dashboard() {
  const { token } = useAuth();

  const isMountedRef = useRef(true);
  const [languages, setLanguages] = useState<LanguageSummary[]>([]);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [goals, setGoals] = useState<GoalSummary[]>([]);
  const [loans, setLoans] = useState<LoanSummary[]>([]);
  const [monthly, setMonthly] = useState(0);
  const [metrics, setMetrics] = useState<FitnessMetrics>({ steps: 0, hr: 0, sleepH: 0, activeCalories: 0 });
  const [series, setSeries] = useState<FitnessPoint[]>([]);
  const [spend, setSpend] = useState<SpendPoint[]>([]);
  const [categorySpend, setCategorySpend] = useState<CategorySpend[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [calendarPreview, setCalendarPreview] = useState<{ iso: string; x: number; y: number; above: boolean; events: CalendarEvent[] } | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const calendarCardRef = useRef<HTMLDivElement | null>(null);

  const [editing, setEditing] = useState<LoanSummary | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ bank: '', payment_monthly: 0, remaining: 0, due_day: '' });
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  const [formTagIds, setFormTagIds] = useState<number[]>([]);
  const [editingTagIds, setEditingTagIds] = useState<number[]>([]);
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [weatherCity, setWeatherCity] = useState('');
  const [weatherStatus, setWeatherStatus] = useState<'idle' | 'loading' | 'error'>('loading');
  const [weatherError, setWeatherError] = useState<WeatherErrorState>(null);
  const [weatherBackgrounds, setWeatherBackgrounds] = useState<StoredWeatherBackgrounds>(loadWeatherBackgrounds);
  const [weatherEffects, setWeatherEffects] = useState<StoredWeatherEffects>(loadWeatherEffects);
  const [topStatsCollapsed, setTopStatsCollapsed] = usePersistentCollapse('dashboard:top-stats');
  const [layout, setLayout] = useDashboardLayout();
  const [editMode, setEditMode] = useState(false);
  const [dragId, setDragId] = useState<WidgetId | null>(null);
  const [missions, setMissions] = useState<DashMissions | null>(null);
  const [habits, setHabits] = useState<{ id: number; title: string }[]>([]);
  const [habitsDone, setHabitsDone] = useState<Set<number>>(new Set());
  const [learnCourses, setLearnCourses] = useState<DashLearnCourse[]>([]);
  const [recentAchievements, setRecentAchievements] = useState<DashAchievement[]>([]);
  const [recentTx, setRecentTx] = useState<BankTransaction[]>([]);
  const [expenseOpen, setExpenseOpen] = useState(false);

  // Данные для новых блоков: задания, привычки, курсы-тренировки, ачивки
  useEffect(() => {
    const today = toISODate(new Date());
    api.get('/api/life/daily-missions', { silentError: true }).then(setMissions).catch(() => {});
    Promise.all([
      api.get('/api/life/habits', { silentError: true }),
      api.get(`/api/life/habits/checks?from=${today}&to=${today}`, { silentError: true }),
    ])
      .then(([h, c]) => {
        setHabits((h?.items || []).map((x: any) => ({ id: x.id, title: x.title })));
        setHabitsDone(new Set((c?.items || []).map((x: any) => x.habit_id)));
      })
      .catch(() => {});
    api.get('/api/learn/courses', { silentError: true }).then((r) => setLearnCourses(r?.items || [])).catch(() => {});
    api
      .get('/api/achievements', { silentError: true })
      .then((r) =>
        setRecentAchievements(
          (r?.items || [])
            .filter((a: any) => a.earned)
            .sort((a: any, b: any) => String(b.earned_at || '').localeCompare(String(a.earned_at || '')))
            .slice(0, 6)
        )
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fallbackWeatherKey = useMemo(() => {
    const raw = import.meta.env.VITE_OPENWEATHER_API_KEY as string | undefined;
    if (typeof raw !== 'string') return '';
    const trimmed = raw.trim();
    if (!trimmed) return '';
    const lowered = trimmed.toLowerCase();
    if (lowered === 'undefined' || lowered === 'null') return '';
    return trimmed;
  }, []);

  useEffect(() => {
    const loadAssets = () => {
      setWeatherBackgrounds(loadWeatherBackgrounds());
      setWeatherEffects(loadWeatherEffects());
    };

    loadAssets();

    if (typeof window === 'undefined') return;

    const handleAssetsUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ backgrounds?: StoredWeatherBackgrounds; effects?: StoredWeatherEffects }>;
      if (customEvent.detail) {
        if (customEvent.detail.backgrounds) {
          setWeatherBackgrounds(customEvent.detail.backgrounds);
        }
        if (customEvent.detail.effects) {
          setWeatherEffects(customEvent.detail.effects);
        }
      } else {
        loadAssets();
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (!event.key) return;
      if (
        event.key === WEATHER_BACKGROUNDS_STORAGE_KEY ||
        event.key === WEATHER_EFFECTS_STORAGE_KEY
      ) {
        loadAssets();
      }
    };

    window.addEventListener(WEATHER_ASSETS_EVENT, handleAssetsUpdate as EventListener);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(WEATHER_ASSETS_EVENT, handleAssetsUpdate as EventListener);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const loadWeather = useCallback(async () => {
    if (!isMountedRef.current) return;
    setWeatherError(null);
    setWeatherStatus('loading');

    let cityName = '';
    let apiKey = '';
    try {
      const profile = await api.get('/api/life/profile', { silentError: true });
      if (!isMountedRef.current) return;
      cityName = (profile?.user?.city || '').trim();
      const rawKey =
        typeof profile?.user?.weather_api_key === 'string'
          ? profile.user.weather_api_key
          : '';
      const trimmedKey = (rawKey || '').trim();
      apiKey = trimmedKey || fallbackWeatherKey;
      setWeatherCity(cityName);
    } catch {
      if (!isMountedRef.current) return;
      setWeatherCity('');
      setWeather(null);
      setWeatherError('profile');
      setWeatherStatus('error');
      return;
    }

    if (!isMountedRef.current) return;

    if (!cityName) {
      setWeather(null);
      setWeatherStatus('idle');
      return;
    }

    if (!apiKey) {
      setWeather(null);
      setWeatherError('missing-key');
      setWeatherStatus('error');
      return;
    }

    try {
      const encodedCity = encodeURIComponent(cityName);
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${encodedCity}&appid=${apiKey}&units=metric&lang=ru`,
      );
      if (!response.ok) {
        let errorCode = 'fetch_failed';
        try {
          const payload = await response.clone().json();
          const message = typeof payload?.message === 'string' ? payload.message.toLowerCase() : '';
          if (message.includes('not found')) {
            errorCode = 'not-found';
          } else if (message.includes('invalid api key')) {
            errorCode = 'missing-key';
          }
        } catch {
          try {
            const text = (await response.text()).toLowerCase();
            if (text.includes('not found')) errorCode = 'not-found';
            else if (text.includes('invalid api key')) errorCode = 'missing-key';
          } catch {
            // ignore text parse errors
          }
        }
        throw new Error(errorCode);
      }
      const payload = await response.json();
      if (!isMountedRef.current) return;
      setWeather(normalizeWeatherResponse(payload, cityName));
      setWeatherStatus('idle');
    } catch (error) {
      if (!isMountedRef.current) return;
      const code = error instanceof Error ? error.message : '';
      if (code === 'missing-key') {
        setWeatherError('missing-key');
      } else if (code === 'not-found') {
        setWeatherError('not-found');
      } else if (code === 'profile') {
        setWeatherError('profile');
      } else {
        setWeatherError('fetch');
      }
      setWeather(null);
      setWeatherStatus('error');
    }
  }, [fallbackWeatherKey]);

  const loadLanguages = async () => {
    try {
      const response = await api.get('/api/life/languages', { silentError: true });
      const source = Array.isArray(response?.items)
        ? response.items
        : Array.isArray(response)
        ? response
        : Array.isArray(response?.active)
        ? response.active
        : [];
      const active = source.filter((item: any) => (item.status ?? 'active') !== 'archived');
      setLanguages(active.map(mapLanguage));
    } catch {
      setLanguages([]);
    }
  };

  const loadCourses = async () => {
    try {
      const response = await api.get('/api/life/courses', { silentError: true });
      const list = Array.isArray(response?.items)
        ? response.items
        : Array.isArray(response)
        ? response
        : [];
      setCourses(list.map(mapCourse));
    } catch {
      setCourses([]);
    }
  };

  const loadGoals = async () => {
    try {
      const response = await api.get('/api/life/yearly-goals', { silentError: true });
      const active = Array.isArray(response?.active) ? response.active : [];
      setGoals(active.map(mapGoal));
    } catch {
      setGoals([]);
    }
  };

  const loadLoans = async () => {
    const res = await api.get('/api/loans/summary');
    const normalized = (res.items || []).map(mapLoan);
    setLoans(normalized);
    setMonthly(Number(res.monthlyTotal || 0));
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

  const loadFitness = async () => {
    try {
      const today = new Date();
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      const startIso = toISODate(start);
      const endIso = toISODate(today);

      const [activityRes, heartRes, sleepRes] = await Promise.all([
        api.get(`/api/fitness/activity?start=${startIso}&end=${endIso}`, { silentError: true }),
        api.get(`/api/fitness/heart_rate?start=${startIso}&end=${endIso}`, { silentError: true }),
        api.get(`/api/fitness/sleep?start=${startIso}&end=${endIso}`, { silentError: true }),
      ]);

      const activityMap = new Map<string, any>();
      const heartMap = new Map<string, any>();
      const sleepMap = new Map<string, any>();

      const activityItems = Array.isArray(activityRes?.items) ? activityRes.items : [];
      const heartItems = Array.isArray(heartRes?.items) ? heartRes.items : [];
      const sleepItems = Array.isArray(sleepRes?.items) ? sleepRes.items : [];

      activityItems.forEach((item: any) => {
        if (item?.date) activityMap.set(item.date, item);
      });
      heartItems.forEach((item: any) => {
        if (item?.date) heartMap.set(item.date, item);
      });
      sleepItems.forEach((item: any) => {
        if (item?.date) sleepMap.set(item.date, item);
      });

      const rangeDates: string[] = [];
      const cursor = new Date(`${startIso}T00:00:00Z`);
      const end = new Date(`${endIso}T00:00:00Z`);
      while (cursor.getTime() <= end.getTime()) {
        rangeDates.push(toISODate(cursor));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }

      const history: FitnessPoint[] = rangeDates.map((iso) => {
        const dateObj = new Date(`${iso}T00:00:00Z`);
        const activity = activityMap.get(iso) || {};
        const heart = heartMap.get(iso) || {};
        const sleep = sleepMap.get(iso) || {};
        const sleepHours =
          typeof sleep.duration_hours === 'number'
            ? Number(sleep.duration_hours)
            : sleep.duration_minutes
            ? Number((Number(sleep.duration_minutes) / 60).toFixed(2))
            : 0;
        return {
          date: fmtDateKey(dateObj),
          steps: Number(activity.steps || 0),
          hr: Number(heart.avg_bpm || 0),
          sleep: Number(sleepHours || 0),
          activeCalories: Number(
            activity.calories ?? activity.calories_kcal ?? activity.active_calories ?? 0
          ),
        };
      });

      setSeries(history);
      const latest = history[history.length - 1];
      if (latest) {
        setMetrics({
          steps: latest.steps,
          hr: latest.hr,
          sleepH: latest.sleep,
          activeCalories: latest.activeCalories,
        });
      }
    } catch {
      setSeries([]);
      setMetrics({ steps: 0, hr: 0, sleepH: 0, activeCalories: 0 });
    }
  };

  const loadFinance = async () => {
    try {
      const response = await api.get('/api/banks/transactions', { silentError: true });
      const items: BankTransaction[] = Array.isArray(response?.items) ? response.items : [];
      setRecentTx(items.slice(0, 8));
      const byDay = new Map<string, number>();
      const categoryTotals = new Map<string, number>();
      const categoryColors = new Map<string, string>();
      for (const tx of items) {
        const amount = Number(tx.amount || 0);
        if (!Number.isFinite(amount)) continue;
        const date = new Date(Number(tx.ts));
        const key = fmtDateKey(date);
        if (!byDay.has(key)) byDay.set(key, 0);
        if (amount < 0) {
          byDay.set(key, (byDay.get(key) || 0) + Math.abs(amount));
          const category = categorizeTransaction(tx);
          if (category) {
            const prev = categoryTotals.get(category.label) || 0;
            categoryTotals.set(category.label, prev + Math.abs(amount));
            categoryColors.set(category.label, category.color);
          }
        }
      }
      const today = new Date();
      const days = [...Array(7)].map((_, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() - (6 - i));
        return d;
      });
      setSpend(
        days.map((day) => ({
          date: fmtDateKey(day),
          out: +(byDay.get(fmtDateKey(day)) || 0).toFixed(2),
        }))
      );
      const categories = Array.from(categoryTotals.entries())
        .map(([label, amount]) => ({
          label,
          amount: Math.round(amount),
          color: categoryColors.get(label) || assignCategoryColor(label),
        }))
        .filter((entry) => entry.amount > 0)
        .sort((a, b) => b.amount - a.amount);
      setCategorySpend(categories);
    } catch {
      setSpend([]);
      setCategorySpend([]);
    }
  };

  const loadCalendar = async (month: Date) => {
    try {
      const year = month.getFullYear();
      const m = month.getMonth() + 1;
      const response = await api.get(`/api/life/calendar?y=${year}&m=${m}`, { silentError: true });
      const normalized = (response.items || []).map((item: any) => ({
        id: item.id,
        date: item.date,
        title: item.title,
        type: item.type,
        mood: item.mood ?? null,
      }));
      setCalendarEvents(normalized);
    } catch {
      setCalendarEvents([]);
    }
  };
  useEffect(() => {
    (async () => {
      try {
        await loadLoans();
      } catch {}
      try {
        await loadTagOptions();
      } catch {}
      try {
        await loadLanguages();
      } catch {}
      try {
        await loadCourses();
      } catch {}
      try {
        await loadGoals();
      } catch {}
      try {
        await loadFitness();
      } catch {}
      try {
        await loadFinance();
      } catch {}
    })();
  }, []);

  useEffect(() => {
    loadWeather();
  }, [loadWeather]);

  useEffect(() => {
    loadCalendar(currentMonth);
  }, [currentMonth]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of calendarEvents) {
      if (!map.has(event.date)) {
        map.set(event.date, []);
      }
      map.get(event.date)!.push(event);
    }
    return map;
  }, [calendarEvents]);

  const languagesAverage = useMemo(() => {
    if (!languages.length) return 0;
    const total = languages.reduce((acc, lang) => acc + lang.courseProgressPct, 0);
    return Math.round(total / languages.length);
  }, [languages]);

  const totalMinutesToday = useMemo(
    () => languages.reduce((acc, lang) => acc + (lang.minutesToday || 0), 0),
    [languages]
  );

  const activeCourses = useMemo(
    () => courses.filter((course) => (course.status ?? 'in-progress') !== 'done'),
    [courses]
  );

  const courseAverageProgress = useMemo(() => {
    if (!activeCourses.length) return 0;
    const sum = activeCourses.reduce((acc, course) => acc + clampProgress(course.progress), 0);
    return Math.round(sum / activeCourses.length);
  }, [activeCourses]);

  const goalsAverageProgress = useMemo(() => {
    if (!goals.length) return 0;
    const sum = goals.reduce((acc, goal) => acc + goal.completion_pct, 0);
    return Math.round(sum / goals.length);
  }, [goals]);

  const loanRemainingTotal = useMemo(
    () => loans.reduce((acc, loan) => acc + (loan.remaining || 0), 0),
    [loans]
  );

  const loanOverviewProgress = useMemo(() => {
    const total = monthly + loanRemainingTotal;
    if (total <= 0) return 0;
    return Math.round((monthly / total) * 100);
  }, [monthly, loanRemainingTotal]);

  const spendTotal = useMemo(() => spend.reduce((acc, day) => acc + (day.out || 0), 0), [spend]);

  const stepsSpark = useMemo(() => series.map((point) => ({ value: point.steps })), [series]);
  const sleepSpark = useMemo(() => series.map((point) => ({ value: point.sleep })), [series]);
  const caloriesSpark = useMemo(
    () => series.map((point) => ({ value: Math.round(point.activeCalories) })),
    [series]
  );
  const activitySpark = useMemo(
    () => series.map((point) => ({ value: Math.round(point.steps / 100) })),
    [series]
  );

  const activeCaloriesToday = metrics.activeCalories;
  const estimatedActiveMinutes = Math.round(metrics.steps / 100);

  const weeks = useMemo(() => monthMatrix(currentMonth), [currentMonth]);
  const todayIso = toISODate(new Date());

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    return calendarEvents
      .map((event) => ({ ...event, dateObj: new Date(event.date) }))
      .filter((event) => !Number.isNaN(event.dateObj.valueOf()) && event.dateObj >= new Date(now.toDateString()))
      .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime())
      .slice(0, 4);
  }, [calendarEvents]);

  const startAdd = () => {
    setForm({ bank: '', payment_monthly: 0, remaining: 0, due_day: '' });
    setFormTagIds([]);
    setAdding(true);
  };

  const startEdit = (loan: LoanSummary) => {
    setEditing(loan);
    setForm({
      bank: loan.bank || '',
      payment_monthly: loan.payment_monthly || 0,
      remaining: loan.remaining || 0,
      due_day: loan.due_day || '',
    });
    setEditingTagIds((loan.tags || []).map((tag) => tag.id));
  };

  const saveAdd = async () => {
    await api.post('/api/loans', { ...form, tags: formTagIds });
    setAdding(false);
    setFormTagIds([]);
    await loadLoans();
  };

  const saveEdit = async () => {
    if (!editing) return;
    await api.put(`/api/loans/${editing.id}`, { ...form, tags: editingTagIds });
    setEditing(null);
    setEditingTagIds([]);
    await loadLoans();
  };

  const removeLoan = async (id: number) => {
    if (!window.confirm('Удалить этот кредит?')) return;
    await api.del(`/api/loans/${id}`);
    await loadLoans();
  };

  const googleAuthUrl = `/api/fitness/google/auth?token=${encodeURIComponent(token || '')}`;

  const goPrevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const goNextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  const clearCalendarHoverTimer = () => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  const startCalendarPreviewTimer = (iso: string, events: CalendarEvent[], target: HTMLDivElement) => {
    clearCalendarHoverTimer();
    if (!events.length) {
      setCalendarPreview(null);
      return;
    }
    hoverTimerRef.current = window.setTimeout(() => {
      const rect = target.getBoundingClientRect();
      const containerRect = calendarCardRef.current?.getBoundingClientRect();
      if (!containerRect) return;
      const popupWidth = 224;
      const padding = 12;
      const preferredX = rect.left + rect.width / 2 - containerRect.left;
      const clampedX = Math.min(
        containerRect.width - popupWidth / 2 - padding,
        Math.max(popupWidth / 2 + padding, preferredX)
      );
      const above = rect.top - containerRect.top > 96;
      const y = above
        ? rect.top - containerRect.top - 8
        : rect.bottom - containerRect.top + 8;
      setCalendarPreview({
        iso,
        events,
        x: clampedX,
        y,
        above,
      });
      hoverTimerRef.current = null;
    }, 1400);
  };

  const stopCalendarPreview = () => {
    clearCalendarHoverTimer();
    setCalendarPreview(null);
  };

  useEffect(() => () => clearCalendarHoverTimer(), []);

  // ───── Настраиваемый Дэшборд ─────
  const moveWidgetBy = (id: WidgetId, delta: number) => {
    const visible = layout.filter((w) => !w.hidden);
    const index = visible.findIndex((w) => w.id === id);
    const target = visible[index + delta];
    if (!target) return;
    moveWidgetTo(id, target.id, delta > 0);
  };

  const moveWidgetTo = (id: WidgetId, targetId: WidgetId, after = false) => {
    const item = layout.find((w) => w.id === id);
    if (!item) return;
    const rest = layout.filter((w) => w.id !== id);
    const targetIndex = rest.findIndex((w) => w.id === targetId);
    rest.splice(after ? targetIndex + 1 : targetIndex, 0, item);
    setLayout(rest);
  };

  const toggleHabit = async (habitId: number) => {
    const done = habitsDone.has(habitId);
    const next = new Set(habitsDone);
    if (done) next.delete(habitId);
    else next.add(habitId);
    setHabitsDone(next);
    await api.post('/api/life/habits/checks', { habit_id: habitId, date: todayIso, done: !done }, { silentSuccess: true });
  };

  const removeTransaction = async (id: number) => {
    if (!window.confirm('Удалить эту запись?')) return;
    await api.del(`/api/banks/transactions/${id}`, { silentSuccess: true });
    await loadFinance();
  };

  const widgetHead = (id: WidgetId, sub: React.ReactNode, color: string, action?: React.ReactNode) => (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className={classNames('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-base', color)}>{WIDGETS[id].emoji}</div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{WIDGETS[id].title}</div>
          <div className="truncate text-[11px] text-white/50">{sub}</div>
        </div>
      </div>
      {action}
    </div>
  );

  const emptyHint = (text: string, to?: string, label?: string) => (
    <div className="rounded-xl border border-dashed border-white/10 p-3 text-xs text-white/60">
      {text}{' '}
      {to && (
        <Link to={to} className="text-brand-mint hover:underline">
          {label}
        </Link>
      )}
    </div>
  );

  const ringRow = (items: { key: string | number; label: string; value: number; sub?: string }[]) => (
    <div className="grid grid-cols-3 gap-2">
      {items.slice(0, 6).map((item) => (
        <div key={item.key} className="flex flex-col items-center rounded-xl bg-black/25 p-2 text-center">
          <CircleProgress value={item.value} size={52} thickness={6} />
          <div className="mt-1 w-full truncate text-[11px] font-semibold text-white">{item.label}</div>
          {item.sub && <div className="truncate text-[10px] text-white/50">{item.sub}</div>}
        </div>
      ))}
    </div>
  );

  const renderWidget = (config: WidgetConfig): React.ReactNode => {
    const view = viewOf(config);
    switch (config.id) {
      case 'weather':
        return (
          <WeatherCard weather={weather} status={weatherStatus} city={weatherCity} error={weatherError} onRetry={loadWeather} backgrounds={weatherBackgrounds} effects={weatherEffects} />
        );

      case 'missions': {
        const pct = missions ? Math.min(100, Math.round((missions.total_points * 100) / Math.max(1, missions.target_points))) : 0;
        const claimable = missions?.missions.filter((m) => m.claimable).length || 0;
        return (
          <Link to="/daily-missions" onClick={(e) => { e.preventDefault(); openMissionsDiary(); }} className="card block space-y-2 !p-3 transition hover:border-amber-300/50">
            {widgetHead('missions', missions ? `Выполнено ${missions.completed_count} из ${missions.total_count}` : 'загрузка…', 'bg-amber-400/15', claimable > 0 ? <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-brand-deep">🎁 {claimable}</span> : null)}
            {view === 'ring' ? (
              <div className="flex items-center gap-3">
                <CircleProgress value={pct} size={64} thickness={7} />
                <div className="text-sm text-white/80">
                  <b className="text-white">{missions?.total_points ?? 0}</b> из {missions?.target_points ?? 500} очков
                  <div className="text-xs text-white/50">+{missions?.xp_earned ?? 0} XP сегодня</div>
                </div>
              </div>
            ) : (
              <div>
                <ProgressBar value={pct} color="from-amber-300 via-rose-400 to-purple-500" />
                <div className="mt-1 flex justify-between text-[11px] text-white/55">
                  <span>{missions?.total_points ?? 0} / {missions?.target_points ?? 500} очков</span>
                  <span>{pct}%</span>
                </div>
              </div>
            )}
          </Link>
        );
      }

      case 'learn': {
        const next = learnCourses.find((c) => c.progress_pct < 100 && !c.locked);
        return (
          <div className="card space-y-2 !p-3">
            {widgetHead('learn', next ? `${next.lessons_done} из ${next.lessons_total} уроков` : 'курсов-тренировок пока нет', 'bg-[#58cc02]/20')}
            {next ? (
              <Link to={`/learn/${next.id}`} className="flex items-center gap-3 rounded-xl bg-black/25 p-2.5 transition hover:bg-black/40">
                <span className="text-2xl">{next.icon || '📘'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">{next.title}</span>
                  <span className="mt-1 block">
                    <ProgressBar value={next.progress_pct} color="from-[#58cc02] to-[#89e219]" />
                  </span>
                </span>
                <span className="rounded-xl bg-[#58cc02] px-3 py-1.5 text-[11px] font-extrabold uppercase text-white">Дальше</span>
              </Link>
            ) : (
              emptyHint('Импортируйте курс, сгенерированный ИИ, —', '/courses?template=1', 'шаблон и импорт')
            )}
          </div>
        );
      }

      case 'habits': {
        const done = habits.filter((h) => habitsDone.has(h.id)).length;
        const pct = habits.length ? Math.round((done * 100) / habits.length) : 0;
        return (
          <div className="card space-y-2 !p-3">
            {widgetHead('habits', habits.length ? `Сегодня ${done} из ${habits.length}` : 'привычек пока нет', 'bg-emerald-400/15')}
            {!habits.length ? (
              emptyHint('Добавьте первую привычку —', '/habits', 'перейти к привычкам')
            ) : view === 'ring' ? (
              <Link to="/habits" className="flex items-center gap-3">
                <CircleProgress value={pct} size={64} thickness={7} />
                <span className="text-sm text-white/70">{done === habits.length ? 'Все привычки на сегодня отмечены 🎉' : `Осталось ${habits.length - done}`}</span>
              </Link>
            ) : (
              <div className="space-y-1">
                {habits.slice(0, 6).map((habit) => {
                  const checked = habitsDone.has(habit.id);
                  return (
                    <button
                      key={habit.id}
                      type="button"
                      onClick={() => toggleHabit(habit.id)}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-xs transition hover:bg-white/5"
                    >
                      <span className={classNames('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-black', checked ? 'border-brand-mint bg-brand-mint text-brand-deep' : 'border-white/30 bg-white/5')}>
                        {checked ? '✓' : ''}
                      </span>
                      <span className={classNames('truncate', checked ? 'text-white/45 line-through' : 'text-white/85')}>{habit.title}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      }

      case 'languages':
        return (
          <div className="card space-y-2 !p-3">
            {widgetHead('languages', totalMinutesToday > 0 ? `Сегодня: ${formatNumber(totalMinutesToday)} мин` : 'Сегодня занятий ещё не было', 'bg-violet-400/15')}
            {!languages.length
              ? emptyHint('Добавьте язык —', '/languages', 'к языкам')
              : view === 'ring'
              ? ringRow(languages.map((l) => ({ key: l.id, label: l.name, value: l.courseProgressPct, sub: `${l.minutesToday || 0} мин` })))
              : (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {languages.slice(0, 4).map((lang) => (
                    <div key={lang.id} className="rounded-xl bg-black/25 px-2.5 py-2">
                      <div className="flex items-center justify-between">
                        <div className="truncate text-xs font-semibold text-white">{lang.name}</div>
                        <div className="text-[10px] text-white/50">{lang.minutesToday || 0} мин</div>
                      </div>
                      <div className="mt-1.5">
                        <ProgressBar value={lang.courseProgressPct} color="from-violet-400 to-sky-400" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        );

      case 'courses':
        return (
          <div className="card space-y-2 !p-3">
            {widgetHead('courses', activeCourses.length ? `В работе: ${activeCourses.length} · ${courseAverageProgress}%` : 'Нет активных курсов', 'bg-emerald-400/15')}
            {!activeCourses.length
              ? emptyHint('Самое время выбрать курс —', '/courses', 'к курсам')
              : view === 'ring'
              ? ringRow(activeCourses.map((c) => ({ key: c.id, label: c.title, value: c.progress })))
              : (
                <div className="space-y-1.5">
                  {activeCourses.slice(0, 4).map((course) => (
                    <div key={course.id} className="rounded-xl bg-black/25 px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 truncate text-xs font-semibold text-white">{course.title}</div>
                        <div className="text-[11px] text-white/60">{course.progress}%</div>
                      </div>
                      <div className="mt-1.5">
                        <ProgressBar value={course.progress} color="from-emerald-400 to-lime-300" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        );

      case 'goals':
        return (
          <div className="card space-y-2 !p-3">
            {widgetHead('goals', goals.length ? `${goals.length} активных` : 'Целей пока нет', 'bg-pink-400/15')}
            {!goals.length
              ? emptyHint('Поставьте цель на год —', '/year-goals', 'к целям')
              : view === 'ring'
              ? ringRow(goals.map((g) => ({ key: g.id, label: g.title, value: g.completion_pct, sub: `🔥 ${g.streak_current}` })))
              : (
                <div className="space-y-1.5">
                  {goals.slice(0, 4).map((goal) => (
                    <div key={goal.id} className="rounded-xl bg-black/25 px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 truncate text-xs font-semibold text-white">{goal.title}</div>
                        <div className="shrink-0 text-[11px] text-white/55">🔥 {goal.streak_current} · {goal.completion_pct}%</div>
                      </div>
                      <div className="mt-1.5">
                        <ProgressBar value={goal.completion_pct} color="from-purple-400 to-pink-400" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        );

      case 'calendar':
        if (view === 'upcoming') {
          return (
            <Link to="/calendar" className="card block space-y-2 !p-3">
              {widgetHead('calendar', upcomingEvents.length ? 'ближайшие события' : 'событий впереди нет', 'bg-sky-400/15')}
              <div className="space-y-1">
                {upcomingEvents.map((event) => (
                  <div key={event.id} className="flex items-center gap-2 rounded-xl bg-black/25 px-2.5 py-1.5 text-xs">
                    <span className="w-16 shrink-0 text-white/50">{new Date(event.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
                    <span className="truncate text-white/85">{event.title}</span>
                  </div>
                ))}
              </div>
            </Link>
          );
        }
        return (
          <div ref={calendarCardRef} className="card relative space-y-2 overflow-visible !p-3">
            <div className="flex items-center justify-between gap-2">
              <button onClick={goPrevMonth} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20">
                ‹
              </button>
              <div className="text-sm font-medium text-white first-letter:uppercase">{currentMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</div>
              <button onClick={goNextMonth} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20">
                ›
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] font-medium uppercase tracking-wide text-white/45">
              {dayNames.map((name) => (
                <div key={name}>{name}</div>
              ))}
            </div>
            <div className="relative grid grid-cols-7 gap-0.5">
              {weeks.flat().map((date) => {
                const iso = toISODate(date);
                const dayEvents = eventsByDate.get(iso) || [];
                const isCurrentMonth = date.getMonth() === currentMonth.getMonth();
                const isToday = iso === todayIso;
                return (
                  <div
                    key={`${iso}-${date.getDate()}`}
                    onMouseEnter={(event) => startCalendarPreviewTimer(iso, dayEvents, event.currentTarget)}
                    onMouseLeave={stopCalendarPreview}
                    className={classNames(
                      'relative flex h-7 items-center justify-center rounded-md text-[10px] transition',
                      isCurrentMonth ? 'text-white/75' : 'text-white/25',
                      isToday && 'bg-sky-500/70 text-white shadow-lg shadow-sky-950/30',
                      !isToday && isCurrentMonth && 'hover:bg-white/8',
                      dayEvents.length > 0 && !isToday && 'bg-white/6'
                    )}
                  >
                    <span>{date.getDate()}</span>
                    {dayEvents.length > 0 && <span className={classNames('absolute bottom-0.5 h-1 w-1 rounded-full', isToday ? 'bg-white' : 'bg-sky-300')} />}
                  </div>
                );
              })}
              {calendarPreview && (
                <div
                  className="pointer-events-none absolute z-50 w-56 -translate-x-1/2 rounded-xl border border-white/10 bg-[#0b1018]/95 p-3 text-xs shadow-2xl"
                  style={{ left: calendarPreview.x, top: calendarPreview.y, transform: calendarPreview.above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)' }}
                >
                  <div className="mb-2 text-[11px] uppercase tracking-wide text-white/45">
                    {new Date(calendarPreview.iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' })}
                  </div>
                  <div className="space-y-1">
                    {calendarPreview.events.map((event) => (
                      <div key={event.id} className="truncate text-white/85">
                        {event.title}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 'fitness':
        return (
          <div className="card space-y-2 !p-3">
            {widgetHead('fitness', 'последние 7 дней', 'bg-sky-400/15', <a href={googleAuthUrl} className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[10px] text-white/60 hover:bg-white/10">Google Fit</a>)}
            <div className="grid grid-cols-2 gap-1.5">
              <FitnessStatCard icon={Footprints} label="Шаги" value={formatNumber(metrics.steps)} data={stepsSpark} color="#38bdf8" />
              <FitnessStatCard icon={Moon} label="Сон" value={metrics.sleepH.toFixed(1)} unit="ч" data={sleepSpark} color="#a855f7" />
              <FitnessStatCard icon={Flame} label="Калории" value={formatNumber(activeCaloriesToday)} data={caloriesSpark} color="#f97316" />
              <FitnessStatCard icon={TrendingUp} label="Активность" value={formatNumber(estimatedActiveMinutes)} unit="мин" data={activitySpark} color="#34d399" />
            </div>
            {view === 'chart' && (
              <div className="h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="stepsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.6} />
                        <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} />
                    <YAxis stroke="#94a3b8" fontSize={10} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                    <Area type="monotone" dataKey="steps" stroke="#38bdf8" fill="url(#stepsGradient)" strokeWidth={2} />
                    <Line type="monotone" dataKey="hr" stroke="#facc15" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="sleep" stroke="#a855f7" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        );

      case 'spend':
        return (
          <div className="card space-y-2 !p-3">
            {widgetHead(
              'spend',
              `За 7 дней: ${formatCurrency(spendTotal)}`,
              'bg-orange-400/15',
              <button type="button" onClick={() => setExpenseOpen(true)} className="inline-flex items-center gap-1 rounded-full bg-orange-400 px-2.5 py-1 text-[11px] font-bold text-brand-deep hover:brightness-110">
                <Plus className="h-3.5 w-3.5" /> Расход
              </button>
            )}
            {view === 'list' ? (
              recentTx.length ? (
                <div className="space-y-1">
                  {recentTx.map((tx) => (
                    <div key={tx.id} className="group flex items-center gap-2 rounded-xl bg-black/25 px-2.5 py-1.5 text-xs">
                      <span className="w-12 shrink-0 text-white/45">{new Date(Number(tx.ts)).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
                      <span className="min-w-0 flex-1 truncate text-white/80">{tx.category || tx.description || 'Без описания'}</span>
                      <span className={classNames('shrink-0 font-semibold', tx.amount < 0 ? 'text-rose-300' : 'text-emerald-300')}>
                        {tx.amount < 0 ? '−' : '+'}
                        {formatCurrency(Math.abs(tx.amount))}
                      </span>
                      <button type="button" onClick={() => removeTransaction(tx.id)} className="text-white/30 opacity-0 transition hover:text-white group-hover:opacity-100" title="Удалить">
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                emptyHint('Записей пока нет — добавьте первый расход кнопкой выше или импортируйте выписку.')
              )
            ) : view === 'line' ? (
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={spend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} />
                    <YAxis stroke="#94a3b8" fontSize={10} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ backgroundColor: '#0f172a', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                    <Line type="monotone" dataKey="out" stroke="#f97316" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : categorySpend.length === 0 ? (
              emptyHint('Добавьте расход или загрузите выписку, чтобы увидеть категории.')
            ) : (
              <div className="flex items-center gap-3">
                <div className="h-28 w-28 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ backgroundColor: '#0f172a', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                      <Pie data={categorySpend} dataKey="amount" nameKey="label" innerRadius={30} outerRadius={52} paddingAngle={3}>
                        {categorySpend.map((entry) => (
                          <Cell key={entry.label} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="min-w-0 flex-1 space-y-1 text-xs text-white/70">
                  {categorySpend.slice(0, 5).map((entry) => (
                    <div key={entry.label} className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                        <span className="truncate">{entry.label}</span>
                      </div>
                      <span className="shrink-0 text-white/55">{formatCurrency(entry.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'loans':
        return (
          <div className="card space-y-2 !p-3">
            {widgetHead(
              'loans',
              `${formatCurrency(monthly)} / мес · остаток ${formatCurrency(loanRemainingTotal)}`,
              'bg-emerald-400/15',
              <button onClick={startAdd} className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/80 text-black hover:bg-emerald-400" title="Добавить кредит">
                <Plus className="h-4 w-4" />
              </button>
            )}
            <div>
              <ProgressBar value={loanOverviewProgress} color="from-emerald-400 to-lime-300" />
              <div className="mt-1 flex justify-between text-[11px] text-white/55">
                <span>Прогресс выплат</span>
                <span>{loanOverviewProgress}%</span>
              </div>
            </div>
            {view === 'list' &&
              (loans.length ? (
                loans.map((loan) => {
                  const ratio = loan.payment_monthly + loan.remaining;
                  const loanProgress = ratio > 0 ? Math.round((loan.payment_monthly / ratio) * 100) : 0;
                  return (
                    <div key={loan.id} className="group rounded-xl bg-black/25 px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-white">{loan.bank}</div>
                          <div className="text-[11px] text-white/50">
                            {formatCurrency(loan.payment_monthly)} / мес · день {loan.due_day || '—'}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-60 transition group-hover:opacity-100">
                          <button onClick={() => startEdit(loan)} className="rounded-full bg-white/10 px-2 py-0.5 text-xs hover:bg-white/20">
                            ✎
                          </button>
                          <button onClick={() => removeLoan(loan.id)} className="rounded-full bg-white/10 px-2 py-0.5 text-xs hover:bg-rose-500/40">
                            ✕
                          </button>
                        </div>
                      </div>
                      <div className="mt-1.5">
                        <ProgressBar value={loanProgress} color="from-emerald-400 to-lime-300" />
                      </div>
                    </div>
                  );
                })
              ) : (
                emptyHint('Кредитов нет — и это прекрасно 🙌')
              ))}
          </div>
        );

      case 'achievements':
        return (
          <Link to="/achievements" className="card block space-y-2 !p-3">
            {widgetHead('achievements', recentAchievements.length ? 'последние полученные' : 'пока ни одной', 'bg-amber-400/15')}
            {recentAchievements.length ? (
              <div className="grid grid-cols-3 gap-2">
                {recentAchievements.map((a) => (
                  <div key={a.id} className="flex flex-col items-center rounded-xl bg-black/25 p-2 text-center" title={a.description || ''}>
                    <span className="text-2xl">{a.icon}</span>
                    <span className="mt-1 line-clamp-2 text-[10px] leading-tight text-white/75">{a.title}</span>
                  </div>
                ))}
              </div>
            ) : (
              emptyHint('Ачивки приходят сами — просто пользуйтесь приложением.')
            )}
          </Link>
        );

      default:
        return null;
    }
  };

  return (
    <Shell>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xl font-semibold text-white">Привет! 👋 Хорошего дня</div>
            <div className="text-xs text-white/60 first-letter:uppercase">
              {new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              className={classNames(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition',
                editMode ? 'bg-brand-mint text-brand-deep' : 'border border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
              )}
            >
              {editMode ? <Check className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
              {editMode ? 'Готово' : 'Настроить'}
            </button>
            <CollapseToggle compact collapsed={topStatsCollapsed} onToggle={() => setTopStatsCollapsed((prev) => !prev)} />
          </div>
        </div>

        {!topStatsCollapsed && (
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <TopStat icon={BookOpen} label="Языки" value={`${languages.length}`} sub={`Сегодня ${formatNumber(totalMinutesToday)} мин`} />
            <TopStat icon={Activity} label="Курсы" value={`${activeCourses.length}`} sub={`Прогресс ${courseAverageProgress}%`} />
            <TopStat icon={Target} label="Цели" value={`${goals.length}`} sub={`Прогресс ${goalsAverageProgress}%`} />
            <TopStat icon={Banknote} label="Расходы · 7 дн." value={formatCurrency(spendTotal)} sub="Сумма списаний" />
          </div>
        )}

        {editMode && (
          <div className="rounded-2xl border border-dashed border-brand-mint/40 bg-brand-mint/5 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-white/80">
                Перетаскивайте блоки или двигайте стрелками, выбирайте вид, скрывайте лишнее.
              </div>
              <button type="button" onClick={() => setLayout(DEFAULT_LAYOUT)} className="text-xs text-white/50 hover:text-white">
                Сбросить как было
              </button>
            </div>
            {layout.some((w) => w.hidden) ? (
              <div className="flex flex-wrap gap-2">
                {layout
                  .filter((w) => w.hidden)
                  .map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => setLayout(layout.map((x) => (x.id === w.id ? { ...x, hidden: false } : x)))}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:border-brand-mint/60"
                      title={WIDGETS[w.id].description}
                    >
                      <Plus className="h-3.5 w-3.5" /> {WIDGETS[w.id].emoji} {WIDGETS[w.id].title}
                    </button>
                  ))}
              </div>
            ) : (
              <div className="text-xs text-white/45">Все блоки уже на Дэшборде.</div>
            )}
          </div>
        )}

        <div className="columns-1 gap-3 lg:columns-2 2xl:columns-3 [&>*]:mb-3 [&>*]:break-inside-avoid">
          {layout
            .filter((w) => !w.hidden)
            .map((config, index, visible) => (
              <div
                key={config.id}
                draggable={editMode}
                onDragStart={() => setDragId(config.id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={(event) => {
                  if (!editMode || !dragId || dragId === config.id) return;
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragId && dragId !== config.id) moveWidgetTo(dragId, config.id);
                  setDragId(null);
                }}
                className={classNames(
                  editMode && 'rounded-3xl ring-1 ring-brand-mint/30 ring-offset-2 ring-offset-transparent',
                  dragId === config.id && 'opacity-40'
                )}
              >
                {editMode && (
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5 rounded-2xl bg-black/30 px-2 py-1.5 text-xs">
                    <GripVertical className="h-4 w-4 cursor-grab text-white/40" />
                    <span className="mr-auto font-semibold text-white/80">
                      {WIDGETS[config.id].emoji} {WIDGETS[config.id].title}
                    </span>
                    {WIDGETS[config.id].views.length > 1 &&
                      WIDGETS[config.id].views.map((view) => (
                        <button
                          key={view.id}
                          type="button"
                          onClick={() => setLayout(layout.map((x) => (x.id === config.id ? { ...x, view: view.id } : x)))}
                          className={classNames(
                            'rounded-full px-2 py-0.5',
                            viewOf(config) === view.id ? 'bg-brand-mint text-brand-deep' : 'bg-white/5 text-white/60 hover:bg-white/10'
                          )}
                        >
                          {view.label}
                        </button>
                      ))}
                    <button type="button" disabled={index === 0} onClick={() => moveWidgetBy(config.id, -1)} className="rounded-full p-1 text-white/60 hover:bg-white/10 disabled:opacity-30" title="Выше">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" disabled={index === visible.length - 1} onClick={() => moveWidgetBy(config.id, 1)} className="rounded-full p-1 text-white/60 hover:bg-white/10 disabled:opacity-30" title="Ниже">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setLayout(layout.map((x) => (x.id === config.id ? { ...x, hidden: true } : x)))}
                      className="rounded-full p-1 text-white/60 hover:bg-rose-500/30 hover:text-white"
                      title="Убрать с Дэшборда"
                    >
                      <EyeOff className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {renderWidget(config)}
              </div>
            ))}
        </div>
      </div>

      <ExpenseModal open={expenseOpen} onClose={() => setExpenseOpen(false)} onSaved={loadFinance} />

      <LoanFormModal
        mode="edit"
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        form={form}
        onFormChange={setForm}
        tagOptions={tagOptions}
        selectedTagIds={editingTagIds}
        onTagsChange={setEditingTagIds}
        onSubmit={saveEdit}
      />

      <LoanFormModal
        mode="create"
        open={adding}
        onClose={() => setAdding(false)}
        form={form}
        onFormChange={setForm}
        tagOptions={tagOptions}
        selectedTagIds={formTagIds}
        onTagsChange={setFormTagIds}
        onSubmit={saveAdd}
      />
    </Shell>
  );
}

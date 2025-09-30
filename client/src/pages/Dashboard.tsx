import React, { useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import Shell from '../components/Shell';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import TagBadge from '../components/tags/TagBadge';
import TagSelector from '../components/tags/TagSelector';
import { Modal } from '../components/ui/Modal';
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
  Clock,
  Flame,
  Footprints,
  HeartPulse,
  Moon,
  PieChart as PieChartIcon,
  Plus,
  Target,
  TrendingUp,
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

type FitnessPoint = { date: string; steps: number; hr: number; sleep: number };

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
  mcc?: number | null;
  ts: number;
};

type FitnessMetrics = { steps: number; hr: number; sleepH: number };

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
  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
      <Icon className="h-5 w-5 text-white" />
    </div>
    <div>
      <div className="text-xs uppercase tracking-wide text-white/50">{label}</div>
      <div className="text-lg font-semibold text-white leading-tight">{value}</div>
      {sub && <div className="text-xs text-white/50">{sub}</div>}
    </div>
  </div>
);

const ProgressBar = ({ value, color = 'from-indigo-400 to-sky-400' }: { value: number; color?: string }) => (
  <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
    <div
      className={classNames('h-full rounded-full bg-gradient-to-r', color)}
      style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
    />
  </div>
);

const CircleProgress = ({ value, size = 140, thickness = 16 }: { value: number; size?: number; thickness?: number }) => {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full border border-white/5"
        style={{ background: `conic-gradient(#8b5cf6 ${clamped * 3.6}deg, rgba(255,255,255,0.08) ${clamped * 3.6}deg)` }}
      />
      <div
        className="absolute rounded-full bg-[#0b0b12]"
        style={{ width: size - thickness * 2, height: size - thickness * 2 }}
      />
      <div className="relative text-center text-white">
        <div className="text-3xl font-semibold leading-none">{clamped}%</div>
        <div className="mt-2 text-xs uppercase tracking-wide text-white/50">Средний прогресс</div>
      </div>
    </div>
  );
};

const MiniSparkline = ({ data, color }: { data: { value: number }[]; color: string }) => (
  <ResponsiveContainer width="100%" height={48}>
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
  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-white/50">{label}</div>
        <div className="text-lg font-semibold text-white">
          {value}
          {unit && <span className="ml-1 text-xs font-normal text-white/60">{unit}</span>}
        </div>
      </div>
    </div>
    <div className="mt-3 h-14">
      <MiniSparkline data={data} color={color} />
    </div>
  </div>
);

const categorizeTransaction = (tx: BankTransaction) => {
  if (!tx || !Number.isFinite(Number(tx.amount)) || tx.amount >= 0) return null;
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

  const [languages, setLanguages] = useState<LanguageSummary[]>([]);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [goals, setGoals] = useState<GoalSummary[]>([]);
  const [loans, setLoans] = useState<LoanSummary[]>([]);
  const [monthly, setMonthly] = useState(0);
  const [metrics, setMetrics] = useState<FitnessMetrics>({ steps: 0, hr: 0, sleepH: 0 });
  const [series, setSeries] = useState<FitnessPoint[]>([]);
  const [spend, setSpend] = useState<SpendPoint[]>([]);
  const [categorySpend, setCategorySpend] = useState<CategorySpend[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [currentMonth, setCurrentMonth] = useState(() => new Date());

  const [editing, setEditing] = useState<LoanSummary | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ bank: '', payment_monthly: 0, remaining: 0, due_day: '' });
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  const [formTagIds, setFormTagIds] = useState<number[]>([]);
  const [editingTagIds, setEditingTagIds] = useState<number[]>([]);

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
      const days = [...Array(7)].map((_, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() - (6 - i));
        return d;
      });
      const history: FitnessPoint[] = [];
      for (const d of days) {
        const iso = d.toISOString().slice(0, 10);
        const data = await api.get(`/api/fitness/metrics?day=${iso}`, { silentError: true });
        history.push({
          date: fmtDateKey(d),
          steps: Number(data.steps || 0),
          hr: Number(data.hr || 0),
          sleep: Number(data.sleepH || 0),
        });
      }
      setSeries(history);
      const latest = history[history.length - 1];
      if (latest) {
        setMetrics({ steps: latest.steps, hr: latest.hr, sleepH: latest.sleep });
      }
    } catch {
      setSeries([]);
      setMetrics({ steps: 0, hr: 0, sleepH: 0 });
    }
  };

  const loadFinance = async () => {
    try {
      const response = await api.get('/api/banks/transactions', { silentError: true });
      const items: BankTransaction[] = Array.isArray(response?.items) ? response.items : [];
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
    () => series.map((point) => ({ value: Math.round(point.steps * 0.04) })),
    [series]
  );
  const activitySpark = useMemo(
    () => series.map((point) => ({ value: Math.round(point.steps / 100) })),
    [series]
  );

  const estimatedCalories = Math.round(metrics.steps * 0.04);
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
  return (
    <Shell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-3xl font-semibold text-white">Добро пожаловать!</div>
            <div className="text-sm text-white/60">
              {new Date().toLocaleDateString('ru-RU', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <TopStat
              icon={BookOpen}
              label="Языки"
              value={`${languages.length}`}
              sub={`Средний прогресс: ${languagesAverage}%`}
            />
            <TopStat
              icon={Activity}
              label="Курсы"
              value={`${activeCourses.length}`}
              sub={`Средний прогресс: ${courseAverageProgress}%`}
            />
            <TopStat
              icon={Target}
              label="Цели"
              value={`${goals.length}`}
              sub={`Средний прогресс: ${goalsAverageProgress}%`}
            />
            <TopStat
              icon={Banknote}
              label="Расходы (7 дней)"
              value={formatCurrency(spendTotal)}
              sub="Сумма списаний"
            />
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-12">
          <div className="space-y-6 xl:col-span-8">
            <div className="card">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                    <BookOpen className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-white">Языки</div>
                    <div className="text-xs uppercase tracking-wide text-white/50">
                      {languages.length > 0 ? `${languages.length} активных языков` : 'Нет активных языков'}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-center">
                  <CircleProgress value={languagesAverage} />
                  <div className="mt-3 text-sm text-white/60">
                    {totalMinutesToday > 0
                      ? `Сегодня: ${formatNumber(totalMinutesToday)} мин`
                      : 'Сегодня занятий ещё не было'}
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {languages.slice(0, 6).map((lang) => (
                  <div key={lang.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-white">{lang.name}</div>
                      <div className="text-xs text-white/50">{lang.level || 'уровень ?'}</div>
                    </div>
                    <div className="mt-3">
                      <ProgressBar value={lang.courseProgressPct} color="from-violet-400 to-sky-400" />
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-white/60">
                      <span>Прогресс</span>
                      <span>{lang.courseProgressPct}%</span>
                    </div>
                    {lang.minutesToday > 0 && (
                      <div className="mt-2 text-xs text-white/50">Сегодня: {formatNumber(lang.minutesToday)} мин</div>
                    )}
                  </div>
                ))}
                {languages.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-black/30 p-6 text-sm text-white/60">
                    Добавьте языки, чтобы отслеживать прогресс.
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                    <Activity className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-white">Курсы</div>
                    <div className="text-xs uppercase tracking-wide text-white/50">
                      {activeCourses.length > 0 ? `${activeCourses.length} курса в работе` : 'Нет активных курсов'}
                    </div>
                  </div>
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs text-white/60">
                  Средний прогресс: {courseAverageProgress}%
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {activeCourses.slice(0, 5).map((course) => (
                  <div key={course.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-white">{course.title}</div>
                        {course.provider && <div className="text-xs text-white/50">{course.provider}</div>}
                      </div>
                      <div className="text-xs uppercase tracking-wide text-white/50">
                        {(course.status ?? 'in-progress') === 'done' ? 'Готово' : 'В процессе'}
                      </div>
                    </div>
                    <div className="mt-3">
                      <ProgressBar value={course.progress} color="from-emerald-400 to-lime-300" />
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-white/60">
                      <span>Прогресс</span>
                      <span>{course.progress}%</span>
                    </div>
                  </div>
                ))}
                {activeCourses.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-black/30 p-6 text-sm text-white/60">
                    Пока нет активных курсов — самое время выбрать новый!
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                    <HeartPulse className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-white">Mi Fitness</div>
                    <div className="text-xs uppercase tracking-wide text-white/50">Последние 7 дней</div>
                  </div>
                </div>
                <a
                  href={googleAuthUrl}
                  className="rounded-full border border-white/10 bg-black/50 px-4 py-1 text-xs uppercase tracking-wide text-white/60 hover:bg-white/10"
                >
                  Подключить Google Fit
                </a>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <FitnessStatCard icon={Footprints} label="Шаги" value={formatNumber(metrics.steps)} data={stepsSpark} color="#38bdf8" />
                <FitnessStatCard icon={Moon} label="Сон" value={metrics.sleepH.toFixed(1)} unit="ч" data={sleepSpark} color="#a855f7" />
                <FitnessStatCard icon={Flame} label="Калории" value={formatNumber(estimatedCalories)} data={caloriesSpark} color="#f97316" />
                <FitnessStatCard icon={TrendingUp} label="Активность" value={formatNumber(estimatedActiveMinutes)} unit="мин" data={activitySpark} color="#34d399" />
              </div>

              <div className="mt-6 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="stepsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.6} />
                        <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                    <XAxis dataKey="date" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                    <Area type="monotone" dataKey="steps" stroke="#38bdf8" fill="url(#stepsGradient)" strokeWidth={2} />
                    <Line type="monotone" dataKey="hr" stroke="#facc15" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="sleep" stroke="#a855f7" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                  <PieChartIcon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-white">Расходы</div>
                  <div className="text-xs uppercase tracking-wide text-white/50">Категории и динамика</div>
                </div>
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <div className="flex flex-col items-center justify-center">
                  {categorySpend.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/30 p-6 text-center text-sm text-white/60">
                      Загрузите данные транзакций, чтобы увидеть разбивку по категориям.
                    </div>
                  ) : (
                    <>
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Tooltip
                              formatter={(value: number) => formatCurrency(value)}
                              contentStyle={{
                                backgroundColor: '#0f172a',
                                borderRadius: 12,
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: '#fff',
                              }}
                            />
                            <Pie data={categorySpend} dataKey="amount" nameKey="label" innerRadius={50} outerRadius={90} paddingAngle={4}>
                              {categorySpend.map((entry) => (
                                <Cell key={entry.label} fill={entry.color} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-4 w-full space-y-2 text-sm text-white/70">
                        {categorySpend.map((entry) => (
                          <div key={entry.label} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                              <span>{entry.label}</span>
                            </div>
                            <span className="text-white/60">{formatCurrency(entry.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={spend} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                      <XAxis dataKey="date" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderRadius: 12,
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#fff',
                        }}
                      />
                      <Line type="monotone" dataKey="out" stroke="#f97316" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-6 xl:col-span-4">
            <div className="card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                    <CalendarDays className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-white">Календарь</div>
                    <div className="text-xs uppercase tracking-wide text-white/50">
                      {currentMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={goPrevMonth}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20"
                  >
                    ‹
                  </button>
                  <button
                    onClick={goNextMonth}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20"
                  >
                    ›
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs uppercase tracking-wide text-white/50">
                {dayNames.map((name) => (
                  <div key={name}>{name}</div>
                ))}
              </div>

              <div className="mt-2 grid grid-cols-7 gap-2">
                {weeks.flat().map((date) => {
                  const iso = toISODate(date);
                  const dayEvents = eventsByDate.get(iso) || [];
                  const isCurrentMonth = date.getMonth() === currentMonth.getMonth();
                  const isToday = iso === todayIso;
                  return (
                    <div
                      key={`${iso}-${date.getDate()}`}
                      className={classNames(
                        'aspect-square rounded-2xl border border-white/5 p-2 text-xs text-white/70 transition',
                        isCurrentMonth ? 'bg-white/5' : 'bg-black/20 text-white/30',
                        isToday && 'border-white/70 text-white',
                        dayEvents.length > 0 && 'ring-1 ring-offset-0 ring-purple-400/60'
                      )}
                    >
                      <div className="flex h-full flex-col justify-between">
                        <div className="flex items-center justify-between text-[11px]">
                          <span>{date.getDate()}</span>
                          {dayEvents.length > 0 && <span className="rounded-full bg-purple-400/40 px-1 text-[10px] text-purple-100">{dayEvents.length}</span>}
                        </div>
                        {dayEvents.slice(0, 2).map((event) => (
                          <div key={event.id} className="truncate text-[10px] text-white/60">
                            {event.title}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {upcomingEvents.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="text-xs uppercase tracking-wide text-white/50">Ближайшие события</div>
                  {upcomingEvents.map((event) => (
                    <div key={event.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
                      <div className="text-sm text-white/80">{event.title}</div>
                      <div className="flex items-center gap-2 text-xs text-white/50">
                        <Clock className="h-3.5 w-3.5" />
                        <span>
                          {new Date(event.date).toLocaleDateString('ru-RU', {
                            day: '2-digit',
                            month: 'short',
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                  <Target className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-white">Цели на год</div>
                  <div className="text-xs uppercase tracking-wide text-white/50">
                    {goals.length > 0 ? `${goals.length} активных целей` : 'Целей пока нет'}
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {goals.slice(0, 4).map((goal) => (
                  <div key={goal.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-white">{goal.title}</div>
                      <div className="text-xs text-white/50">Стрик: {goal.streak_current}</div>
                    </div>
                    <div className="mt-3">
                      <ProgressBar value={goal.completion_pct} color="from-purple-400 to-pink-400" />
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-white/60">
                      <span>Прогресс</span>
                      <span>{goal.completion_pct}%</span>
                    </div>
                  </div>
                ))}
                {goals.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-black/30 p-6 text-sm text-white/60">
                    Добавьте цели, чтобы отслеживать годовой прогресс.
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                    <Banknote className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-white">Кредиты</div>
                    <div className="text-xs uppercase tracking-wide text-white/50">Ежемесячные платежи</div>
                  </div>
                </div>
                <button
                  onClick={startAdd}
                  className="flex items-center gap-2 rounded-full bg-emerald-500/80 px-3 py-1.5 text-xs font-semibold text-black hover:bg-emerald-400"
                >
                  <Plus className="h-4 w-4" /> Добавить
                </button>
              </div>

              <div className="mt-4">
                <div className="text-xs uppercase tracking-wide text-white/50">Заплачено в месяц</div>
                <div className="text-2xl font-semibold text-white mt-1">{formatCurrency(monthly)}</div>
                <div className="text-xs text-white/50 mt-1">Остаток долга: {formatCurrency(loanRemainingTotal)}</div>
                <div className="mt-4 h-2 rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-300"
                    style={{ width: `${Math.max(0, Math.min(100, loanOverviewProgress))}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs text-white/60">
                  <span>Прогресс выплат</span>
                  <span>{loanOverviewProgress}%</span>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {loans.map((loan) => {
                  const ratio = loan.payment_monthly + loan.remaining;
                  const loanProgress = ratio > 0 ? Math.round((loan.payment_monthly / ratio) * 100) : 0;
                  return (
                    <div key={loan.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-white">{loan.bank}</div>
                          <div className="text-xs text-white/50">День платежа: {loan.due_day || '—'}</div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-white/60">
                          <button
                            onClick={() => startEdit(loan)}
                            className="rounded-full bg-white/10 px-2 py-1 hover:bg-white/20"
                          >
                            ✎
                          </button>
                          <button
                            onClick={() => removeLoan(loan.id)}
                            className="rounded-full bg-red-500/20 px-2 py-1 text-red-100 hover:bg-red-500/40"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-white/60">
                        <span>Ежемесячно: {formatCurrency(loan.payment_monthly)}</span>
                        <span>Остаток: {formatCurrency(loan.remaining)}</span>
                      </div>
                      <div className="mt-3">
                        <ProgressBar value={loanProgress} color="from-emerald-400 to-lime-300" />
                      </div>
                      <div className="mt-2 text-xs text-white/60">Прогресс выплаты: {loanProgress}%</div>
                      {loan.tags.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1">
                          {loan.tags.map((tag) => (
                            <TagBadge key={tag.id} tag={tag} compact />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {loans.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-black/30 p-6 text-sm text-white/60">
                    Добавьте кредиты, чтобы отслеживать ежемесячные платежи и остаток.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        contentClassName="w-full max-w-sm space-y-3 rounded-2xl border border-white/20 bg-black p-6 shadow-2xl"
      >
        <div className="text-lg font-medium mb-2">Редактировать кредит</div>
        <input
          placeholder="Банк"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2"
          value={form.bank}
          onChange={(e) => setForm({ ...form, bank: e.target.value })}
        />
        <input
          placeholder="Ежемесячный платёж"
          type="number"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2"
          value={form.payment_monthly}
          onChange={(e) => setForm({ ...form, payment_monthly: Number(e.target.value) })}
        />
        <input
          placeholder="Остаток"
          type="number"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2"
          value={form.remaining}
          onChange={(e) => setForm({ ...form, remaining: Number(e.target.value) })}
        />
        <input
          placeholder="День платежа"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2"
          value={form.due_day}
          onChange={(e) => setForm({ ...form, due_day: e.target.value })}
        />
        <TagSelector
          tags={tagOptions}
          selectedIds={editingTagIds}
          onChange={setEditingTagIds}
          label="Теги кредита"
          className="mt-2"
          emptyState="Нет доступных тэгов. Создайте их на странице Страницы."
          onManageTags={() => window.open('/pages', '_blank')}
        />
        <div className="mt-4 flex justify-between">
          <button onClick={() => setEditing(null)} className="rounded-full bg-white/10 px-4 py-2 hover:bg-white/20">
            Отмена
          </button>
          <button onClick={saveEdit} className="rounded-full bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400">
            Сохранить
          </button>
        </div>
      </Modal>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        contentClassName="w-full max-w-sm space-y-3 rounded-2xl border border-white/20 bg-black p-6 shadow-2xl"
      >
        <div className="text-lg font-medium mb-2">Добавить кредит</div>
        <input
          placeholder="Банк"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2"
          value={form.bank}
          onChange={(e) => setForm({ ...form, bank: e.target.value })}
        />
        <input
          placeholder="Ежемесячный платёж"
          type="number"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2"
          value={form.payment_monthly}
          onChange={(e) => setForm({ ...form, payment_monthly: Number(e.target.value) })}
        />
        <input
          placeholder="Остаток"
          type="number"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2"
          value={form.remaining}
          onChange={(e) => setForm({ ...form, remaining: Number(e.target.value) })}
        />
        <input
          placeholder="День платежа"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2"
          value={form.due_day}
          onChange={(e) => setForm({ ...form, due_day: e.target.value })}
        />
        <TagSelector
          tags={tagOptions}
          selectedIds={formTagIds}
          onChange={setFormTagIds}
          label="Теги кредита"
          className="mt-2"
          emptyState="Нет доступных тэгов. Создайте их на странице Страницы."
          onManageTags={() => window.open('/pages', '_blank')}
        />
        <div className="mt-4 flex justify-between">
          <button onClick={() => setAdding(false)} className="rounded-full bg-white/10 px-4 py-2 hover:bg-white/20">
            Отмена
          </button>
          <button onClick={saveAdd} className="rounded-full bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400">
            Добавить
          </button>
        </div>
      </Modal>
    </Shell>
  );
}

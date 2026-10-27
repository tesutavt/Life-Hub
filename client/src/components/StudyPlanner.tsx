import React, { useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import { CalendarCheck, Loader2, Trash2 } from 'lucide-react';
import { api } from '../api';
import { Modal } from './ui/Modal';

type Language = { id: number; name: string };
type PlanDay = { date: string; kind: 'work' | 'off'; time: string; minutes: number; items: { title: string; source: string; kind: 'lesson' | 'material'; minutes: number }[] };
type Preview = {
  sources: { key: string; kind: string; title: string; stage?: number; count: number; excluded: boolean }[];
  days: PlanDay[];
  summary: { tasks: number; scheduled: number; unscheduled: number; required_minutes: number; capacity_minutes: number; fits: boolean; finish_date: string | null; recommended_daily_minutes: number };
};

type Form = {
  language_id: number | '';
  deadline: string;
  work_weekdays: number[];
  rest_weekdays: number[];
  workday_minutes: number;
  dayoff_minutes: number;
  work_time: string;
  off_time: string;
  lesson_minutes: number;
  material_minutes: number;
  excluded_sources: string[];
};

const WEEKDAYS: [number, string][] = [[1, 'Пн'], [2, 'Вт'], [3, 'Ср'], [4, 'Чт'], [5, 'Пт'], [6, 'Сб'], [0, 'Вс']];
const STORAGE_KEY = 'lifehub:study-planner';
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const inMonths = (months: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return iso(d);
};
const plural = (n: number, forms: [string, string, string]) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
};
const fmtMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60 ? `${m % 60} мин` : ''}`.trim() : `${m} мин`);

const DEFAULT_FORM: Form = {
  language_id: '',
  deadline: inMonths(3),
  work_weekdays: [1, 2, 3, 4, 5],
  rest_weekdays: [],
  workday_minutes: 20,
  dayoff_minutes: 60,
  work_time: '20:00',
  off_time: '11:00',
  lesson_minutes: 10,
  material_minutes: 30,
  excluded_sources: [],
};

const loadForm = (): Form => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return saved ? { ...DEFAULT_FORM, ...saved, excluded_sources: [] } : DEFAULT_FORM;
  } catch {
    return DEFAULT_FORM;
  }
};

/** «Умный план обучения»: раскладывает уроки и материалы языка по календарю до заданного срока. */
export default function StudyPlanner({ open, onClose, onApplied }: { open: boolean; onClose: () => void; onApplied: () => void }) {
  const setOpen = (value: boolean) => {
    if (!value) onClose();
  };
  const [languages, setLanguages] = useState<Language[]>([]);
  const [form, setForm] = useState<Form>(loadForm);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  const set = (patch: Partial<Form>) => setForm((prev) => ({ ...prev, ...patch }));

  useEffect(() => {
    if (!open) return;
    api.get('/api/life/languages', { silentError: true }).then((res) => {
      const list: Language[] = (res?.items || []).map((l: any) => ({ id: l.id, name: l.name }));
      setLanguages(list);
      if (!form.language_id && list[0]) set({ language_id: list[0].id });
    });
  }, [open]);

  useEffect(() => {
    try {
      const { excluded_sources: _skip, ...rest } = form;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
    } catch {
      // хранилище недоступно — не страшно
    }
    if (!open || !form.language_id || !form.deadline) return;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        setPreview(await api.post('/api/life/study-plan/preview', form, { silentSuccess: true, silentError: true }));
      } catch (e: any) {
        setError(e.message);
        setPreview(null);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [form, open]);

  const apply = async () => {
    setApplying(true);
    try {
      const res = await api.post('/api/life/study-plan/apply', form, { notifySuccess: 'План добавлен в календарь 📚' });
      if (res?.created !== undefined) {
        setOpen(false);
        onApplied();
      }
    } finally {
      setApplying(false);
    }
  };

  const removePlan = async () => {
    if (!form.language_id || !window.confirm('Удалить будущие занятия этого плана из календаря?')) return;
    await api.del(`/api/life/study-plan/${form.language_id}`, { notifySuccess: 'План удалён' });
    onApplied();
  };

  const toggleDay = (key: 'work_weekdays' | 'rest_weekdays', day: number) =>
    set({ [key]: form[key].includes(day) ? form[key].filter((d) => d !== day) : [...form[key], day] } as Partial<Form>);

  const summary = preview?.summary;
  const input = 'w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-brand-mint/60';
  const languageName = useMemo(() => languages.find((l) => l.id === form.language_id)?.name || '', [languages, form.language_id]);

  return (
    <>

      <Modal open={open} onClose={() => setOpen(false)} showCloseButton contentClassName="w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-3xl border border-white/10 bg-brand-night p-5 shadow-2xl">
        <div className="mb-4 pr-10">
          <div className="text-lg font-semibold text-white">Умный план обучения</div>
          <div className="text-sm text-white/55">
            Расскажите, когда вы работаете и сколько времени готовы уделять, — уроки и материалы сами встанут в календарь к нужному сроку.
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Язык">
                <select className={input} value={form.language_id} onChange={(e) => set({ language_id: e.target.value ? Number(e.target.value) : '', excluded_sources: [] })}>
                  {languages.length === 0 && <option value="">Сначала добавьте язык</option>}
                  {languages.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Пройти до">
                <input type="date" className={input} value={form.deadline} min={iso(new Date())} onChange={(e) => set({ deadline: e.target.value })} />
              </Field>
            </div>
            <div className="-mt-2 flex flex-wrap gap-1">
              {[1, 2, 3, 6, 12].map((m) => (
                <button key={m} type="button" onClick={() => set({ deadline: inMonths(m) })} className="rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] text-white/60 hover:bg-white/10">
                  {m === 12 ? 'год' : `${m} мес.`}
                </button>
              ))}
            </div>

            <Field label="Рабочие дни (смены из календаря важнее)">
              <DayChips value={form.work_weekdays} onToggle={(d) => toggleDay('work_weekdays', d)} activeClass="bg-amber-400/80 text-brand-deep" />
            </Field>
            <Field label="Без учёбы в эти дни">
              <DayChips value={form.rest_weekdays} onToggle={(d) => toggleDay('rest_weekdays', d)} activeClass="bg-rose-400/80 text-brand-deep" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2 rounded-2xl bg-amber-400/5 p-3">
                <div className="text-xs font-semibold text-amber-200">💼 В рабочий день</div>
                <MinutesInput value={form.workday_minutes} onChange={(v) => set({ workday_minutes: v })} />
                <input type="time" className={input} value={form.work_time} onChange={(e) => set({ work_time: e.target.value })} />
              </div>
              <div className="space-y-2 rounded-2xl bg-emerald-400/5 p-3">
                <div className="text-xs font-semibold text-emerald-200">🌴 В выходной</div>
                <MinutesInput value={form.dayoff_minutes} onChange={(v) => set({ dayoff_minutes: v })} />
                <input type="time" className={input} value={form.off_time} onChange={(e) => set({ off_time: e.target.value })} />
              </div>
            </div>

            <details className="rounded-2xl bg-black/20 p-3 text-sm text-white/70">
              <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wide text-white/50">Длительность занятий</summary>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Один урок, мин">
                  <input type="number" min={3} className={input} value={form.lesson_minutes} onChange={(e) => set({ lesson_minutes: Number(e.target.value) })} />
                </Field>
                <Field label="Один материал, мин">
                  <input type="number" min={5} className={input} value={form.material_minutes} onChange={(e) => set({ material_minutes: Number(e.target.value) })} />
                </Field>
              </div>
            </details>

            {preview && preview.sources.length > 0 && (
              <Field label="Что включить в план">
                <div className="space-y-1">
                  {new Set(preview.sources.map((s) => s.stage || 1)).size > 1 && (
                    <div className="text-[11px] text-white/45">Курсы идут по этапам программы языка; курсы одного этапа чередуются.</div>
                  )}
                  {preview.sources.map((source) => (
                    <label key={source.key} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm text-white/80">
                      <input
                        type="checkbox"
                        checked={!form.excluded_sources.includes(source.key)}
                        onChange={(e) =>
                          set({ excluded_sources: e.target.checked ? form.excluded_sources.filter((k) => k !== source.key) : [...form.excluded_sources, source.key] })
                        }
                      />
                      <span>{source.kind === 'lesson' ? '🦉' : '📄'}</span>
                      <span className="flex-1 truncate">{source.title}</span>
                      {(source.stage || 1) > 1 && <span className="rounded-full bg-white/10 px-1.5 text-[10px] text-white/60">этап {source.stage}</span>}
                      <span className="text-xs text-white/45">
                        {source.count} {source.kind === 'lesson' ? 'ур.' : 'мат.'}
                      </span>
                    </label>
                  ))}
                </div>
              </Field>
            )}
          </div>

          <div className="flex min-h-[320px] flex-col rounded-2xl border border-white/10 bg-black/20 p-4">
            {error ? (
              <div className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>
            ) : !preview ? (
              <div className="flex flex-1 items-center justify-center text-sm text-white/50">
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Заполните параметры слева'}
              </div>
            ) : preview.sources.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-white/60">
                <div className="text-4xl">🎉</div>
                Для языка «{languageName}» нечего планировать: нет непройденных уроков и материалов. Импортируйте курс-тренировку или добавьте материалы к курсу.
              </div>
            ) : (
              <>
                <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                  <Stat label="Нужно" value={fmtMinutes(summary!.required_minutes)} />
                  <Stat label="Есть времени" value={fmtMinutes(summary!.capacity_minutes)} />
                  <Stat label="Финиш" value={summary!.finish_date ? new Date(`${summary!.finish_date}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '—'} />
                </div>
                <div className={classNames('mb-3 rounded-xl px-3 py-2 text-sm', summary!.fits ? 'bg-emerald-400/10 text-emerald-100' : 'bg-amber-400/10 text-amber-100')}>
                  {summary!.fits
                    ? `Успеваете! ${summary!.tasks} ${plural(summary!.tasks, ['занятие', 'занятия', 'занятий'])} равномерно до срока — в среднем около ${fmtMinutes(Math.max(1, summary!.recommended_daily_minutes))} в день.`
                    : `Не хватает времени: ${summary!.unscheduled} ${plural(summary!.unscheduled, ['занятие не влезает', 'занятия не влезают', 'занятий не влезают'])} до срока. Увеличьте время в день или сдвиньте срок.`}
                </div>
                <div className="flex-1 space-y-1.5 overflow-y-auto pr-1" style={{ maxHeight: 340 }}>
                  {preview.days.map((day) => (
                    <div key={day.date} className="flex gap-3 rounded-xl bg-white/[0.04] px-3 py-2">
                      <div className="w-16 shrink-0 text-center">
                        <div className="text-xs font-semibold text-white first-letter:uppercase">
                          {new Date(`${day.date}T00:00:00`).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' })}
                        </div>
                        <div className="text-[10px] text-white/45">
                          {day.kind === 'work' ? '💼' : '🌴'} {day.time}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        {day.items.map((item, i) => (
                          <div key={i} className="truncate text-xs text-white/80">
                            {item.kind === 'lesson' ? '🦉' : '📄'} {item.title} <span className="text-white/35">· {item.source}</span>
                          </div>
                        ))}
                      </div>
                      <div className="shrink-0 text-[11px] text-white/50">{day.minutes} мин</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={removePlan} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs text-white/50 hover:bg-rose-500/15 hover:text-white">
            <Trash2 size={14} /> Удалить текущий план
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-full px-4 py-2 text-sm text-white/70 hover:bg-white/10">
              Отмена
            </button>
            <button
              type="button"
              disabled={!preview || !preview.days.length || applying}
              onClick={apply}
              className="inline-flex items-center gap-2 rounded-full bg-brand-mint px-5 py-2 text-sm font-semibold text-brand-deep hover:brightness-110 disabled:opacity-40"
            >
              {applying ? <Loader2 size={14} className="animate-spin" /> : <CalendarCheck size={16} />} Расставить в календаре
            </button>
          </div>
        </div>
        <div className="mt-2 text-right text-[11px] text-white/35">Повторное применение заменяет будущие занятия прошлого плана по этому языку.</div>
      </Modal>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-white/50">{label}</div>
      {children}
    </div>
  );
}

function DayChips({ value, onToggle, activeClass }: { value: number[]; onToggle: (day: number) => void; activeClass: string }) {
  return (
    <div className="flex gap-1">
      {WEEKDAYS.map(([day, label]) => (
        <button
          key={day}
          type="button"
          onClick={() => onToggle(day)}
          className={classNames('h-9 flex-1 rounded-xl text-xs font-semibold transition', value.includes(day) ? activeClass : 'bg-white/5 text-white/55 hover:bg-white/10')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function MinutesInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <input type="range" min={0} max={240} step={5} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#27e9b5]" />
      <div className="text-center text-sm font-semibold text-white">{value === 0 ? 'не заниматься' : fmtMinutes(value)}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 px-2 py-2">
      <div className="text-[10px] uppercase tracking-wide text-white/45">{label}</div>
      <div className="text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

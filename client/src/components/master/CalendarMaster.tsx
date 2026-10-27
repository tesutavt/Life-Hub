import React, { useMemo, useState } from "react";
import Master from "./Master";
import { api } from "../../api";
import TagSelector from "../tags/TagSelector";

type CalendarTag = { id: number; label: string; color: string };

type CalendarMasterProps = {
  tagOptions: CalendarTag[];
  currentMonth: Date;
  onCompleted?: () => Promise<void> | void;
  /** Открыть «Умный план обучения» (окно живёт на странице календаря). */
  onOpenPlanner?: () => void;
};

type WizardStep = 0 | 1 | 2;

type Mode = "event" | "shifts" | "plan";

type EventForm = {
  date: string;
  title: string;
  type: string;
  mood: number;
};

type ShiftForm = {
  pattern: string;
  startDate: string;
};

const INITIAL_EVENT_FORM: EventForm = {
  date: "",
  title: "",
  type: "note",
  mood: 3,
};

const INITIAL_SHIFT_FORM: ShiftForm = {
  pattern: "2/2",
  startDate: "",
};

const toISODate = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function CalendarWizard({
  close,
  tagOptions,
  currentMonth,
  onCompleted,
  onOpenPlanner,
}: CalendarMasterProps & { close: () => void }) {
  const [step, setStep] = useState<WizardStep>(0);
  const [mode, setMode] = useState<Mode | null>(null);
  const [eventForm, setEventForm] = useState<EventForm>({ ...INITIAL_EVENT_FORM });
  const [eventTagIds, setEventTagIds] = useState<number[]>([]);
  const [shiftForm, setShiftForm] = useState<ShiftForm>({ ...INITIAL_SHIFT_FORM });
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("Готово!");

  const defaultShiftStart = useMemo(
    () => toISODate(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)),
    [currentMonth],
  );

  const canContinue = mode !== null;

  const goToForm = () => {
    if (!mode) return;
    if (mode === "plan") {
      close();
      setMode(null);
      onOpenPlanner?.();
      return;
    }
    setStep(1);
    if (mode === "shifts" && !shiftForm.startDate) {
      setShiftForm((prev) => ({ ...prev, startDate: defaultShiftStart }));
    }
  };

  const goBack = () => {
    if (loading) return;
    setStep(0);
  };

  const closeWithDelay = () => {
    setTimeout(() => {
      close();
      setStep(0);
      setMode(null);
      setEventForm({ ...INITIAL_EVENT_FORM });
      setEventTagIds([]);
      setShiftForm({ ...INITIAL_SHIFT_FORM });
    }, 900);
  };

  const finish = (message: string) => {
    setSuccessMessage(message);
    setStep(2);
    closeWithDelay();
  };

  const submitEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!eventForm.date.trim() || !eventForm.title.trim()) return;
    setLoading(true);
    try {
      await api.post("/api/life/calendar", { ...eventForm, tags: eventTagIds });
      await api.post("/api/life/xp/add", { amount: 20, note: "calendar add" });
      await onCompleted?.();
      finish("Событие создано!");
    } finally {
      setLoading(false);
    }
  };

  const submitShifts = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!shiftForm.pattern.trim()) return;
    const startDate = shiftForm.startDate.trim() || defaultShiftStart;
    setLoading(true);
    try {
      await api.post("/api/life/calendar/auto-shifts", {
        startDate,
        pattern: shiftForm.pattern.trim(),
        days: 120,
      });
      await onCompleted?.();
      finish("Смены сгенерированы!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/60">
        <span>{step === 0 ? "ШАГ 1" : step === 1 ? "ШАГ 2" : "ГОТОВО"}</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>
      <div className="relative overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${step * 100}%)` }}
        >
          <div className="w-full shrink-0">
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-semibold">Что сделаем?</h3>
                <p className="text-sm text-white/70">Выберите действие, которое хотите выполнить.</p>
              </div>
              <div className="space-y-3">
                <label
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-4 transition ${
                    mode === "event"
                      ? "border-white/40 bg-white/10"
                      : "border-white/10 bg-white/5 hover:border-white/20"
                  }`}
                >
                  <div>
                    <div className="text-base font-medium">Создать событие</div>
                    <p className="text-sm text-white/60">
                      Настройте заметку, смену или любое напоминание в календаре.
                    </p>
                  </div>
                  <input
                    type="radio"
                    name="calendar-mode"
                    checked={mode === "event"}
                    onChange={() => setMode("event")}
                    className="h-5 w-5"
                  />
                </label>
                <label
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-4 transition ${
                    mode === "shifts"
                      ? "border-white/40 bg-white/10"
                      : "border-white/10 bg-white/5 hover:border-white/20"
                  }`}
                >
                  <div>
                    <div className="text-base font-medium">Сгенерировать смены</div>
                    <p className="text-sm text-white/60">
                      Автоматически добавим рабочие смены и выходные по выбранному паттерну.
                    </p>
                  </div>
                  <input
                    type="radio"
                    name="calendar-mode"
                    checked={mode === "shifts"}
                    onChange={() => setMode("shifts")}
                    className="h-5 w-5"
                  />
                </label>
                {onOpenPlanner && (
                  <label
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-4 transition ${
                      mode === "plan" ? "border-white/40 bg-white/10" : "border-white/10 bg-white/5 hover:border-white/20"
                    }`}
                  >
                    <div>
                      <div className="text-base font-medium">🧠 Умный план обучения</div>
                      <p className="text-sm text-white/60">
                        Укажите рабочие дни, свободное время и срок — уроки и материалы языка сами встанут в календарь.
                      </p>
                    </div>
                    <input type="radio" name="calendar-mode" checked={mode === "plan"} onChange={() => setMode("plan")} className="h-5 w-5" />
                  </label>
                )}
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={goToForm}
                  disabled={!canContinue}
                  className={`rounded-lg px-4 py-2 font-semibold transition ${
                    canContinue
                      ? "bg-white text-black hover:bg-white/90"
                      : "cursor-not-allowed bg-white/20 text-white/40"
                  }`}
                >
                  Далее
                </button>
              </div>
            </div>
          </div>

          <div className="w-full shrink-0">
            {mode === "event" ? (
              <form onSubmit={submitEvent} className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-xl font-semibold">Новое событие</h3>
                  <p className="text-sm text-white/70">Заполните детали и добавьте теги при необходимости.</p>
                </div>
                <input
                  type="date"
                  value={eventForm.date}
                  onChange={(event) => setEventForm({ ...eventForm, date: event.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2"
                  required
                />
                <input
                  placeholder="Название"
                  value={eventForm.title}
                  onChange={(event) => setEventForm({ ...eventForm, title: event.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2"
                  required
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-wide text-white/60">Тип</label>
                    <select
                      value={eventForm.type}
                      onChange={(event) => setEventForm({ ...eventForm, type: event.target.value })}
                      className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2"
                    >
                      <option value="note">Заметка</option>
                      <option value="work">Рабочая смена</option>
                      <option value="off">Выходной</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-wide text-white/60">Настроение (1-5)</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={eventForm.mood}
                      onChange={(event) =>
                        setEventForm({ ...eventForm, mood: Math.min(5, Math.max(1, Number(event.target.value) || 3)) })
                      }
                      className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2"
                    />
                  </div>
                </div>
                <TagSelector
                  tags={tagOptions}
                  selectedIds={eventTagIds}
                  onChange={setEventTagIds}
                  label="Теги события"
                  emptyState="Нет доступных тэгов. Создайте их на странице Страницы."
                  onManageTags={() => window.open("/pages", "_blank")}
                />
                <div className="flex justify-between gap-2">
                  <button
                    type="button"
                    onClick={goBack}
                    className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/80 transition hover:border-white/30"
                  >
                    Назад
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition disabled:opacity-60"
                  >
                    {loading ? "Сохранение…" : "Готово"}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={submitShifts} className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-xl font-semibold">Генерация смен</h3>
                  <p className="text-sm text-white/70">
                    Укажите паттерн и стартовую дату. Мы создадим расписание на ближайшие месяцы.
                  </p>
                </div>
                <input
                  placeholder="Паттерн (например 2/2)"
                  value={shiftForm.pattern}
                  onChange={(event) => setShiftForm({ ...shiftForm, pattern: event.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2"
                  required
                />
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-wide text-white/60">Стартовая дата</label>
                  <input
                    type="date"
                    value={shiftForm.startDate || defaultShiftStart}
                    onChange={(event) => setShiftForm({ ...shiftForm, startDate: event.target.value })}
                    className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2"
                  />
                </div>
                <p className="text-xs text-white/60">
                  Смены будут чередоваться по указанному шаблону в течение 120 дней.
                </p>
                <div className="flex justify-between gap-2">
                  <button
                    type="button"
                    onClick={goBack}
                    className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/80 transition hover:border-white/30"
                  >
                    Назад
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition disabled:opacity-60"
                  >
                    {loading ? "Создание…" : "Готово"}
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="w-full shrink-0">
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <div className="text-3xl font-semibold text-white drop-shadow animate-pulse">{successMessage}</div>
              <p className="text-sm text-white/70">Мастер автоматически закроется через мгновение.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CalendarMaster(props: CalendarMasterProps) {
  return (
    <Master
      buttonLabel="Мастер календаря"
      title="Мастер календаря"
      description="События, рабочие смены и умный план обучения — в несколько шагов."
      triggerClassName="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black shadow hover:bg-white/90 transition"
    >
      {({ close }) => <CalendarWizard close={close} {...props} />}
    </Master>
  );
}

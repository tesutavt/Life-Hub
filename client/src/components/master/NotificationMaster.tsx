import React, { useEffect, useMemo, useState } from 'react';
import Master from './Master';
import { NotificationCategory, NotificationPreferences } from '../../types/ui';

const STEP_INTRO = 'intro';
const STEP_DONE = 'done';

type NotificationMasterProps = {
  preferences: NotificationPreferences;
  onApply: (preferences: NotificationPreferences) => Promise<void> | void;
};

type CategoryOption = {
  id: NotificationCategory;
  label: string;
  description: string;
};

const CATEGORY_OPTIONS: CategoryOption[] = [
  {
    id: 'system',
    label: 'Системные уведомления',
    description: 'Изменения профиля, настройки безопасности и технические сообщения.',
  },
  {
    id: 'progress',
    label: 'Прогресс и опыт',
    description: 'Увеличение уровня, рост опыта, достигнутые цели.',
  },
  {
    id: 'event',
    label: 'События',
    description: 'Начало важных событий, дедлайны и связанные напоминания.',
  },
  {
    id: 'reminder',
    label: 'Напоминания',
    description: 'Плановые напоминания по задачам и привычкам.',
  },
];

export default function NotificationMaster({ preferences, onApply }: NotificationMasterProps) {
  return (
    <Master
      buttonLabel="Мастер оповещений"
      title="Отфильтруйте оповещения"
      description="Выберите, какие уведомления считать важными, и настройте формат их доставки."
      triggerClassName="px-4 py-2 rounded-2xl bg-white/15 text-sm font-medium transition hover:bg-white/25"
    >
      {({ close }) => (
        <NotificationMasterContent initialPreferences={preferences} onApply={onApply} close={close} />
      )}
    </Master>
  );
}

type ContentProps = {
  initialPreferences: NotificationPreferences;
  onApply: (preferences: NotificationPreferences) => Promise<void> | void;
  close: () => void;
};

function NotificationMasterContent({ initialPreferences, onApply, close }: ContentProps) {
  const [step, setStep] = useState<'intro' | 'done'>(STEP_INTRO);
  const [disabled, setDisabled] = useState<Set<NotificationCategory>>(new Set(initialPreferences.disabledTypes));
  const [muteSound, setMuteSound] = useState<boolean>(initialPreferences.muteSound);
  const [textEnabled, setTextEnabled] = useState<boolean>(initialPreferences.textEnabled);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (step !== STEP_INTRO) return;
    setDisabled(new Set(initialPreferences.disabledTypes));
    setMuteSound(initialPreferences.muteSound);
    setTextEnabled(initialPreferences.textEnabled);
  }, [initialPreferences, step]);

  useEffect(() => {
    if (step !== STEP_DONE) return;
    const timer = window.setTimeout(() => close(), 1400);
    return () => window.clearTimeout(timer);
  }, [step, close]);

  const summary = useMemo(() => {
    const disabledLabels = CATEGORY_OPTIONS.filter(option => disabled.has(option.id)).map(option => option.label.toLowerCase());
    const parts: string[] = [];
    if (disabledLabels.length > 0) {
      parts.push(`Будут отключены: ${disabledLabels.join(', ')}.`);
    } else {
      parts.push('Все категории уведомлений останутся включёнными.');
    }
    parts.push(muteSound ? 'Звук уведомлений выключен.' : 'Звук уведомлений включён.');
    parts.push(textEnabled ? 'Текстовые уведомления останутся.' : 'Текстовые уведомления будут скрыты.');
    return parts.join(' ');
  }, [disabled, muteSound, textEnabled]);

  const toggleCategory = (category: NotificationCategory) => {
    setDisabled(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload: NotificationPreferences = {
        disabledTypes: Array.from(disabled),
        muteSound,
        textEnabled,
      };
      await onApply(payload);
      setStep(STEP_DONE);
    } finally {
      setSaving(false);
    }
  };

  if (step === STEP_DONE) {
    return (
      <div className="space-y-3">
        <div className="text-lg font-semibold text-brand-mint">Готово!</div>
        <p className="text-sm text-slate-200/80">Предпочтения уведомлений сохранены. Мастер закроется автоматически.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-3">
        {CATEGORY_OPTIONS.map(option => (
          <label
            key={option.id}
            className="flex flex-col gap-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition hover:border-brand-mint/60 hover:bg-white/10"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100/90">{option.label}</div>
                <p className="text-xs text-white/60">{option.description}</p>
              </div>
              <input
                type="checkbox"
                checked={disabled.has(option.id)}
                onChange={() => toggleCategory(option.id)}
                className="h-4 w-4 accent-brand-mint"
                aria-label={`Отключить категорию ${option.label}`}
              />
            </div>
            <span className="text-[11px] uppercase tracking-wide text-white/40">
              {disabled.has(option.id) ? 'Категория будет отключена' : 'Категория включена'}
            </span>
          </label>
        ))}
      </div>

      <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
        <label className="flex items-center justify-between gap-3">
          <span>Выключить звук уведомлений</span>
          <input
            type="checkbox"
            checked={muteSound}
            onChange={event => setMuteSound(event.target.checked)}
            className="h-4 w-4 accent-brand-mint"
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span>Оставить текстовые уведомления</span>
          <input
            type="checkbox"
            checked={textEnabled}
            onChange={event => setTextEnabled(event.target.checked)}
            className="h-4 w-4 accent-brand-mint"
          />
        </label>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/70">{summary}</div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-2xl bg-brand-mint text-brand-deep text-sm font-semibold shadow-brand-glow transition disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saving ? 'Сохраняем…' : 'Сохранить настройки'}
        </button>
        <button
          type="button"
          onClick={() => close()}
          className="px-3 py-2 text-xs uppercase tracking-wide text-white/60 transition hover:text-white"
        >
          Отменить
        </button>
      </div>
    </form>
  );
}

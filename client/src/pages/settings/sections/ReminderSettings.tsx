import React, { useEffect, useState } from 'react';
import classNames from 'classnames';
import { BellRing, Monitor } from 'lucide-react';
import { api } from '../../../api';
import { desktop, DesktopSettings, localDate, ReminderStatus } from '../../../desktop';

type ReminderSettingsData = {
  enabled: boolean;
  categories: Record<'learning' | 'habits' | 'calendar' | 'missions' | 'goals', boolean>;
  learning_hour: number;
  habits_hour: number;
  quiet_start: number;
  quiet_end: number;
};

const CATEGORIES: { id: keyof ReminderSettingsData['categories']; emoji: string; title: string; text: string }[] = [
  { id: 'learning', emoji: '🦉', title: 'Учёба и языки', text: 'урок не пройден, серия в опасности' },
  { id: 'habits', emoji: '✅', title: 'Привычки', text: 'вечером — что не отмечено' },
  { id: 'calendar', emoji: '📅', title: 'Календарь', text: 'утром — сегодня, вечером — завтра' },
  { id: 'missions', emoji: '🎁', title: 'Задания дня', text: 'награды ждут, сколько осталось до цели' },
  { id: 'goals', emoji: '🎯', title: 'Цели на год', text: 'нет отметки за сегодня' },
];

const hours = Array.from({ length: 24 }, (_, h) => h);

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={classNames('relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40', checked ? 'bg-brand-mint/80' : 'bg-white/15')}
    >
      <span className={classNames('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

function HourSelect({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm text-white outline-none">
      {hours.map((h) => (
        <option key={h} value={h}>
          {String(h).padStart(2, '0')}:00
        </option>
      ))}
    </select>
  );
}

/** Напоминания (общие для Android и десктопа) + настройки десктоп-приложения. */
export default function ReminderSettings() {
  const [data, setData] = useState<ReminderSettingsData | null>(null);
  const [desktopSettings, setDesktopSettings] = useState<DesktopSettings | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [status, setStatus] = useState<ReminderStatus | null>(null);
  const bridge = desktop();

  useEffect(() => {
    bridge?.reminderStatus?.().then(setStatus).catch(() => {});
  }, []);

  useEffect(() => {
    api.get('/api/reminders/settings', { silentError: true }).then(setData).catch(() => {});
    bridge?.getDesktopSettings?.().then(setDesktopSettings);
  }, []);

  const save = async (patch: Partial<ReminderSettingsData>) => {
    if (!data) return;
    const optimistic = { ...data, ...patch, categories: { ...data.categories, ...(patch.categories || {}) } };
    setData(optimistic);
    const saved = await api.put('/api/reminders/settings', patch, { silentSuccess: true });
    if (saved) setData(saved);
  };

  const saveDesktop = async (patch: Partial<DesktopSettings>) => {
    if (!bridge?.setDesktopSettings) return;
    setDesktopSettings(await bridge.setDesktopSettings(patch));
  };

  const test = async () => {
    const now = new Date();
    const res = await api.get(`/api/reminders/pending?date=${localDate(now)}&hour=${now.getHours()}&force=1`);
    const items = Array.isArray(res?.items) ? res.items : [];
    if (!items.length) {
      setTestResult('Сейчас напоминать не о чем — всё сделано 🎉');
      return;
    }
    setTestResult(items.map((i: any) => `${i.title} — ${i.body}`).join('\n'));
    // На компьютере проверку делает главный процесс — так же, как в фоне
    if (bridge?.checkReminders) setStatus(await bridge.checkReminders());
  };

  if (!data) return null;

  return (
    <div className="card space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold">
            <BellRing size={18} className="text-amber-300" /> Напоминания
          </div>
          <p className="text-xs opacity-70">Как в Duolingo: сова Хаби напомнит про уроки, привычки и планы. Действует на телефоне и компьютере.</p>
        </div>
        <Toggle checked={data.enabled} onChange={(enabled) => save({ enabled })} />
      </div>

      <div className={classNames('space-y-2', !data.enabled && 'pointer-events-none opacity-40')}>
        {CATEGORIES.map((category) => (
          <div key={category.id} className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-2">
            <span className="text-xl">{category.emoji}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-white">{category.title}</div>
              <div className="text-xs text-white/50">{category.text}</div>
            </div>
            {category.id === 'learning' && <HourSelect value={data.learning_hour} onChange={(learning_hour) => save({ learning_hour })} />}
            {category.id === 'habits' && <HourSelect value={data.habits_hour} onChange={(habits_hour) => save({ habits_hour })} />}
            <Toggle checked={data.categories[category.id]} onChange={(value) => save({ categories: { ...data.categories, [category.id]: value } })} />
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/5 px-3 py-2 text-sm text-white/80">
          🌙 Не беспокоить с <HourSelect value={data.quiet_start} onChange={(quiet_start) => save({ quiet_start })} /> до{' '}
          <HourSelect value={data.quiet_end} onChange={(quiet_end) => save({ quiet_end })} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={test} className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10">
          🔔 Проверить, о чём напомнить сейчас
        </button>
      </div>
      {testResult && <pre className="whitespace-pre-wrap rounded-xl bg-black/25 p-3 text-xs text-white/75">{testResult}</pre>}

      {bridge && desktopSettings && (
        <div className="space-y-2 border-t border-white/10 pt-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Monitor size={16} className="text-sky-300" /> Это компьютер
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/5 px-3 py-2 text-xs text-white/70">
            <span className="min-w-0 flex-1">
              {!status?.lastCheck
                ? 'Фоновая проверка ещё не выполнялась (первая — через минуту после запуска, потом каждые 10 минут).'
                : status.ok
                ? `Последняя проверка: ${new Date(status.lastCheck).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} — всё в порядке${status.shown ? `, показано: ${status.shown}` : ''}.`
                : `Последняя проверка: ${new Date(status.lastCheck).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} — ошибка: ${status.error}.`}
            </span>
            <button type="button" onClick={() => bridge.testNotification?.()} className="rounded-full border border-white/15 px-3 py-1 text-white/80 hover:bg-white/10">
              Тестовое уведомление
            </button>
          </div>
          <div className="text-[11px] text-white/40">
            Не видите тестовое уведомление? Проверьте «Параметры Windows → Система → Уведомления»: включены ли уведомления для Life Hub и не включён ли режим «Не беспокоить».
          </div>
          {[
            { key: 'notifications' as const, title: 'Уведомления Windows', text: 'напоминания и новые ачивки в углу экрана' },
            { key: 'closeToTray' as const, title: 'Сворачивать в трей при закрытии', text: 'приложение остаётся у часов и продолжает напоминать' },
            { key: 'autostart' as const, title: 'Запускать вместе с Windows', text: 'стартует свёрнутым в трей' },
          ].map((row) => (
            <div key={row.key} className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-white">{row.title}</div>
                <div className="text-xs text-white/50">{row.text}</div>
              </div>
              <Toggle checked={desktopSettings[row.key]} onChange={(value) => saveDesktop({ [row.key]: value })} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

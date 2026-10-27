import React, { useEffect, useState } from 'react';
import classNames from 'classnames';
import { api } from '../api';
import { desktop, DesktopSettings } from '../desktop';

export type DesktopChoice = Pick<DesktopSettings, 'autostart' | 'closeToTray' | 'notifications'>;

export const DEFAULT_DESKTOP_CHOICE: DesktopChoice = { autostart: true, closeToTray: true, notifications: true };

const OPTIONS: { key: keyof DesktopChoice; emoji: string; title: string; text: string }[] = [
  { key: 'autostart', emoji: '🚀', title: 'Запускать вместе с Windows', text: 'Life Hub тихо стартует в трее — напоминания придут, даже если вы его не открывали' },
  { key: 'closeToTray', emoji: '📥', title: 'Сворачивать в трей при закрытии', text: 'крестик прячет окно к часам, выйти можно из меню значка' },
  { key: 'notifications', emoji: '🔔', title: 'Уведомления Windows', text: 'сова Хаби напомнит про уроки, привычки и планы, покажет новые ачивки' },
];

/** Переключатели десктоп-настроек — шаг мастера приветствия и отдельное окно. */
export function DesktopSetupFields({ value, onChange }: { value: DesktopChoice; onChange: (value: DesktopChoice) => void }) {
  return (
    <div className="space-y-2">
      {OPTIONS.map((option) => {
        const active = value[option.key];
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange({ ...value, [option.key]: !active })}
            className={classNames(
              'flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition',
              active ? 'border-brand-mint bg-brand-mint/10' : 'border-white/10 bg-white/[0.03] hover:border-white/25'
            )}
          >
            <span className="text-2xl">{option.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-white">{option.title}</span>
              <span className="block text-xs text-white/55">{option.text}</span>
            </span>
            <span className={classNames('relative h-6 w-11 shrink-0 rounded-full transition', active ? 'bg-emerald-400/80' : 'bg-white/15')}>
              <span className={classNames('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all', active ? 'left-[22px]' : 'left-0.5')} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

export async function applyDesktopChoice(choice: DesktopChoice) {
  await desktop()?.setDesktopSettings?.({ ...choice, setupDone: true });
}

/**
 * Один раз на компьютере: если мастер приветствия не показывается (аккаунт уже был),
 * спрашиваем про автозапуск, трей и уведомления отдельным окном.
 */
export default function DesktopSetupPrompt() {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<DesktopChoice>(DEFAULT_DESKTOP_CHOICE);

  useEffect(() => {
    const bridge = desktop();
    if (!bridge?.getDesktopSettings) return;
    (async () => {
      const settings = await bridge.getDesktopSettings!();
      if (settings.setupDone) return;
      // Новому аккаунту этот вопрос задаст мастер приветствия
      const onboarding = await api.get('/api/onboarding', { silentError: true }).catch(() => null);
      if (onboarding?.show) return;
      setOpen(true);
    })();
  }, []);

  if (!open) return null;

  const finish = async (save: boolean) => {
    if (save) await applyDesktopChoice(choice);
    else await desktop()?.setDesktopSettings?.({ setupDone: true });
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-brand-deep/85 p-4 backdrop-blur-md">
      <div className="w-full max-w-lg animate-[auth-in_500ms_cubic-bezier(0.22,1,0.36,1)] rounded-3xl border border-white/10 bg-brand-night p-6 shadow-2xl">
        <div className="text-4xl">🖥️</div>
        <h2 className="mt-2 text-xl font-bold text-white">Настроим Life Hub на этом компьютере</h2>
        <p className="mb-4 mt-1 text-sm text-white/60">Всё можно поменять позже: Настройки → Напоминания или правый клик по значку в трее.</p>
        <DesktopSetupFields value={choice} onChange={setChoice} />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => finish(false)} className="rounded-full px-4 py-2 text-sm text-white/60 hover:bg-white/10">
            Не сейчас
          </button>
          <button type="button" onClick={() => finish(true)} className="rounded-full bg-brand-mint px-5 py-2 text-sm font-bold text-brand-deep hover:brightness-110">
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

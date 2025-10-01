import React, { useEffect, useMemo, useState } from 'react';
import Master from './Master';
import type { MenuItem } from '../../app/App';

const STEP_INTRO = 'intro';
const STEP_DONE = 'done';

type MenuMasterProps = {
  hiddenItems: string[];
  onApply: (hidden: string[]) => Promise<void> | void;
  menuItems: MenuItem[];
};

export default function MenuMaster({ hiddenItems, onApply, menuItems }: MenuMasterProps) {
  return (
    <Master
      buttonLabel="Мастер меню"
      title="Настройка бокового меню"
      description="Выберите пункты, которые хотите скрыть в левом меню. Все изменения можно вернуть в любой момент."
      triggerClassName="px-4 py-2 rounded-2xl bg-white/15 text-sm font-medium transition hover:bg-white/25"
    >
      {({ close }) => (
        <MenuMasterContent initialHidden={hiddenItems} onApply={onApply} menuItems={menuItems} close={close} />
      )}
    </Master>
  );
}

type MenuMasterContentProps = {
  initialHidden: string[];
  onApply: (hidden: string[]) => Promise<void> | void;
  menuItems: MenuItem[];
  close: () => void;
};

function MenuMasterContent({ initialHidden, onApply, menuItems, close }: MenuMasterContentProps) {
  const [step, setStep] = useState<'intro' | 'done'>(STEP_INTRO);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialHidden));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (step !== STEP_INTRO) return;
    setSelected(new Set(initialHidden));
  }, [initialHidden, step]);

  useEffect(() => {
    if (step !== STEP_DONE) return;
    const timer = window.setTimeout(() => close(), 1400);
    return () => window.clearTimeout(timer);
  }, [step, close]);

  const hiddenPreview = useMemo(() => {
    if (selected.size === 0) return 'Все пункты меню будут отображаться.';
    const labels = menuItems
      .filter(item => selected.has(item.to))
      .map(item => item.label);
    if (labels.length === 0) return 'Все пункты меню будут отображаться.';
    return `Будут скрыты: ${labels.join(', ')}.`;
  }, [menuItems, selected]);

  const toggleItem = (value: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onApply(Array.from(selected));
      setStep(STEP_DONE);
    } finally {
      setSaving(false);
    }
  };

  if (step === STEP_DONE) {
    return (
      <div className="space-y-3">
        <div className="text-lg font-semibold text-brand-mint">Готово!</div>
        <p className="text-sm text-slate-200/80">
          Настройки меню сохранены. Мастер закроется автоматически.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        {menuItems.map(item => {
          const id = `menu-master-${item.to}`;
          return (
            <label
              key={item.to}
              htmlFor={id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm transition hover:border-brand-mint/60 hover:bg-white/10"
            >
              <span className="font-medium text-slate-100/90">{item.label}</span>
              <input
                id={id}
                type="checkbox"
                checked={selected.has(item.to)}
                onChange={() => toggleItem(item.to)}
                className="h-4 w-4 accent-brand-mint"
              />
            </label>
          );
        })}
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/70">
        {hiddenPreview}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-2xl bg-brand-mint text-brand-deep text-sm font-semibold shadow-brand-glow transition disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saving ? 'Сохраняем…' : 'Сохранить выбор'}
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

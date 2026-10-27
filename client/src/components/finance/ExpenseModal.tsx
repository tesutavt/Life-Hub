import React, { useEffect, useState } from 'react';
import classNames from 'classnames';
import { api } from '../../api';
import { Modal } from '../ui/Modal';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, isoDay } from '../../finance';

/** Ручное добавление расхода или дохода (без выписки). */
export default function ExpenseModal({
  open,
  onClose,
  onSaved,
  initialKind = 'expense',
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  initialKind?: 'expense' | 'income';
}) {
  const [kind, setKind] = useState<'expense' | 'income'>(initialKind);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => isoDay(new Date()));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
    setAmount('');
    setCategory('');
    setDescription('');
    setDate(isoDay(new Date()));
  }, [open, initialKind]);

  const amountValue = Number(amount.replace(',', '.'));
  const valid = Number.isFinite(amountValue) && amountValue > 0;
  const categories = kind === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      await api.post(
        '/api/banks/transactions',
        // «🛒 Продукты» → «Продукты»: эмодзи только для кнопок
        { amount: amountValue, kind, category: category.replace(/^\S+\s/, '') || null, description, date },
        { notifySuccess: kind === 'expense' ? 'Расход записан' : 'Доход записан' }
      );
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const input = 'w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-brand-mint/60';

  return (
    <Modal open={open} onClose={onClose} showCloseButton contentClassName="w-full max-w-md rounded-3xl border border-white/10 bg-brand-night p-5 shadow-2xl">
      <form onSubmit={submit} className="space-y-3">
        <div className="pr-8 text-lg font-semibold text-white">{kind === 'expense' ? 'Новый расход' : 'Новый доход'}</div>
        <div className="grid grid-cols-2 gap-1 rounded-full bg-black/30 p-1">
          {(['expense', 'income'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                setCategory('');
              }}
              className={classNames(
                'rounded-full py-1.5 text-sm font-medium transition',
                kind === k ? (k === 'expense' ? 'bg-rose-400 text-brand-deep' : 'bg-emerald-400 text-brand-deep') : 'text-white/60'
              )}
            >
              {k === 'expense' ? 'Расход' : 'Доход'}
            </button>
          ))}
        </div>
        <div className="relative">
          <input
            autoFocus
            inputMode="decimal"
            className={classNames(input, 'pr-8 text-2xl font-bold')}
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-lg text-white/40">₽</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(category === c ? '' : c)}
              className={classNames('rounded-full px-2.5 py-1 text-xs transition', category === c ? 'bg-brand-mint text-brand-deep' : 'bg-white/5 text-white/70 hover:bg-white/10')}
            >
              {c}
            </button>
          ))}
        </div>
        <input className={input} placeholder="Комментарий (необязательно)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
        <button type="submit" disabled={!valid || saving} className="w-full rounded-xl bg-brand-mint py-2.5 text-sm font-bold text-brand-deep transition hover:brightness-110 disabled:opacity-40">
          {saving ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </form>
    </Modal>
  );
}

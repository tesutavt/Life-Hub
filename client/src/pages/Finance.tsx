import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { useSearchParams } from 'react-router-dom';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { ChevronLeft, ChevronRight, FileUp, Plus, Search, Trash2 } from 'lucide-react';
import Shell from '../components/Shell';
import { api } from '../api';
import { Modal } from '../components/ui/Modal';
import ExpenseModal from '../components/finance/ExpenseModal';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, Transaction, categoryColor, categoryOf, formatMoney, isoDay } from '../finance';

type Account = { id: number; bank: string; number_mask?: string | null; transactions: number; first_ts?: number | null; last_ts?: number | null };
type Loan = { id: number; bank: string; payment_monthly: number; remaining: number; due_day: string };
type ImportResult = { imported: number; duplicates: number; skipped: number };

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const stripEmoji = (label: string) => label.replace(/^\S+\s/, '');
const ALL_CATEGORIES = Array.from(new Set([...EXPENSE_CATEGORIES.map(stripEmoji), 'Магазины', 'Прочее', ...INCOME_CATEGORIES.map(stripEmoji), 'Доход']));
const dayLabel = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' });
const shortDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

const card = 'rounded-3xl border border-white/10 bg-white/[0.03] p-4';
const input = 'w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-brand-mint/60';

export default function Finance() {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [items, setItems] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [expenseKind, setExpenseKind] = useState<'expense' | 'income' | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [loanOpen, setLoanOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('import') !== '1') return;
    setImportOpen(true);
    params.delete('import');
    setParams(params, { replace: true });
  }, [params, setParams]);

  const monthEnd = useMemo(() => new Date(month.getFullYear(), month.getMonth() + 1, 0), [month]);

  const load = useCallback(async () => {
    const [tx, acc, ln] = await Promise.all([
      api.get(`/api/banks/transactions?from=${isoDay(month)}&to=${isoDay(monthEnd)}&limit=5000`),
      api.get('/api/banks/accounts', { silentError: true }).catch(() => ({ items: [] })),
      api.get('/api/loans/summary', { silentError: true }).catch(() => ({ items: [] })),
    ]);
    setItems(Array.isArray(tx?.items) ? tx.items : []);
    setAccounts(Array.isArray(acc?.items) ? acc.items : []);
    setLoans(Array.isArray(ln?.items) ? ln.items : []);
    setLoading(false);
  }, [month, monthEnd]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  const stats = useMemo(() => {
    let expense = 0;
    let income = 0;
    const byCategory = new Map<string, number>();
    const byDay = new Map<number, number>();
    for (const tx of items) {
      const amount = Number(tx.amount);
      if (amount < 0) {
        expense += -amount;
        const cat = categoryOf(tx);
        byCategory.set(cat, (byCategory.get(cat) || 0) - amount);
        const day = new Date(tx.ts).getDate();
        byDay.set(day, (byDay.get(day) || 0) - amount);
      } else {
        income += amount;
      }
    }
    const today = new Date();
    const isCurrent = today.getFullYear() === month.getFullYear() && today.getMonth() === month.getMonth();
    const daysPassed = isCurrent ? today.getDate() : monthEnd.getDate();
    const categories = Array.from(byCategory.entries())
      .map(([label, value]) => ({ label, value, color: categoryColor(label) }))
      .sort((a, b) => b.value - a.value);
    const days = Array.from({ length: monthEnd.getDate() }, (_, i) => ({ day: i + 1, value: Math.round(byDay.get(i + 1) || 0) }));
    return { expense, income, balance: income - expense, perDay: daysPassed ? expense / daysPassed : 0, categories, days };
  }, [items, month, monthEnd]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((tx) => {
      if (categoryFilter && categoryOf(tx) !== categoryFilter) return false;
      if (q && !`${tx.description || ''} ${tx.category || ''} ${tx.account_bank || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, query, categoryFilter]);

  const groups = useMemo(() => {
    const map = new Map<string, { date: Date; items: Transaction[]; total: number }>();
    for (const tx of filtered) {
      const date = new Date(tx.ts);
      const key = isoDay(date);
      if (!map.has(key)) map.set(key, { date, items: [], total: 0 });
      const group = map.get(key)!;
      group.items.push(tx);
      group.total += Number(tx.amount);
    }
    return Array.from(map.values());
  }, [filtered]);

  const shiftMonth = (delta: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  const changeCategory = async (tx: Transaction, category: string) => {
    setEditingId(null);
    await api.patch(`/api/banks/transactions/${tx.id}`, { category: category || null });
    setItems((list) => list.map((item) => (item.id === tx.id ? { ...item, category: category || null } : item)));
  };

  const removeTx = async (tx: Transaction) => {
    if (!window.confirm('Удалить эту операцию?')) return;
    await api.del(`/api/banks/transactions/${tx.id}`);
    setItems((list) => list.filter((item) => item.id !== tx.id));
  };

  const removeAccount = async (account: Account) => {
    if (!window.confirm(`Удалить выписку «${account.bank}» и все её операции (${account.transactions})?`)) return;
    await api.del(`/api/banks/accounts/${account.id}`, { notifySuccess: 'Выписка удалена' });
    await load();
  };

  const removeLoan = async (loan: Loan) => {
    if (!window.confirm(`Удалить кредит «${loan.bank}»?`)) return;
    await api.del(`/api/loans/${loan.id}`);
    await load();
  };

  const loansMonthly = loans.reduce((sum, loan) => sum + Number(loan.payment_monthly || 0), 0);
  const loansRemaining = loans.reduce((sum, loan) => sum + Number(loan.remaining || 0), 0);

  return (
    <Shell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold text-white">Финансы</div>
          <div className="text-sm text-white/60">Расходы, доходы, выписки и кредиты.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setExpenseKind('expense')} className="inline-flex items-center gap-1.5 rounded-xl bg-rose-400 px-3 py-2 text-sm font-semibold text-brand-deep hover:brightness-110">
            <Plus size={16} /> Расход
          </button>
          <button type="button" onClick={() => setExpenseKind('income')} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-400 px-3 py-2 text-sm font-semibold text-brand-deep hover:brightness-110">
            <Plus size={16} /> Доход
          </button>
          <button type="button" onClick={() => setImportOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10">
            <FileUp size={16} /> Загрузить выписку
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" onClick={() => shiftMonth(-1)} className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Предыдущий месяц">
          <ChevronLeft size={18} />
        </button>
        <div className="min-w-[150px] text-center font-semibold text-white">
          {MONTHS[month.getMonth()]} {month.getFullYear()}
        </div>
        <button type="button" onClick={() => shiftMonth(1)} className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Следующий месяц">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Расходы" value={formatMoney(stats.expense)} tone="text-rose-300" />
        <Stat label="Доходы" value={formatMoney(stats.income)} tone="text-emerald-300" />
        <Stat label="Баланс месяца" value={`${stats.balance > 0 ? '+' : ''}${formatMoney(stats.balance)}`} tone={stats.balance >= 0 ? 'text-emerald-300' : 'text-rose-300'} />
        <Stat label="В среднем за день" value={formatMoney(stats.perDay)} tone="text-white" />
      </div>

      {loading ? (
        <div className="text-sm text-white/60">Загружаем…</div>
      ) : items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/15 p-8 text-center">
          <div className="text-5xl">💸</div>
          <div className="mt-2 font-semibold text-white">За этот месяц операций нет</div>
          <div className="mx-auto mt-1 max-w-md text-sm text-white/60">
            Загрузите выписку из банка (CSV) — расходы разложатся по категориям сами. Или добавьте расход вручную.
          </div>
          <button type="button" onClick={() => setImportOpen(true)} className="mt-4 rounded-xl bg-brand-mint px-4 py-2 text-sm font-bold text-brand-deep">
            Загрузить выписку
          </button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <div className={card}>
              <div className="mb-2 text-sm font-semibold text-white">Расходы по дням</div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.days}>
                    <XAxis dataKey="day" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} interval={2} />
                    <Tooltip
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      contentStyle={{ background: '#0b1224', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}
                      labelFormatter={(day) => `${day} ${MONTHS[month.getMonth()]!.toLowerCase()}`}
                      formatter={(value: number) => [formatMoney(value), 'Расходы']}
                    />
                    <Bar dataKey="value" fill="#fb7185" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={card}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold text-white">Операции</div>
                <div className="relative ml-auto w-full sm:w-64">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input className={classNames(input, 'pl-8')} placeholder="Найти операцию" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
              </div>
              {categoryFilter && (
                <button type="button" onClick={() => setCategoryFilter(null)} className="mb-3 rounded-full bg-white/10 px-3 py-1 text-xs text-white">
                  {categoryFilter} ✕
                </button>
              )}
              {groups.length === 0 ? (
                <div className="py-6 text-center text-sm text-white/50">Ничего не нашлось</div>
              ) : (
                <div className="space-y-4">
                  {groups.map((group) => (
                    <div key={isoDay(group.date)}>
                      <div className="mb-1 flex justify-between text-xs text-white/45">
                        <span>{dayLabel.format(group.date)}</span>
                        <span>{group.total > 0 ? '+' : ''}{formatMoney(group.total)}</span>
                      </div>
                      <div className="divide-y divide-white/5 rounded-2xl bg-black/20">
                        {group.items.map((tx) => {
                          const cat = categoryOf(tx);
                          const amount = Number(tx.amount);
                          return (
                            <div key={tx.id} className="group flex items-center gap-3 px-3 py-2">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: amount > 0 ? '#34d399' : categoryColor(cat) }} />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm text-white">{tx.description || cat}</div>
                                {editingId === tx.id ? (
                                  <select
                                    autoFocus
                                    className="mt-0.5 rounded-lg border border-white/10 bg-brand-night px-1 py-0.5 text-xs text-white"
                                    value={tx.category || ''}
                                    onChange={(e) => changeCategory(tx, e.target.value)}
                                    onBlur={() => setEditingId(null)}
                                  >
                                    <option value="">Автоматически ({categoryOf({ ...tx, category: null })})</option>
                                    {ALL_CATEGORIES.map((c) => (
                                      <option key={c} value={c}>
                                        {c}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <button type="button" onClick={() => setEditingId(tx.id)} className="text-xs text-white/45 hover:text-brand-mint" title="Сменить категорию">
                                    {cat}
                                    {tx.account_bank ? ` · ${tx.account_bank}` : ''}
                                  </button>
                                )}
                              </div>
                              <div className={classNames('shrink-0 text-sm font-semibold', amount > 0 ? 'text-emerald-300' : 'text-white')}>
                                {amount > 0 ? '+' : ''}
                                {formatMoney(amount)}
                              </div>
                              <button
                                type="button"
                                onClick={() => removeTx(tx)}
                                className="shrink-0 rounded-lg p-1 text-white/30 opacity-0 transition hover:bg-white/10 hover:text-rose-300 group-hover:opacity-100"
                                aria-label="Удалить операцию"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className={card}>
              <div className="mb-3 text-sm font-semibold text-white">Куда ушли деньги</div>
              {stats.categories.length === 0 ? (
                <div className="text-sm text-white/50">Расходов нет</div>
              ) : (
                <div className="space-y-2">
                  {stats.categories.map((cat) => {
                    const share = stats.expense ? (cat.value / stats.expense) * 100 : 0;
                    return (
                      <button
                        key={cat.label}
                        type="button"
                        onClick={() => setCategoryFilter(categoryFilter === cat.label ? null : cat.label)}
                        className={classNames('block w-full rounded-xl px-2 py-1.5 text-left transition hover:bg-white/5', categoryFilter === cat.label && 'bg-white/10')}
                      >
                        <div className="flex justify-between text-sm">
                          <span className="text-white/85">{cat.label}</span>
                          <span className="text-white">{formatMoney(cat.value)}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
                          <div className="h-full rounded-full" style={{ width: `${Math.max(2, share)}%`, background: cat.color }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-white">Загруженные выписки</div>
            <button type="button" onClick={() => setImportOpen(true)} className="text-xs text-brand-mint hover:underline">
              + Загрузить
            </button>
          </div>
          {accounts.length === 0 ? (
            <div className="text-sm text-white/50">Пока ни одной. Выгрузите выписку в CSV из приложения банка.</div>
          ) : (
            <div className="space-y-2">
              {accounts.map((account) => (
                <div key={account.id} className="flex items-center gap-3 rounded-xl bg-black/20 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-white">{account.bank}</div>
                    <div className="text-xs text-white/45">
                      {account.transactions} операций
                      {account.first_ts && account.last_ts ? ` · ${shortDate.format(new Date(account.first_ts))} — ${shortDate.format(new Date(account.last_ts))}` : ''}
                    </div>
                  </div>
                  <button type="button" onClick={() => removeAccount(account)} className="rounded-lg p-1 text-white/30 hover:bg-white/10 hover:text-rose-300" aria-label="Удалить выписку">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={card}>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-white">Кредиты</div>
            <button type="button" onClick={() => setLoanOpen(true)} className="text-xs text-brand-mint hover:underline">
              + Добавить
            </button>
          </div>
          {loans.length === 0 ? (
            <div className="text-sm text-white/50">Кредитов нет — и это прекрасно.</div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-white/50">
                В месяц: <span className="text-white">{formatMoney(loansMonthly)}</span> · Осталось всего: <span className="text-white">{formatMoney(loansRemaining)}</span>
              </div>
              {loans.map((loan) => (
                <div key={loan.id} className="flex items-center gap-3 rounded-xl bg-black/20 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-white">{loan.bank || 'Кредит'}</div>
                    <div className="text-xs text-white/45">
                      {formatMoney(loan.payment_monthly)} в месяц · платёж {loan.due_day}-го · осталось {formatMoney(loan.remaining)}
                    </div>
                  </div>
                  <button type="button" onClick={() => removeLoan(loan)} className="rounded-lg p-1 text-white/30 hover:bg-white/10 hover:text-rose-300" aria-label="Удалить кредит">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ExpenseModal open={expenseKind !== null} initialKind={expenseKind || 'expense'} onClose={() => setExpenseKind(null)} onSaved={load} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={load} />
      <LoanModal open={loanOpen} onClose={() => setLoanOpen(false)} onSaved={load} />
    </Shell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={card}>
      <div className="text-xs text-white/50">{label}</div>
      <div className={classNames('mt-1 text-xl font-bold', tone)}>{value}</div>
    </div>
  );
}

function ImportModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => Promise<void> | void }) {
  const [file, setFile] = useState<File | null>(null);
  const [bank, setBank] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setBank('');
    setResult(null);
    setError('');
  }, [open]);

  const pick = (picked: File | undefined | null) => {
    if (!picked) return;
    setFile(picked);
    setResult(null);
    setError('');
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      if (bank.trim()) form.append('bank', bank.trim());
      const data = await api.post('/api/banks/import/csv', form, { silentError: true });
      setResult(data);
      await onImported();
    } catch (e: any) {
      setError(e?.message || 'Не удалось разобрать файл');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} showCloseButton contentClassName="w-full max-w-lg rounded-3xl border border-white/10 bg-brand-night p-5 shadow-2xl">
      <div className="space-y-4">
        <div className="pr-8">
          <div className="text-lg font-semibold text-white">Загрузить выписку</div>
          <div className="text-sm text-white/60">CSV из приложения банка: Т-Банк, Сбер, Альфа и другие. Колонки определятся сами, повторы пропустятся.</div>
        </div>

        {result ? (
          <div className="space-y-3 text-center">
            <div className="text-5xl">✅</div>
            <div className="text-lg font-semibold text-white">Загружено операций: {result.imported}</div>
            <div className="text-sm text-white/60">
              {result.duplicates > 0 && <>Уже были загружены раньше: {result.duplicates}. </>}
              {result.skipped > 0 && <>Пропущено строк (отклонённые или без суммы): {result.skipped}.</>}
            </div>
            <button type="button" onClick={onClose} className="w-full rounded-xl bg-brand-mint py-2.5 text-sm font-bold text-brand-deep">
              Готово
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pick(e.dataTransfer.files?.[0]);
              }}
              className={classNames(
                'flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition',
                dragging ? 'border-brand-mint bg-brand-mint/10' : 'border-white/15 hover:border-white/30'
              )}
            >
              <FileUp size={28} className="text-white/50" />
              <span className="text-sm text-white">{file ? file.name : 'Перетащите файл сюда или нажмите, чтобы выбрать'}</span>
              <span className="text-xs text-white/40">.csv, до 15 МБ</span>
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            <input className={input} placeholder="Название (например, «Т-Банк, карта»). Необязательно" value={bank} onChange={(e) => setBank(e.target.value)} />
            {error && <div className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}
            <details className="text-xs text-white/50">
              <summary className="cursor-pointer hover:text-white">Где взять выписку?</summary>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>Т-Банк: в веб-версии «Операции» → «Выгрузить» → CSV.</li>
                <li>Сбер: СберБанк Онлайн (веб) → карта → «Выписка» → формат CSV/Excel → сохраните как CSV.</li>
                <li>Другие банки: любой CSV, где есть колонки с датой и суммой (или «Приход»/«Расход»).</li>
              </ul>
            </details>
            <button type="button" disabled={!file || busy} onClick={submit} className="w-full rounded-xl bg-brand-mint py-2.5 text-sm font-bold text-brand-deep disabled:opacity-40">
              {busy ? 'Разбираем выписку…' : 'Загрузить'}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

function LoanModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const [bank, setBank] = useState('');
  const [payment, setPayment] = useState('');
  const [remaining, setRemaining] = useState('');
  const [dueDay, setDueDay] = useState('1');

  useEffect(() => {
    if (!open) return;
    setBank('');
    setPayment('');
    setRemaining('');
    setDueDay('1');
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await api.post(
      '/api/loans',
      { bank: bank.trim(), payment_monthly: Number(payment.replace(',', '.')) || 0, remaining: Number(remaining.replace(',', '.')) || 0, due_day: dueDay },
      { notifySuccess: 'Кредит добавлен' }
    );
    await onSaved();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} showCloseButton contentClassName="w-full max-w-md rounded-3xl border border-white/10 bg-brand-night p-5 shadow-2xl">
      <form onSubmit={submit} className="space-y-3">
        <div className="pr-8 text-lg font-semibold text-white">Новый кредит</div>
        <input autoFocus required className={input} placeholder="Банк или название" value={bank} onChange={(e) => setBank(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <input inputMode="decimal" className={input} placeholder="Платёж в месяц, ₽" value={payment} onChange={(e) => setPayment(e.target.value)} />
          <input inputMode="decimal" className={input} placeholder="Осталось, ₽" value={remaining} onChange={(e) => setRemaining(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-white/70">
          День платежа
          <input type="number" min={1} max={31} className={classNames(input, 'w-20')} value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
        </label>
        <button type="submit" className="w-full rounded-xl bg-brand-mint py-2.5 text-sm font-bold text-brand-deep">
          Сохранить
        </button>
      </form>
    </Modal>
  );
}

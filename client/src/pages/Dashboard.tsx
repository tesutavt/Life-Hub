import React, { useEffect, useMemo, useState } from 'react';
import Shell from '../components/Shell';
import { api } from '../api';
import { HeartPulse, Footprints, Banknote, Plus } from 'lucide-react';
import TagBadge from '../components/tags/TagBadge';
import TagSelector from '../components/tags/TagSelector';
import { Modal } from '../components/ui/Modal';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, BarChart, Bar, CartesianGrid
} from 'recharts';
import { useAuth } from '../AuthContext';

const Stat = ({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) => (
  <div className="flex flex-col items-start gap-1 p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur">
    <span className="text-xs opacity-70">{label}</span>
    <span className="text-2xl font-semibold leading-none">{value}</span>
    {sub && <span className="text-xs opacity-70">{sub}</span>}
  </div>
);

function fmt(d: Date) {
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

type TagOption = { id: number; label: string; color: string };

export default function Dashboard() {
  const { token } = useAuth();
  const [loans, setLoans] = useState<any[]>([]);
  const [monthly, setMonthly] = useState(0);
  const [metrics, setMetrics] = useState<{ steps: number; hr: number; sleepH: number }>({ steps: 0, hr: 0, sleepH: 0 });
  const [series, setSeries] = useState<{ date: string, steps: number, hr: number, sleep: number }[]>([]);
  const [spend, setSpend] = useState<{ date: string, out: number }[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [adding, setAdding] = useState(false);

  const [form, setForm] = useState({ bank: '', payment_monthly: 0, remaining: 0, due_day: '' });
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  const [formTagIds, setFormTagIds] = useState<number[]>([]);
  const [editingTagIds, setEditingTagIds] = useState<number[]>([]);

  async function loadLoans() {
    const l = await api.get('/api/loans/summary');
    const normalized = (l.items || []).map((item: any) => ({
      ...item,
      tags: Array.isArray(item?.tags)
        ? item.tags.map((tag: any) => ({ id: tag.id, label: tag.label, color: tag.color }))
        : [],
    }));
    setLoans(normalized);
    setMonthly(l.monthlyTotal || 0);
  }

  async function loadTagOptions() {
    const res = await api.get('/api/life/pages/tags', { silentError: true });
    const options = (res.items || []).map((tag: any) => ({
      id: tag.id,
      label: tag.label,
      color: tag.color,
    }));
    setTagOptions(options);
  }

  useEffect(() => {
    (async () => {
      try { await loadLoans(); } catch { }
      try { await loadTagOptions(); } catch { }

      // fitness
      try {
        const today = new Date();
        const days = [...Array(7)].map((_, i) => { const d = new Date(today); d.setDate(d.getDate() - i); return d; }).reverse();
        const arr: any[] = [];
        for (const d of days) {
          const iso = d.toISOString().slice(0, 10);
          const m = await api.get('/api/fitness/metrics?day=' + iso);
          arr.push({ date: fmt(d), steps: m.steps || 0, hr: m.hr || 0, sleep: m.sleepH || 0 });
        }
        setSeries(arr);
        setMetrics({ steps: arr.at(-1)?.steps || 0, hr: arr.at(-1)?.hr || 0, sleepH: arr.at(-1)?.sleep || 0 });
      } catch { }

      // spend
      try {
        const t = await api.get('/api/banks/transactions');
        const map = new Map<string, number>();
        for (const x of t.items || []) {
          const d = new Date(x.ts); const key = fmt(d);
          if (!map.has(key)) map.set(key, 0);
          if (x.amount < 0) map.set(key, (map.get(key) || 0) + Math.abs(x.amount));
        }
        const today = new Date();
        const days = [...Array(7)].map((_, i) => { const d = new Date(today); d.setDate(d.getDate() - i); return d; }).reverse();
        setSpend(days.map(d => ({ date: fmt(d), out: +(map.get(fmt(d)) || 0).toFixed(2) })));
      } catch { }
    })();
  }, []);

  const totalMonthly = useMemo(() => monthly, [monthly]);

  const removeLoan = async (id: number) => {
    if (!window.confirm('Удалить этот кредит?')) return;
    await api.del(`/api/loans/${id}`);
    await loadLoans();
  };

  const startEdit = (loan: any) => {
    setEditing(loan);
    setForm({
      bank: loan.bank || '',
      payment_monthly: loan.payment_monthly || 0,
      remaining: loan.remaining || 0,
      due_day: loan.due_day || ''
    });
    setEditingTagIds((loan.tags || []).map((tag: any) => tag.id));
  };

  const saveEdit = async () => {
    await api.put(`/api/loans/${editing.id}`, { ...form, tags: editingTagIds });
    setEditing(null);
    setEditingTagIds([]);
    await loadLoans();
  };

  const startAdd = () => {
    setForm({ bank: '', payment_monthly: 0, remaining: 0, due_day: '' });
    setFormTagIds([]);
    setAdding(true);
  };

  const saveAdd = async () => {
    await api.post('/api/loans', { ...form, tags: formTagIds });
    setAdding(false);
    setFormTagIds([]);
    await loadLoans();
  };

  const googleAuthUrl = `/api/fitness/google/auth?token=${encodeURIComponent(token || '')}`;

  return (
    <Shell>
      <div className="flex items-center justify-between">
        <div className="text-3xl font-semibold leading-tight">
          Сегодня<br /><span className="opacity-80 text-xl">контроль финансов и здоровья</span>
        </div>
        <button
          onClick={startAdd}
          className="flex items-center gap-1 px-3 py-2 rounded bg-green-600 hover:bg-green-700 text-white text-sm"
        >
          <Plus className="w-4 h-4" /> Добавить кредит
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        {/* --- Кредиты --- */}
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <Banknote className="w-4 h-4" />
            <span className="font-medium">Платежи по кредитам</span>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {loans.map((l: any) => (
              <div key={l.id} className="p-3 rounded-2xl bg-white/5 border border-white/10">
                <div className="flex items-center justify-between text-sm opacity-80">
                  <span>{l.bank}</span>
                  <span className="badge">день: {l.due_day || '?'}</span>
                </div>
                <div className="text-2xl font-semibold mt-1">{(l.payment_monthly || 0).toLocaleString('ru-RU')} ₽</div>
                <div className="text-xs opacity-70 mt-1">осталось: {(l.remaining || 0).toLocaleString('ru-RU')} ₽</div>
                {Array.isArray(l.tags) && l.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                    {l.tags.map((tag: any) => (
                      <TagBadge key={tag.id} tag={tag} compact />
                    ))}
                  </div>
                )}
                <div className="flex gap-2 mt-2 text-xs">
                  <button onClick={() => startEdit(l)} className="px-2 py-1 rounded bg-white/10 hover:bg-white/20">✎</button>
                  <button onClick={() => removeLoan(l.id)} className="px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/40">Удалить</button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-sm opacity-80">
            Итого в месяц: <b className="opacity-100">{totalMonthly.toLocaleString('ru-RU')} ₽</b>
          </div>
        </div>

        {/* --- Mi Fitness --- */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HeartPulse className="w-4 h-4" /><span className="font-medium">Mi Fitness</span>
            </div>
            <a href={googleAuthUrl} className="text-xs px-3 py-1 rounded-full bg-black/80 border border-white/20">
              Подключить
            </a>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3">
            <Stat label="Пульс" value={<div className="flex items-baseline gap-1">{metrics.hr}<span className="text-sm opacity-80">уд/м</span></div>} sub="в покое" />
            <Stat label="Шаги" value={<div className="flex items-baseline gap-1">{metrics.steps.toLocaleString('ru-RU')}<Footprints className="w-4 h-4" /></div>} sub="сегодня" />
            <Stat label="Сон" value={<div className="flex items-baseline gap-1">{metrics.sleepH}<span className="text-sm">ч</span></div>} sub="последняя ночь" />
          </div>
          <div className="mt-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="steps" stroke="#ffffff" dot={false} />
                <Line type="monotone" dataKey="hr" stroke="#a0a0ff" dot={false} />
                <Line type="monotone" dataKey="sleep" stroke="#a0ffc0" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* --- Расходы --- */}
      <div className="card mt-6">
        <div className="font-medium mb-2">Расходы (7 дней)</div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={spend}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="out" fill="#ffb3b3" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* --- Модальные окна --- */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        contentClassName="w-full max-w-sm space-y-3 rounded-2xl border border-white/20 bg-black p-6 shadow-2xl"
      >
        <div className="text-lg font-medium mb-2">Редактировать кредит</div>
        <input
          placeholder="Банк"
          className="w-full px-3 py-2 rounded bg-white/10 mb-2"
          value={form.bank}
          onChange={e => setForm({ ...form, bank: e.target.value })}
        />
        <input
          placeholder="Ежемесячный платёж"
          type="number"
          className="w-full px-3 py-2 rounded bg-white/10 mb-2"
          value={form.payment_monthly}
          onChange={e => setForm({ ...form, payment_monthly: +e.target.value })}
        />
        <input
          placeholder="Остаток"
          type="number"
          className="w-full px-3 py-2 rounded bg-white/10 mb-2"
          value={form.remaining}
          onChange={e => setForm({ ...form, remaining: +e.target.value })}
        />
        <input
          placeholder="День платежа"
          className="w-full px-3 py-2 rounded bg-white/10 mb-2"
          value={form.due_day}
          onChange={e => setForm({ ...form, due_day: e.target.value })}
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
        <div className="flex justify-between mt-4">
          <button onClick={() => setEditing(null)} className="px-4 py-2 rounded bg-white/10 hover:bg-white/20">Отмена</button>
          <button onClick={saveEdit} className="px-4 py-2 rounded bg-green-600 hover:bg-green-700">Сохранить</button>
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
          className="w-full px-3 py-2 rounded bg-white/10 mb-2"
          value={form.bank}
          onChange={e => setForm({ ...form, bank: e.target.value })}
        />
        <input
          placeholder="Ежемесячный платёж"
          type="number"
          className="w-full px-3 py-2 rounded bg-white/10 mb-2"
          value={form.payment_monthly}
          onChange={e => setForm({ ...form, payment_monthly: +e.target.value })}
        />
        <input
          placeholder="Остаток"
          type="number"
          className="w-full px-3 py-2 rounded bg-white/10 mb-2"
          value={form.remaining}
          onChange={e => setForm({ ...form, remaining: +e.target.value })}
        />
        <input
          placeholder="День платежа"
          className="w-full px-3 py-2 rounded bg-white/10 mb-2"
          value={form.due_day}
          onChange={e => setForm({ ...form, due_day: e.target.value })}
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
        <div className="flex justify-between mt-4">
          <button onClick={() => setAdding(false)} className="px-4 py-2 rounded bg-white/10 hover:bg-white/20">Отмена</button>
          <button onClick={saveAdd} className="px-4 py-2 rounded bg-green-600 hover:bg-green-700">Добавить</button>
        </div>
      </Modal>
    </Shell>
  );
}

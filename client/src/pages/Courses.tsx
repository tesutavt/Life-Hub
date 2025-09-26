import React, { useEffect, useMemo, useState } from 'react';
import Shell from '../components/Shell';
import { api } from '../api';
import { requestMenuCountersRefresh } from '../menuBus';

type Course = {
  id: number;
  title: string;
  provider?: string;
  progress?: number;
  status?: string;
  course_type?: string | null;
  language_id?: number | null;
};

type Language = { id: number; name: string };

const Pill = ({ children }: { children: React.ReactNode }) => (
  <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-xs">
    {children}
  </span>
);

const STATUS_LABELS: Record<string, string> = {
  'in-progress': 'В процессе',
  'done': 'Завершено',
};

const StatusPill = ({ status }: { status?: string }) => {
  const code = status ?? 'in-progress';
  return <Pill>{STATUS_LABELS[code] || code}</Pill>;
};
const COURSE_TYPES = [
  { value: 'study', label: 'Учёба' },
  { value: 'other', label: 'Другое' },
] as const;

const INITIAL_FORM: CourseForm = {
  title: '',
  provider: '',
  progress: 0,
  status: 'in-progress',
  course_type: COURSE_TYPES[0].value,
  language_id: null,
};

export default function Courses() {
  const [items, setItems] = useState<Course[]>([]);
  const [form, setForm] = useState<CourseForm>({ ...INITIAL_FORM });
  const [editing, setEditing] = useState<Course | null>(null);
  const [languages, setLanguages] = useState<Language[]>([]);

  const languageMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const lang of languages) map.set(lang.id, lang.name);
    return map;
  }, [languages]);

  const loadCourses = async () => {
    const res = await api.get('/api/life/courses');
    setItems(res.items || []);
    requestMenuCountersRefresh();
  };

  const loadLanguages = async () => {
    const res = await api.get('/api/life/languages');
    setLanguages(res.items || []);
  };

  useEffect(() => {
    loadCourses();
    loadLanguages();
  }, []);

  const parseLanguageId = (value: string) => {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const resetForm = () => setForm({ ...INITIAL_FORM });

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      language_id: form.language_id ?? null,
    };
    await api.post('/api/life/courses', payload);
    await api.post('/api/life/xp/add', { amount: 25 });
    resetForm();
    await loadCourses();
  };

  const save = async () => {
    if (!editing) return;
    const payload = {
      title: editing.title,
      provider: editing.provider || '',
      progress: editing.progress || 0,
      status: editing.status || 'in-progress',
      course_type: editing.course_type || COURSE_TYPES[0].value,
      language_id: editing.language_id ?? null,
    };
    await api.put(`/api/life/courses/${editing.id}`, payload);
    if ((editing.progress || 0) >= 100) {
      await api.post('/api/life/xp/add', { amount: 50 });
    }
    setEditing(null);
    await loadCourses();
  };

  const del = async (id: number) => {
    if (!confirm('Удалить курс?')) return;
    await api.del(`/api/life/courses/${id}`);
    await loadCourses();
  };

  const courseTypeLabel = (value?: string | null) =>
    COURSE_TYPES.find(option => option.value === value)?.label || COURSE_TYPES[0].label;

  return (
    <Shell>
      <div className="flex items-center justify-between mb-4">
        <div className="text-2xl font-semibold">Курсы</div>
      </div>

      <form onSubmit={add} className="card grid md:grid-cols-5 gap-2 mb-6">
        <input
          placeholder="Название курса"
          value={form.title}
          onChange={e => setForm({ ...form, title: e.target.value })}
          className="px-3 py-2 rounded bg-white/10"
        />
        <input
          placeholder="Платформа"
          value={form.provider}
          onChange={e => setForm({ ...form, provider: e.target.value })}
          className="px-3 py-2 rounded bg-white/10"
        />
        <select
          value={form.course_type}
          onChange={e => setForm({ ...form, course_type: e.target.value as CourseType })}
          className="px-3 py-2 rounded bg-white/10"
        >
          {COURSE_TYPES.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={form.language_id !== null ? String(form.language_id) : ''}
          onChange={e => setForm({ ...form, language_id: parseLanguageId(e.target.value) })}
          className="px-3 py-2 rounded bg-white/10"
        >
          <option value="">Без языка</option>
          {languages.map(lang => (
            <option key={lang.id} value={lang.id}>
              {lang.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            max={100}
            placeholder="Прогресс, %"
            value={form.progress}
            onChange={e => setForm({ ...form, progress: Number(e.target.value) || 0 })}
            className="px-3 py-2 rounded bg-white/10 w-full"
          />
          <button type="submit" className="px-4 py-2 rounded bg-white text-black whitespace-nowrap">Добавить</button>
        </div>
      </form>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {(items || []).map(c => {
          const languageLabel = c.language_id != null ? languageMap.get(c.language_id) : undefined;
          return (
            <div key={c.id} className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold truncate">{c.title}</div>
                <StatusPill status={c.status} />
              </div>
              <div className="text-sm opacity-80">{c.provider}</div>
              <div className="flex items-center gap-2 text-xs">
                <Pill>{courseTypeLabel(c.course_type)}</Pill>
                {languageLabel && <Pill>{languageLabel}</Pill>}
              </div>
              <div className="w-full h-2 bg-white/10 rounded">
                <div className="h-2 bg-white rounded" style={{ width: `${Math.min(100, c.progress || 0)}%` }} />
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() =>
                    setEditing({
                      ...c,
                      course_type: c.course_type || COURSE_TYPES[0].value,
                      language_id: c.language_id ?? null,
                    })
                  }
                  className="ml-auto px-2 py-1 rounded bg-white/10 hover:bg-white/20"
                >Редактировать</button>
                <button
                  onClick={() => del(c.id)}
                  className="px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/40"
                >Удалить</button>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-black p-6 rounded-xl w-96 border border-white/20 space-y-3">
            <div className="text-lg font-medium">Редактирование курса</div>
            <input
              className="px-3 py-2 rounded bg-white/10 w-full"
              value={editing.title}
              onChange={e => setEditing({ ...editing, title: e.target.value })}
            />
            <input
              className="px-3 py-2 rounded bg-white/10 w-full"
              value={editing.provider || ''}
              onChange={e => setEditing({ ...editing, provider: e.target.value })}
            />
            <select
              className="px-3 py-2 rounded bg-white/10 w-full"
              value={editing.course_type || COURSE_TYPES[0].value}
              onChange={e => setEditing({ ...editing, course_type: e.target.value })}
            >
              {COURSE_TYPES.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              className="px-3 py-2 rounded bg-white/10 w-full"
              value={editing.language_id != null ? String(editing.language_id) : ''}
              onChange={e => setEditing({ ...editing, language_id: parseLanguageId(e.target.value) })}
            >
              <option value="">Без языка</option>
              {languages.map(lang => (
                <option key={lang.id} value={lang.id}>
                  {lang.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              max={100}
              placeholder="Прогресс, %"
              className="px-3 py-2 rounded bg-white/10 w-full"
              value={editing.progress ?? 0}
              onChange={e => setEditing({ ...editing, progress: Number(e.target.value) || 0 })}
            />
            <select
              className="px-3 py-2 rounded bg-white/10 w-full"
              value={editing.status || 'in-progress'}
              onChange={e => setEditing({ ...editing, status: e.target.value })}
            >
              <option value="in-progress">В процессе</option>
              <option value="done">Завершено</option>
            </select>
            <div className="flex justify-between">
              <button
                onClick={() => setEditing(null)}
                className="px-3 py-2 rounded bg-white/10 hover:bg-white/20"
              >Отмена</button>
              <button
                onClick={save}
                className="px-3 py-2 rounded bg-green-600 hover:bg-green-700"
              >Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}












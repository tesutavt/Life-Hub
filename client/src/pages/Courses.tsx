import React, { useEffect, useMemo, useState } from 'react';
import Shell from '../components/Shell';
import { api } from '../api';
import { requestMenuCountersRefresh } from '../menuBus';
import SiteSearch from '../components/SiteSearch';
import TagBadge from '../components/tags/TagBadge';
import TagSelector from '../components/tags/TagSelector';
import CourseMaster, { COURSE_TYPES } from '../components/master/CourseMaster';

type TagOption = { id: number; label: string; color: string };

type Course = {
  id: number;
  title: string;
  provider?: string;
  progress?: number;
  status?: string;
  course_type?: string | null;
  language_id?: number | null;
  tags: TagOption[];
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
export default function Courses() {
  const [items, setItems] = useState<Course[]>([]);
  const [editing, setEditing] = useState<Course | null>(null);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  const [editingTagIds, setEditingTagIds] = useState<number[]>([]);

  const languageMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const lang of languages) map.set(lang.id, lang.name);
    return map;
  }, [languages]);

  const mapCourse = (row: any): Course => ({
    id: row.id,
    title: row.title,
    provider: row.provider,
    progress: row.progress,
    status: row.status,
    course_type: row.course_type,
    language_id: row.language_id,
    tags: Array.isArray(row?.tags)
      ? row.tags.map((tag: any) => ({ id: tag.id, label: tag.label, color: tag.color }))
      : [],
  });

  const loadCourses = async () => {
    const res = await api.get('/api/life/courses');
    const active = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
    setItems(active.map(mapCourse));
    requestMenuCountersRefresh();
  };

  const loadLanguages = async () => {
    const res = await api.get('/api/life/languages');
    const list = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : res.items || [];
    setLanguages(list);
  };

  const loadTagOptions = async () => {
    const res = await api.get('/api/life/pages/tags', { silentError: true });
    const options = (res.items || []).map((tag: any) => ({
      id: tag.id,
      label: tag.label,
      color: tag.color,
    }));
    setTagOptions(options);
  };

  useEffect(() => {
    loadCourses();
    loadLanguages();
    loadTagOptions();
  }, []);

  const parseLanguageId = (value: string) => {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
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
      tags: editingTagIds,
    };
    await api.put(`/api/life/courses/${editing.id}`, payload);
    if ((editing.progress || 0) >= 100) {
      await api.post('/api/life/xp/add', { amount: 50 });
    }
    setEditing(null);
    setEditingTagIds([]);
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
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="text-2xl font-semibold">Курсы</div>
        <CourseMaster
          languages={languages}
          tagOptions={tagOptions}
          onCreated={loadCourses}
        />
      </div>

      <SiteSearch
        sections={['courses', 'pages']}
        className="mb-6 bg-black/30 border-white/15"
        placeholder="Поиск по курсам или страницам..."
      />

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
              {c.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 text-xs">
                  {c.tags.map((tag) => (
                    <TagBadge key={tag.id} tag={tag} compact />
                  ))}
                </div>
              )}
              <div className="w-full h-2 bg-white/10 rounded">
                <div className="h-2 bg-white rounded" style={{ width: `${Math.min(100, c.progress || 0)}%` }} />
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() =>
                    {
                      setEditing({
                        ...c,
                        course_type: c.course_type || COURSE_TYPES[0].value,
                        language_id: c.language_id ?? null,
                      });
                      setEditingTagIds((c.tags || []).map((tag) => tag.id));
                    }
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
            <TagSelector
              tags={tagOptions}
              selectedIds={editingTagIds}
              onChange={setEditingTagIds}
              label="Теги курса"
              emptyState="Нет доступных тэгов. Создайте их на странице Страницы."
              onManageTags={() => window.open('/pages', '_blank')}
            />
            <div className="flex justify-between">
              <button
                onClick={() => {
                  setEditing(null);
                  setEditingTagIds([]);
                }}
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













import React, { useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import { PencilLine, Trash2 } from 'lucide-react';
import Shell from '../components/Shell';
import { api } from '../api';
import { requestMenuCountersRefresh } from '../menuBus';
import SiteSearch from '../components/SiteSearch';
import { Modal } from '../components/ui/Modal';
import TagBadge from '../components/tags/TagBadge';
import TagSelector from '../components/tags/TagSelector';
import CourseMaster, { COURSE_TYPES } from '../components/master/CourseMaster';
import { useReorderableList } from '../hooks/useReorderableList';

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
  done: 'Завершено',
};

const StatusPill = ({ status }: { status?: string }) => {
  const code = status ?? 'in-progress';
  return <Pill>{STATUS_LABELS[code] || code}</Pill>;
};

const COURSE_BANNER_GRADIENTS = [
  'from-violet-500/50 via-fuchsia-500/30 to-rose-400/50',
  'from-sky-500/50 via-cyan-400/30 to-emerald-400/50',
  'from-amber-500/50 via-orange-500/30 to-red-400/50',
  'from-indigo-500/50 via-purple-500/30 to-blue-500/50',
  'from-teal-500/50 via-emerald-500/30 to-lime-400/50',
  'from-pink-500/50 via-rose-500/30 to-purple-500/50',
];

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

  const coursesLayout = useReorderableList<Course>('courses:active', items, (course) => course.id);

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

      <div
        className="grid md:grid-cols-2 xl:grid-cols-3 gap-4"
        {...coursesLayout.getContainerProps()}
      >
        {coursesLayout.items.map((c, index) => {
          const dragProps = coursesLayout.getDraggableProps(c.id);
          const canDrag = dragProps.draggable;
          const isDragging = coursesLayout.activeId === String(c.id);
          const isOver = coursesLayout.overId === String(c.id);
          const languageLabel = c.language_id != null ? languageMap.get(c.language_id) : undefined;
          const gradient = COURSE_BANNER_GRADIENTS[index % COURSE_BANNER_GRADIENTS.length];
          const rawProgress = typeof c.progress === 'number' ? c.progress : null;
          const clampedProgress =
            rawProgress != null && Number.isFinite(rawProgress)
              ? Math.min(100, Math.max(0, rawProgress))
              : null;
          return (
            <div
              key={c.id}
              {...dragProps}
              data-dragging={isDragging ? 'true' : undefined}
              data-drop-target={isOver && !isDragging ? 'true' : undefined}
              className={classNames(
                'flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition-all duration-200 ease-out select-none',
                { 'cursor-grab active:cursor-grabbing': canDrag },
                {
                  'ring-2 ring-white/70 border-white/40 scale-[0.98] shadow-2xl shadow-black/40': isDragging,
                  'border-white/30 ring-1 ring-white/40': isOver && !isDragging,
                  'hover:-translate-y-0.5': !isDragging,
                },
              )}
            >
              <div className="relative h-32">
                <div className={`absolute inset-0 bg-gradient-to-r ${gradient}`} />
                <div className="absolute inset-0 bg-black/40" />
                <div className="absolute inset-0 flex flex-col justify-between p-4 text-white">
                  <div className="text-base font-semibold leading-tight line-clamp-2 drop-shadow">
                    {c.title}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-white/80">
                    <Pill>{courseTypeLabel(c.course_type)}</Pill>
                    <StatusPill status={c.status} />
                  </div>
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="text-sm text-white/70 line-clamp-2 min-h-[1.5rem]">{c.provider}</div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {languageLabel && <Pill>{languageLabel}</Pill>}
                  {clampedProgress != null && <Pill>Прогресс: {Math.round(clampedProgress)}%</Pill>}
                </div>
                {c.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 text-xs">
                    {c.tags.map(tag => (
                      <TagBadge key={tag.id} tag={tag} compact />
                    ))}
                  </div>
                )}
                <div className="mt-1 h-2 w-full overflow-hidden rounded bg-white/10">
                  <div
                    className="h-2 rounded bg-white"
                    style={{ width: `${clampedProgress != null ? clampedProgress : 0}%` }}
                  />
                </div>
                <div className="mt-auto flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing({
                        ...c,
                        course_type: c.course_type || COURSE_TYPES[0].value,
                        language_id: c.language_id ?? null,
                      });
                      setEditingTagIds((c.tags || []).map(tag => tag.id));
                    }}
                    className="ml-auto flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/0 text-white/80 transition hover:bg-white/10"
                    title="Редактировать"
                    aria-label="Редактировать"
                  >
                    <PencilLine className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => del(c.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-red-400/40 bg-red-500/10 text-red-200 transition hover:bg-red-500/20"
                    title="Удалить"
                    aria-label="Удалить"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => {
          setEditing(null);
          setEditingTagIds([]);
        }}
        contentClassName="w-full max-w-md space-y-3 rounded-2xl border border-white/20 bg-black p-6 shadow-2xl"
      >
        <div className="text-lg font-medium">Редактирование курса</div>
        {editing && (
          <>
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
              >
                Отмена
              </button>
              <button
                onClick={save}
                className="px-3 py-2 rounded bg-green-600 hover:bg-green-700"
              >
                Сохранить
              </button>
            </div>
          </>
        )}
      </Modal>
    </Shell>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import classNames from "classnames";
import { Link } from "react-router-dom";
import { Circle, CircleCheck, PencilLine, Trash2 } from "lucide-react";
import Shell from "../components/Shell";
import { api } from "../api";
import { requestMenuCountersRefresh } from "../menuBus";
import TagBadge from "../components/tags/TagBadge";
import TagSelector from "../components/tags/TagSelector";
import { Modal } from "../components/ui/Modal";
import LanguageMaster from "../components/master/LanguageMaster";
import { useReorderableList } from "../hooks/useReorderableList";

type TagOption = { id: number; label: string; color: string };

type CourseSummary = {
  id: number;
  title: string;
  progress: number;
  status: string;
  provider?: string;
  course_type?: string | null;
  tags: TagOption[];
};

type Lang = {
  id: number;
  name: string;
  level?: string;
  minutes_today?: number;
  imageUrl?: string | null;
  bannerUrl?: string | null;
  tags: TagOption[];
  courses: CourseSummary[];
  coursesTotal: number;
  coursesCompleted: number;
  courseProgressPct: number;
};

const Badge = ({ children }: { children: React.ReactNode }) => (
  <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-xs">
    {children}
  </span>
);

const sanitizeUrl = (value: string | null | undefined) => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getInitials = (value: string) => {
  if (!value) return "";
  const parts = value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return value.slice(0, 1).toUpperCase();
  return parts
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");
};

const BANNER_FALLBACKS = [
  'from-brand-mint/40 via-brand-slate/30 to-brand-night/70',
  'from-brand-slate/40 via-brand-night/35 to-brand-deep/80',
  'from-brand-mint/30 via-brand-mint/10 to-brand-night/80',
  'from-brand-night/45 via-brand-slate/25 to-brand-mint/35',
];

const clampProgress = (value: number | null | undefined) => {
  if (!Number.isFinite(Number(value))) return 0;
  const numeric = Number(value);
  if (numeric < 0) return 0;
  if (numeric > 100) return 100;
  return Math.round(numeric);
};

const mapCourse = (entry: any): CourseSummary => ({
  id: entry.id,
  title: entry.title,
  progress: clampProgress(entry.progress),
  status: typeof entry.status === "string" ? entry.status : "in-progress",
  provider: entry.provider || undefined,
  course_type: entry.course_type ?? null,
  tags: Array.isArray(entry?.tags)
    ? entry.tags.map((tag: any) => ({ id: tag.id, label: tag.label, color: tag.color }))
    : [],
});

const mapLanguage = (entry: any): Lang => {
  const courses = Array.isArray(entry?.courses)
    ? entry.courses.map(mapCourse)
    : [];
  const apiTotal = entry?.courses_total ?? entry?.coursesTotal;
  const apiCompleted = entry?.courses_completed ?? entry?.coursesCompleted;
  const apiPct = entry?.courses_progress_pct ?? entry?.coursesProgressPct;
  const total = Number.isFinite(Number(apiTotal)) ? Number(apiTotal) : courses.length;
  const completed = Number.isFinite(Number(apiCompleted))
    ? Number(apiCompleted)
    : courses.filter((course) => clampProgress(course.progress) >= 100).length;
  const progressPct = Number.isFinite(Number(apiPct))
    ? clampProgress(apiPct)
    : total > 0
    ? Math.round((completed * 100) / total)
    : 0;

  return {
    id: entry.id,
    name: entry.name,
    level: entry.level,
    minutes_today: entry.minutes_today ?? entry.minutesToday ?? 0,
    imageUrl: entry.image_url ?? entry.imageUrl ?? null,
    bannerUrl: entry.banner_url ?? entry.bannerUrl ?? null,
    tags: Array.isArray(entry?.tags)
      ? entry.tags.map((tag: any) => ({ id: tag.id, label: tag.label, color: tag.color }))
      : [],
    courses,
    coursesTotal: total,
    coursesCompleted: completed,
    courseProgressPct: progressPct,
  };
};

export default function Languages() {
  const [items, setItems] = useState<Lang[]>([]);
  const [archivedLanguages, setArchivedLanguages] = useState<Lang[]>([]);
  const [editing, setEditing] = useState<Lang | null>(null);
  const [editingTagIds, setEditingTagIds] = useState<number[]>([]);
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);

  const loadLanguages = async () => {
    const res = await api.get("/api/life/languages");
    const activeSource = Array.isArray(res?.items)
      ? res.items
      : Array.isArray(res?.active)
      ? res.active
      : Array.isArray(res)
      ? res
      : [];
    const archivedSource = Array.isArray(res?.archived) ? res.archived : [];
    setItems(activeSource.map(mapLanguage));
    setArchivedLanguages(archivedSource.map(mapLanguage));
    requestMenuCountersRefresh();
  };

  const loadTagOptions = async () => {
    const res = await api.get("/api/life/pages/tags", { silentError: true });
    const options = (res.items || []).map((tag: any) => ({
      id: tag.id,
      label: tag.label,
      color: tag.color,
    }));
    setTagOptions(options);
  };

  useEffect(() => {
    loadLanguages();
    loadTagOptions();
  }, []);

  const totalMinutes = useMemo(
    () =>
      (items || []).reduce((acc, lang) => acc + (lang.minutes_today || 0), 0),
    [items],
  );

  const activeLanguagesLayout = useReorderableList<Lang>(
    "languages:active",
    items,
    (language) => language.id,
  );

  const archivedLanguagesLayout = useReorderableList<Lang>(
    "languages:archived",
    archivedLanguages,
    (language) => language.id,
  );

  const saveEdit = async () => {
    if (!editing) return;
    await api.put(`/api/life/languages/${editing.id}`, {
      name: editing.name,
      level: editing.level,
      minutes_today: editing.minutes_today || 0,
      tags: editingTagIds,
      image_url: sanitizeUrl(editing.imageUrl),
      banner_url: sanitizeUrl(editing.bannerUrl),
    });
    setEditing(null);
    setEditingTagIds([]);
    await loadLanguages();
  };

  const archiveLanguage = async (id: number) => {
    if (!confirm("Переместить язык в архив?")) return;
    await api.del("/api/life/languages/" + id);
    await loadLanguages();
  };

  const restoreLanguage = async (id: number) => {
    await api.post("/api/life/languages/" + id + "/restore");
    await loadLanguages();
  };

  const streak =
    items.filter((lang) => (lang.minutes_today || 0) > 0).length > 0 ? 1 : 0;

  const renderCourse = (course: CourseSummary) => {
    const progress = clampProgress(course.progress);
    const isDone = progress >= 100 || course.status === "done";
    return (
      <Link
        key={course.id}
        to="/courses"
        className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm transition hover:bg-white/10"
      >
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate text-white">{course.title}</div>
          {course.provider && (
            <div className="text-xs text-white/60 truncate">{course.provider}</div>
          )}
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-white/10">
            <div
              className="h-1.5 rounded bg-white"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/70">
          <span>{progress}%</span>
          {isDone ? (
            <CircleCheck className="h-4 w-4 text-emerald-300" />
          ) : (
            <Circle className="h-4 w-4 opacity-70" />
          )}
        </div>
      </Link>
    );
  };

  return (
    <Shell>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="text-2xl font-semibold">Языки</div>
          <div className="text-sm opacity-80">
            Минут сегодня: <b>{totalMinutes}</b>
          </div>
        </div>
        <LanguageMaster tagOptions={tagOptions} onCreated={loadLanguages} />
      </div>

      <div
        className="grid md:grid-cols-2 xl:grid-cols-3 gap-4"
        {...activeLanguagesLayout.getContainerProps()}
      >
        {activeLanguagesLayout.items.map((language, index) => {
          const dragProps = activeLanguagesLayout.getDraggableProps(language.id);
          const canDrag = dragProps.draggable;
          const isDragging = activeLanguagesLayout.activeId === String(language.id);
          const isOver = activeLanguagesLayout.overId === String(language.id);
          const gradient = BANNER_FALLBACKS[(language.id + index) % BANNER_FALLBACKS.length];

          return (
            <div
              key={language.id}
              {...dragProps}
              data-dragging={isDragging ? "true" : undefined}
              data-drop-target={isOver && !isDragging ? "true" : undefined}
              className={classNames(
                "rounded-2xl border border-white/10 bg-white/5 overflow-hidden flex flex-col transition-all duration-200 ease-out select-none",
                { "cursor-grab active:cursor-grabbing": canDrag },
                {
                  "ring-2 ring-white/70 border-white/40 scale-[0.98] shadow-2xl shadow-black/40": isDragging,
                  "border-white/30 ring-1 ring-white/40": isOver && !isDragging,
                  "hover:-translate-y-0.5": !isDragging,
                },
              )}
            >
              <div className="relative h-28 overflow-hidden">
                {language.bannerUrl ? (
                  <img
                    src={language.bannerUrl}
                    alt={`Баннер ${language.name}`}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className={`absolute inset-0 bg-gradient-to-r ${gradient}`} />
                )}
                <div className="absolute inset-0 bg-black/30" />
              </div>

              <div className="p-4 pt-0 flex flex-col flex-1">
                <div className="relative -mt-10 flex items-start gap-3">
                  <div className="shrink-0 w-16 h-16 rounded-xl border-2 border-black/60 overflow-hidden bg-black/60 flex items-center justify-center text-lg font-semibold text-white">
                    {language.imageUrl ? (
                      <img
                        src={language.imageUrl}
                        alt={`Изображение ${language.name}`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span>{getInitials(language.name)}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pt-2">
                    <div className="flex items-center gap-2">
                      <div className="text-lg font-semibold truncate">
                        {language.name}
                      </div>
                      <Badge>{language.level || "A1"}</Badge>
                    </div>
                    <div className="mt-1 text-sm opacity-80">
                      Минут сегодня: <b>{language.minutes_today || 0} мин</b>
                    </div>
                  </div>
                </div>

                {language.tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1 text-xs">
                    {language.tags.map((tag) => (
                      <TagBadge key={tag.id} tag={tag} compact />
                    ))}
                  </div>
                )}

                <div className="mt-4 space-y-1">
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/60">
                    <span>Прогресс по курсам</span>
                    <span>
                      {language.coursesCompleted}/{language.coursesTotal}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-2 rounded-full bg-white"
                      style={{ width: `${language.courseProgressPct}%` }}
                    />
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="text-xs uppercase tracking-wide text-white/60">
                    Закреплённые курсы
                  </div>
                  {language.courses.length === 0 ? (
                    <div className="text-xs text-white/60">
                      Курсы ещё не привязаны. Добавьте их на странице «Курсы».
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {language.courses.map(renderCourse)}
                    </div>
                  )}
                  <div className="text-[11px] text-white/50">
                    Управляйте материалами на странице
                    <Link to="/courses" className="ml-1 underline">
                      «Курсы»
                    </Link>
                    .
                  </div>
                </div>

                <div className="mt-auto flex items-center gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing({ ...language });
                      setEditingTagIds((language.tags || []).map((tag) => tag.id));
                    }}
                    className="ml-auto flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/0 text-white/80 transition hover:bg-white/10"
                    title="Редактировать"
                    aria-label="Редактировать"
                  >
                    <PencilLine className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => archiveLanguage(language.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-red-400/40 bg-red-500/10 text-red-200 transition hover:bg-red-500/20"
                    title="Архивировать"
                    aria-label="Архивировать"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {archivedLanguagesLayout.items.length > 0 && (
        <div className="mt-10 space-y-2">
          <div className="text-sm uppercase tracking-wide text-white/60">
            Архив
          </div>
          <div
            className="grid md:grid-cols-2 xl:grid-cols-3 gap-3"
            {...archivedLanguagesLayout.getContainerProps()}
          >
            {archivedLanguagesLayout.items.map((language) => {
              const dragProps = archivedLanguagesLayout.getDraggableProps(language.id);
              const canDrag = dragProps.draggable;
              const isDragging = archivedLanguagesLayout.activeId === String(language.id);
              const isOver = archivedLanguagesLayout.overId === String(language.id);
              return (
                <div
                  key={language.id}
                  {...dragProps}
                  data-dragging={isDragging ? "true" : undefined}
                  data-drop-target={isOver && !isDragging ? "true" : undefined}
                  className={classNames(
                    "flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 transition-all duration-200 ease-out select-none",
                    { "cursor-grab active:cursor-grabbing": canDrag },
                    {
                      "ring-2 ring-white/70 border-white/40 scale-[0.98] shadow-2xl shadow-black/40": isDragging,
                      "border-white/30 ring-1 ring-white/40": isOver && !isDragging,
                      "hover:-translate-y-0.5": !isDragging,
                    },
                  )}
                >
                  <div>
                    <div className="font-medium">{language.name}</div>
                    <div className="text-xs opacity-70">
                      Уровень: {language.level || "A1"}
                    </div>
                    {language.coursesTotal > 0 && (
                      <div className="text-[11px] text-white/60 mt-1">
                        Курсов: {language.coursesCompleted}/{language.coursesTotal}
                      </div>
                    )}
                    {language.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1 text-xs">
                        {language.tags.map((tag) => (
                          <TagBadge key={tag.id} tag={tag} compact />
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => restoreLanguage(language.id)}
                    className="text-xs px-3 py-1 rounded bg-white text-black hover:bg-white/80"
                  >
                    Восстановить
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => {
          setEditing(null);
          setEditingTagIds([]);
        }}
        contentClassName="w-full max-w-lg space-y-3 rounded-2xl border border-white/20 bg-black p-6 shadow-2xl"
      >
        {editing && (
          <>
            <div className="text-lg font-medium">Редактирование языка: {editing.name}</div>
            <input
              className="px-3 py-2 rounded bg-white/10 w-full"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <select
              className="px-3 py-2 rounded bg-white/10 w-full"
              value={editing.level || "A1"}
              onChange={(e) => setEditing({ ...editing, level: e.target.value })}
            >
              {["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              className="px-3 py-2 rounded bg-white/10 w-full"
              value={editing.minutes_today || 0}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  minutes_today: Number(e.target.value) || 0,
                })
              }
            />
            <input
              className="px-3 py-2 rounded bg-white/10 w-full"
              placeholder="Ссылка на изображение (опционально)"
              value={editing.imageUrl || ""}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  imageUrl: e.target.value,
                })
              }
            />
            <input
              className="px-3 py-2 rounded bg-white/10 w-full"
              placeholder="Ссылка на баннер (опционально)"
              value={editing.bannerUrl || ""}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  bannerUrl: e.target.value,
                })
              }
            />
            <TagSelector
              tags={tagOptions}
              selectedIds={editingTagIds}
              onChange={setEditingTagIds}
              label="Теги языка"
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
                onClick={saveEdit}
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

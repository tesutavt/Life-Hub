import React, { useEffect, useMemo, useState } from "react";
import classNames from "classnames";
import { Link, useSearchParams } from "react-router-dom";
import { BookOpenCheck, Circle, CircleCheck, Flame, ListOrdered, Lock, PencilLine, Trash2, X } from "lucide-react";
import Shell from "../components/Shell";
import { api } from "../api";
import { requestMenuCountersRefresh } from "../menuBus";
import TagBadge from "../components/tags/TagBadge";
import TagSelector from "../components/tags/TagSelector";
import { Modal } from "../components/ui/Modal";
import LanguageMaster from "../components/master/LanguageMaster";
import { useReorderableList } from "../hooks/useReorderableList";
import ProgramEditor from "../components/languages/ProgramEditor";

type TagOption = { id: number; label: string; color: string };

type CourseSummary = {
  id: number;
  title: string;
  progress: number;
  status: string;
  provider?: string;
  course_type?: string | null;
  learn_course_id?: number | null;
  program_stage: number;
  locked: boolean;
  lock_reason?: string | null;
  tags: TagOption[];
};

type Lang = {
  id: number;
  name: string;
  level?: string;
  minutes_today?: number;
  streak: number;
  streakBest: number;
  dailyGoalXp: number;
  imageUrl?: string | null;
  bannerUrl?: string | null;
  tags: TagOption[];
  courses: CourseSummary[];
  coursesTotal: number;
  coursesCompleted: number;
  courseProgressPct: number;
};

type VocabItem = {
  id: number;
  language_id: number;
  term: string;
  translation: string;
  note: string | null;
  unit_label: string | null;
  is_new: boolean;
  is_due: boolean;
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
  // Только слова, начинающиеся с буквы: эмодзи-флаг в названии не должен ломать инициалы
  const parts = value
    .split(/\s+/)
    .filter((part) => /^\p{L}/u.test(part))
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
  learn_course_id: entry.learn_course_id ?? null,
  program_stage: Number(entry.program_stage) || 1,
  locked: !!entry.locked,
  lock_reason: entry.lock_reason ?? null,
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
    streak: Number(entry.streak) || 0,
    streakBest: Number(entry.streak_best ?? entry.streakBest) || 0,
    dailyGoalXp: Number(entry.daily_goal_xp ?? entry.dailyGoalXp) || 50,
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

  // Занятия вне приложения (учебник, аудио): уроки и тренировки засчитываются сами
  const addMinutes = async (languageId: number, minutes: number) => {
    const res = await api.post(`/api/life/languages/${languageId}/minutes`, { minutes }, { notifySuccess: `+${minutes} мин занятий` });
    setItems((prev) => prev.map((lang) => (lang.id === languageId ? { ...lang, minutes_today: res?.minutes_today ?? lang.minutes_today } : lang)));
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

  const [vocabLanguage, setVocabLanguage] = useState<Lang | null>(null);
  const [vocabItems, setVocabItems] = useState<VocabItem[]>([]);
  const [vocabLoading, setVocabLoading] = useState(false);
  const [bulkVocabText, setBulkVocabText] = useState("");

  const openVocab = async (language: Lang) => {
    setVocabLanguage(language);
    setVocabLoading(true);
    try {
      const res = await api.get(`/api/life/languages/${language.id}/vocab`);
      setVocabItems(Array.isArray(res?.items) ? res.items : []);
    } finally {
      setVocabLoading(false);
    }
  };
  // Переход из поиска: /languages?vocab=<id> открывает словарь этого языка
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const vocabId = Number(searchParams.get("vocab"));
    if (!vocabId || !items.length) return;
    const language = items.find((lang) => lang.id === vocabId);
    if (language) openVocab(language);
    setSearchParams({}, { replace: true });
  }, [searchParams, items]);


  const closeVocab = () => {
    setVocabLanguage(null);
    setVocabItems([]);
    setBulkVocabText("");
  };

  const parseBulkVocabLine = (line: string) => {
    const separators = [" - ", " — ", " – ", "\t", ":"];
    for (const sep of separators) {
      const idx = line.indexOf(sep);
      if (idx > 0) {
        return {
          term: line.slice(0, idx).trim(),
          translation: line.slice(idx + sep.length).trim(),
        };
      }
    }
    return null;
  };

  const submitBulkVocab = async () => {
    if (!vocabLanguage) return;
    const lines = bulkVocabText.split("\n").map((line) => line.trim()).filter(Boolean);
    const items = lines
      .map(parseBulkVocabLine)
      .filter((item): item is { term: string; translation: string } => !!item && !!item.term && !!item.translation);
    if (items.length === 0) return;
    const res = await api.post(`/api/life/languages/${vocabLanguage.id}/vocab`, { items });
    const created = Array.isArray(res?.items) ? res.items : [];
    setVocabItems((prev) => [...prev, ...created]);
    setBulkVocabText("");
  };

  const deleteVocabItem = async (vocabId: number) => {
    await api.del(`/api/life/languages/vocab/${vocabId}`);
    setVocabItems((prev) => prev.filter((item) => item.id !== vocabId));
  };

  const [programLanguage, setProgramLanguage] = useState<Lang | null>(null);

  const renderCourses = (courses: CourseSummary[]) => {
    const multiStage = new Set(courses.map((course) => course.program_stage)).size > 1;
    return courses.map((course, index) => (
      <React.Fragment key={course.id}>
        {multiStage && (index === 0 || courses[index - 1]!.program_stage !== course.program_stage) && (
          <div className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-white/40">Этап {course.program_stage}</div>
        )}
        {renderCourse(course)}
      </React.Fragment>
    ));
  };

  const renderCourse = (course: CourseSummary) => {
    const progress = clampProgress(course.progress);
    const isDone = progress >= 100 || course.status === "done";
    return (
      <Link
        key={course.id}
        to={course.learn_course_id && !course.locked ? `/learn/${course.learn_course_id}` : "/courses"}
        title={course.locked ? course.lock_reason || "Курс пока закрыт" : undefined}
        className={classNames(
          "flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm transition",
          course.locked ? "border-dashed border-white/10 bg-black/20 opacity-70" : "border-white/10 bg-white/5 hover:bg-white/10"
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-medium text-white">
            {course.locked && <Lock className="h-3.5 w-3.5 shrink-0 text-white/50" />}
            <span className="truncate">{course.title}</span>
          </div>
          {course.locked && course.lock_reason && <div className="text-[11px] text-amber-200/80">{course.lock_reason}</div>}
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
            <CircleCheck className="h-4 w-4 text-brand-mint" />
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
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-sm opacity-80">
                      <span className="inline-flex items-center gap-1.5">
                        Сегодня: <b>{language.minutes_today || 0} мин</b>
                        <button
                          type="button"
                          onClick={() => addMinutes(language.id, 15)}
                          title="Отметить 15 минут занятий вне приложения (учебник, аудио)"
                          className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/70 transition hover:bg-white/10"
                        >
                          +15 мин
                        </button>
                      </span>
                      {language.streak > 0 && (
                        <span className="inline-flex items-center gap-1 text-amber-300">
                          <Flame className="h-3.5 w-3.5" />
                          {language.streak} {language.streak === 1 ? 'день' : 'дней'} подряд
                        </span>
                      )}
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
                      {renderCourses(language.courses)}
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
                  <Link
                    to={`/languages/${language.id}/practice`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 via-rose-400 to-purple-500 px-3 py-1.5 text-xs font-semibold text-brand-night transition hover:brightness-110"
                  >
                    <Flame className="h-3.5 w-3.5" />
                    Практика
                  </Link>
                  <button
                    type="button"
                    onClick={() => setProgramLanguage(language)}
                    title="Порядок курсов: что открыто сразу, что параллельно, что потом"
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 transition hover:bg-white/10"
                  >
                    <ListOrdered className="h-3.5 w-3.5" />
                    Программа
                  </button>
                  <button
                    type="button"
                    onClick={() => openVocab(language)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 transition hover:bg-white/10"
                  >
                    <BookOpenCheck className="h-3.5 w-3.5" />
                    Словарь
                  </button>
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

      <ProgramEditor
        open={!!programLanguage}
        language={programLanguage}
        onClose={() => setProgramLanguage(null)}
        onSaved={loadLanguages}
      />

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

      <Modal
        open={Boolean(vocabLanguage)}
        onClose={closeVocab}
        contentClassName="w-full max-w-lg max-h-[85vh] overflow-y-auto space-y-3 rounded-2xl border border-white/20 bg-black p-6 shadow-2xl"
      >
        {vocabLanguage && (
          <>
            <div className="flex items-center justify-between">
              <div className="text-lg font-medium">Словарь: {vocabLanguage.name}</div>
              <button onClick={closeVocab} className="text-white/60 hover:text-white" aria-label="Закрыть">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2">
              <textarea
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
                rows={4}
                placeholder={"Добавьте слова построчно, например:\nhello - привет\ncat - кошка"}
                value={bulkVocabText}
                onChange={(e) => setBulkVocabText(e.target.value)}
              />
              <button
                type="button"
                onClick={submitBulkVocab}
                disabled={!bulkVocabText.trim()}
                className="rounded-full bg-brand-mint px-4 py-2 text-sm font-semibold text-black hover:bg-brand-mint disabled:cursor-not-allowed disabled:opacity-50"
              >
                Добавить слова
              </button>
            </div>

            <div className="space-y-1.5">
              {vocabLoading ? (
                <div className="text-sm text-white/60">Загрузка…</div>
              ) : vocabItems.length === 0 ? (
                <div className="text-sm text-white/60">
                  Пока нет слов. Добавьте несколько строк выше, чтобы начать практику.
                </div>
              ) : (
                vocabItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-white">{item.term}</span>
                      <span className="mx-2 text-white/40">→</span>
                      <span className="text-white/80">{item.translation}</span>
                      {item.unit_label && (
                        <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/50">
                          {item.unit_label}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => deleteVocabItem(item.id)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-red-400/40 bg-red-500/10 text-red-200 transition hover:bg-red-500/20"
                      aria-label="Удалить слово"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </Modal>
    </Shell>
  );
}

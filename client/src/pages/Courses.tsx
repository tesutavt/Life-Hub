import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { Link } from 'react-router-dom';
import { Circle, CircleCheck, ExternalLink, FileText, PencilLine, Trash2 } from 'lucide-react';
import Shell from '../components/Shell';
import { api } from '../api';
import { requestMenuCountersRefresh } from '../menuBus';
import SiteSearch, { SearchPdfBookmark } from '../components/SiteSearch';
import { Modal } from '../components/ui/Modal';
import TagBadge from '../components/tags/TagBadge';
import TagSelector from '../components/tags/TagSelector';
import CourseMaster, { COURSE_TYPES } from '../components/master/CourseMaster';
import { useReorderableList } from '../hooks/useReorderableList';
import LearnSection, { LearnCourse } from './learn/LearnSection';

type TagOption = { id: number; label: string; color: string };

type Course = {
  id: number;
  title: string;
  provider?: string;
  progress?: number;
  status?: string;
  course_type?: string | null;
  language_id?: number | null;
  learn_course_id?: number | null;
  program_stage?: number;
  locked?: boolean;
  lock_reason?: string | null;
  tags: TagOption[];
};

type Language = { id: number; name: string };

type CoursePageLink = {
  id: number;
  course_id: number;
  page_id: number;
  page_title: string;
  done: boolean;
  done_at?: string | null;
};

type CoursePdfLink = {
  id: number;
  course_id: number;
  title: string;
  pdf_url: string;
  page_number?: number | null;
  done: boolean;
  done_at?: string | null;
  original_name?: string | null;
};

type CourseAttachment =
  | (CoursePageLink & { kind: 'page' })
  | (CoursePdfLink & { kind: 'pdf' });

type PageOption = { id: number; title: string };

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
  'from-sky-500/50 via-cyan-400/30 to-brand-mint/50',
  'from-amber-500/50 via-orange-500/30 to-red-400/50',
  'from-indigo-500/50 via-purple-500/30 to-blue-500/50',
  'from-brand-mint/50 via-brand-mint/30 to-lime-400/50',
  'from-pink-500/50 via-rose-500/30 to-purple-500/50',
];

export default function Courses() {
  const [items, setItems] = useState<Course[]>([]);
  const [editing, setEditing] = useState<Course | null>(null);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [learnCourses, setLearnCourses] = useState<LearnCourse[]>([]);
  const loadLearnCourses = useCallback(async () => {
    const res = await api.get('/api/learn/courses', { silentError: true });
    setLearnCourses(Array.isArray(res?.items) ? res.items : []);
  }, []);
  const learnMap = useMemo(() => new Map(learnCourses.map((course) => [course.id, course])), [learnCourses]);
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  const [editingTagIds, setEditingTagIds] = useState<number[]>([]);
  const [pages, setPages] = useState<PageOption[]>([]);
  const [coursePages, setCoursePages] = useState<CoursePageLink[]>([]);
  const [coursePdfPages, setCoursePdfPages] = useState<CoursePdfLink[]>([]);
  const [pickerCourseId, setPickerCourseId] = useState<number | null>(null);

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
    learn_course_id: row.learn_course_id ?? null,
    program_stage: Number(row.program_stage) || 1,
    locked: !!row.locked,
    lock_reason: row.lock_reason ?? null,
    tags: Array.isArray(row?.tags)
      ? row.tags.map((tag: any) => ({ id: tag.id, label: tag.label, color: tag.color }))
      : [],
  });

  const loadCourses = useCallback(async () => {
    const res = await api.get('/api/life/courses');
    const active = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
    setItems(active.map(mapCourse));
    requestMenuCountersRefresh();
  }, []);

  const coursesReloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleCoursesRefresh = useCallback(() => {
    if (coursesReloadTimer.current) {
      clearTimeout(coursesReloadTimer.current);
    }
    coursesReloadTimer.current = setTimeout(() => {
      loadCourses();
      coursesReloadTimer.current = null;
    }, 250);
  }, [loadCourses]);

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

  const loadCoursePages = async () => {
    const res = await api.get('/api/life/course-pages');
    const normalized = (res.items || []).map((entry: any) => ({
      id: entry.id,
      course_id: entry.course_id,
      page_id: entry.page_id,
      page_title: entry.page_title || 'Без названия',
      done: !!entry.done,
      done_at: entry.done_at ?? null,
    }));
    setCoursePages(normalized);
  };

  const loadCoursePdfPages = async () => {
    const res = await api.get('/api/life/course-pdf-pages');
    const normalized = (res.items || []).map((entry: any) => ({
      id: entry.id,
      course_id: entry.course_id,
      title: entry.title || 'PDF материал',
      pdf_url: entry.pdf_url,
      page_number: entry.page_number ?? null,
      done: !!entry.done,
      done_at: entry.done_at ?? null,
      original_name: entry.original_name ?? null,
    }));
    setCoursePdfPages(normalized);
  };

  const loadPages = async () => {
    const res = await api.get('/api/life/pages');
    const normalized = (res.items || []).map((row: any) => ({
      id: row.id,
      title: (row.title || '').trim() || 'Без названия',
    }));
    setPages(normalized);
  };

  useEffect(() => {
    loadCourses();
    loadLearnCourses();
    loadLanguages();
    loadTagOptions();
    loadCoursePages();
    loadCoursePdfPages();
    loadPages();
    return () => {
      if (coursesReloadTimer.current) {
        clearTimeout(coursesReloadTimer.current);
        coursesReloadTimer.current = null;
      }
    };
  }, [loadCourses]);

  const parseLanguageId = (value: string) => {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const coursesLayout = useReorderableList<Course>('courses:active', items, (course) => course.id);

  const courseAttachmentMap = useMemo(() => {
    const map = new Map<number, CourseAttachment[]>();
    for (const link of coursePages) {
      if (!map.has(link.course_id)) map.set(link.course_id, []);
      map.get(link.course_id)!.push({ ...link, kind: 'page' });
    }
    for (const link of coursePdfPages) {
      if (!map.has(link.course_id)) map.set(link.course_id, []);
      map.get(link.course_id)!.push({ ...link, kind: 'pdf' });
    }
    for (const attachments of map.values()) {
      attachments.sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        const titleA = a.kind === 'page' ? a.page_title : a.title;
        const titleB = b.kind === 'page' ? b.page_title : b.title;
        return titleA.localeCompare(titleB, 'ru');
      });
    }
    return map;
  }, [coursePages, coursePdfPages]);

  const handleAttachPage = async (courseId: number, pageId: number) => {
    try {
      const res = await api.post('/api/life/course-pages', {
        course_id: courseId,
        page_id: pageId,
      });
      if (res?.item) {
        const it = res.item;
        setCoursePages((prev) => {
          const exists = prev.some((entry) => entry.id === it.id);
          const next = exists
            ? prev.map((entry) =>
                entry.id === it.id
                  ? {
                      id: it.id,
                      course_id: it.course_id ?? courseId,
                      page_id: it.page_id ?? pageId,
                      page_title: it.page_title || pages.find((p) => p.id === pageId)?.title || 'Без названия',
                      done: !!it.done,
                      done_at: it.done_at ?? null,
                    }
                  : entry,
              )
            : [
                ...prev,
                {
                  id: it.id,
                  course_id: it.course_id ?? courseId,
                  page_id: it.page_id ?? pageId,
                  page_title: it.page_title || pages.find((p) => p.id === pageId)?.title || 'Без названия',
                  done: !!it.done,
                  done_at: it.done_at ?? null,
                },
              ];
          return next;
        });
      } else {
        setCoursePages((prev) => [
          ...prev,
          {
            id: Date.now(),
            course_id: courseId,
            page_id: pageId,
            page_title: pages.find((p) => p.id === pageId)?.title || 'Без названия',
            done: false,
            done_at: null,
          },
        ]);
      }
    } catch (error) {
      console.error(error);
    } finally {
      scheduleCoursesRefresh();
    }
  };

  const handleAttachPdfBookmark = async (courseId: number, bookmark: SearchPdfBookmark) => {
    const pdfUrl = bookmark.pdf_url?.trim();
    if (!pdfUrl) return;

    const existing = coursePdfPages.some(
      (entry) =>
        entry.course_id === courseId &&
        entry.pdf_url === pdfUrl &&
        (entry.page_number ?? null) === (bookmark.page_number ?? null) &&
        (entry.title || '').trim().toLowerCase() === bookmark.marker_title.trim().toLowerCase(),
    );
    if (existing) return;

    try {
      const payload: Record<string, unknown> = {
        course_id: courseId,
        title: bookmark.marker_title,
        pdf_url: pdfUrl,
      };
      if (bookmark.page_number != null) payload.page_number = bookmark.page_number;
      const originalName = bookmark.original_name || bookmark.pdf_title || null;
      if (originalName) payload.original_name = originalName;

      const res = await api.post('/api/life/course-pdf-pages', payload);
      if (res?.item) {
        const item = res.item;
        setCoursePdfPages((prev) => [
          ...prev,
          {
            id: item.id,
            course_id: item.course_id ?? courseId,
            title: item.title || bookmark.marker_title,
            pdf_url: item.pdf_url || pdfUrl,
            page_number: item.page_number ?? bookmark.page_number ?? null,
            done: !!item.done,
            done_at: item.done_at ?? null,
            original_name: item.original_name ?? originalName,
          },
        ]);
      }
    } catch (error) {
      console.error(error);
    } finally {
      scheduleCoursesRefresh();
    }
  };

  const togglePageLinkDone = async (link: CoursePageLink) => {
    try {
      const res = await api.patch(`/api/life/course-pages/${link.id}`, {
        done: !link.done,
      });
      if (res?.item) {
        setCoursePages((prev) =>
          prev.map((entry) =>
            entry.id === link.id
              ? {
                  id: res.item.id,
                  course_id: res.item.course_id ?? link.course_id,
                  page_id: res.item.page_id ?? link.page_id,
                  page_title: res.item.page_title || link.page_title,
                  done: !!res.item.done,
                  done_at: res.item.done_at ?? null,
                }
              : entry,
          ),
        );
      }
    } catch (error) {
      console.error(error);
    } finally {
      scheduleCoursesRefresh();
    }
  };

  const togglePdfLinkDone = async (link: CoursePdfLink) => {
    try {
      const res = await api.patch(`/api/life/course-pdf-pages/${link.id}`, {
        done: !link.done,
      });
      if (res?.item) {
        setCoursePdfPages((prev) =>
          prev.map((entry) =>
            entry.id === link.id
              ? {
                  id: res.item.id,
                  course_id: res.item.course_id ?? link.course_id,
                  title: res.item.title ?? link.title,
                  pdf_url: res.item.pdf_url ?? link.pdf_url,
                  page_number: res.item.page_number ?? link.page_number ?? null,
                  done: !!res.item.done,
                  done_at: res.item.done_at ?? null,
                  original_name: res.item.original_name ?? link.original_name ?? null,
                }
              : entry,
          ),
        );
      }
    } catch (error) {
      console.error(error);
    } finally {
      scheduleCoursesRefresh();
    }
  };

  const removePageLink = async (link: CoursePageLink) => {
    if (!confirm('Удалить учебную страницу?')) return;
    try {
      await api.del(`/api/life/course-pages/${link.id}`);
      setCoursePages((prev) => prev.filter((entry) => entry.id !== link.id));
    } catch (error) {
      console.error(error);
    } finally {
      scheduleCoursesRefresh();
    }
  };

  const removePdfLink = async (link: CoursePdfLink) => {
    if (!confirm('Удалить PDF материал?')) return;
    try {
      await api.del(`/api/life/course-pdf-pages/${link.id}`);
      setCoursePdfPages((prev) => prev.filter((entry) => entry.id !== link.id));
    } catch (error) {
      console.error(error);
    } finally {
      scheduleCoursesRefresh();
    }
  };

  const pickerCourse =
    pickerCourseId != null
      ? items.find((course) => course.id === pickerCourseId) || null
      : null;
  const pickerAttachments = pickerCourse
    ? courseAttachmentMap.get(pickerCourse.id) || []
    : [];

  useEffect(() => {
    if (pickerCourseId == null) return;
    if (!items.some((course) => course.id === pickerCourseId)) {
      setPickerCourseId(null);
    }
  }, [pickerCourseId, items]);

  const save = async () => {
    if (!editing) return;
    const payload = {
      title: editing.title,
      provider: editing.provider || '',
      status: editing.status || 'in-progress',
      course_type: editing.course_type || COURSE_TYPES[0].value,
      language_id: editing.language_id ?? null,
      learn_course_id: editing.learn_course_id ?? null,
      tags: editingTagIds,
    };
    await api.put(`/api/life/courses/${editing.id}`, payload);
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

      <LearnSection
        languages={languages}
        onChanged={() => {
          loadCourses();
          loadLearnCourses();
        }}
      />

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
          const attachments = courseAttachmentMap.get(c.id) || [];
          const materialsTotal = attachments.length;
          const materialsDone = attachments.filter((attachment) => attachment.done).length;
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
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="text-sm text-white/70 line-clamp-2 min-h-[1.5rem]">{c.provider}</div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {languageLabel && <Pill>{languageLabel}</Pill>}
                  {languageLabel && (c.program_stage || 1) > 1 && <Pill>Этап {c.program_stage}</Pill>}
                  {materialsTotal > 0 && (
                    <Pill>Материалов: {materialsDone}/{materialsTotal}</Pill>
                  )}
                  {clampedProgress != null && <Pill>Прогресс: {Math.round(clampedProgress)}%</Pill>}
                  {c.learn_course_id != null && learnMap.get(c.learn_course_id) && (
                    <Pill>
                      🦉 Уроки: {learnMap.get(c.learn_course_id)!.lessons_done}/{learnMap.get(c.learn_course_id)!.lessons_total}
                    </Pill>
                  )}
                </div>
                {c.locked && (
                  <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
                    🔒 {c.lock_reason || 'Курс пока закрыт программой обучения'}
                  </div>
                )}
                {c.learn_course_id != null && !c.locked && (
                  <Link
                    to={`/learn/${c.learn_course_id}`}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#58cc02] px-3 py-2 text-xs font-extrabold uppercase text-white shadow-[0_3px_0_#46a302] transition hover:brightness-110"
                  >
                    Продолжить уроки
                  </Link>
                )}
                {c.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 text-xs">
                    {c.tags.map(tag => (
                      <TagBadge key={tag.id} tag={tag} compact />
                    ))}
                  </div>
                )}
                <div className="h-2 w-full overflow-hidden rounded bg-white/10">
                  <div
                    className="h-2 rounded bg-white"
                    style={{ width: `${clampedProgress != null ? clampedProgress : 0}%` }}
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-white/60">
                    Учебные материалы
                  </div>
                  {attachments.length === 0 ? (
                    <div className="text-xs text-white/60">
                      Материалы ещё не добавлены.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {attachments.map((link) => (
                        <div
                          key={`${link.kind}-${link.id}`}
                          className="flex items-center gap-3 rounded border border-white/10 bg-white/0 px-3 py-2 text-sm"
                        >
                          {link.kind === 'page' ? (
                            <Link
                              to={`/pages/${link.page_id}`}
                              className="flex-1 min-w-0 truncate hover:underline"
                            >
                              {link.page_title}
                            </Link>
                          ) : (
                            <div className="flex-1 min-w-0">
                              <a
                                href={`${link.pdf_url}${link.page_number ? `#page=${link.page_number}` : ''}`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 hover:underline"
                              >
                                <FileText className="h-4 w-4" />
                                <span className="truncate">{link.title}</span>
                                <ExternalLink className="h-3 w-3 opacity-60" />
                              </a>
                              {link.page_number != null && (
                                <div className="text-xs text-white/60">Стр. {link.page_number}</div>
                              )}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              link.kind === 'page'
                                ? togglePageLinkDone(link)
                                : togglePdfLinkDone(link)
                            }
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/0 text-white/80 transition hover:bg-white/10"
                            title={link.done ? 'Снять отметку' : 'Отметить пройденным'}
                            aria-label={link.done ? 'Снять отметку' : 'Отметить пройденным'}
                          >
                            {link.done ? (
                              <CircleCheck className="h-4 w-4 text-brand-mint" />
                            ) : (
                              <Circle className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              link.kind === 'page' ? removePageLink(link) : removePdfLink(link)
                            }
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-red-400/40 bg-red-500/10 text-red-200 transition hover:bg-red-500/20"
                            title="Удалить"
                            aria-label="Удалить материал"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setPickerCourseId(c.id)}
                    className="text-xs px-3 py-1.5 rounded-full border border-white/15 text-white/80 hover:bg-white/10 transition"
                  >
                    Добавить материал
                  </button>
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
            <select
              className="px-3 py-2 rounded bg-white/10 w-full"
              value={editing.learn_course_id != null ? String(editing.learn_course_id) : ''}
              onChange={e => setEditing({ ...editing, learn_course_id: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">Без курса-тренировки</option>
              {learnCourses.map(course => (
                <option key={course.id} value={course.id}>
                  {course.icon || '📘'} {course.title} — пройдено {course.progress_pct}%
                </option>
              ))}
            </select>
            <div className="text-xs text-white/60">
              Прогресс курса рассчитывается автоматически: пройденные уроки курса-тренировки и отмеченные материалы.
              Он же идёт в общий прогресс выбранного языка.
            </div>
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

      <Modal
        open={Boolean(pickerCourse)}
        onClose={() => setPickerCourseId(null)}
        contentClassName="w-full max-w-3xl rounded-2xl border border-white/20 bg-black p-6 shadow-2xl max-h-[80vh] overflow-hidden flex flex-col"
      >
        {pickerCourse && (
          <div className="flex h-full flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Материалы курса</div>
                <div className="text-sm opacity-70">{pickerCourse.title}</div>
              </div>
              <button
                onClick={() => setPickerCourseId(null)}
                className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-xs"
              >
                Закрыть
              </button>
            </div>

            <SiteSearch
              sections={['pages', 'pdfBookmarks']}
              className="bg-black/25 border-white/15"
              placeholder="Поиск по страницам и PDF закладкам..."
              onSelectPage={(page) => {
                if (!pickerCourse) return;
                if (pickerAttachments.some((link) => link.kind === 'page' && link.page_id === page.id)) return;
                handleAttachPage(pickerCourse.id, page.id);
              }}
              onSelectPdfBookmark={(bookmark) => {
                if (!pickerCourse) return;
                if (
                  pickerAttachments.some(
                    (link) =>
                      link.kind === 'pdf' &&
                      link.pdf_url === bookmark.pdf_url &&
                      (link.page_number ?? null) === (bookmark.page_number ?? null) &&
                      link.title.trim().toLowerCase() === bookmark.marker_title.trim().toLowerCase(),
                  )
                ) {
                  return;
                }
                handleAttachPdfBookmark(pickerCourse.id, bookmark);
              }}
            />

            <div className="flex-1 overflow-y-auto pr-1">
              {pickerAttachments.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-xs uppercase opacity-60">Уже прикреплены</div>
                  <div className="space-y-1">
                    {pickerAttachments.map((link) => (
                      <div
                        key={`${link.kind}-${link.id}`}
                        className="flex items-center justify-between gap-3 px-3 py-2 rounded border border-white/10 bg-white/5"
                      >
                        {link.kind === 'page' ? (
                          <Link to={`/pages/${link.page_id}`} className="flex-1 min-w-0 truncate hover:underline">
                            {link.page_title}
                          </Link>
                        ) : (
                          <div className="flex-1 min-w-0">
                            <a
                              href={`${link.pdf_url}${link.page_number ? `#page=${link.page_number}` : ''}`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2 hover:underline"
                            >
                              <FileText className="h-4 w-4" />
                              <span className="truncate">{link.title}</span>
                              <ExternalLink className="h-3 w-3 opacity-60" />
                            </a>
                            {link.page_number != null && (
                              <div className="text-xs opacity-60">Стр. {link.page_number}</div>
                            )}
                          </div>
                        )}
                        <button
                          onClick={() =>
                            link.kind === 'page' ? togglePageLinkDone(link) : togglePdfLinkDone(link)
                          }
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/0 text-white/80 transition hover:bg-white/10"
                          title={link.done ? 'Снять отметку' : 'Отметить пройденным'}
                          aria-label={link.done ? 'Снять отметку' : 'Отметить пройденным'}
                        >
                          {link.done ? (
                            <CircleCheck className="h-4 w-4 text-brand-mint" />
                          ) : (
                            <Circle className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={() =>
                            link.kind === 'page' ? removePageLink(link) : removePdfLink(link)
                          }
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-red-400/40 bg-red-500/10 text-red-200 transition hover:bg-red-500/20"
                          title="Удалить"
                          aria-label="Удалить материал"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-white/60">Материалы ещё не добавлены.</div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </Shell>
  );
}

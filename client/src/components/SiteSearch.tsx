import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { matchCommands, SearchCommand } from './searchCommands';
import TagBadge from './tags/TagBadge';
import { api } from '../api';

type SearchTag = {
  id: number;
  label: string;
  color: string;
  page_count?: number;
};

type SearchPage = {
  id: number;
  title: string;
  snippet?: string;
  updated_at?: string;
  created_at?: string;
  pinned?: boolean;
  tags: SearchTag[];
};

type SearchPdfBookmark = {
  id: string;
  marker_title: string;
  page_number?: number | null;
  pdf_url: string;
  pdf_title: string;
  original_name?: string | null;
  page_id: number;
  page_title: string;
  marker_done?: boolean;
};

type SearchLanguage = {
  id: number;
  name: string;
  level?: string | null;
  minutes_today?: number | null;
  image_url?: string | null;
  banner_url?: string | null;
  tags: SearchTag[];
};

type SearchCourse = {
  id: number;
  title: string;
  provider?: string | null;
  progress?: number | null;
  status?: string | null;
  course_type?: string | null;
  tags: SearchTag[];
};

type SearchTravel = {
  id: number;
  title: string;
  location?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  status?: string | null;
  tags: SearchTag[];
};

type SearchLoan = {
  id: number;
  bank: string;
  payment_monthly?: number | null;
  remaining?: number | null;
  due_day?: string | null;
  tags: SearchTag[];
};

type SearchHabit = {
  id: number;
  title: string;
  target_per_week?: number | null;
  done_this_week?: number | null;
  tags: SearchTag[];
};

type SearchCalendarEvent = {
  id: number;
  date: string;
  title: string;
  type: string;
  mood?: number | null;
  tags: SearchTag[];
};

type SearchGoal = {
  id: number;
  title: string;
  target: number;
  completed: number;
  status: string;
  completion_pct: number;
  streak_current?: number;
  streak_best?: number;
  archived_at?: string | null;
  created_at?: string | null;
};

type SearchLearnCourse = { id: number; title: string; description?: string | null; icon?: string | null };
type SearchLearnLesson = { id: number; title: string; description?: string | null; course_id: number; course_title: string; icon?: string | null };
type SearchVocab = { id: number; term: string; translation: string; note?: string | null; language_id: number; language_name: string };
type SearchAchievement = { id: number; title: string; description?: string | null; icon: string; earned: boolean };

type SearchResponse = {
  learn_courses: SearchLearnCourse[];
  learn_lessons: SearchLearnLesson[];
  vocab: SearchVocab[];
  achievements: SearchAchievement[];
  tags: SearchTag[];
  selected_tag: SearchTag | null;
  tag_matches: SearchTag[];
  pages: SearchPage[];
  pdf_bookmarks: SearchPdfBookmark[];
  languages: SearchLanguage[];
  courses: SearchCourse[];
  travel: SearchTravel[];
  loans: SearchLoan[];
  habits: SearchHabit[];
  calendar: SearchCalendarEvent[];
  goals: SearchGoal[];
};

type SearchSection =
  | 'pages'
  | 'pdfBookmarks'
  | 'languages'
  | 'courses'
  | 'travel'
  | 'loans'
  | 'habits'
  | 'calendar'
  | 'goals';

type SiteSearchProps = {
  onSelectPage?: (page: SearchPage) => void;
  onSelectPdfBookmark?: (bookmark: SearchPdfBookmark) => void;
  sections?: SearchSection[];
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  initialTagId?: number | null;
  /** Вызывается после перехода по быстрой команде (например, закрыть окно поиска). */
  onNavigate?: () => void;
};

const DEFAULT_SECTIONS: SearchSection[] = [
  'pages',
  'pdfBookmarks',
  'languages',
  'courses',
  'travel',
  'loans',
  'habits',
  'calendar',
  'goals',
];
const SEARCH_DELAY = 250;
const LANGUAGE_BANNER_FALLBACKS = [
  'from-brand-mint/40 via-brand-slate/30 to-brand-night/70',
  'from-brand-slate/40 via-brand-night/40 to-brand-deep/80',
  'from-brand-mint/30 via-brand-mint/10 to-brand-night/80',
  'from-brand-night/40 via-brand-slate/25 to-brand-mint/40',
];

const hasQuery = (value: string) => value.trim().length > 0;

const nothingFound = (r: SearchResponse) =>
  [r.pages, r.pdf_bookmarks, r.languages, r.courses, r.travel, r.loans, r.habits, r.calendar, r.goals, r.learn_courses, r.learn_lessons, r.vocab, r.achievements].every(
    (list) => !list?.length
  );

export type { SearchPage, SearchPdfBookmark };

export default function SiteSearch({
  onSelectPage,
  onSelectPdfBookmark,
  sections = DEFAULT_SECTIONS,
  className = '',
  placeholder = 'Найти страницу, курс, привычку или раздел…',
  autoFocus = false,
  initialTagId = null,
  onNavigate,
}: SiteSearchProps) {
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedTagId, setSelectedTagId] = useState<number | null>(initialTagId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResponse | null>(null);

  useEffect(() => {
    setSelectedTagId(initialTagId ?? null);
  }, [initialTagId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(inputValue.trim());
    }, SEARCH_DELAY);
    return () => window.clearTimeout(timer);
  }, [inputValue]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const hasTextQuery = hasQuery(debouncedQuery);
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (hasTextQuery) params.set('q', debouncedQuery);
        if (selectedTagId) params.set('tag_id', String(selectedTagId));
        params.set('limit', '20');
        const response = await api.get(`/api/life/search?${params.toString()}`, { silentError: true });
        if (cancelled) return;
        const showPageResults = hasTextQuery || selectedTagId !== null;
        const allowSecondary = showPageResults;
        const payload: SearchResponse = {
          learn_courses: hasTextQuery ? response?.learn_courses || [] : [],
          learn_lessons: hasTextQuery ? response?.learn_lessons || [] : [],
          vocab: hasTextQuery ? response?.vocab || [] : [],
          achievements: hasTextQuery ? response?.achievements || [] : [],
          tags: response?.tags || [],
          selected_tag: response?.selected_tag || null,
          tag_matches: hasTextQuery ? response?.tag_matches || [] : [],
          pages: showPageResults ? response?.pages || [] : [],
          pdf_bookmarks: hasTextQuery ? response?.pdf_bookmarks || [] : [],
          languages: allowSecondary ? response?.languages || [] : [],
          courses: allowSecondary ? response?.courses || [] : [],
          travel: allowSecondary ? response?.travel || [] : [],
          loans: allowSecondary ? response?.loans || [] : [],
          habits: allowSecondary ? response?.habits || [] : [],
          calendar: allowSecondary ? response?.calendar || [] : [],
          goals: hasTextQuery ? response?.goals || [] : [],
        };
        setResults(payload);
        if (selectedTagId && !payload.selected_tag) {
          setSelectedTagId(null);
        }
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || 'Не удалось выполнить поиск');
        setResults(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, selectedTagId]);

  const sectionOrder = useMemo(() => {
    const allowed = new Set<SearchSection>(DEFAULT_SECTIONS);
    const seen = new Set<SearchSection>();
    const order: SearchSection[] = [];
    for (const section of sections) {
      if (allowed.has(section) && !seen.has(section)) {
        order.push(section);
        seen.add(section);
      }
    }
    if (order.length === 0) {
      for (const section of DEFAULT_SECTIONS) {
        if (!seen.has(section)) {
          order.push(section);
        }
      }
    }
    return order;
  }, [sections]);
  const tags = results?.tags || [];
  const tagMatches = results?.tag_matches || [];
  const selectedTag = results?.selected_tag || null;
  const hasTextQuery = hasQuery(debouncedQuery);
  const showPageSection = selectedTagId !== null || hasTextQuery;
  const showSecondarySections = showPageSection;

  const commandMatches = useMemo(() => matchCommands(inputValue), [inputValue]);

  const runCommand = (command: SearchCommand) => {
    navigate(command.path);
    onNavigate?.();
  };

  const clearFilters = () => {
    setInputValue('');
    setDebouncedQuery('');
    setSelectedTagId(null);
  };

  const renderSectionTitle = (title: string) => (
    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-white/60">
      <span>{title}</span>
      {loading && <span className="text-[10px] text-white/40">Загрузка…</span>}
    </div>
  );

  return (
    <div
      className={`flex max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 ${className}`.trim()}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[12rem] flex-1">
          <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && commandMatches[0]) {
                event.preventDefault();
                runCommand(commandMatches[0]);
              }
              if (event.key === 'Escape' && inputValue) {
                event.stopPropagation();
                setInputValue('');
              }
            }}
            placeholder={placeholder}
            className="w-full rounded-xl bg-black/30 py-2.5 pl-9 pr-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
            autoFocus={autoFocus}
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-white/60">
          {(hasTextQuery || selectedTagId !== null) && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-full bg-white/10 px-3 py-1 hover:bg-white/20"
            >
              Очистить
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSelectedTagId(null)}
          className={`rounded-full border px-3 py-1 text-xs ${selectedTagId === null ? 'border-white/60 bg-white/20 text-white' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'}`}
        >
          Всё
        </button>
        {tags.map((tag) => (
          <TagBadge
            key={tag.id}
            tag={tag}
            compact
            onClick={() => setSelectedTagId(tag.id)}
            className={selectedTagId === tag.id ? 'ring-1 ring-white/80' : ''}
          />
        ))}
      </div>

      {tagMatches.length > 0 && hasTextQuery && (
        <div className="mt-3 space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-white/50">Подходящие теги</div>
          <div className="flex flex-wrap gap-2">
            {tagMatches.map((tag) => (
              <TagBadge
                key={`match-${tag.id}`}
                tag={tag}
                compact
                onClick={() => setSelectedTagId(tag.id)}
              />
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>
      )}


      <div className="mt-4 flex-1 overflow-y-auto pr-1">
        <div className="space-y-4">
          {commandMatches.length > 0 && (
            <section className="space-y-2">
              {renderSectionTitle('Перейти')}
              <div className="grid gap-2 sm:grid-cols-2">
                {commandMatches.map((command, index) => (
                  <button
                    key={command.id}
                    type="button"
                    onClick={() => runCommand(command)}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left transition hover:border-brand-mint/50 hover:bg-white/10"
                  >
                    <span className="text-xl">{command.emoji}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white">{command.label}</span>
                      <span className="block truncate text-xs text-white/50">{command.hint}</span>
                    </span>
                    {index === 0 && <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60">Enter</kbd>}
                  </button>
                ))}
              </div>
            </section>
          )}
          {(results?.learn_courses?.length || 0) > 0 && (
            <section className="space-y-2">
              {renderSectionTitle('Курсы-тренировки')}
              {results!.learn_courses.map((course) => (
                <Link key={`lc-${course.id}`} to={`/learn/${course.id}`} onClick={() => onNavigate?.()} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 transition hover:border-brand-mint/50 hover:bg-white/10">
                  <span className="text-xl">{course.icon || '📘'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">{course.title}</span>
                    {course.description && <span className="block truncate text-xs text-white/50">{course.description}</span>}
                  </span>
                  <span className="text-xs text-brand-mint">Открыть →</span>
                </Link>
              ))}
            </section>
          )}
          {(results?.learn_lessons?.length || 0) > 0 && (
            <section className="space-y-2">
              {renderSectionTitle('Уроки')}
              {results!.learn_lessons.map((lesson) => (
                <Link key={`ll-${lesson.id}`} to={`/learn/lesson/${lesson.id}`} onClick={() => onNavigate?.()} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 transition hover:border-brand-mint/50 hover:bg-white/10">
                  <span className="text-xl">{lesson.icon || '⭐'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">{lesson.title}</span>
                    <span className="block truncate text-xs text-white/50">{lesson.course_title}</span>
                  </span>
                  <span className="text-xs text-brand-mint">Начать →</span>
                </Link>
              ))}
            </section>
          )}
          {(results?.vocab?.length || 0) > 0 && (
            <section className="space-y-2">
              {renderSectionTitle('Слова из словаря')}
              {results!.vocab.map((word) => (
                <Link key={`v-${word.id}`} to={`/languages?vocab=${word.language_id}`} onClick={() => onNavigate?.()} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 transition hover:border-brand-mint/50 hover:bg-white/10">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">
                      {word.term} <span className="font-normal text-white/60">— {word.translation}</span>
                    </span>
                    <span className="block truncate text-xs text-white/50">{word.language_name}{word.note ? ` · ${word.note}` : ''}</span>
                  </span>
                  <span className="text-xs text-brand-mint">Словарь →</span>
                </Link>
              ))}
            </section>
          )}
          {(results?.achievements?.length || 0) > 0 && (
            <section className="space-y-2">
              {renderSectionTitle('Ачивки')}
              {results!.achievements.map((item) => (
                <Link key={`a-${item.id}`} to="/achievements" onClick={() => onNavigate?.()} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 transition hover:border-brand-mint/50 hover:bg-white/10">
                  <span className={item.earned ? 'text-xl' : 'text-xl opacity-40 grayscale'}>{item.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">{item.title}</span>
                    <span className="block truncate text-xs text-white/50">{item.earned ? 'получена ✓' : item.description}</span>
                  </span>
                </Link>
              ))}
            </section>
          )}
          {sectionOrder.map((section) => {
          if (section === 'pages') {
            if (!showPageSection) return null;
            const pages = results?.pages ?? [];
            const hasPages = pages.length > 0;
            if (!hasPages) return null;
            return (
              <section key="pages" className="space-y-2">
                {renderSectionTitle('Страницы')}
                {hasPages ? (
                  <div className="space-y-2">
                    {pages.map((page) => (
                      <div key={page.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-white">{page.title || 'Без названия'}</div>
                            {page.tags.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {page.tags.map((tag) => (
                                  <TagBadge key={tag.id} tag={tag} compact />
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-2 text-xs text-white/50">
                            {page.updated_at && <span>Обновлено: {new Date(page.updated_at).toLocaleDateString()}</span>}
                            {onSelectPage ? (
                              <button
                                type="button"
                                onClick={() => onSelectPage(page)}
                                className="rounded bg-white px-3 py-1 text-xs font-semibold text-black hover:bg-white/90"
                              >
                                Выбрать
                              </button>
                            ) : (
                              <Link
                                to={`/pages/${page.id}`}
                                className="rounded bg-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/20"
                              >
                                Открыть
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60">No pages found.</div>
                )}
              </section>
            );
          }

          if (section === 'pdfBookmarks') {
            if (!hasTextQuery) return null;
            const bookmarks = results?.pdf_bookmarks ?? [];
            const hasBookmarks = bookmarks.length > 0;
            if (!hasBookmarks) return null;
            return (
              <section key="pdfBookmarks" className="space-y-2">
                {renderSectionTitle('Закладки PDF')}
                {hasBookmarks ? (
                  <div className="space-y-2">
                    {bookmarks.map((bookmark) => (
                      <div
                        key={bookmark.id}
                        className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/80"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white">{bookmark.marker_title}</div>
                            <div className="mt-1 text-xs text-white/60">
                              {bookmark.page_number != null ? `Стр. ${bookmark.page_number} · ` : ''}
                              {bookmark.pdf_title}
                            </div>
                            <div className="text-[11px] text-white/40">{bookmark.page_title}</div>
                          </div>
                          <div className="flex flex-col items-end gap-2 text-xs text-white/60">
                            <a
                              href={bookmark.pdf_url}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded bg-white/10 px-3 py-1 text-xs text-white/70 hover:bg-white/20"
                            >
                              Открыть PDF
                            </a>
                            <Link
                              to={`/pages/${bookmark.page_id}`}
                              className="rounded bg-white/10 px-3 py-1 text-xs text-white/70 hover:bg-white/20"
                            >
                              Страница
                            </Link>
                            {onSelectPdfBookmark && (
                              <button
                                type="button"
                                onClick={() => onSelectPdfBookmark(bookmark)}
                                className="rounded bg-white px-3 py-1 text-xs font-semibold text-black hover:bg-white/90"
                              >
                                Добавить
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60">
                    Закладок PDF не найдено.
                  </div>
                )}
              </section>
            );
          }

          if (section === 'languages') {
            if (!showSecondarySections) return null;
            const languages = results?.languages ?? [];
            const hasLanguages = languages.length > 0;
            if (!hasLanguages) return null;
            return (
              <section key="languages" className="space-y-2">
                {renderSectionTitle('Языки')}
                {hasLanguages ? (
                  <div className="grid gap-2">
                    {languages.map((item) => {
                      const fallback = LANGUAGE_BANNER_FALLBACKS[item.id % LANGUAGE_BANNER_FALLBACKS.length];
                      return (
                        <div
                          key={item.id}
                          className="relative overflow-hidden rounded-xl border border-white/10 text-sm"
                        >
                          <div className="relative h-20">
                            {item.banner_url ? (
                              <img
                                src={item.banner_url}
                                alt={item.name}
                                className="absolute inset-0 h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className={`absolute inset-0 bg-gradient-to-r ${fallback}`} />
                            )}
                            <div className="absolute inset-0 bg-black/40" />
                          </div>
                          <div className="relative space-y-1 bg-black/40 px-3 py-2 backdrop-blur-sm">
                            <div className="font-medium text-white">{item.name}</div>
                            <div className="text-xs text-white/70">
                              Уровень {item.level || '—'} • сегодня {item.minutes_today ?? 0} мин
                            </div>
                            {item.tags.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {item.tags.map((tag) => (
                                  <TagBadge key={tag.id} tag={tag} compact />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60">No languages found.</div>
                )}
              </section>
            );
          }

          if (section === 'courses') {
            if (!showSecondarySections) return null;
            const courses = results?.courses ?? [];
            const hasCourses = courses.length > 0;
            if (!hasCourses) return null;
            return (
              <section key="courses" className="space-y-2">
                {renderSectionTitle('Курсы')}
                {hasCourses ? (
                  <div className="grid gap-2">
                    {courses.map((course) => (
                      <div key={course.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                        <div className="font-medium text-white">{course.title}</div>
                        <div className="text-xs text-white/60">
                          {course.provider || 'без автора'} • {course.status === 'done' ? 'завершён' : 'в процессе'} • {course.progress ?? 0}%
                        </div>
                        {course.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {course.tags.map((tag) => (
                              <TagBadge key={tag.id} tag={tag} compact />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60">No courses found.</div>
                )}
              </section>
            );
          }

          if (section === 'travel') {
            if (!showSecondarySections) return null;
            const trips = results?.travel ?? [];
            const hasTrips = trips.length > 0;
            if (!hasTrips) return null;
            return (
              <section key="travel" className="space-y-2">
                {renderSectionTitle('Путешествия')}
                {hasTrips ? (
                  <div className="grid gap-2">
                    {trips.map((trip) => (
                      <div key={trip.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium text-white">{trip.title}</div>
                          <span className="text-[11px] uppercase tracking-wide text-white/60">{trip.status || 'planned'}</span>
                        </div>
                        {trip.location && <div className="text-xs text-white/60">{trip.location}</div>}
                        {(trip.date_from || trip.date_to) && (
                          <div className="text-[11px] text-white/50">
                            {trip.date_from || '—'} — {trip.date_to || '—'}
                          </div>
                        )}
                        {trip.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {trip.tags.map((tag) => (
                              <TagBadge key={tag.id} tag={tag} compact />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (

                  <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60">No travel found.</div>
                )}
              </section>
            );
          }

          if (section === 'loans') {
            if (!showSecondarySections) return null;
            const loans = results?.loans ?? [];
            const hasLoans = loans.length > 0;
            if (!hasLoans) return null;
            return (
              <section key="loans" className="space-y-2">
                {renderSectionTitle('Кредиты')}
                {hasLoans ? (
                  <div className="grid gap-2">
                    {loans.map((loan) => (
                      <div key={loan.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                        <div className="font-medium text-white">{loan.bank}</div>
                        <div className="text-xs text-white/60">
                          Monthly: {(loan.payment_monthly ?? 0).toLocaleString()} • Remaining: {(loan.remaining ?? 0).toLocaleString()} • Due day: {loan.due_day || '-'}
                        </div>
                        {loan.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {loan.tags.map((tag) => (
                              <TagBadge key={tag.id} tag={tag} compact />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60">No loans found.</div>
                )}
              </section>
            );
          }

          if (section === 'habits') {
            if (!showSecondarySections) return null;
            const habits = results?.habits ?? [];
            const hasHabits = habits.length > 0;
            if (!hasHabits) return null;
            return (
              <section key="habits" className="space-y-2">
                {renderSectionTitle('Привычки')}
                {hasHabits ? (
                  <div className="grid gap-2">
                    {habits.map((habit) => (
                      <div key={habit.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                        <div className="font-medium text-white">{habit.title}</div>
                        <div className="text-xs text-white/60">
                          Weekly target: {habit.target_per_week ?? 0} • Done: {habit.done_this_week ?? 0}
                        </div>
                        {habit.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {habit.tags.map((tag) => (
                              <TagBadge key={tag.id} tag={tag} compact />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60">No habits found.</div>
                )}
              </section>
            );
          }

          if (section === 'calendar') {
            if (!showSecondarySections) return null;
            const events = results?.calendar ?? [];
            const hasEvents = events.length > 0;
            if (!hasEvents) return null;
            return (
              <section key="calendar" className="space-y-2">
                {renderSectionTitle('Календарь')}
                {hasEvents ? (
                  <div className="grid gap-2">
                    {events.map((event) => (
                      <div key={event.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                        <div className="flex items-center justify-between text-xs text-white/60">
                          <span>{new Date(event.date).toLocaleDateString()}</span>
                          <span className="uppercase tracking-wide">{event.type}</span>
                        </div>
                        <div className="mt-1 text-sm font-medium text-white">{event.title}</div>
                        {typeof event.mood === 'number' && (
                          <div className="text-[11px] text-white/50">Mood: {event.mood}</div>
                        )}
                        {event.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {event.tags.map((tag) => (
                              <TagBadge key={tag.id} tag={tag} compact />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60">No calendar events found.</div>
                )}
              </section>
            );
          }

          if (section === 'goals') {
            if (!hasTextQuery) return null;
            const goals = results?.goals ?? [];
            const hasGoals = goals.length > 0;
            if (!hasGoals) return null;
            return (
              <section key="goals" className="space-y-2">
                {renderSectionTitle('Цели на год')}
                {hasGoals ? (
                  <div className="grid gap-2">
                    {goals.map((goal) => (
                      <div key={goal.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                        <div className="font-medium text-white">{goal.title}</div>
                        <div className="text-xs text-white/60">
                          {goal.completed}/{goal.target} • {goal.completion_pct}% • {goal.status === 'archived' ? 'в архиве' : 'активна'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60">No goals found.</div>
                )}
              </section>
            );
          }

          return null;

          })}
        </div>
      </div>
      {!loading && hasTextQuery && commandMatches.length === 0 && results && nothingFound(results) && (
        <div className="mt-4 rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/55">Ничего не найдено 🙈 Попробуйте другое слово.</div>
      )}
    </div>
  );
}

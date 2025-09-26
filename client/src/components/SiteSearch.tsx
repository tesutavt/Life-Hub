import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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

type SearchLanguage = {
  id: number;
  name: string;
  level?: string | null;
  minutes_today?: number | null;
};

type SearchCourse = {
  id: number;
  title: string;
  provider?: string | null;
  progress?: number | null;
  status?: string | null;
  course_type?: string | null;
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

type SearchResponse = {
  tags: SearchTag[];
  selected_tag: SearchTag | null;
  tag_matches: SearchTag[];
  pages: SearchPage[];
  languages: SearchLanguage[];
  courses: SearchCourse[];
  goals: SearchGoal[];
};

type SearchSection = 'pages' | 'languages' | 'courses' | 'goals';

type SiteSearchProps = {
  onSelectPage?: (page: SearchPage) => void;
  sections?: SearchSection[];
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  initialTagId?: number | null;
};

const DEFAULT_SECTIONS: SearchSection[] = ['pages', 'languages', 'courses', 'goals'];
const SEARCH_DELAY = 250;

const hasQuery = (value: string) => value.trim().length > 0;

export type { SearchPage };

export default function SiteSearch({
  onSelectPage,
  sections = DEFAULT_SECTIONS,
  className = '',
  placeholder = 'Search anything...',
  autoFocus = false,
  initialTagId = null,
}: SiteSearchProps) {
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
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (hasQuery(debouncedQuery)) params.set('q', debouncedQuery);
        if (selectedTagId) params.set('tag_id', String(selectedTagId));
        params.set('limit', '20');
        const response = await api.get(`/api/life/search?${params.toString()}`, { silentError: true });
        if (cancelled) return;
        const payload: SearchResponse = {
          tags: response?.tags || [],
          selected_tag: response?.selected_tag || null,
          tag_matches: response?.tag_matches || [],
          pages: response?.pages || [],
          languages: response?.languages || [],
          courses: response?.courses || [],
          goals: response?.goals || [],
        };
        setResults(payload);
        if (selectedTagId && !payload.selected_tag) {
          setSelectedTagId(null);
        }
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || 'Unable to load search results');
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

  const activeSections = useMemo(() => new Set(sections), [sections]);
  const tags = results?.tags || [];
  const tagMatches = results?.tag_matches || [];
  const selectedTag = results?.selected_tag || null;

  const clearFilters = () => {
    setInputValue('');
    setDebouncedQuery('');
    setSelectedTagId(null);
  };

  const renderSectionTitle = (title: string) => (
    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-white/60">
      <span>{title}</span>
      {loading && <span className="text-[10px] text-white/40">Loading...</span>}
    </div>
  );

  return (
    <div className={`rounded-2xl border border-white/10 bg-white/5 p-4 ${className}`.trim()}>
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          placeholder={placeholder}
          className="flex-1 min-w-[12rem] rounded-xl bg-black/30 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
          autoFocus={autoFocus}
        />
        <div className="flex items-center gap-2 text-xs text-white/60">
          {(hasQuery(debouncedQuery) || selectedTagId !== null) && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-full bg-white/10 px-3 py-1 hover:bg-white/20"
            >
              Clear
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

      {tagMatches.length > 0 && hasQuery(debouncedQuery) && (
        <div className="mt-3 space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-white/50">Matching tags</div>
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

      <div className="mt-4 space-y-4">
        {activeSections.has('pages') && (
          <section className="space-y-2">
            {renderSectionTitle('Pages')}
            {results?.pages?.length ? (
              <div className="space-y-2">
                {results.pages.map((page) => (
                  <div
                    key={page.id}
                    className="rounded-xl border border-white/10 bg-white/5 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">{page.title || 'Untitled page'}</div>
                        {page.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {page.tags.map((tag) => (
                              <TagBadge key={tag.id} tag={tag} compact />
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 text-xs text-white/50">
                        {page.updated_at && <span>Updated: {new Date(page.updated_at).toLocaleDateString()}</span>}
                        {onSelectPage ? (
                          <button
                            type="button"
                            onClick={() => onSelectPage(page)}
                            className="rounded bg-white px-3 py-1 text-xs font-semibold text-black hover:bg-white/90"
                          >
                            Select
                          </button>
                        ) : (
                          <Link
                            to={`/pages/${page.id}`}
                            className="rounded bg-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/20"
                          >
                            Open
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
        )}

        {activeSections.has('languages') && hasQuery(debouncedQuery) && (
          <section className="space-y-2">
            {renderSectionTitle('Languages')}
            {results?.languages?.length ? (
              <div className="grid gap-2">
                {results.languages.map((item) => (
                  <div key={item.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                    <div className="font-medium text-white">{item.name}</div>
                    <div className="text-xs text-white/60">
                      Level: {item.level || 'n/a'} � Today: {item.minutes_today ?? 0} min
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60">No languages found.</div>
            )}
          </section>
        )}

        {activeSections.has('courses') && hasQuery(debouncedQuery) && (
          <section className="space-y-2">
            {renderSectionTitle('Courses')}
            {results?.courses?.length ? (
              <div className="grid gap-2">
                {results.courses.map((course) => (
                  <div key={course.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                    <div className="font-medium text-white">{course.title}</div>
                    <div className="text-xs text-white/60">
                      {course.provider || 'No provider'} � Status: {course.status || 'in-progress'} � {course.progress ?? 0}%
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60">No courses found.</div>
            )}
          </section>
        )}

        {activeSections.has('goals') && hasQuery(debouncedQuery) && (
          <section className="space-y-2">
            {renderSectionTitle('Year goals')}
            {results?.goals?.length ? (
              <div className="grid gap-2">
                {results.goals.map((goal) => (
                  <div key={goal.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                    <div className="font-medium text-white">{goal.title}</div>
                    <div className="text-xs text-white/60">
                      {goal.completed}/{goal.target} � {goal.completion_pct}% � Status: {goal.status}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60">No goals found.</div>
            )}
          </section>
        )}
      </div>

      {!loading && !error && !results?.pages?.length && !hasQuery(debouncedQuery) && selectedTagId === null && (
        <div className="mt-6 rounded border border-white/10 bg-white/5 px-3 py-4 text-sm text-white/60">
          Use search or pick a tag to explore your content.
        </div>
      )}
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Pin, PinOff, Tag as TagIcon, X } from 'lucide-react';
import Shell from '../components/Shell';
import { api } from '../api';
import TagManager from '../components/tags/TagManager';
import TagSelector from '../components/tags/TagSelector';
import TagBadge from '../components/tags/TagBadge';

const uuid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));

type Tag = {
  id: number;
  label: string;
  color: string;
  page_count?: number;
};

type PageRow = {
  id: number;
  title: string | null;
  blocks_json?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  page_date?: string | null;
  pinned?: boolean;
  tags: Tag[];
  bannerUrl?: string | null;
  bannerGradient?: string | null;
};

const DEFAULT_PAGE_GRADIENT = 'linear-gradient(135deg, rgba(59, 130, 246, 0.65) 0%, rgba(236, 72, 153, 0.6) 100%)';

const extractPreview = (blocksJson?: string | null) => {
  if (!blocksJson) return '';
  try {
    const blocks = JSON.parse(blocksJson);
    if (!Array.isArray(blocks)) return '';
    const firstWithText = blocks.find((entry: any) => typeof entry?.text === 'string' && entry.text.trim());
    return (firstWithText?.text || '').trim();
  } catch {
    return '';
  }
};

export default function Pages() {
  const [items, setItems] = useState<PageRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [tagSelectorFor, setTagSelectorFor] = useState<number | null>(null);
  const tagManagerRef = useRef<HTMLDivElement | null>(null);
  const nav = useNavigate();

  const loadPages = useCallback(async () => {
    const response = await api.get('/api/life/pages', { silentError: true });
    const normalized: PageRow[] = (response.items || []).map((row: any) => ({
      id: row.id,
      title: row.title,
      blocks_json: row.blocks_json || null,
      updated_at: row.updated_at,
      created_at: row.created_at,
      page_date: row.page_date,
      pinned: !!row.pinned,
      bannerUrl: row.banner_url ?? row.bannerUrl ?? null,
      bannerGradient: row.banner_gradient ?? row.bannerGradient ?? null,
      tags: Array.isArray(row.tags)
        ? row.tags.map((tag: any) => ({
            id: tag.id,
            label: tag.label,
            color: tag.color,
            page_count: tag.page_count,
          }))
        : [],
    }));
    setItems(normalized);
  }, []);

  const loadTags = useCallback(async () => {
    setLoadingTags(true);
    try {
      const response = await api.get('/api/life/pages/tags', { silentError: true });
      setTags(response?.items || []);
    } finally {
      setLoadingTags(false);
    }
  }, []);

  useEffect(() => {
    loadPages();
    loadTags();
  }, [loadPages, loadTags]);

  const create = async () => {
    setCreating(true);
    try {
      const result = await api.post('/api/life/pages', {
        title: 'Untitled page',
        blocks: [{ id: uuid(), type: 'text', text: '' }],
      });
      await loadPages();
      nav(`/pages/${result.id}`);
    } finally {
      setCreating(false);
    }
  };

  const togglePin = async (pageId: number, current: boolean) => {
    setItems((prev) => prev.map((item) => (item.id === pageId ? { ...item, pinned: !current } : item)));
    try {
      await api.put(`/api/life/pages/${pageId}`, { pinned: !current });
      await loadPages();
    } catch (err) {
      console.error(err);
      setItems((prev) => prev.map((item) => (item.id === pageId ? { ...item, pinned: current } : item)));
    }
  };

  const handleUpdatePageTags = useCallback(
    async (pageId: number, nextTagIds: number[]) => {
      const response = await api.put(`/api/life/pages/${pageId}/tags`, { tags: nextTagIds }, { silentSuccess: true });
      const updatedTags: Tag[] = Array.isArray(response?.tags)
        ? response.tags.map((tag: any) => ({ id: tag.id, label: tag.label, color: tag.color, page_count: tag.page_count }))
        : [];
      setItems((prev) =>
        prev.map((item) => (item.id === pageId ? { ...item, tags: updatedTags } : item))
      );
      await loadTags();
    },
    [loadTags]
  );

  const handleTagCreate = useCallback(
    async (draft: { label: string; color: string }) => {
      await api.post('/api/life/pages/tags', draft);
      await loadTags();
    },
    [loadTags]
  );

  const handleTagUpdate = useCallback(
    async (id: number, draft: { label: string; color: string }) => {
      await api.put(`/api/life/pages/tags/${id}`, draft);
      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          tags: item.tags.map((tag) => (tag.id === id ? { ...tag, label: draft.label, color: draft.color } : tag)),
        }))
      );
      await loadTags();
    },
    [loadTags]
  );

  const handleTagDelete = useCallback(
    async (id: number) => {
      await api.del(`/api/life/pages/tags/${id}`);
      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          tags: item.tags.filter((tag) => tag.id !== id),
        }))
      );
      await loadTags();
    },
    [loadTags]
  );

  const formatted = useMemo(
    () =>
      items.map((row) => ({
        ...row,
        preview: extractPreview(row.blocks_json),
        updatedLabel: row.updated_at ? new Date(row.updated_at).toLocaleString() : '-',
        pinned: !!row.pinned,
      })),
    [items]
  );

  return (
    <Shell>
      <div className="flex items-center justify-between mb-4">
        <div className="text-2xl font-semibold">Pages</div>
        <button onClick={create} disabled={creating} className="px-4 py-2 rounded bg-white text-black">
          {creating ? 'Creating...' : 'New page'}
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="rounded-2xl border border-white/10 bg-white/5">
          {formatted.length === 0 ? (
            <div className="p-4 text-sm text-white/60">No pages yet.</div>
          ) : (
            <div className="divide-y divide-white/10">
              {formatted.map((item) => (
                <div key={item.id} className="px-4 py-4">
                  <div className="flex flex-col gap-3">
                    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                      {item.bannerUrl ? (
                        <img
                          src={item.bannerUrl}
                          alt="Предпросмотр баннера"
                          className="absolute inset-0 h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div
                          className="absolute inset-0"
                          style={{
                            backgroundImage: item.bannerGradient || DEFAULT_PAGE_GRADIENT,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                          }}
                        />
                      )}
                      <div className="absolute inset-0 z-20 bg-gradient-to-br from-black/70 via-black/40 to-black/70" />
                      <div className="relative z-30 flex h-full flex-col justify-between p-4 text-white">
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-xs font-medium text-white/80">
                            Обновлено: {item.updatedLabel}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                togglePin(item.id, !!item.pinned);
                              }}
                              className={`flex h-9 w-9 items-center justify-center rounded-full border transition ${
                                item.pinned
                                  ? 'border-amber-400/60 bg-amber-300 text-black hover:bg-amber-200'
                                  : 'border-white/15 bg-black/30 text-white/80 hover:bg-white/20'
                              }`}
                              title={item.pinned ? 'Открепить страницу' : 'Закрепить страницу'}
                              aria-label={item.pinned ? 'Открепить страницу' : 'Закрепить страницу'}
                            >
                              {item.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setTagSelectorFor((prev) => (prev === item.id ? null : item.id));
                              }}
                              className={`flex h-9 w-9 items-center justify-center rounded-full border transition ${
                                tagSelectorFor === item.id
                                  ? 'border-white/20 bg-white/20 text-white'
                                  : 'border-white/15 bg-black/30 text-white/80 hover:bg-white/20'
                              }`}
                              title={tagSelectorFor === item.id ? 'Скрыть управление тегами' : 'Управлять тегами'}
                              aria-label={tagSelectorFor === item.id ? 'Скрыть управление тегами' : 'Управлять тегами'}
                            >
                              {tagSelectorFor === item.id ? <X className="h-4 w-4" /> : <TagIcon className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                        <Link
                          to={`/pages/${item.id}`}
                          className="mt-auto block space-y-2"
                          aria-label={`Открыть страницу ${item.title?.trim() || 'без названия'}`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-lg font-semibold leading-tight line-clamp-2">
                              {item.title?.trim() || 'Untitled page'}
                            </div>
                            {item.pinned && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-300/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black">
                                Pinned
                              </span>
                            )}
                          </div>
                          {item.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 text-xs text-white/80">
                              {item.tags.map((tag) => (
                                <TagBadge key={tag.id} tag={tag} compact />
                              ))}
                            </div>
                          )}
                        </Link>
                      </div>
                    </div>
                    {tagSelectorFor === item.id && (
                      <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                        <TagSelector
                          tags={tags}
                          selectedIds={item.tags.map((tag) => tag.id)}
                          onChange={(ids) => handleUpdatePageTags(item.id, ids)}
                          onManageTags={() => tagManagerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                          emptyState={loadingTags ? 'Loading tags...' : undefined}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div ref={tagManagerRef} className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <TagManager
            tags={tags}
            loading={loadingTags}
            onCreate={handleTagCreate}
            onUpdate={handleTagUpdate}
            onDelete={handleTagDelete}
          />
        </div>
      </div>
    </Shell>
  );
}

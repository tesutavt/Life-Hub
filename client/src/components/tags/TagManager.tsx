import React, { FormEvent, useMemo, useState } from 'react';
import TagBadge from './TagBadge';

type Tag = {
  id: number;
  label: string;
  color: string;
  page_count?: number;
};

type TagDraft = {
  label: string;
  color: string;
};

type TagManagerProps = {
  tags: Tag[];
  loading?: boolean;
  onCreate: (draft: TagDraft) => Promise<void> | void;
  onUpdate: (id: number, draft: TagDraft) => Promise<void> | void;
  onDelete: (id: number) => Promise<void> | void;
};

const DEFAULT_COLOR = '#6366F1';

const normalizeHex = (value: string) => {
  if (typeof value !== 'string') return DEFAULT_COLOR;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return ('#' + trimmed).toUpperCase();
  return DEFAULT_COLOR;
};

export default function TagManager({ tags, loading, onCreate, onUpdate, onDelete }: TagManagerProps) {
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<TagDraft>({ label: '', color: DEFAULT_COLOR });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<TagDraft>({ label: '', color: DEFAULT_COLOR });
  const [busyTagId, setBusyTagId] = useState<number | null>(null);

  const sorted = useMemo(() => [...tags].sort((a, b) => a.label.localeCompare(b.label, 'ru', { sensitivity: 'base' })), [tags]);

  const resetCreateForm = () => setCreateDraft({ label: '', color: DEFAULT_COLOR });

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    const label = createDraft.label.trim();
    if (!label) return;
    setCreating(true);
    try {
      await onCreate({ label, color: normalizeHex(createDraft.color) });
      resetCreateForm();
    } finally {
      setCreating(false);
    }
  };

  const startEditing = (tag: Tag) => {
    setEditingId(tag.id);
    setEditDraft({ label: tag.label, color: tag.color || DEFAULT_COLOR });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditDraft({ label: '', color: DEFAULT_COLOR });
  };

  const saveEdit = async () => {
    if (editingId == null) return;
    const label = editDraft.label.trim();
    if (!label) return;
    setBusyTagId(editingId);
    try {
      await onUpdate(editingId, { label, color: normalizeHex(editDraft.color) });
      cancelEditing();
    } finally {
      setBusyTagId(null);
    }
  };

  const removeTag = async (id: number) => {
    if (!window.confirm('Delete this tag?')) return;
    setBusyTagId(id);
    try {
      await onDelete(id);
    } finally {
      setBusyTagId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="text-sm font-semibold uppercase tracking-wide text-white/70">Тэги</div>
        <form onSubmit={handleCreate} className="flex flex-wrap gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
          <input
            type="text"
            placeholder="Название"
            value={createDraft.label}
            onChange={(event) => setCreateDraft((prev) => ({ ...prev, label: event.target.value }))}
            className="flex-1 min-w-[180px] rounded-lg bg-black/20 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
          />
          <input
            type="color"
            value={createDraft.color}
            onChange={(event) => setCreateDraft((prev) => ({ ...prev, color: normalizeHex(event.target.value) }))}
            className="h-10 w-14 cursor-pointer rounded-lg border border-white/10 bg-black/20"
            title="Tag color"
          />
          <button
            type="submit"
            disabled={creating || loading}
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating ? 'Создается...' : 'Создать'}
          </button>
        </form>
      </div>

      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-white/60">Список тэгов</div>
        {sorted.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-white/60">
            Нет тэгов. Создайте свой первый тэг.
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((tag) => {
              const isEditing = editingId === tag.id;
              const isBusy = busyTagId === tag.id;
              return (
                <div
                  key={tag.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <TagBadge tag={tag} />
                    <div className="text-xs text-white/60">{tag.page_count || 0} страницы</div>
                  </div>
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editDraft.label}
                        onChange={(event) => setEditDraft((prev) => ({ ...prev, label: event.target.value }))}
                        className="rounded bg-black/20 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
                      />
                      <input
                        type="color"
                        value={editDraft.color}
                        onChange={(event) => setEditDraft((prev) => ({ ...prev, color: normalizeHex(event.target.value) }))}
                        className="h-8 w-12 cursor-pointer rounded border border-white/10 bg-black/20"
                      />
                      <button
                        type="button"
                        onClick={saveEdit}
                        disabled={isBusy}
                        className="rounded bg-white px-3 py-1 text-xs font-semibold text-black hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="rounded bg-white/10 px-3 py-1 text-xs text-white/70 hover:bg-white/20"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => startEditing(tag)}
                        className="rounded bg-white/10 px-3 py-1 text-white/80 hover:bg-white/20"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeTag(tag.id)}
                        disabled={isBusy}
                        className="rounded bg-red-500/20 px-3 py-1 text-red-100 hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

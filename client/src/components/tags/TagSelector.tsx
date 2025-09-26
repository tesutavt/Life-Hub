import React, { useMemo } from 'react';
import TagBadge from './TagBadge';

type Tag = {
  id: number;
  label: string;
  color: string;
};

type TagSelectorProps = {
  tags: Tag[];
  selectedIds: number[];
  onChange: (next: number[]) => void;
  onManageTags?: () => void;
  emptyState?: React.ReactNode;
};

const sortByProvidedOrder = (ids: number[], order: Tag[]) => {
  const indexMap = new Map(order.map((tag, index) => [tag.id, index]));
  return [...ids].sort((a, b) => (indexMap.get(a) ?? 0) - (indexMap.get(b) ?? 0));
};

export default function TagSelector({ tags, selectedIds, onChange, onManageTags, emptyState }: TagSelectorProps) {
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleTag = (tagId: number, checked: boolean) => {
    if (checked) {
      const next = sortByProvidedOrder([...selectedSet, tagId], tags);
      onChange(next);
    } else {
      const next = selectedIds.filter((id) => id !== tagId);
      onChange(next);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Page tags</div>
        {onManageTags && (
          <button
            type="button"
            className="text-xs text-white/70 hover:text-white"
            onClick={onManageTags}
          >
            Manage tags
          </button>
        )}
      </div>
      {tags.length === 0 ? (
        <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">
          {emptyState ?? 'No tags yet. Create them in the manager.'}
        </div>
      ) : (
        <div className="grid gap-2">
          {tags.map((tag) => (
            <label
              key={tag.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10"
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedSet.has(tag.id)}
                  onChange={(event) => toggleTag(tag.id, event.target.checked)}
                  className="accent-white h-4 w-4"
                />
                <TagBadge tag={tag} compact />
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

import React, { useMemo, useState, useEffect } from 'react';
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
  label?: React.ReactNode;
  className?: string;
};

const sortByProvidedOrder = (ids: number[], order: Tag[]) => {
  const indexMap = new Map(order.map((tag, index) => [tag.id, index]));
  return [...ids].sort((a, b) => (indexMap.get(a) ?? 0) - (indexMap.get(b) ?? 0));
};

export default function TagSelector({
  tags,
  selectedIds,
  onChange,
  onManageTags,
  emptyState,
  label,
  className = '',
}: TagSelectorProps) {
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const [isOpen, setIsOpen] = useState(() => selectedIds.length > 0);

  useEffect(() => {
    if (selectedIds.length > 0) {
      setIsOpen(true);
    }
  }, [selectedIds.length]);

  const toggleTag = (tagId: number, checked: boolean) => {
    if (checked) {
      const next = sortByProvidedOrder([...selectedSet, tagId], tags);
      onChange(next);
    } else {
      const next = selectedIds.filter((id) => id !== tagId);
      onChange(next);
    }
  };

  const heading = label ?? 'Page tags';
  const hasSelected = selectedIds.length > 0;

  return (
    <div className={`space-y-3 ${className}`.trim()}>
      {heading ? (

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className="flex items-center gap-2 text-left text-sm font-medium text-white/80 transition hover:text-white"
            onClick={() => setIsOpen((value) => !value)}
          >
            <span
              className={`inline-block text-xs transition-transform duration-150 ${
                isOpen ? 'rotate-90' : ''
              }`}
            >
              ▸
            </span>
            <span>{heading}</span>
            {hasSelected ? (
              <span className="text-xs font-normal text-white/60">({selectedIds.length})</span>
            ) : null}
          </button>
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
      ) : null}
      {!isOpen && hasSelected ? (
        <div className="flex flex-wrap gap-2">
          {sortByProvidedOrder(selectedIds, tags)
            .map((id) => tags.find((tag) => tag.id === id))
            .filter(Boolean)
            .map((tag) => (
              <TagBadge key={tag!.id} tag={tag!} compact />
            ))}
        </div>
      ) : null}
      {isOpen ? (
        tags.length === 0 ? (
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
        )
      ) : null}
    </div>
  );
}

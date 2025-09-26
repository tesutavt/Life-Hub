import React from 'react';

type Tag = {
  id: number;
  label: string;
  color: string;
};

type TagBadgeProps = {
  tag: Tag;
  className?: string;
  compact?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
};

const clampAlpha = (value: number) => Math.min(1, Math.max(0, value));

const hexToRgba = (hex: string, alpha = 0.2) => {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    const safe = clampAlpha(alpha);
    return `rgba(99, 102, 241, ${safe.toFixed(2)})`;
  }
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const safe = clampAlpha(alpha);
  return `rgba(${r}, ${g}, ${b}, ${safe.toFixed(2)})`;
};

export default function TagBadge({ tag, className = '', compact = false, onClick, onRemove }: TagBadgeProps) {
  const background = hexToRgba(tag.color, 0.16);
  const border = hexToRgba(tag.color, 0.35);
  const textColor = /^#[0-9a-fA-F]{6}$/.test(tag.color) ? tag.color : '#6366F1';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 ${compact ? 'py-0.5 text-[11px]' : 'py-1 text-xs'} font-medium transition-colors ${onClick ? 'cursor-pointer hover:opacity-90' : ''} ${className}`.trim()}
      style={{ backgroundColor: background, borderColor: border, color: textColor }}
      onClick={onClick}
    >
      <span className="truncate max-w-[10rem]">{tag.label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-black/20 text-[10px] hover:bg-black/40"
          aria-label="Remove tag"
        >
          x
        </button>
      )}
    </span>
  );
}

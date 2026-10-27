import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

type Props = {
  collapsed: boolean;
  onToggle: () => void;
  expandedLabel?: string;
  collapsedLabel?: string;
  className?: string;
  /** Только иконка-шеврон, без подписи */
  compact?: boolean;
};

export default function CollapseToggle({
  collapsed,
  onToggle,
  expandedLabel = "Свернуть",
  collapsedLabel = "Развернуть",
  className,
  compact,
}: Props) {
  const label = collapsed ? collapsedLabel : expandedLabel;
  if (compact) {
    return (
      <button
        type="button"
        onClick={onToggle}
        title={label}
        aria-label={label}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white ${className ?? ""}`}
      >
        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`} />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center gap-1 rounded-full border border-white/20 px-3 py-1 text-xs uppercase tracking-wide text-white/70 transition hover:border-white/40 hover:text-white ${className ?? ""}`}
    >
      {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      <span>{label}</span>
    </button>
  );
}

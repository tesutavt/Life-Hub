import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

type Props = {
  collapsed: boolean;
  onToggle: () => void;
  expandedLabel?: string;
  collapsedLabel?: string;
  className?: string;
};

export default function CollapseToggle({
  collapsed,
  onToggle,
  expandedLabel = "Свернуть",
  collapsedLabel = "Развернуть",
  className,
}: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center gap-1 rounded-full border border-white/20 px-3 py-1 text-xs uppercase tracking-wide text-white/70 transition hover:border-white/40 hover:text-white ${className ?? ""}`}
    >
      {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      <span>{collapsed ? collapsedLabel : expandedLabel}</span>
    </button>
  );
}

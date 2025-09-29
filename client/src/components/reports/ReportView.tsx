import React from "react";
import { TrendingUp, TrendingDown, Minus, Sparkles } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ReportData, ReportItem, ReportSection, ReportTrend } from "../../types/reports";

const numberFormatter = new Intl.NumberFormat("ru-RU");
const dateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
});

const formatNumber = (value: number) => numberFormatter.format(Math.round(value));

const TrendBadge = ({ trend }: { trend: ReportTrend }) => {
  if (trend === "up") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-300 px-2 py-0.5 text-xs">
        <TrendingUp className="w-3 h-3" /> Рост
      </span>
    );
  }
  if (trend === "down") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 text-rose-300 px-2 py-0.5 text-xs">
        <TrendingDown className="w-3 h-3" /> Снижение
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 text-white/70 px-2 py-0.5 text-xs">
      <Minus className="w-3 h-3" /> Без изменений
    </span>
  );
};

const SummaryStat = ({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) => (
  <div
    className={`rounded-xl border border-white/10 px-4 py-3 bg-white/5 ${
      accent ? "shadow-inner shadow-emerald-500/20" : ""
    }`}
  >
    <div className="text-xs uppercase tracking-wide opacity-60">{label}</div>
    <div className="text-lg font-semibold text-white mt-1">{value}</div>
  </div>
);

const SectionItems = ({ section }: { section: ReportSection }) => {
  if (!section.items || section.items.length === 0) {
    return <div className="text-sm opacity-60">Нет заметного прогресса в этом периоде.</div>;
  }
  return (
    <div className="space-y-2">
      {section.items.map((item) => (
        <ItemRow key={item.id} item={item} unit={section.unit} />
      ))}
    </div>
  );
};

const ItemRow = ({ item, unit }: { item: ReportItem; unit: string }) => (
  <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <div className="font-medium text-white truncate">{item.name}</div>
        <TrendBadge trend={item.trend} />
      </div>
      <div className="text-xs opacity-70 mt-1 leading-snug">{item.message}</div>
    </div>
    <div className="text-sm text-right min-w-[120px]">
      <div className="font-semibold text-white">{formatNumber(item.current)} {unit}</div>
      <div className="text-xs opacity-60">Было: {formatNumber(item.previous)}</div>
      {typeof item.total === "number" && (
        <div className="text-xs opacity-60">Итого: {formatNumber(item.total)}%</div>
      )}
    </div>
  </div>
);

const SectionChart = ({ section }: { section: ReportSection }) => {
  if (!section.timeline || section.timeline.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-white/60">
        Недостаточно данных для построения графика.
      </div>
    );
  }
  return (
    <div className="h-64 rounded-2xl border border-white/10 bg-black/30 px-2 py-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={section.timeline} margin={{ top: 10, left: 0, right: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`trend-${section.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#a855f7" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
          <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 12 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} />
          <YAxis tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 12 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} allowDecimals={false} />
          <Tooltip
            formatter={(value: number) => `${formatNumber(value)} ${section.unit}`}
            labelFormatter={(label: string) => `Период: ${label}`}
            contentStyle={{ backgroundColor: "rgba(15,15,20,0.95)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", color: "white" }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#a855f7"
            strokeWidth={2}
            fill={`url(#trend-${section.key})`}
            dot={{ r: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const InsightsList = ({ insights }: { insights: string[] }) => {
  if (!insights || insights.length === 0) {
    return <div className="text-sm opacity-60">Нет дополнительных рекомендаций.</div>;
  }
  return (
    <ul className="space-y-2 text-sm text-white/80">
      {insights.map((insight, index) => (
        <li key={`${insight}-${index}`} className="flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
          <span>{insight}</span>
        </li>
      ))}
    </ul>
  );
};

const ReportSectionView = ({ section }: { section: ReportSection }) => (
  <section className="card space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div>
        <div className="text-lg font-semibold text-white">{section.title}</div>
        <div className="text-xs uppercase tracking-wide text-white/60 mt-1">{section.subtitle}</div>
      </div>
      <TrendBadge trend={section.summary.trend} />
    </div>

    <div className="grid gap-3 sm:grid-cols-3">
      <SummaryStat label="Текущий период" value={`${formatNumber(section.summary.current)} ${section.unit}`} accent />
      <SummaryStat label="Прошлый период" value={`${formatNumber(section.summary.previous)} ${section.unit}`} />
      <SummaryStat label="Разница" value={`${formatNumber(section.summary.difference)} ${section.unit}`} />
    </div>

    <div className="text-sm text-white/80 leading-relaxed">{section.summary.message}</div>

    <SectionItems section={section} />

    <SectionChart section={section} />

    <div>
      <div className="text-xs uppercase tracking-wide text-white/60 mb-2">Что обратить внимание</div>
      <InsightsList insights={section.insights} />
    </div>
  </section>
);

type ReportViewProps = {
  report: ReportData;
};

export default function ReportView({ report }: ReportViewProps) {
  const generatedLabel = dateTimeFormatter.format(new Date(report.generated_at));
  const highlights = Array.isArray(report.highlights) ? report.highlights : [];
  return (
    <div className="space-y-6 text-white">
      <header className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-white/60">Сводка периода</div>
        <div className="text-2xl font-semibold">{report.period_label}</div>
        {report.period_description && (
          <div className="text-sm text-white/70">{report.period_description}</div>
        )}
        <div className="text-xs text-white/50">Сформировано: {generatedLabel}</div>
        <div className="text-xs text-white/40">
          Период: {report.range.label || `${report.range.start} — ${report.range.end}`}
        </div>
      </header>

      {highlights.length > 0 && (
        <div className="card">
          <div className="text-xs uppercase tracking-wide text-white/60 mb-2">Главные выводы</div>
          <div className="grid gap-2">
            {highlights.slice(0, 6).map((highlight, index) => (
              <div
                key={`${highlight}-${index}`}
                className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              >
                <Sparkles className="w-4 h-4 text-amber-300 mt-0.5" />
                <span className="text-sm leading-snug text-white/80">{highlight}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ReportSectionView section={report.sections.languages} />
      <ReportSectionView section={report.sections.courses} />
      <ReportSectionView section={report.sections.goals} />
    </div>
  );
}

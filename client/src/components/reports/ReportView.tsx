import React, { useState } from "react";
import { ChevronDown, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ReportData, ReportItem, ReportSection } from "../../types/reports";

const numberFormatter = new Intl.NumberFormat("ru-RU");
const dateTimeFormatter = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" });
const formatNumber = (value: number) => numberFormatter.format(Math.round(value));

const SECTION_STYLE: Record<string, { emoji: string; accent: string; chart: string }> = {
  fitness: { emoji: "💪", accent: "from-sky-400/20 to-cyan-400/5", chart: "#38bdf8" },
  languages: { emoji: "🗣️", accent: "from-violet-400/20 to-fuchsia-400/5", chart: "#a78bfa" },
  courses: { emoji: "🎓", accent: "from-emerald-400/20 to-lime-400/5", chart: "#34d399" },
  goals: { emoji: "🎯", accent: "from-pink-400/20 to-rose-400/5", chart: "#f472b6" },
};

// Выводы про «ничего не было» в дружелюбном отчёте не показываем
const NEGATIVE_HIGHLIGHT =
  /отсутству|не завершал|не зафиксир|не настроен|без продвижени|без завершени|уменьшил|снизил|нет данных|не было/i;

const activeItems = (section: ReportSection) => (section.items || []).filter((item) => item.current > 0);

/** В разделе есть реальная активность за период. */
export const sectionHasActivity = (section: ReportSection | null | undefined): section is ReportSection =>
  !!section && (section.summary.current > 0 || activeItems(section).length > 0);

/** В отчёте есть хоть что-то сделанное — пустые отчёты можно не показывать. */
export const reportHasActivity = (report: ReportData | null | undefined) =>
  !!report && Object.values(report.sections || {}).some((section) => sectionHasActivity(section));

const ItemRow = ({ item, unit }: { item: ReportItem; unit: string }) => {
  const suffix = (item.unit ?? unit) ? ` ${item.unit ?? unit}` : "";
  const grew = item.current > item.previous;
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-black/20 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-white">{item.name}</div>
        {item.message && <div className="truncate text-xs text-white/55">{item.message}</div>}
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold text-white">
          {formatNumber(item.current)}
          {suffix}
        </div>
        {item.previous > 0 && (
          <div className={`text-[11px] ${grew ? "text-emerald-300" : "text-white/45"}`}>
            {grew ? "▲" : "было"} {formatNumber(item.previous)}
            {suffix}
          </div>
        )}
      </div>
    </div>
  );
};

const SectionChart = ({ section, color }: { section: ReportSection; color: string }) => {
  // График имеет смысл, только если активность была хотя бы в двух точках
  if ((section.timeline || []).filter((point) => point.value > 0).length < 2) return null;
  return (
    <div className="h-40 rounded-2xl bg-black/20 px-1 py-3">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={section.timeline} margin={{ top: 6, left: -20, right: 8, bottom: 0 }}>
          <defs>
            <linearGradient id={`trend-${section.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.45} />
              <stop offset="95%" stopColor={color} stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
          <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            formatter={(value: number) => `${formatNumber(value)} ${section.unit}`}
            contentStyle={{ backgroundColor: "rgba(15,15,20,0.95)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", color: "white" }}
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#trend-${section.key})`} dot={{ r: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const ReportSectionView = ({ section }: { section: ReportSection }) => {
  const [showInsights, setShowInsights] = useState(false);
  const style = SECTION_STYLE[section.key] || { emoji: "✨", accent: "from-white/10 to-transparent", chart: "#a855f7" };
  const { current, previous } = section.summary;
  const items = activeItems(section);
  const unit = section.unit ? ` ${section.unit}` : "";
  const insights = (section.insights || []).filter((text) => !NEGATIVE_HIGHLIGHT.test(text));
  return (
    <section className={`space-y-3 rounded-3xl border border-white/10 bg-gradient-to-br ${style.accent} p-4`}>
      <div className="flex items-start gap-3">
        <div className="text-3xl">{style.emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-white">{section.title}</div>
          <div className="text-xs text-white/55">{section.subtitle}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-white">
            {formatNumber(current)}
            <span className="text-sm font-normal text-white/60">{unit}</span>
          </div>
          {previous > 0 && current !== previous && (
            <div className={`inline-flex items-center gap-1 text-xs ${current > previous ? "text-emerald-300" : "text-white/50"}`}>
              {current > previous ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {current > previous ? "+" : ""}
              {formatNumber(current - previous)} к прошлому периоду
            </div>
          )}
          {previous === 0 && current > 0 && <div className="text-xs text-emerald-300">новое в этом периоде ✨</div>}
        </div>
      </div>

      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map((item) => (
            <ItemRow key={item.id} item={item} unit={section.unit} />
          ))}
        </div>
      )}

      <SectionChart section={section} color={style.chart} />

      {insights.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowInsights((v) => !v)} className="inline-flex items-center gap-1 text-xs text-white/60 hover:text-white">
            <ChevronDown className={`h-3.5 w-3.5 transition ${showInsights ? "rotate-180" : ""}`} /> Советы ({insights.length})
          </button>
          {showInsights && (
            <ul className="mt-2 space-y-1.5 text-sm text-white/80">
              {insights.map((insight, index) => (
                <li key={`${insight}-${index}`} className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};

type ReportViewProps = {
  report: ReportData;
};

/** Дружелюбный отчёт: только то, что реально сделано за период. */
export default function ReportView({ report }: ReportViewProps) {
  const generatedLabel = dateTimeFormatter.format(new Date(report.generated_at));
  const sections = [report.sections.fitness, report.sections.languages, report.sections.courses, report.sections.goals].filter(sectionHasActivity);
  const highlights = (Array.isArray(report.highlights) ? report.highlights : []).filter((text) => !NEGATIVE_HIGHLIGHT.test(text));

  return (
    <div className="space-y-4 text-white">
      <header className="space-y-1">
        <div className="text-2xl font-semibold">{sections.length ? `${report.period_label} 🎉` : report.period_label}</div>
        <div className="text-xs text-white/50">
          {report.range.label || `${report.range.start} — ${report.range.end}`} · сформировано {generatedLabel}
        </div>
      </header>

      {sections.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/15 p-8 text-center">
          <div className="text-5xl">🌱</div>
          <div className="mt-2 text-lg font-semibold">В этом периоде пока тихо</div>
          <div className="mt-1 text-sm text-white/60">Пройдите урок, отметьте привычку или шаг к цели — и здесь появятся ваши достижения.</div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {sections.map((section) => (
              <span key={section.key} className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-sm">
                {(SECTION_STYLE[section.key] || { emoji: "✨" }).emoji} {section.title}:{" "}
                <b>
                  {formatNumber(section.summary.current)} {section.unit}
                </b>
              </span>
            ))}
          </div>

          {highlights.length > 0 && (
            <div className="space-y-1.5 rounded-3xl border border-amber-300/20 bg-amber-300/5 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-200/80">Главное</div>
              {highlights.slice(0, 5).map((highlight, index) => (
                <div key={`${highlight}-${index}`} className="flex items-start gap-2 text-sm text-white/85">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <span>{highlight}</span>
                </div>
              ))}
            </div>
          )}

          {sections.map((section) => (
            <ReportSectionView key={section.key} section={section} />
          ))}
        </>
      )}
    </div>
  );
}

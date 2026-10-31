import React, { useEffect, useState } from "react";
import Shell from "../components/Shell";
import { api } from "../api";
import { ReportData, ReportHistoryResponse } from "../types/reports";
import ReportImageModal from "../components/reports/ReportImageModal";
import ReportView, { reportHasActivity, sectionHasActivity } from "../components/reports/ReportView";
import { ImageDown, RefreshCcw } from "lucide-react";

type PeriodFilter = "all" | "daily" | "weekly" | "monthly";

const FILTERS: { value: PeriodFilter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "daily", label: "Дневные" },
  { value: "weekly", label: "Недельные" },
  { value: "monthly", label: "Месячные" },
];

const numberFormatter = new Intl.NumberFormat("ru-RU");
const dateFormatter = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" });

const formatNumber = (value: number) => numberFormatter.format(Math.round(value));

// Единицы с сервера («отметок», «курсов», «п.п.») — склоняем по числу: «1 отметка», «2 отметки»
const plural = (n: number, one: string, few: string, many: string) => {
  const a = Math.abs(Math.round(n)) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
};
const unitLabel = (unit: string, n: number) =>
  unit === "отметок" ? plural(n, "отметка", "отметки", "отметок") : unit === "курсов" ? plural(n, "курс", "курса", "курсов") : unit === "п.п." ? "% прогресса" : unit;
const formatSigned = (value: number) => {
  const rounded = Math.round(value);
  if (rounded > 0) return `+${formatNumber(rounded)}`;
  if (rounded < 0) return `-${formatNumber(Math.abs(rounded))}`;
  return "0";
};

const SECTION_EMOJI: Record<string, string> = { fitness: "💪", languages: "🗣️", courses: "🎓", goals: "🎯" };

/** Карточка отчёта в списке: только то, что реально сделано за период. */
const ReportHistoryCard = ({ report, onOpen }: { report: ReportData; onOpen: (report: ReportData) => void }) => {
  const generated = dateFormatter.format(new Date(report.generated_at));
  const active = [report.sections.fitness, report.sections.languages, report.sections.courses, report.sections.goals].filter(sectionHasActivity);
  return (
    <button
      type="button"
      onClick={() => onOpen(report)}
      className="card flex w-full flex-col gap-2 text-left transition hover:border-brand-mint/40 sm:flex-row sm:items-center"
    >
      <div className="min-w-0 sm:w-72">
        <div className="truncate text-sm font-semibold text-white">{report.period_label}</div>
        <div className="text-xs text-white/45">Сформирован {generated}</div>
      </div>
      <div className="flex flex-1 flex-wrap gap-2">
        {active.map((section) => {
          const grew = section.summary.previous > 0 && section.summary.current > section.summary.previous;
          return (
            <span key={section.key} className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-sm text-white/85">
              {SECTION_EMOJI[section.key] || "✨"} {formatNumber(section.summary.current)} {unitLabel(section.unit, section.summary.current)}
              {grew && <span className="text-xs text-brand-mint">▲ {formatSigned(section.summary.difference)}</span>}
            </span>
          );
        })}
      </div>
      <span className="shrink-0 text-xs text-brand-mint">Открыть →</span>
    </button>
  );
};

export default function Reports() {
  const [reports, setReports] = useState<ReportData[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<PeriodFilter>("all");
  const [selected, setSelected] = useState<ReportData | null>(null);
  const [imageOpen, setImageOpen] = useState(false);
  // Пустые периоды (без активности) по умолчанию скрыты
  const [showEmpty, setShowEmpty] = useState(false);
  const visibleReports = showEmpty ? reports : reports.filter((report) => reportHasActivity(report));
  const hiddenCount = reports.length - visibleReports.length;

  const loadReports = async (activeFilter: PeriodFilter) => {
    setLoading(true);
    try {
      const response = (await api.get(
        `/api/life/reports/history?limit=20&period=${activeFilter}`
      )) as ReportHistoryResponse;
      setReports(response?.items || []);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports(filter);
  }, [filter]);

  return (
    <Shell>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold text-white">Отчёты</div>
          <div className="text-sm text-white/60">Что получилось за день, неделю и месяц.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setImageOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-brand-mint px-4 py-2 text-xs font-semibold uppercase tracking-wide text-brand-deep hover:brightness-110"
          >
            <ImageDown className="w-4 h-4" /> Итоги картинкой
          </button>
          <button
            onClick={() => loadReports(filter)}
            className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-wide text-white/70 hover:bg-white/10"
          >
            <RefreshCcw className="w-4 h-4" /> Обновить
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            onClick={() => setFilter(option.value)}
            className={`px-3 py-1.5 rounded-full text-xs uppercase tracking-wide transition ${
              filter === option.value
                ? "bg-white text-black"
                : "border border-white/20 bg-white/5 text-white/70 hover:bg-white/10"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        {loading ? (
          <div className="text-sm text-white/60">Загружаем историю отчётов…</div>
        ) : visibleReports.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/15 p-8 text-center">
            <div className="text-5xl">🌱</div>
            <div className="mt-2 font-semibold text-white">Пока нечего показать</div>
            <div className="mt-1 text-sm text-white/60">Отчёт появится, как только вы что-нибудь сделаете: пройдёте урок, отметите привычку или шаг к цели.</div>
          </div>
        ) : (
          visibleReports.map((report) => (
            <ReportHistoryCard key={`${report.period_key}-${report.period}`} report={report} onOpen={setSelected} />
          ))
        )}
        {!loading && hiddenCount > 0 && (
          <button type="button" onClick={() => setShowEmpty((v) => !v)} className="text-xs text-white/45 hover:text-white">
            {showEmpty ? "Скрыть пустые периоды" : `Показать пустые периоды (${hiddenCount})`}
          </button>
        )}
      </div>

      <ReportImageModal open={!!selected} report={selected} onClose={() => setSelected(null)} />
      <ReportImageModal open={imageOpen} onClose={() => setImageOpen(false)} />
    </Shell>
  );
}

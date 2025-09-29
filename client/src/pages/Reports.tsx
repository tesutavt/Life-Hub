import React, { useEffect, useState } from "react";
import Shell from "../components/Shell";
import { api } from "../api";
import { ReportData, ReportHistoryResponse } from "../types/reports";
import { Modal } from "../components/ui/Modal";
import ReportView from "../components/reports/ReportView";
import { RefreshCcw } from "lucide-react";

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
const formatSigned = (value: number) => {
  const rounded = Math.round(value);
  if (rounded > 0) return `+${formatNumber(rounded)}`;
  if (rounded < 0) return `-${formatNumber(Math.abs(rounded))}`;
  return "0";
};

const ReportHistoryCard = ({ report, onOpen }: { report: ReportData; onOpen: (report: ReportData) => void }) => {
  const generated = dateFormatter.format(new Date(report.generated_at));
  return (
    <div className="card space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">{report.period_label}</div>
          <div className="text-xs text-white/50">
            Период: {report.range.label || `${report.range.start} — ${report.range.end}`}
          </div>
          <div className="text-xs text-white/40">Сформирован: {generated}</div>
        </div>
        <button
          onClick={() => onOpen(report)}
          className="self-start sm:self-auto rounded-full border border-white/20 px-4 py-1.5 text-xs uppercase tracking-wide text-white/70 hover:bg-white/10"
        >
          Открыть
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 text-sm text-white/80">
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-white/50">Языки</div>
          <div className="font-semibold text-white mt-1">
            {formatNumber(report.sections.languages.summary.current)} курсов
          </div>
          <div className="text-xs text-white/50">
            {formatSigned(report.sections.languages.summary.difference)} курсов vs прошлый период
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-white/50">Курсы</div>
          <div className="font-semibold text-white mt-1">
            {formatNumber(report.sections.courses.summary.current)} п.п.
          </div>
          <div className="text-xs text-white/50">
            {formatSigned(report.sections.courses.summary.difference)} vs прошлый период
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-white/50">Цели</div>
          <div className="font-semibold text-white mt-1">
            {formatNumber(report.sections.goals.summary.current)} отметок
          </div>
          <div className="text-xs text-white/50">
            {formatSigned(report.sections.goals.summary.difference)} vs прошлый период
          </div>
        </div>
      </div>
    </div>
  );
};

export default function Reports() {
  const [reports, setReports] = useState<ReportData[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<PeriodFilter>("all");
  const [selected, setSelected] = useState<ReportData | null>(null);

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
          <div className="text-2xl font-semibold text-white">Мастер-отчёты</div>
          <div className="text-sm text-white/60">История ежедневных, недельных и месячных отчётов.</div>
        </div>
        <button
          onClick={() => loadReports(filter)}
          className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-wide text-white/70 hover:bg-white/10"
        >
          <RefreshCcw className="w-4 h-4" /> Обновить
        </button>
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
        ) : reports.length === 0 ? (
          <div className="text-sm text-white/60">Отчёты ещё не сформированы.</div>
        ) : (
          reports.map((report) => (
            <ReportHistoryCard key={`${report.period_key}-${report.period}`} report={report} onOpen={setSelected} />
          ))
        )}
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        closeOnOverlayClick
        overlayClassName="bg-black/70 backdrop-blur-sm"
        contentClassName="w-full max-w-6xl max-h-[85vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#0b0b0f] px-6 py-6"
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-white/60">Сохранённый отчёт</div>
                <div className="text-xl font-semibold text-white mt-1">{selected.period_label}</div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="rounded-full border border-white/20 px-3 py-1 text-xs uppercase tracking-wide text-white/70 hover:bg-white/10"
              >
                Закрыть
              </button>
            </div>
            <ReportView report={selected} />
          </div>
        )}
      </Modal>
    </Shell>
  );
}

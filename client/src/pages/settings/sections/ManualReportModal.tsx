import React from "react";
import { Modal } from "../../../components/ui/Modal";
import ReportView from "../../../components/reports/ReportView";
import { ReportData } from "../../../types/reports";

type Props = {
  open: boolean;
  onClose: () => void;
  period: "daily" | "weekly" | "monthly";
  onPeriodChange: (period: "daily" | "weekly" | "monthly") => void;
  onRefresh: () => void;
  loading: boolean;
  report: ReportData | null;
};

export default function ManualReportModal({
  open,
  onClose,
  period,
  onPeriodChange,
  onRefresh,
  loading,
  report,
}: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnOverlayClick
      overlayClassName="bg-black/70 backdrop-blur-sm"
      contentClassName="w-full max-w-6xl max-h-[85vh] overflow-y-auto rounded-3xl border border-white/10 bg-brand-night/80 px-6 py-6"
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-white/60">Мастер-отчёт</div>
            <div className="text-xl font-semibold text-white mt-1">
              {report?.period_label || "Предпросмотр"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-white/20 px-3 py-1 text-xs uppercase tracking-wide text-white/70 hover:bg-white/10"
          >
            Закрыть
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select
            value={period}
            onChange={(event) => onPeriodChange(event.target.value as Props["period"])}
            className="px-3 py-2 rounded bg-white/10 border border-white/20"
          >
            <option value="daily">За прошлый день</option>
            <option value="weekly">За прошлую неделю</option>
            <option value="monthly">За прошлый месяц</option>
          </select>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="px-4 py-2 rounded bg-white text-black text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Обновляем…" : "Пересчитать"}
          </button>
        </div>
        {loading ? (
          <div className="text-sm text-white/60">Готовим отчёт…</div>
        ) : report ? (
          <ReportView report={report} />
        ) : (
          <div className="text-sm text-white/60">Выберите период и сформируйте отчёт.</div>
        )}
      </div>
    </Modal>
  );
}

import React, { useCallback, useMemo, useRef, useState } from "react";
import { Modal } from "../../../components/ui/Modal";
import ReportView from "../../../components/reports/ReportView";
import { ReportData } from "../../../types/reports";
import { toPng } from "html-to-image";
import { api } from "../../../api";
import { notify } from "../../../notifications/notificationBus";

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
  const reportRef = useRef<HTMLDivElement | null>(null);
  const [exporting, setExporting] = useState<"download" | "telegram" | null>(null);

  const shareCaption = useMemo(() => {
    if (!report) return "Отчёт из LifeHub";
    const parts: string[] = [];
    if (report.period_label) parts.push(`📊 ${report.period_label}`);
    if (report.generated_at) {
      try {
        const dateLabel = new Date(report.generated_at).toLocaleString("ru-RU", {
          day: "2-digit",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        parts.push(`Сформировано: ${dateLabel}`);
      } catch {
        // ignore invalid date
      }
    }
    return parts.join("\n") || "Отчёт из LifeHub";
  }, [report]);

  const handleExport = useCallback(
    async (mode: "download" | "telegram") => {
      if (!reportRef.current || !report) {
        notify.error("Сначала сформируйте отчёт.");
        return;
      }
      setExporting(mode);
      try {
        const dataUrl = await toPng(reportRef.current, {
          cacheBust: true,
          backgroundColor: "#0b1220",
          pixelRatio: 2,
        });
        if (mode === "download") {
          const normalizedLabel = (report.period_label || "report").replace(/[^\p{L}\p{N}]+/gu, "_");
          const link = document.createElement("a");
          link.href = dataUrl;
          link.download = `lifehub-report-${normalizedLabel || "latest"}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          notify.success("PNG отчёт сохранён");
        } else {
          const caption = shareCaption.length > 1024 ? shareCaption.slice(0, 1024) : shareCaption;
          await api.post(
            "/api/life/reports/share",
            { image: dataUrl, caption },
            { notifySuccess: "Отчёт отправлен в Telegram" },
          );
        }
      } catch (error) {
        console.error("Manual report export failed", error);
        notify.error("Не удалось подготовить изображение отчёта.");
      } finally {
        setExporting(null);
      }
    },
    [report, shareCaption],
  );

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
        <div className="flex flex-wrap items-center gap-2 text-sm mt-2">
          <button
            onClick={() => handleExport("download")}
            disabled={loading || exporting === "download" || !report}
            className="px-4 py-2 rounded border border-white/20 bg-white/10 text-white/80 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting === "download" ? "Готовим PNG…" : "Сохранить PNG"}
          </button>
          <button
            onClick={() => handleExport("telegram")}
            disabled={loading || exporting === "telegram" || !report}
            className="px-4 py-2 rounded bg-[#2aa9e0] text-black text-sm font-semibold hover:bg-[#1f8fc2] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting === "telegram" ? "Отправляем…" : "Отправить в Telegram"}
          </button>
        </div>
        {loading ? (
          <div className="text-sm text-white/60">Готовим отчёт…</div>
        ) : report ? (
          <div
            ref={reportRef}
            className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#0b1220] via-[#141b2c] to-[#251c3f] p-6 shadow-xl shadow-black/40"
          >
            <ReportView report={report} />
          </div>
        ) : (
          <div className="text-sm text-white/60">Выберите период и сформируйте отчёт.</div>
        )}
      </div>
    </Modal>
  );
}

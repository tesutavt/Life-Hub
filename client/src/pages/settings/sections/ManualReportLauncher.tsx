import React from "react";

type Props = {
  period: "daily" | "weekly" | "monthly";
  onPeriodChange: (period: "daily" | "weekly" | "monthly") => void;
  onOpen: () => void;
  loading: boolean;
};

export default function ManualReportLauncher({ period, onPeriodChange, onOpen, loading }: Props) {
  return (
    <div className="card space-y-3">
      <div>
        <div className="text-lg font-semibold mb-1">Мастер-отчёт вручную</div>
        <p className="text-xs opacity-70">Сформируйте отчёт за выбранный период прямо из настроек.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs uppercase tracking-wide text-white/60">Период</label>
        <select
          value={period}
          onChange={(event) => onPeriodChange(event.target.value as Props["period"])}
          className="px-3 py-2 rounded bg-white/10 border border-white/20 text-sm"
        >
          <option value="daily">За прошлый день</option>
          <option value="weekly">За прошлую неделю</option>
          <option value="monthly">За прошлый месяц</option>
        </select>
        <button
          onClick={onOpen}
          className="px-4 py-2 rounded bg-white text-black text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          disabled={loading}
        >
          {loading ? "Загружаем…" : "Показать отчёт"}
        </button>
      </div>
      <div className="text-xs text-white/50">
        Отчёт сохраняется в разделе «Отчёты» и учитывает актуальные данные.
      </div>
    </div>
  );
}

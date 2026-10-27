import React, { useEffect, useState } from "react";
import { api } from "../../api";
import { Modal } from "../ui/Modal";
import ReportView, { reportHasActivity } from "./ReportView";
import { ReportData, ReportPeriodResponse } from "../../types/reports";

type ReportPeriod = "daily" | "weekly" | "monthly";

const STORAGE_PREFIX = "lifehub_report_seen_";
const PERIODS: ReportPeriod[] = ["daily", "weekly", "monthly"];

const MS_DAY = 86400000;

const startOfUtcDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const addDays = (date: Date, amount: number) => new Date(date.getTime() + amount * MS_DAY);

const isoWeekKey = (date: Date) => {
  const target = startOfUtcDay(date);
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((target.getTime() - yearStart.getTime()) / MS_DAY + 1) / 7);
  return `${target.getUTCFullYear()}-W${weekNumber.toString().padStart(2, "0")}`;
};

const computePeriodKey = (period: ReportPeriod): string | null => {
  const today = startOfUtcDay(new Date());
  if (period === "daily") {
    const start = addDays(today, -1);
    return start.toISOString().slice(0, 10);
  }
  if (period === "weekly") {
    const day = today.getUTCDay() || 7;
    const currentWeekStart = addDays(today, -(day - 1));
    const previousWeekStart = addDays(currentWeekStart, -7);
    return isoWeekKey(previousWeekStart);
  }
  if (period === "monthly") {
    const currentMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const previousMonthStart = new Date(Date.UTC(currentMonthStart.getUTCFullYear(), currentMonthStart.getUTCMonth() - 1, 1));
    return `${previousMonthStart.getUTCFullYear()}-${(previousMonthStart.getUTCMonth() + 1)
      .toString()
      .padStart(2, "0")}`;
  }
  return null;
};

const markPeriodSeen = (period: ReportPeriod, key: string) => {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${period}`, key);
  } catch {
    // ignore storage errors
  }
};

const wasPeriodSeen = (period: ReportPeriod, key: string) => {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${period}`) === key;
  } catch {
    return false;
  }
};

export default function ReportReminders() {
  const [queue, setQueue] = useState<ReportData[]>([]);
  const [current, setCurrent] = useState<ReportData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const upcoming: ReportData[] = [];
      for (const period of PERIODS) {
        const key = computePeriodKey(period);
        if (!key || wasPeriodSeen(period, key)) continue;
        try {
          const response = (await api.get(`/api/life/reports/period?period=${period}`)) as ReportPeriodResponse;
          if (cancelled) return;
          if (response?.report && reportHasActivity(response.report)) {
            upcoming.push(response.report);
          } else if (response?.report) {
            // Пустой период не показываем, но запоминаем, чтобы не спрашивать снова
            markPeriodSeen(period, key);
          }
        } catch {
          // ignore fetch errors
        }
      }
      if (!cancelled && upcoming.length > 0) {
        setQueue(upcoming);
        setCurrent(upcoming[0] ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClose = () => {
    if (!current) return;
    markPeriodSeen(current.period, current.period_key);
    setQueue((prev) => {
      const [, ...rest] = prev;
      setCurrent(rest[0] || null);
      return rest;
    });
  };

  return (
    <Modal
      open={!!current}
      onClose={handleClose}
      closeOnOverlayClick={false}
      overlayClassName="bg-black/70 backdrop-blur-sm"
      contentClassName="w-full max-w-6xl max-h-[85vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#0b0b0f] px-6 py-6"
    >
      {current && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-white/60">Мастер-отчёт</div>
              <div className="text-xl font-semibold text-white mt-1">{current.period_label}</div>
              <div className="text-xs text-white/50 mt-1">
                Период: {current.range.label || `${current.range.start} — ${current.range.end}`}
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-full border border-white/20 px-3 py-1 text-xs uppercase tracking-wide text-white/70 hover:bg-white/10"
            >
              Закрыть
            </button>
          </div>
          <ReportView report={current} />
        </div>
      )}
    </Modal>
  );
}

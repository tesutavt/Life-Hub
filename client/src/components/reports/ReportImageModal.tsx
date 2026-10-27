import React, { useCallback, useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { toPng } from 'html-to-image';
import { Download, Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import ReportView from './ReportView';
import { ReportData } from '../../types/reports';
import { api } from '../../api';
import { notify } from '../../notifications/notificationBus';
import { trackClientAction } from '../../achievements';

type Period = 'daily' | 'weekly' | 'monthly';
const PERIODS: { id: Period; label: string }[] = [
  { id: 'daily', label: 'Вчера' },
  { id: 'weekly', label: 'Прошлая неделя' },
  { id: 'monthly', label: 'Прошлый месяц' },
];

/**
 * Отчёт картинкой (PNG). Без report — формирует свежий отчёт за выбранный период;
 * с report — показывает сохранённый отчёт из истории.
 */
export default function ReportImageModal({ open, onClose, report: saved = null }: { open: boolean; onClose: () => void; report?: ReportData | null }) {
  const [period, setPeriod] = useState<Period>('weekly');
  const [fresh, setFresh] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement | null>(null);
  const report = saved || fresh;

  const load = useCallback(async (value: Period) => {
    setLoading(true);
    try {
      const response = await api.get(`/api/life/reports/period?period=${value}&force=1`);
      setFresh(response?.empty ? null : response?.report || null);
    } catch {
      setFresh(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !saved) load(period);
  }, [open, saved, period, load]);

  const download = async () => {
    if (!reportRef.current || !report) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(reportRef.current, { cacheBust: true, backgroundColor: '#0b1220', pixelRatio: 2 });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `lifehub-report-${(report.period_label || 'report').replace(/[^\p{L}\p{N}]+/gu, '_')}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      notify.success('Картинка отчёта сохранена');
      trackClientAction('report.download', { oncePerDay: false });
    } catch (error) {
      console.error('Report export failed', error);
      notify.error('Не удалось подготовить изображение отчёта');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      showCloseButton
      overlayClassName="bg-black/70 backdrop-blur-sm"
      contentClassName="w-full max-w-5xl max-h-[88vh] overflow-y-auto rounded-3xl border border-white/10 bg-brand-night/95 p-5"
    >
      <div className="space-y-4">
        <div className="pr-8">
          <div className="text-xs uppercase tracking-wide text-white/50">{saved ? 'Отчёт из истории' : 'Итоги картинкой'}</div>
          <div className="mt-1 text-xl font-semibold text-white">{report?.period_label || 'Готовим отчёт…'}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!saved &&
            PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={classNames('rounded-full px-3 py-1.5 text-xs', period === p.id ? 'bg-white text-black' : 'border border-white/15 bg-white/5 text-white/70 hover:bg-white/10')}
              >
                {p.label}
              </button>
            ))}
          <button
            type="button"
            onClick={download}
            disabled={!report || loading || exporting}
            className="ml-auto inline-flex items-center gap-2 rounded-full bg-brand-mint px-4 py-2 text-sm font-semibold text-brand-deep disabled:opacity-50"
          >
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Сохранить PNG
          </button>
        </div>
        {loading ? (
          <div className="py-10 text-center text-sm text-white/60">Собираем итоги…</div>
        ) : report ? (
          <div ref={reportRef} className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#0b1220] via-[#141b2c] to-[#251c3f] p-6">
            <ReportView report={report} />
            <div className="mt-4 text-right text-[11px] text-white/35">Life Hub</div>
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-white/60">За этот период данных нет.</div>
        )}
      </div>
    </Modal>
  );
}

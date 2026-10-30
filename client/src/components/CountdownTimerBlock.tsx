import React, { useEffect, useMemo, useState } from 'react';

type TimerState = {
  title: string;
  target: string;
};

type CountdownTimerBlockProps = {
  value: any;
  onChange: (next: TimerState) => void;
};

const parseState = (value: any): TimerState => {
  if (!value || typeof value !== 'object') {
    return { title: '', target: '' };
  }
  return {
    title: typeof value.title === 'string' ? value.title : '',
    target: typeof value.target === 'string' ? value.target : '',
  };
};

const formatPart = (value: number) => String(Math.max(0, Math.floor(value))).padStart(2, '0');

export default function CountdownTimerBlock({ value, onChange }: CountdownTimerBlockProps) {
  const [now, setNow] = useState(() => Date.now());
  const state = parseState(value);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const countdown = useMemo(() => {
    if (!state.target) return null;
    const targetDate = new Date(state.target);
    if (Number.isNaN(targetDate.getTime())) return null;
    const delta = targetDate.getTime() - now;
    const finished = delta <= 0;
    const totalSeconds = Math.max(0, Math.floor(delta / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return { finished, days, hours, minutes, seconds, targetDate };
  }, [now, state.target]);

  const update = (patch: Partial<TimerState>) => {
    onChange({ ...state, ...patch });
  };

  return (
    <div className="flex-1 space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4" style={{ direction: 'ltr' }}>
      <input
        value={state.title}
        onChange={(event) => update({ title: event.target.value })}
        placeholder="Название таймера (например: До отпуска)"
        className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="text-xs uppercase tracking-wide text-white/60">Дата и время</label>
        <input
          type="datetime-local"
          value={state.target}
          onChange={(event) => update({ target: event.target.value })}
          className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
        />
      </div>

      {countdown ? (
        <div className="rounded-xl border border-white/10 bg-black/30 p-3">
          <div className="text-xs text-white/60">
            {countdown.targetDate.toLocaleString('ru-RU', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
          {countdown.finished ? (
            <div className="mt-2 text-lg font-semibold text-brand-mint">Событие наступило</div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-white">
              <span className="rounded-lg bg-white/10 px-2 py-1 text-lg font-semibold">{countdown.days}д</span>
              <span className="rounded-lg bg-white/10 px-2 py-1 text-lg font-semibold">{formatPart(countdown.hours)}ч</span>
              <span className="rounded-lg bg-white/10 px-2 py-1 text-lg font-semibold">{formatPart(countdown.minutes)}м</span>
              <span className="rounded-lg bg-white/10 px-2 py-1 text-lg font-semibold">{formatPart(countdown.seconds)}с</span>
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-white/55">Укажите дату и время, чтобы запустить обратный отсчет.</div>
      )}
    </div>
  );
}

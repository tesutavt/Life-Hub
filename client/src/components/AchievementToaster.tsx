import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import classNames from 'classnames';
import { X } from 'lucide-react';
import { api } from '../api';
import { onAchievementCheck, rarityStyle, trackClientAction, UnlockedAchievement, VISIT_ACTIONS } from '../achievements';
import { desktop } from '../desktop';

const POLL_MS = 20_000;
const SHOW_MS = 6_000;

/**
 * Следит за новыми ачивками и показывает их по одной в правом нижнем углу.
 * Заодно засчитывает «открытие приложения» и визиты страниц.
 */
export default function AchievementToaster() {
  const location = useLocation();
  const navigate = useNavigate();
  const [queue, setQueue] = useState<UnlockedAchievement[]>([]);
  const [visible, setVisible] = useState(false);
  const shownIds = useRef(new Set<number>());

  const check = useCallback(async () => {
    try {
      // Окно в трее — ачивки покажет уведомлением главный процесс; здесь их не трогаем
      const bridge = desktop();
      if (bridge?.isWindowVisible && !(await bridge.isWindowVisible())) return;
      const payload = await api.get('/api/achievements/unseen', { silentError: true });
      const items: UnlockedAchievement[] = Array.isArray(payload?.items) ? payload.items : [];
      const fresh = items.filter((item) => !shownIds.current.has(item.id));
      if (!fresh.length) return;
      fresh.forEach((item) => shownIds.current.add(item.id));
      setQueue((prev) => [...prev, ...fresh]);
      api.post('/api/achievements/seen', { ids: fresh.map((item) => item.id) }, { silentSuccess: true, silentError: true }).catch(() => {});
    } catch {
      // сеть недоступна — попробуем позже
    }
  }, []);

  useEffect(() => {
    trackClientAction('app.open');
    if (desktop()) trackClientAction('app.desktop_open');
    check();
    const timer = window.setInterval(check, POLL_MS);
    const unsubscribe = onAchievementCheck(() => window.setTimeout(check, 400));
    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [check]);

  useEffect(() => {
    const match = VISIT_ACTIONS.find(([pattern]) => pattern.test(location.pathname));
    if (match) trackClientAction(match[1]);
    // Почти любое действие на сайте — запрос к API; проверяем ачивки после навигации.
    const timer = window.setTimeout(check, 1500);
    return () => window.clearTimeout(timer);
  }, [location.pathname, check]);

  const current = queue[0] || null;

  useEffect(() => {
    if (!current) return;
    setVisible(true);
    const hide = window.setTimeout(() => setVisible(false), SHOW_MS);
    const next = window.setTimeout(() => setQueue((prev) => prev.slice(1)), SHOW_MS + 400);
    return () => {
      window.clearTimeout(hide);
      window.clearTimeout(next);
    };
  }, [current?.id]);

  if (!current) return null;
  const style = rarityStyle(current.rarity);

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex flex-col items-end gap-2">
      <div
        role="status"
        className={classNames(
          'pointer-events-auto flex w-80 items-center gap-3 rounded-2xl border bg-brand-deep/95 p-3 pr-4 backdrop-blur transition-all duration-500',
          style.ring,
          style.glow,
          visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
        )}
      >
        <button
          type="button"
          onClick={() => navigate('/achievements')}
          className={classNames('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-3xl', style.bg, visible && 'animate-[achievement-pop_700ms_ease-out]')}
        >
          {current.icon}
        </button>
        <button type="button" onClick={() => navigate('/achievements')} className="min-w-0 flex-1 text-left">
          <div className={classNames('text-[10px] font-bold uppercase tracking-wider', style.text)}>
            🏆 Ачивка получена · {style.label}
          </div>
          <div className="truncate text-sm font-semibold text-white">{current.title}</div>
          {current.description ? <div className="line-clamp-2 text-xs text-white/60">{current.description}</div> : null}
          {current.xp_reward ? <div className="mt-0.5 text-xs font-semibold text-emerald-300">+{current.xp_reward} XP</div> : null}
        </button>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="self-start rounded-full p-1 text-white/40 hover:bg-white/10 hover:text-white"
          aria-label="Закрыть"
        >
          <X size={14} />
        </button>
      </div>
      {queue.length > 1 ? <div className="pointer-events-none text-[11px] text-white/50">и ещё {queue.length - 1}…</div> : null}
    </div>
  );
}

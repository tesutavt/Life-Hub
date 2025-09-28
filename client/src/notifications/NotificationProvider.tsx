import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { X } from 'lucide-react';
import {
  NotificationItem,
  NotificationInput,
  NotificationVariant,
  notify,
  pushNotification,
  subscribe,
} from './notificationBus';

type NotificationContextValue = {
  push: (notification: NotificationInput) => NotificationItem;
  pushInfo: (message: string, options?: Omit<NotificationInput, 'message' | 'variant'>) => NotificationItem;
  pushSuccess: (message: string, options?: Omit<NotificationInput, 'message' | 'variant'>) => NotificationItem;
  pushWarning: (message: string, options?: Omit<NotificationInput, 'message' | 'variant'>) => NotificationItem;
  pushError: (message: string, options?: Omit<NotificationInput, 'message' | 'variant'>) => NotificationItem;
  dismiss: (id: number) => void;
};

type DisplayNotification = NotificationItem & {
  ids: number[];
  count: number;
  key: string;
  closing: boolean;
};

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

const variantStyles: Record<NotificationVariant, string> = {
  info: 'border-sky-400/40 bg-sky-500/15 text-sky-50',
  success: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-50',
  warning: 'border-amber-400/40 bg-amber-500/15 text-amber-50',
  error: 'border-rose-400/40 bg-rose-500/15 text-rose-50',
};


const NOTIFICATION_EXIT_TIMEOUT = 360;
const NOTIFICATION_EASE = "ease-[cubic-bezier(0.16,1,0.3,1)]";

const createKey = (notification: NotificationItem) =>
  `${notification.variant}::${notification.title ?? ''}::${notification.message}`;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<DisplayNotification[]>([]);
  const timersRef = useRef<Map<number, number>>(new Map());

  const clearTimer = useCallback((baseId: number) => {
    const timers = timersRef.current;
    const timer = timers.get(baseId);
    if (timer) {
      window.clearTimeout(timer);
      timers.delete(baseId);
    }
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      let baseIdToRemove: number | null = null;
      setItems(prev => {
        return prev.map(item => {
          if (item.ids.includes(id)) {
            baseIdToRemove = item.ids[0];
            if (!item.closing) {
              return { ...item, closing: true };
            }
          }
          return item;
        });
      });

      if (baseIdToRemove !== null) {
        clearTimer(baseIdToRemove);
        window.setTimeout(() => {
          setItems(prev => prev.filter(entry => entry.ids[0] !== baseIdToRemove));

        }, NOTIFICATION_EXIT_TIMEOUT);
      }
    },
    [clearTimer],
  );

  const scheduleTimer = useCallback(
    (baseId: number, duration: number) => {
      clearTimer(baseId);
      if (duration === Infinity) return;
      const timerId = window.setTimeout(() => dismiss(baseId), duration);
      timersRef.current.set(baseId, timerId);
    },
    [clearTimer, dismiss],
  );

  useEffect(() => {
    const unsubscribe = subscribe(notification => {
      let timerBaseId: number | null = null;
      const timerDuration = notification.duration;

      setItems(prev => {
        const key = createKey(notification);
        const index = prev.findIndex(item => item.key === key);
        if (index >= 0) {
          const existing = prev[index];
          timerBaseId = existing.ids[0];
          const updated = [...prev];
          updated[index] = {
            ...existing,
            ids: [...existing.ids, notification.id],
            count: existing.count + 1,
            duration: notification.duration,
            closing: false,
          };
          return updated;
        }

        timerBaseId = notification.id;
        return [
          ...prev,
          {
            ...notification,
            ids: [notification.id],
            count: 1,
            key,
            closing: false,
          },
        ];
      });

      if (timerBaseId !== null) {
        scheduleTimer(timerBaseId, timerDuration);
      }
    });

    return () => {
      unsubscribe();
      timersRef.current.forEach(timerId => window.clearTimeout(timerId));
      timersRef.current.clear();
    };
  }, [scheduleTimer]);

  const contextValue = useMemo<NotificationContextValue>(
    () => ({
      push: pushNotification,
      pushInfo: (message, options) => notify.info(message, options),
      pushSuccess: (message, options) => notify.success(message, options),
      pushWarning: (message, options) => notify.warning(message, options),
      pushError: (message, options) => notify.error(message, options),
      dismiss,
    }),
    [dismiss],
  );

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      <div className="pointer-events-none fixed top-4 right-4 z-[2000] flex w-full max-w-sm flex-col gap-3 pr-1">
        {items.map(item => (
          <NotificationCard
            key={item.ids[0]}
            item={item}
            variantClass={variantStyles[item.variant]}
            onDismiss={dismiss}
          />
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

function NotificationCard({
  item,
  variantClass,
  onDismiss,
}: {
  item: DisplayNotification;
  variantClass: string;
  onDismiss: (id: number) => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!item.closing) {
      const frame = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }
    setVisible(false);
    return undefined;
  }, [item.closing]);

  return (
    <div

      className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur transition-all duration-[360ms] ${NOTIFICATION_EASE} will-change-[transform,opacity] ${
        visible ? 'translate-x-0 opacity-100 scale-100' : 'translate-x-6 opacity-0 scale-95'
      } ${variantClass}`}
    >
      <div className="flex-1 space-y-1">
        {(item.title || item.count > 1) && (
          <div className="flex items-center justify-between gap-2">
            {item.title && <div className="text-sm font-semibold leading-tight">{item.title}</div>}
            {item.count > 1 && (
              <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
                ×{item.count}
              </span>
            )}
          </div>
        )}
        <div className="text-sm leading-snug opacity-90">{item.message}</div>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(item.ids[0])}
        className="rounded-full p-1 text-xs opacity-70 transition hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}

export const pushNotificationInfo = notify.info;
export const pushNotificationSuccess = notify.success;
export const pushNotificationWarning = notify.warning;
export const pushNotificationError = notify.error;

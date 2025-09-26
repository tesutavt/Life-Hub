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

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

const variantStyles: Record<NotificationVariant, string> = {
  info: 'border-sky-400/40 bg-sky-500/15 text-sky-50',
  success: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-50',
  warning: 'border-amber-400/40 bg-amber-500/15 text-amber-50',
  error: 'border-rose-400/40 bg-rose-500/15 text-rose-50',
};

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const timersRef = useRef<Map<number, number>>(new Map());

  const remove = useCallback((id: number) => {
    setItems(prev => prev.filter(notification => notification.id !== id));
    const timers = timersRef.current;
    const timer = timers.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.delete(id);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribe(notification => {
      setItems(prev => [...prev, notification]);
      if (notification.duration !== Infinity) {
        const timerId = window.setTimeout(() => remove(notification.id), notification.duration);
        timersRef.current.set(notification.id, timerId);
      }
    });

    return () => {
      unsubscribe();
      timersRef.current.forEach(timerId => window.clearTimeout(timerId));
      timersRef.current.clear();
    };
  }, [remove]);

  const contextValue = useMemo<NotificationContextValue>(() => ({
    push: pushNotification,
    pushInfo: (message, options) => notify.info(message, options),
    pushSuccess: (message, options) => notify.success(message, options),
    pushWarning: (message, options) => notify.warning(message, options),
    pushError: (message, options) => notify.error(message, options),
    dismiss: remove,
  }), [remove]);

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      <div className="pointer-events-none fixed top-4 right-4 z-[2000] flex w-full max-w-sm flex-col gap-3 pr-1">
        {items.map(item => (
          <div
            key={item.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur ${variantStyles[item.variant]}`}
          >
            <div className="flex-1">
              {item.title && <div className="text-sm font-semibold leading-tight">{item.title}</div>}
              <div className="text-sm leading-snug opacity-90">{item.message}</div>
            </div>
            <button
              type="button"
              onClick={() => remove(item.id)}
              className="rounded-full p-1 text-xs opacity-70 transition hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
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

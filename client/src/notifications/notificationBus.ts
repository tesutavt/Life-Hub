import { NotificationCategory } from '../types/ui';

export type NotificationVariant = 'info' | 'success' | 'warning' | 'error';

export type NotificationInput = {
  id?: number;
  title?: string;
  message: string;
  variant?: NotificationVariant;
  duration?: number;
  meta?: Record<string, unknown>;
  category?: NotificationCategory;
  sound?: boolean;
  text?: boolean;
};

export type NotificationItem = Required<Pick<NotificationInput, 'id' | 'message'>> &
  Omit<NotificationInput, 'id' | 'message'> & {
    variant: NotificationVariant;
    duration: number;
    category: NotificationCategory;
    sound: boolean;
    text: boolean;
  };

type Listener = (notification: NotificationItem) => void;

let listeners: Listener[] = [];
let counter = 0;

const DEFAULT_DURATION = 4000;

function normalize(payload: NotificationInput): NotificationItem {
  const id = payload.id ?? ++counter;
  return {
    id,
    message: payload.message,
    title: payload.title,
    variant: payload.variant ?? 'info',
    duration: payload.duration ?? DEFAULT_DURATION,
    meta: payload.meta,
    category: payload.category ?? 'system',
    sound: payload.sound !== false,
    text: payload.text !== false,
  };
}

export function pushNotification(payload: NotificationInput) {
  const normalized = normalize(payload);
  for (const listener of listeners) listener(normalized);
  return normalized;
}

export function subscribe(listener: Listener) {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter(entry => entry !== listener);
  };
}

export const notify = {
  info(message: string, options: Omit<NotificationInput, 'message' | 'variant'> = {}) {
    return pushNotification({ ...options, message, variant: 'info' });
  },
  success(message: string, options: Omit<NotificationInput, 'message' | 'variant'> = {}) {
    return pushNotification({ ...options, message, variant: 'success' });
  },
  warning(message: string, options: Omit<NotificationInput, 'message' | 'variant'> = {}) {
    return pushNotification({ ...options, message, variant: 'warning' });
  },
  error(message: string, options: Omit<NotificationInput, 'message' | 'variant'> = {}) {
    return pushNotification({ ...options, message, variant: 'error' });
  },
};

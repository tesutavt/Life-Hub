// Мост к Electron (preload.js). В браузере — null.
export type DesktopSettings = { closeToTray: boolean; notifications: boolean; autostart: boolean; setupDone: boolean };

export type ReminderStatus = { lastCheck: string | null; ok: boolean | null; error: string | null; shown: number };

export type DesktopBridge = {
  isDesktop: boolean;
  getServer: () => Promise<{ mode: 'local' | 'remote'; url: string | null; recent?: string[] }>;
  setServer: (url: string | null) => Promise<{ ok: boolean; error?: string } | void>;
  checkServer?: (url: string) => Promise<{ ok: boolean; url?: string; error?: string }>;
  importDatabase?: () => Promise<boolean>;
  getDesktopSettings?: () => Promise<DesktopSettings>;
  setDesktopSettings?: (patch: Partial<DesktopSettings>) => Promise<DesktopSettings>;
  notify?: (payload: { title: string; body: string; route?: string | null; force?: boolean }) => Promise<boolean>;
  isWindowVisible?: () => Promise<boolean>;
  setAuth?: (token: string | null) => Promise<boolean>;
  checkReminders?: () => Promise<ReminderStatus>;
  reminderStatus?: () => Promise<ReminderStatus>;
  testNotification?: () => Promise<boolean>;
  onNavigate?: (callback: (route: string) => void) => () => void;
};

export const desktop = (): DesktopBridge | null => ((window as any).lifehubDesktop?.isDesktop ? (window as any).lifehubDesktop : null);

/** Маршруты напоминаний (общие с Android) → адреса веб-клиента. */
export function reminderPath(route?: string | null): string {
  if (!route) return '/dashboard';
  const course = /^course\/(\d+)$/.exec(route);
  if (course) return `/learn/${course[1]}`;
  const map: Record<string, string> = {
    learn: '/courses',
    habits: '/habits',
    calendar: '/calendar',
    missions: '/daily-missions',
    goals: '/year-goals',
    achievements: '/achievements',
  };
  return map[route] || '/dashboard';
}

const pad = (n: number) => String(n).padStart(2, '0');
export const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

import { NotificationPreferences } from '../types/ui';

type Cleanup = () => void;

type SettingsDetail = {
  preferences: NotificationPreferences;
};

const SETTINGS_EVENT = 'app:notifications:settings-update';

const isBrowser = typeof window !== 'undefined';

export const notifyNotificationSettingsChange = (preferences: NotificationPreferences): void => {
  if (!isBrowser) return;
  const detail: SettingsDetail = { preferences };
  window.dispatchEvent(new CustomEvent<SettingsDetail>(SETTINGS_EVENT, { detail }));
};

export const onNotificationSettingsChange = (
  callback: (preferences: NotificationPreferences) => void,
): Cleanup => {
  if (!isBrowser) return () => undefined;
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<SettingsDetail>).detail;
    if (detail?.preferences) {
      callback(detail.preferences);
    }
  };
  window.addEventListener(SETTINGS_EVENT, handler as EventListener);
  return () => window.removeEventListener(SETTINGS_EVENT, handler as EventListener);
};

export const notificationSettingsBus = {
  SETTINGS_EVENT,
};

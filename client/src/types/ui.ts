export type NotificationCategory = 'system' | 'progress' | 'event' | 'reminder';

export type NotificationPreferences = {
  disabledTypes: NotificationCategory[];
  muteSound: boolean;
  textEnabled: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  disabledTypes: [],
  muteSound: false,
  textEnabled: true,
};

export function normalizeNotificationPreferences(input: unknown): NotificationPreferences {
  if (!input || typeof input !== 'object') {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }

  const source = input as Record<string, unknown>;
  const disabledRaw = source.disabledTypes || source.disabled_types;
  const disabled = Array.isArray(disabledRaw)
    ? (disabledRaw.filter((entry): entry is NotificationCategory => typeof entry === 'string') as NotificationCategory[])
    : DEFAULT_NOTIFICATION_PREFERENCES.disabledTypes;

  const mute = source.muteSound ?? source.mute_sound;
  const text = source.textEnabled ?? source.text_enabled;

  return {
    disabledTypes: Array.from(new Set(disabled)),
    muteSound: typeof mute === 'boolean' ? mute : DEFAULT_NOTIFICATION_PREFERENCES.muteSound,
    textEnabled: typeof text === 'boolean' ? text : DEFAULT_NOTIFICATION_PREFERENCES.textEnabled,
  };
}

export type UiSettingsPayload = {
  show_menu_counters?: boolean;
  hidden_menu_items?: string[];
  notification_preferences?: {
    disabled_types?: NotificationCategory[];
    mute_sound?: boolean;
    text_enabled?: boolean;
  };
};

export type UiSettingsResponse = {
  show_menu_counters: boolean;
  hidden_menu_items: string[];
  notification_preferences: NotificationPreferences;
};

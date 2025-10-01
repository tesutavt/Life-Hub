import React, { useEffect, useMemo, useRef, useState } from "react";
import Shell from "../components/Shell";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { notifyHiddenMenuItems, notifyMenuCountersVisibility } from "../menuBus";

import { Modal } from "../components/ui/Modal";
import ReportView from "../components/reports/ReportView";
import { ReportData, ReportPeriodResponse } from "../types/reports";
import MenuMaster from "../components/master/MenuMaster";
import NotificationMaster from "../components/master/NotificationMaster";
import { MENU_ITEMS } from "../app/App";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NotificationPreferences,
  normalizeNotificationPreferences,
} from "../types/ui";
import { notifyNotificationSettingsChange } from "../notifications/settingsBus";
const defaultSocialTemplates = {
  stream: "Привет! В эфире: {stream_title}\nhttps://twitch.tv/{channel}",
  video: "Новое видео: {video_title}\n{video_url}",
};

const FALLBACK_OPENWEATHER_KEY = (() => {
  const raw = import.meta.env.VITE_OPENWEATHER_API_KEY as string | undefined;
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  const lowered = trimmed.toLowerCase();
  return lowered === "undefined" || lowered === "null" ? "" : trimmed;
})();

type SocialSettings = {
  tg_bot_token?: string | null;
  tg_chat_id?: string | null;
  twitch_channel?: string | null;
  youtube_channel_id?: string | null;
  tg_stream_template?: string | null;
  tg_video_template?: string | null;
};

type GoogleSettings = { refresh_token: string | null };

export default function Settings() {
  const { token } = useAuth();
  const [socialForm, setSocialForm] = useState<SocialSettings>({});
  const [google, setGoogle] = useState<GoogleSettings>({ refresh_token: null });
  const [weatherApiKey, setWeatherApiKey] = useState('');
  const [showMenuCounters, setShowMenuCounters] = useState(true);
  const [hiddenMenuItems, setHiddenMenuItems] = useState<string[]>([]);
  const hiddenMenuItemsRef = useRef<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingGoogle, setSavingGoogle] = useState(false);
  const [savingWeather, setSavingWeather] = useState(false);
  const [savingUi, setSavingUi] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({
    ...DEFAULT_NOTIFICATION_PREFERENCES,
  });
  const notificationPreferencesRef = useRef<NotificationPreferences>({
    ...DEFAULT_NOTIFICATION_PREFERENCES,
  });

  const [manualOpen, setManualOpen] = useState(false);
  const [manualPeriod, setManualPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [manualLoading, setManualLoading] = useState(false);
  const [manualReport, setManualReport] = useState<ReportData | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const socials = await api.get("/api/socials/settings");
        setSocialForm({
          tg_bot_token: socials.settings?.tg_bot_token || "",
          tg_chat_id: socials.settings?.tg_chat_id || "",
          twitch_channel: socials.settings?.twitch_channel || "",
          youtube_channel_id: socials.settings?.youtube_channel_id || "",
          tg_stream_template: socials.settings?.tg_stream_template || defaultSocialTemplates.stream,
          tg_video_template: socials.settings?.tg_video_template || defaultSocialTemplates.video,
        });
      } catch {
        setSocialForm({
          tg_bot_token: "",
          tg_chat_id: "",
          twitch_channel: "",
          youtube_channel_id: "",
          tg_stream_template: defaultSocialTemplates.stream,
          tg_video_template: defaultSocialTemplates.video,
        });
      }
      try {
        const g = await api.get("/api/life/settings/google");
        setGoogle({ refresh_token: g.refresh_token || "" });
      } catch {
        setGoogle({ refresh_token: "" });
      }
      try {
        const weather = await api.get("/api/life/settings/weather");
        const rawKey =
          typeof weather?.api_key === "string"
            ? weather.api_key
            : typeof weather?.weather_api_key === "string"
            ? weather.weather_api_key
            : "";
        const trimmed = (rawKey || "").trim();
        setWeatherApiKey(trimmed || FALLBACK_OPENWEATHER_KEY);
      } catch {
        setWeatherApiKey(FALLBACK_OPENWEATHER_KEY);
      }
      try {
        const ui = await api.get("/api/life/ui-settings");
        const visible = ui?.show_menu_counters !== false;
        setShowMenuCounters(visible);
        notifyMenuCountersVisibility(visible);
        const hidden = Array.isArray(ui?.hidden_menu_items)
          ? ui.hidden_menu_items.filter((entry: unknown): entry is string => typeof entry === "string")
          : [];
        setHiddenMenuItems(hidden);
        hiddenMenuItemsRef.current = hidden;
        notifyHiddenMenuItems(hidden);
        const prefs = normalizeNotificationPreferences(ui?.notification_preferences);
        setNotificationPreferences(prefs);
        notificationPreferencesRef.current = prefs;
        notifyNotificationSettingsChange(prefs);
      } catch {
        setShowMenuCounters(true);
        notifyMenuCountersVisibility(true);
        setHiddenMenuItems([]);
        hiddenMenuItemsRef.current = [];
        notifyHiddenMenuItems([]);
        setNotificationPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES });
        notificationPreferencesRef.current = { ...DEFAULT_NOTIFICATION_PREFERENCES };
        notifyNotificationSettingsChange({ ...DEFAULT_NOTIFICATION_PREFERENCES });
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    hiddenMenuItemsRef.current = hiddenMenuItems;
  }, [hiddenMenuItems]);

  useEffect(() => {
    notificationPreferencesRef.current = notificationPreferences;
  }, [notificationPreferences]);

  const loadManualReport = async (period: 'daily' | 'weekly' | 'monthly') => {
    setManualLoading(true);
    try {
      const response = (await api.get(`/api/life/reports/period?period=${period}&force=1`)) as ReportPeriodResponse;
      setManualReport(response?.report || null);
    } catch {
      setManualReport(null);
    } finally {
      setManualLoading(false);
    }
  };

  const saveSocials = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/api/socials/settings", socialForm, {
        notifySuccess: "Настройки сохранены",
      });
      await api.post("/api/life/feed/add", {
        type: "settings",
        text: "Обновлены настройки соцсетей",
        meta: { section: "socials" },
      }, { silentSuccess: true });
    } finally {
      setSaving(false);
    }
  };

  const saveGoogle = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGoogle(true);
    try {
      await api.post("/api/life/settings/google", { refresh_token: google.refresh_token }, {
        notifySuccess: "Google API token сохранён",
      });
    } finally {
      setSavingGoogle(false);
    }
  };

  const saveWeather = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingWeather(true);
    try {
      await api.post(
        "/api/life/settings/weather",
        { api_key: weatherApiKey.trim() },
        {
          notifySuccess: "Ключ OpenWeather сохранён",
        },
      );
    } finally {
      setSavingWeather(false);
    }
  };

  const updateMenuCountersVisibility = async (show: boolean) => {
    const previous = showMenuCounters;
    setShowMenuCounters(show);
    setSavingUi(true);
    notifyMenuCountersVisibility(show);
    try {
      const response = await api.put("/api/life/ui-settings", { show_menu_counters: show });
      const resolved = response?.show_menu_counters !== false;
      setShowMenuCounters(resolved);
      if (resolved !== show) {
        notifyMenuCountersVisibility(resolved);
      }
    } catch {
      setShowMenuCounters(previous);
      notifyMenuCountersVisibility(previous);
    } finally {
      setSavingUi(false);
    }
  };

  const applyHiddenMenuItems = async (hidden: string[]) => {
    const previous = hiddenMenuItemsRef.current;
    setHiddenMenuItems(hidden);
    notifyHiddenMenuItems(hidden);
    try {
      const response = await api.put(
        "/api/life/ui-settings",
        { hidden_menu_items: hidden },
        { silentSuccess: true },
      );
      const normalized = Array.isArray(response?.hidden_menu_items)
        ? response.hidden_menu_items.filter((entry: unknown): entry is string => typeof entry === "string")
        : hidden;
      setHiddenMenuItems(normalized);
      hiddenMenuItemsRef.current = normalized;
      notifyHiddenMenuItems(normalized);
    } catch (error) {
      setHiddenMenuItems(previous);
      hiddenMenuItemsRef.current = previous;
      notifyHiddenMenuItems(previous);
      throw error;
    }
  };

  const applyNotificationPreferences = async (prefs: NotificationPreferences) => {
    const previous = notificationPreferencesRef.current;
    setNotificationPreferences(prefs);
    notificationPreferencesRef.current = prefs;
    notifyNotificationSettingsChange(prefs);
    try {
      const response = await api.put(
        "/api/life/ui-settings",
        {
          notification_preferences: {
            disabled_types: prefs.disabledTypes,
            mute_sound: prefs.muteSound,
            text_enabled: prefs.textEnabled,
          },
        },
        { silentSuccess: true },
      );
      const normalized = normalizeNotificationPreferences(response?.notification_preferences);
      setNotificationPreferences(normalized);
      notificationPreferencesRef.current = normalized;
      notifyNotificationSettingsChange(normalized);
    } catch (error) {
      setNotificationPreferences(previous);
      notificationPreferencesRef.current = previous;
      notifyNotificationSettingsChange(previous);
      throw error;
    }
  };

  const hiddenMenuSummary = useMemo(() => {
    if (hiddenMenuItems.length === 0) return "Все пункты меню отображаются.";
    const labels = hiddenMenuItems
      .map(value => MENU_ITEMS.find(item => item.to === value)?.label)
      .filter((label): label is string => Boolean(label));
    if (labels.length === 0) return "Все пункты меню отображаются.";
    const preview = labels.slice(0, 3).join(', ');
    const rest = labels.length > 3 ? ` и ещё ${labels.length - 3}` : '';
    return `Скрыто: ${preview}${rest}.`;
  }, [hiddenMenuItems]);

  const notificationSummary = useMemo(() => {
    const disabled = notificationPreferences.disabledTypes.length;
    const parts: string[] = [];
    if (disabled === 0) {
      parts.push('Все категории уведомлений включены.');
    } else {
      const labels = notificationPreferences.disabledTypes
        .map(type =>
          ({
            system: 'системные',
            progress: 'прогресс',
            event: 'события',
            reminder: 'напоминания',
          } as Record<string, string>)[type] || type,
        )
        .join(', ');
      parts.push(`Отключены: ${labels}.`);
    }
    parts.push(notificationPreferences.muteSound ? 'Звук отключён.' : 'Звук включён.');
    parts.push(
      notificationPreferences.textEnabled
        ? 'Текстовые уведомления показываются.'
        : 'Текстовые уведомления скрыты.',
    );
    return parts.join(' ');
  }, [notificationPreferences]);

  const googleAuthUrl = token
    ? `/api/fitness/google/auth?token=${encodeURIComponent(token)}`
    : "/api/fitness/google/auth";

  if (loading) {
    return (
      <Shell>
        <div className="text-sm opacity-70">Загружаем настройки…</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="text-2xl font-semibold mb-4">Настройки интеграций</div>

      <div className="grid gap-6">
        <form onSubmit={saveSocials} className="card space-y-4">
          <div>
            <div className="text-lg font-semibold mb-1">Telegram</div>
            <p className="text-xs opacity-70">Заполните поля, чтобы бот мог отправлять сообщения и посты.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <input
                placeholder="Bot token"
                value={socialForm.tg_bot_token || ""}
                onChange={(e) => setSocialForm({ ...socialForm, tg_bot_token: e.target.value })}
                className="px-3 py-2 rounded bg-white/10"
              />
              <input
                placeholder="Chat ID"
                value={socialForm.tg_chat_id || ""}
                onChange={(e) => setSocialForm({ ...socialForm, tg_chat_id: e.target.value })}
                className="px-3 py-2 rounded bg-white/10"
              />
            </div>
            <div className="flex flex-col gap-2">
              <input
                placeholder="Twitch канал (логин)"
                value={socialForm.twitch_channel || ""}
                onChange={(e) => setSocialForm({ ...socialForm, twitch_channel: e.target.value })}
                className="px-3 py-2 rounded bg-white/10"
              />
              <input
                placeholder="YouTube channelId (начинается с UC)"
                value={socialForm.youtube_channel_id || ""}
                onChange={(e) => setSocialForm({ ...socialForm, youtube_channel_id: e.target.value })}
                className="px-3 py-2 rounded bg-white/10"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs opacity-70">Шаблон сообщения о стриме</label>
              <textarea
                value={socialForm.tg_stream_template || ""}
                onChange={(e) => setSocialForm({ ...socialForm, tg_stream_template: e.target.value })}
                className="w-full px-3 py-2 rounded bg-white/10 min-h-[96px]"
              />
            </div>
            <div>
              <label className="text-xs opacity-70">Шаблон сообщения о видео</label>
              <textarea
                value={socialForm.tg_video_template || ""}
                onChange={(e) => setSocialForm({ ...socialForm, tg_video_template: e.target.value })}
                className="w-full px-3 py-2 rounded bg-white/10 min-h-[96px]"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button disabled={saving} className="px-4 py-2 rounded bg-white text-black">
              {saving ? "Сохраняем..." : "Сохранить"}
            </button>
            <span className="text-xs opacity-70">Подсказка: используйте формат &lt;name&gt;</span>
          </div>
        </form>

        <form onSubmit={saveGoogle} className="card space-y-4">
          <div>
            <div className="text-lg font-semibold mb-1">Google API / Fitness</div>
            <p className="text-xs opacity-70">Нужен для импорта активности и сна из Google Fit.</p>
          </div>
          <input
            placeholder="Refresh token"
            value={google.refresh_token || ""}
            onChange={(e) => setGoogle({ refresh_token: e.target.value })}
            className="px-3 py-2 rounded bg-white/10"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={savingGoogle} className="px-4 py-2 rounded bg-white text-black">
              {savingGoogle ? "Сохраняем..." : "Сохранить"}
            </button>
            <a
              href={googleAuthUrl}
              className="px-4 py-2 rounded bg-white/10 border border-white/20 text-sm"
            >
              Подключить к Google
            </a>
            <span className="text-xs opacity-70">После авторизации OAuth появится новый токен.</span>
          </div>
        </form>

        <form onSubmit={saveWeather} className="card space-y-4">
          <div>
            <div className="text-lg font-semibold mb-1">OpenWeather</div>
            <p className="text-xs opacity-70">
              Добавьте персональный API-ключ, чтобы показывать погоду в&nbsp;дашборде.
            </p>
          </div>
          <input
            placeholder="API key"
            value={weatherApiKey}
            onChange={(e) => setWeatherApiKey(e.target.value)}
            className="px-3 py-2 rounded bg-white/10"
            autoComplete="off"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={savingWeather} className="px-4 py-2 rounded bg-white text-black">
              {savingWeather ? "Сохраняем..." : "Сохранить"}
            </button>
            <span className="text-xs opacity-70">
              Ключ можно получить на&nbsp;openweathermap.org в&nbsp;разделе API keys.
            </span>
          </div>
        </form>

        <div className="card space-y-3">
          <div>
            <div className="text-lg font-semibold mb-1">Мастер-отчёт вручную</div>
            <p className="text-xs opacity-70">Сформируйте отчёт за выбранный период прямо из настроек.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs uppercase tracking-wide text-white/60">Период</label>
            <select
              value={manualPeriod}
              onChange={(event) => {
                const value = event.target.value as 'daily' | 'weekly' | 'monthly';
                setManualPeriod(value);
                setManualReport(null);
              }}
              className="px-3 py-2 rounded bg-white/10 border border-white/20 text-sm"
            >
              <option value="daily">За прошлый день</option>
              <option value="weekly">За прошлую неделю</option>
              <option value="monthly">За прошлый месяц</option>
            </select>
            <button
              onClick={() => {
                setManualOpen(true);
                loadManualReport(manualPeriod);
              }}
              className="px-4 py-2 rounded bg-white text-black text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={manualLoading}
            >
              {manualLoading ? 'Загружаем…' : 'Показать отчёт'}
            </button>
          </div>
          <div className="text-xs text-white/50">Отчёт сохраняется в разделе «Отчёты» и учитывает актуальные данные.</div>
        </div>

        <div className="card space-y-3">
          <div>
            <div className="text-lg font-semibold mb-1">Интерфейс</div>
            <p className="text-xs opacity-70">
              Управляйте отображением элементов меню и настройками уведомлений.
            </p>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={showMenuCounters}
              onChange={(e) => updateMenuCountersVisibility(e.target.checked)}
              disabled={savingUi}
              className="h-4 w-4 accent-white"
            />
            <span>Показывать индикаторы активных блоков в меню</span>
          </label>
          {savingUi && <div className="text-xs opacity-60">Сохраняем...</div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <MenuMaster hiddenItems={hiddenMenuItems} onApply={applyHiddenMenuItems} menuItems={MENU_ITEMS} />
            <NotificationMaster preferences={notificationPreferences} onApply={applyNotificationPreferences} />
          </div>
          <div className="text-xs text-white/60 space-y-1">
            <div>{hiddenMenuSummary}</div>
            <div>{notificationSummary}</div>
          </div>
        </div>
      </div>
      <Modal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        closeOnOverlayClick
        overlayClassName="bg-black/70 backdrop-blur-sm"
        contentClassName="w-full max-w-6xl max-h-[85vh] overflow-y-auto rounded-3xl border border-white/10 bg-brand-night/80 px-6 py-6"
      >
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-white/60">Мастер-отчёт</div>
              <div className="text-xl font-semibold text-white mt-1">
                {manualReport?.period_label || 'Предпросмотр'}
              </div>
            </div>
            <button
              onClick={() => setManualOpen(false)}
              className="rounded-full border border-white/20 px-3 py-1 text-xs uppercase tracking-wide text-white/70 hover:bg-white/10"
            >
              Закрыть
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select
              value={manualPeriod}
              onChange={(event) => {
                const value = event.target.value as 'daily' | 'weekly' | 'monthly';
                setManualPeriod(value);
                setManualReport(null);
              }}
              className="px-3 py-2 rounded bg-white/10 border border-white/20"
            >
              <option value="daily">За прошлый день</option>
              <option value="weekly">За прошлую неделю</option>
              <option value="monthly">За прошлый месяц</option>
            </select>
            <button
              onClick={() => loadManualReport(manualPeriod)}
              disabled={manualLoading}
              className="px-4 py-2 rounded bg-white text-black text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {manualLoading ? 'Обновляем…' : 'Пересчитать'}
            </button>
          </div>
          {manualLoading ? (
            <div className="text-sm text-white/60">Готовим отчёт…</div>
          ) : manualReport ? (
            <ReportView report={manualReport} />
          ) : (
            <div className="text-sm text-white/60">Выберите период и сформируйте отчёт.</div>
          )}
        </div>
      </Modal>
    </Shell>
  );
}

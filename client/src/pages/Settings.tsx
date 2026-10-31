import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Cog, LayoutGrid, Palette, Plug } from "lucide-react";
import AppearanceSettings from "./settings/sections/AppearanceSettings";
import Shell from "../components/Shell";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { notifyHiddenMenuItems, notifyMenuCountersVisibility } from "../menuBus";

import { MENU_ITEMS } from "../app/App";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NotificationPreferences,
  normalizeNotificationPreferences,
} from "../types/ui";
import { notifyNotificationSettingsChange } from "../notifications/settingsBus";
import GoogleIntegration from "./settings/sections/GoogleIntegration";
import WeatherIntegration from "./settings/sections/WeatherIntegration";
import ShelfIntegrations from "./settings/sections/ShelfIntegrations";
import InterfacePreferences from "./settings/sections/InterfacePreferences";
import ReminderSettings from "./settings/sections/ReminderSettings";
import SystemSettings from "./settings/sections/SystemSettings";
import QuickSetupMaster from "./settings/QuickSetupMaster";
import { GoogleSettings } from "./settings/types";
import {
  emitFaviconUpdate,
  emitWeatherAssetsUpdate,
  loadStoredFavicon,
  loadWeatherBackgrounds,
  loadWeatherEffects,
  saveFaviconToStorage,
  saveWeatherBackgrounds,
  saveWeatherEffects,
  updateDocumentFavicon,
  WeatherBackgroundKey,
  WeatherEffectKey,
} from "../utils/customAssets";
// Разделы настроек — как в боковом меню: оформление, уведомления, меню, система, интеграции
const SETTINGS_TABS = [
  { id: "appearance", label: "Оформление", hint: "темы, цвета, шрифт", icon: Palette },
  { id: "notifications", label: "Уведомления", hint: "напоминания и «не беспокоить»", icon: Bell },
  { id: "interface", label: "Меню и интерфейс", hint: "пункты меню, счётчики", icon: LayoutGrid },
  { id: "system", label: "Система", hint: "иконка вкладки", icon: Cog },
  { id: "integrations", label: "Интеграции", hint: "Shikimori, Steam, Google, погода", icon: Plug },
] as const;

type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

const FALLBACK_OPENWEATHER_KEY = (() => {
  const raw = import.meta.env.VITE_OPENWEATHER_API_KEY as string | undefined;
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  const lowered = trimmed.toLowerCase();
  return lowered === "undefined" || lowered === "null" ? "" : trimmed;
})();

type WeatherBackgroundMap = Record<WeatherBackgroundKey, string>;
type WeatherEffectMap = Record<WeatherEffectKey, string>;

const createInitialWeatherBackgrounds = (): WeatherBackgroundMap => {
  const stored = loadWeatherBackgrounds();
  return {
    morning: stored.morning || "",
    day: stored.day || "",
    evening: stored.evening || "",
  };
};

const createInitialWeatherEffects = (): WeatherEffectMap => {
  const stored = loadWeatherEffects();
  return {
    rain: stored.rain || "",
    snow: stored.snow || "",
    mist: stored.mist || "",
  };
};

export default function Settings() {
  const { token } = useAuth();
  const [google, setGoogle] = useState<GoogleSettings>({ refresh_token: null });
  const [weatherApiKey, setWeatherApiKey] = useState('');
  const [weatherBackgrounds, setWeatherBackgrounds] = useState<WeatherBackgroundMap>(createInitialWeatherBackgrounds);
  const [weatherEffects, setWeatherEffects] = useState<WeatherEffectMap>(createInitialWeatherEffects);
  const [favicon, setFavicon] = useState(() => loadStoredFavicon());
  const [showMenuCounters, setShowMenuCounters] = useState(true);
  const [hiddenMenuItems, setHiddenMenuItems] = useState<string[]>([]);
  const hiddenMenuItemsRef = useRef<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingGoogle, setSavingGoogle] = useState(false);
  const [savingWeather, setSavingWeather] = useState(false);
  const [savingSystem, setSavingSystem] = useState(false);
  const [savingUi, setSavingUi] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({
    ...DEFAULT_NOTIFICATION_PREFERENCES,
  });
  const notificationPreferencesRef = useRef<NotificationPreferences>({
    ...DEFAULT_NOTIFICATION_PREFERENCES,
  });

  useEffect(() => {
    updateDocumentFavicon(favicon);
  }, [favicon]);

  // ?tab=integrations — открыть нужную вкладку по ссылке (например, с полки)
  const [activeTab, setActiveTab] = useState<SettingsTabId>(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("tab");
    return (SETTINGS_TABS.some((t) => t.id === fromUrl) ? fromUrl : "appearance") as SettingsTabId;
  });
  const handleWeatherBackgroundChange = useCallback(
    (key: WeatherBackgroundKey, value: string) => {
      setWeatherBackgrounds((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleWeatherEffectChange = useCallback(
    (key: WeatherEffectKey, value: string) => {
      setWeatherEffects((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  useEffect(() => {
    (async () => {
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
        const faviconFromApi = typeof ui?.favicon === "string" ? ui.favicon.trim() : "";
        if (faviconFromApi) {
          setFavicon(faviconFromApi);
          saveFaviconToStorage(faviconFromApi);
        }
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
      saveWeatherBackgrounds(weatherBackgrounds);
      saveWeatherEffects(weatherEffects);
      emitWeatherAssetsUpdate(weatherBackgrounds, weatherEffects);
    } finally {
      setSavingWeather(false);
    }
  };

  const saveSystemSettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSavingSystem(true);
    try {
      await api.put(
        "/api/life/ui-settings",
        { favicon: favicon ? favicon : null },
        { notifySuccess: "Favicon обновлён" },
      );
      saveFaviconToStorage(favicon);
      emitFaviconUpdate(favicon);
    } finally {
      setSavingSystem(false);
    }
  };

  const updateMenuCountersVisibility = async (show: boolean) => {
    const previous = showMenuCounters;
    setShowMenuCounters(show);
    setSavingUi(true);
    notifyMenuCountersVisibility(show);
    try {
      const response = await api.put("/api/life/ui-settings", { show_menu_counters: show, favicon: favicon ? favicon : null });
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
        { hidden_menu_items: hidden, favicon: favicon ? favicon : null },
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
          favicon: favicon ? favicon : null,
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
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-2xl font-semibold">Настройки</div>
          <div className="text-sm text-white/55">Внешний вид, уведомления и подключения — общие для компьютера и телефона.</div>
        </div>
        <QuickSetupMaster
          googleRefreshToken={google.refresh_token || ""}
          onGoogleTokenChange={(token) => setGoogle({ refresh_token: token })}
          weatherKey={weatherApiKey}
          onWeatherKeyChange={setWeatherApiKey}
          favicon={favicon}
          onFaviconChange={setFavicon}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <nav className="flex gap-2 overflow-x-auto rounded-3xl border border-white/10 bg-white/[0.03] p-2 lg:flex-col lg:self-start">
          {SETTINGS_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex min-w-max items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition lg:min-w-0 ${
                  active ? "border-brand-mint/50 bg-brand-mint/15 text-white shadow-brand-glow" : "border-transparent text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className={`h-5 w-5 shrink-0 ${active ? "text-brand-mint" : "text-white/50"}`} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{tab.label}</span>
                  <span className="hidden truncate text-[11px] text-white/45 lg:block">{tab.hint}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="grid min-w-0 content-start gap-6">
          {activeTab === "appearance" && <AppearanceSettings />}
          {activeTab === "notifications" && <ReminderSettings />}
          {activeTab === "interface" && (
            <InterfacePreferences
              showMenuCounters={showMenuCounters}
              savingUi={savingUi}
              onToggleMenuCounters={updateMenuCountersVisibility}
              menuItems={MENU_ITEMS}
              hiddenMenuItems={hiddenMenuItems}
              onHiddenItemsChange={applyHiddenMenuItems}
              notificationPreferences={notificationPreferences}
              onNotificationPreferencesChange={applyNotificationPreferences}
              hiddenMenuSummary={hiddenMenuSummary}
              notificationSummary={notificationSummary}
            />
          )}
          {activeTab === "system" && (
            <SystemSettings favicon={favicon} onChange={setFavicon} onSubmit={saveSystemSettings} saving={savingSystem} />
          )}
          {activeTab === "integrations" && (
            <>
              <ShelfIntegrations />
              <GoogleIntegration value={google} onChange={(value) => setGoogle(value)} onSubmit={saveGoogle} saving={savingGoogle} authUrl={googleAuthUrl} />
              <WeatherIntegration
                apiKey={weatherApiKey}
                backgrounds={weatherBackgrounds}
                effects={weatherEffects}
                onApiKeyChange={setWeatherApiKey}
                onBackgroundChange={handleWeatherBackgroundChange}
                onEffectChange={handleWeatherEffectChange}
                onSubmit={saveWeather}
                saving={savingWeather}
              />
            </>
          )}
        </div>
      </div>

    </Shell>
  );
}

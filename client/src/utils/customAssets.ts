export type WeatherBackgroundKey = 'morning' | 'day' | 'evening';
export type WeatherEffectKey = 'rain' | 'snow' | 'mist';

export type StoredWeatherBackgrounds = Partial<Record<WeatherBackgroundKey, string>>;
export type StoredWeatherEffects = Partial<Record<WeatherEffectKey, string>>;

export const WEATHER_BACKGROUNDS_STORAGE_KEY = 'lifehub.weather.backgrounds';
export const WEATHER_EFFECTS_STORAGE_KEY = 'lifehub.weather.effects';
export const FAVICON_STORAGE_KEY = 'lifehub.system.favicon';

export const WEATHER_ASSETS_EVENT = 'lifehub:weather-assets-update';
export const FAVICON_EVENT = 'lifehub:favicon-update';

type WeatherAssetsEventDetail = {
  backgrounds: StoredWeatherBackgrounds;
  effects: StoredWeatherEffects;
};

type FaviconEventDetail = {
  favicon: string;
};

const safeParse = <T,>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const isBrowser = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export const loadWeatherBackgrounds = (): StoredWeatherBackgrounds => {
  if (!isBrowser()) return {};
  const raw = window.localStorage.getItem(WEATHER_BACKGROUNDS_STORAGE_KEY);
  const parsed = safeParse<StoredWeatherBackgrounds>(raw);
  if (!parsed || typeof parsed !== 'object') return {};
  return parsed;
};

export const saveWeatherBackgrounds = (backgrounds: StoredWeatherBackgrounds) => {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(
      WEATHER_BACKGROUNDS_STORAGE_KEY,
      JSON.stringify(backgrounds ?? {}),
    );
  } catch {
    // ignore storage write errors
  }
};

export const loadWeatherEffects = (): StoredWeatherEffects => {
  if (!isBrowser()) return {};
  const raw = window.localStorage.getItem(WEATHER_EFFECTS_STORAGE_KEY);
  const parsed = safeParse<StoredWeatherEffects>(raw);
  if (!parsed || typeof parsed !== 'object') return {};
  return parsed;
};

export const saveWeatherEffects = (effects: StoredWeatherEffects) => {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(WEATHER_EFFECTS_STORAGE_KEY, JSON.stringify(effects ?? {}));
  } catch {
    // ignore storage write errors
  }
};

export const loadStoredFavicon = (): string => {
  if (!isBrowser()) return '';
  const raw = window.localStorage.getItem(FAVICON_STORAGE_KEY);
  return typeof raw === 'string' ? raw : '';
};

export const saveFaviconToStorage = (favicon: string) => {
  if (!isBrowser()) return;
  try {
    if (favicon) {
      window.localStorage.setItem(FAVICON_STORAGE_KEY, favicon);
    } else {
      window.localStorage.removeItem(FAVICON_STORAGE_KEY);
    }
  } catch {
    // ignore storage write errors
  }
};

export const updateDocumentFavicon = (favicon: string) => {
  if (typeof document === 'undefined') return;
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']")
    || document.querySelector<HTMLLinkElement>("link[rel='shortcut icon']")
    || document.querySelector<HTMLLinkElement>("link[rel*='icon']");
  if (!favicon) {
    if (link?.parentElement) {
      link.parentElement.removeChild(link);
    }
    return;
  }
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/png';
  link.href = favicon;
};

export const emitWeatherAssetsUpdate = (backgrounds: StoredWeatherBackgrounds, effects: StoredWeatherEffects) => {
  if (!isBrowser()) return;
  const event = new CustomEvent<WeatherAssetsEventDetail>(WEATHER_ASSETS_EVENT, {
    detail: { backgrounds, effects },
  });
  window.dispatchEvent(event);
};

export const emitFaviconUpdate = (favicon: string) => {
  if (!isBrowser()) return;
  const event = new CustomEvent<FaviconEventDetail>(FAVICON_EVENT, {
    detail: { favicon },
  });
  window.dispatchEvent(event);
};

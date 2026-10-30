// Темы интерфейса: пресеты, пользовательские темы, светлый/тёмный режим, плотность, шрифт, скругления.
// Настройки общие для ПК и телефона — хранятся на сервере (/api/life/ui-settings → theme),
// а копия в localStorage нужна, чтобы тема применялась сразу при запуске, без мигания.

// Базовая палитра бренда (используют теги и календарь)
export const palette = {
  deep: '#051824',
  midnight: '#162936',
  steel: '#3b5265',
  mint: '#27e9b5',
  mintSoft: 'rgba(39, 233, 181, 0.25)',
  mintStrong: 'rgba(39, 233, 181, 0.4)',
};

export const gradients = {
  hero: 'linear-gradient(135deg, rgba(5, 24, 36, 0.95) 0%, rgba(22, 41, 54, 0.92) 45%, rgba(59, 82, 101, 0.88) 100%)',
  accentGlow: 'linear-gradient(135deg, rgba(39, 233, 181, 0.25) 0%, rgba(39, 233, 181, 0) 70%)',
};

export type ThemeMode = 'auto' | 'dark' | 'light';
export type Density = 'relaxed' | 'standard' | 'compact';

export type ThemePalette = {
  id: string;
  name: string;
  deep: string; // самый тёмный фон
  night: string; // поверхности
  slate: string; // рамки и третий слой фона
  accent: string; // акцент
  custom?: boolean;
};

export type ThemeSettings = {
  mode: ThemeMode;
  preset: string;
  accent: string | null; // null — акцент из пресета
  density: Density;
  font: string;
  radius: number; // 4…20, по умолчанию 12
  animations: boolean;
  boldFocus: boolean;
  customThemes: ThemePalette[];
};

export const PRESETS: ThemePalette[] = [
  { id: 'lifehub', name: 'Life Hub', deep: '#051824', night: '#162936', slate: '#3b5265', accent: '#27e9b5' },
  { id: 'midnight', name: 'Полночь', deep: '#070b1a', night: '#141b34', slate: '#33406b', accent: '#818cf8' },
  { id: 'ocean', name: 'Океан', deep: '#03151f', night: '#0b2a3a', slate: '#1f5068', accent: '#38bdf8' },
  { id: 'forest', name: 'Лес', deep: '#06140d', night: '#12281b', slate: '#2f5640', accent: '#4ade80' },
  { id: 'sakura', name: 'Сакура', deep: '#1a0b14', night: '#2c1424', slate: '#5e3150', accent: '#f472b6' },
  { id: 'coral', name: 'Коралл', deep: '#160d0c', night: '#261716', slate: '#4f322f', accent: '#fb7185' },
  { id: 'coffee', name: 'Кофе', deep: '#140f0a', night: '#241b13', slate: '#4b3a2a', accent: '#fbbf24' },
  { id: 'graphite', name: 'Графит', deep: '#0b0c0e', night: '#1a1c20', slate: '#3a3d44', accent: '#e5e7eb' },
];

export const ACCENTS = ['#3b82f6', '#22c55e', '#facc15', '#f97316', '#ef4444', '#d946ef', '#8b5cf6', '#22d3ee', '#fb7185', '#27e9b5'];

export const FONTS: { id: string; label: string; css: string; google?: string }[] = [
  { id: 'nunito', label: 'Nunito', css: '"Nunito Variable", Nunito, system-ui, sans-serif' },
  { id: 'inter', label: 'Inter', css: 'Inter, system-ui, sans-serif', google: 'Inter:wght@400;500;600;700' },
  { id: 'manrope', label: 'Manrope', css: 'Manrope, system-ui, sans-serif', google: 'Manrope:wght@400;500;600;700;800' },
  { id: 'rubik', label: 'Rubik', css: 'Rubik, system-ui, sans-serif', google: 'Rubik:wght@400;500;600;700' },
  { id: 'montserrat', label: 'Montserrat', css: 'Montserrat, system-ui, sans-serif', google: 'Montserrat:wght@400;500;600;700' },
  { id: 'system', label: 'Системный', css: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
];

export const DEFAULT_THEME: ThemeSettings = {
  mode: 'dark',
  preset: 'lifehub',
  accent: null,
  density: 'standard',
  font: 'nunito',
  radius: 12,
  animations: true,
  boldFocus: false,
  customThemes: [],
};

const STORAGE_KEY = 'lifehub:theme';

export function normalizeTheme(value: unknown): ThemeSettings {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<ThemeSettings>;
  const custom = Array.isArray(v.customThemes)
    ? v.customThemes.filter((t) => t && typeof t.id === 'string' && typeof t.deep === 'string').slice(0, 30).map((t) => ({ ...t, custom: true }))
    : [];
  return {
    mode: v.mode === 'auto' || v.mode === 'light' ? v.mode : 'dark',
    preset: typeof v.preset === 'string' ? v.preset : DEFAULT_THEME.preset,
    accent: typeof v.accent === 'string' && /^#[0-9a-f]{6}$/i.test(v.accent) ? v.accent : null,
    density: v.density === 'relaxed' || v.density === 'compact' ? v.density : 'standard',
    font: FONTS.some((f) => f.id === v.font) ? (v.font as string) : 'nunito',
    radius: Number.isFinite(Number(v.radius)) ? Math.min(20, Math.max(4, Number(v.radius))) : 12,
    animations: v.animations !== false,
    boldFocus: !!v.boldFocus,
    customThemes: custom,
  };
}

export function allPalettes(theme: ThemeSettings) {
  return [...PRESETS, ...theme.customThemes];
}

export function paletteOf(theme: ThemeSettings): ThemePalette {
  return allPalettes(theme).find((p) => p.id === theme.preset) || PRESETS[0]!;
}

const hexToRgb = (hex: string) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return m ? `${parseInt(m[1]!, 16)} ${parseInt(m[2]!, 16)} ${parseInt(m[3]!, 16)}` : '39 233 181';
};

const loadedFonts = new Set<string>();
function ensureFont(id: string) {
  const font = FONTS.find((f) => f.id === id);
  if (!font?.google || loadedFonts.has(id)) return;
  loadedFonts.add(id);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${font.google}&display=swap`;
  document.head.appendChild(link);
}

let mediaListener: ((e: MediaQueryListEvent) => void) | null = null;

/** Применить тему ко всему интерфейсу (CSS-переменные на <html>). */
export function applyTheme(theme: ThemeSettings) {
  const root = document.documentElement;
  const palette = paletteOf(theme);
  const accent = theme.accent || palette.accent;
  root.style.setProperty('--brand-deep-rgb', hexToRgb(palette.deep));
  root.style.setProperty('--brand-night-rgb', hexToRgb(palette.night));
  root.style.setProperty('--brand-slate-rgb', hexToRgb(palette.slate));
  root.style.setProperty('--brand-mint-rgb', hexToRgb(accent));
  root.style.setProperty('--color-deep', palette.deep);
  root.style.setProperty('--color-night', palette.night);
  root.style.setProperty('--color-slate', palette.slate);
  root.style.setProperty('--color-mint', accent);
  root.style.setProperty('--radius-scale', String(theme.radius / 12));
  root.style.setProperty('--app-font', FONTS.find((f) => f.id === theme.font)?.css || FONTS[0]!.css);
  root.style.fontSize = theme.density === 'compact' ? '15px' : theme.density === 'relaxed' ? '17px' : '16px';
  ensureFont(theme.font);
  root.classList.toggle('no-anim', !theme.animations);
  root.classList.toggle('bold-focus', theme.boldFocus);

  const media = window.matchMedia('(prefers-color-scheme: light)');
  const setLight = () => root.classList.toggle('theme-light', theme.mode === 'light' || (theme.mode === 'auto' && media.matches));
  setLight();
  if (mediaListener) media.removeEventListener('change', mediaListener);
  mediaListener = theme.mode === 'auto' ? () => setLight() : null;
  if (mediaListener) media.addEventListener('change', mediaListener);
}

export function loadLocalTheme(): ThemeSettings {
  try {
    return normalizeTheme(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveLocalTheme(theme: ThemeSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  } catch {
    // приватный режим — тема просто не запомнится локально
  }
}

const listeners = new Set<(t: ThemeSettings) => void>();
export function onThemeChange(fn: (t: ThemeSettings) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function setTheme(theme: ThemeSettings) {
  saveLocalTheme(theme);
  applyTheme(theme);
  listeners.forEach((fn) => fn(theme));
}

import { api } from './api';

export type UnlockedAchievement = {
  id: number;
  title: string;
  description?: string | null;
  icon: string;
  rarity?: string;
  xp_reward?: number;
};

type Listener = () => void;
const listeners = new Set<Listener>();

/** Просит тостер проверить новые ачивки (например, сразу после действия). */
export function requestAchievementCheck() {
  listeners.forEach((listener) => listener());
}

export function onAchievementCheck(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const sentToday = new Set<string>();
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * Засчитывает клиентское действие (визит страницы, использование функции).
 * Каждое действие отправляется не чаще раза за сессию в день — для ачивок
 * важны «дни» и «серии», а не количество перезагрузок.
 */
export function trackClientAction(action: string, { oncePerDay = true } = {}) {
  const key = `${today()}:${action}`;
  if (oncePerDay && sentToday.has(key)) return;
  sentToday.add(key);
  api
    .post('/api/achievements/track', { action }, { silentSuccess: true, silentError: true })
    .then(() => requestAchievementCheck())
    .catch(() => sentToday.delete(key));
}

type RarityStyle = { label: string; ring: string; text: string; glow: string; bg: string };

export const RARITY_STYLES: Record<string, RarityStyle> = {
  common: { label: 'Обычная', ring: 'border-slate-300/40', text: 'text-slate-200', glow: 'shadow-[0_0_30px_rgba(148,163,184,0.25)]', bg: 'from-slate-400/20 to-slate-600/10' },
  rare: { label: 'Редкая', ring: 'border-sky-300/60', text: 'text-sky-200', glow: 'shadow-[0_0_30px_rgba(56,189,248,0.35)]', bg: 'from-sky-400/25 to-indigo-500/10' },
  epic: { label: 'Эпическая', ring: 'border-fuchsia-300/60', text: 'text-fuchsia-200', glow: 'shadow-[0_0_34px_rgba(217,70,239,0.4)]', bg: 'from-fuchsia-400/25 to-purple-600/10' },
  legendary: { label: 'Легендарная', ring: 'border-amber-300/70', text: 'text-amber-200', glow: 'shadow-[0_0_40px_rgba(251,191,36,0.5)]', bg: 'from-amber-300/30 to-orange-500/10' },
};

export const rarityStyle = (rarity?: string | null): RarityStyle => RARITY_STYLES[rarity || 'common'] ?? (RARITY_STYLES.common as RarityStyle);

/** Соответствие маршрутов клиентским действиям «визит страницы». */
export const VISIT_ACTIONS: [RegExp, string][] = [
  [/^\/(dashboard)?$/, 'visit.dashboard'],
  [/^\/profile-full/, 'visit.profile'],
  [/^\/calendar/, 'visit.calendar'],
  [/^\/languages\/?$/, 'visit.languages'],
  [/^\/learn\//, 'visit.learn'],
  [/^\/courses/, 'visit.courses'],
  [/^\/year-goals/, 'visit.goals'],
  [/^\/pages/, 'visit.pages'],
  [/^\/habits/, 'visit.habits'],
  [/^\/daily-missions/, 'visit.missions'],
  [/^\/travel/, 'visit.travel'],
  [/^\/reports/, 'visit.reports'],
  [/^\/finance/, 'visit.finance'],
  [/^\/settings/, 'visit.settings'],
  [/^\/achievements/, 'visit.achievements'],
];

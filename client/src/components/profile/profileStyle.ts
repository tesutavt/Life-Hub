// Оформление профиля: фоны и витрины (как в Steam).

export type ShowcaseId = 'achievements' | 'languages' | 'courses' | 'goals' | 'activity' | 'radar' | 'feed';

export type ProfileStyle = {
  background_url: string | null;
  background_preset: string;
  featured_id: number | null;
  showcases: ShowcaseId[];
};

export const DEFAULT_PROFILE_STYLE: ProfileStyle = {
  background_url: null,
  background_preset: 'aurora',
  featured_id: null,
  showcases: ['achievements', 'languages', 'activity', 'goals'],
};

export const SHOWCASES: { id: ShowcaseId; emoji: string; title: string; hint: string }[] = [
  { id: 'achievements', emoji: '🏆', title: 'Витрина достижений', hint: 'до 6 закреплённых ачивок' },
  { id: 'languages', emoji: '🗣️', title: 'Языки', hint: 'уровень, стрик и прогресс курсов' },
  { id: 'courses', emoji: '🎓', title: 'Курсы', hint: 'что сейчас прохожу' },
  { id: 'goals', emoji: '🎯', title: 'Цели года', hint: 'прогресс по целям' },
  { id: 'activity', emoji: '🔥', title: 'Активность', hint: 'карта дней, настроение, быстрые действия' },
  { id: 'radar', emoji: '🧭', title: 'Индекс жизни', hint: 'баланс сфер на диаграмме' },
  { id: 'feed', emoji: '📰', title: 'Лента событий', hint: 'последние записи' },
];

export const BACKGROUND_PRESETS: { id: string; title: string; css: string }[] = [
  { id: 'aurora', title: 'Северное сияние', css: 'radial-gradient(ellipse at 20% 0%, rgba(39,233,181,0.35), transparent 55%), radial-gradient(ellipse at 90% 20%, rgba(99,102,241,0.35), transparent 50%), linear-gradient(180deg, #0b1a2b 0%, #071019 100%)' },
  { id: 'steam', title: 'Ночной Steam', css: 'linear-gradient(180deg, #1b2838 0%, #0e1621 60%, #090d14 100%)' },
  { id: 'sunset', title: 'Закат', css: 'radial-gradient(ellipse at 50% 0%, rgba(251,146,60,0.45), transparent 55%), linear-gradient(180deg, #3b1d3a 0%, #170d1f 100%)' },
  { id: 'forest', title: 'Лес', css: 'radial-gradient(ellipse at 30% 10%, rgba(132,204,22,0.3), transparent 55%), linear-gradient(180deg, #11261c 0%, #08130d 100%)' },
  { id: 'ocean', title: 'Океан', css: 'radial-gradient(ellipse at 70% 0%, rgba(56,189,248,0.4), transparent 55%), linear-gradient(180deg, #0c2340 0%, #050d1a 100%)' },
  { id: 'sakura', title: 'Сакура', css: 'radial-gradient(ellipse at 20% 10%, rgba(244,114,182,0.4), transparent 50%), radial-gradient(ellipse at 90% 60%, rgba(196,181,253,0.25), transparent 50%), linear-gradient(180deg, #2a1428 0%, #120a14 100%)' },
  { id: 'cozy', title: 'Уютный вечер', css: 'radial-gradient(ellipse at 50% 0%, rgba(251,191,36,0.3), transparent 55%), linear-gradient(180deg, #2b1d12 0%, #140d08 100%)' },
  { id: 'mono', title: 'Графит', css: 'linear-gradient(180deg, #1f2227 0%, #0d0f12 100%)' },
];

export const presetCss = (id: string) => (BACKGROUND_PRESETS.find((p) => p.id === id) || BACKGROUND_PRESETS[0]!).css;

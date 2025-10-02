export type AvatarFrameOption = {
  id: string;
  label: string;
  description: string;
  wrapperClass: string;
  innerClass?: string;
  accentClass?: string;
};

export const AVATAR_FRAME_OPTIONS: AvatarFrameOption[] = [
  {
    id: 'classic-night',
    label: 'Ночной свет',
    description: 'Тёмная база с мягкой мятной подсветкой.',
    wrapperClass:
      'p-[3px] rounded-[1.3rem] bg-gradient-to-r from-brand-mint/80 via-cyan-400/70 to-blue-500/70 shadow-[0_0_24px_rgba(56,189,248,0.35)]',
    innerClass: 'rounded-[1.15rem] bg-brand-night/95 border border-white/10',
  },
  {
    id: 'sunset-glow',
    label: 'Закат',
    description: 'Тёплый градиент с мягким свечением.',
    wrapperClass:
      'p-[3px] rounded-[1.3rem] bg-gradient-to-r from-orange-400/80 via-pink-500/75 to-purple-500/70 shadow-[0_0_22px_rgba(244,114,182,0.35)]',
    innerClass: 'rounded-[1.15rem] bg-brand-night/95 border border-white/10',
  },
  {
    id: 'aurora',
    label: 'Северное сияние',
    description: 'Холодные переливы синего и фиолетового.',
    wrapperClass:
      'p-[3px] rounded-[1.3rem] bg-gradient-to-br from-sky-500/80 via-indigo-500/70 to-purple-600/70 shadow-[0_0_24px_rgba(129,140,248,0.35)]',
    innerClass: 'rounded-[1.15rem] bg-brand-night/95 border border-white/10',
  },
  {
    id: 'golden-hour',
    label: 'Золотой час',
    description: 'Тонкая золотая рамка для акцента.',
    wrapperClass:
      'p-[3px] rounded-[1.3rem] bg-gradient-to-r from-amber-300/90 via-orange-200/80 to-amber-400/90 shadow-[0_0_20px_rgba(251,191,36,0.3)]',
    innerClass: 'rounded-[1.15rem] bg-brand-night/95 border border-amber-200/40',
  },
  {
    id: 'minimal',
    label: 'Минимал',
    description: 'Аккуратная рамка без ярких эффектов.',
    wrapperClass: 'p-[2px] rounded-[1.15rem] border border-white/15 bg-brand-night/80',
    innerClass: 'rounded-[1rem] bg-brand-night/95 border border-white/5',
  },
];

export const DEFAULT_AVATAR_FRAME_ID = 'classic-night';

export function getAvatarFrameOption(frameId?: string | null): AvatarFrameOption {
  const found = AVATAR_FRAME_OPTIONS.find((option) => option.id === frameId);
  return found ?? AVATAR_FRAME_OPTIONS[0];
}

export function resolveAvatarFrameId(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_AVATAR_FRAME_ID;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_AVATAR_FRAME_ID;
  return AVATAR_FRAME_OPTIONS.some((option) => option.id === trimmed)
    ? trimmed
    : DEFAULT_AVATAR_FRAME_ID;
}

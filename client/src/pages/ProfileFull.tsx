
import React, { useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { Image as ImageIcon, Link2, MapPin, Palette, Sparkles, User, type LucideIcon } from 'lucide-react';
import Shell from '../components/Shell';
import { Modal } from '../components/ui/Modal';
import { api, resolveApiUrl } from '../api';
import { useAuth } from '../AuthContext';
import { useNotifications } from '../notifications/NotificationProvider';
import { useReorderableList } from '../hooks/useReorderableList';
import { AVATAR_FRAME_OPTIONS, DEFAULT_AVATAR_FRAME_ID, getAvatarFrameOption, resolveAvatarFrameId } from '../constants/avatarFrames';

const JOURNAL_BATCH_SIZE = 10;

const DEFAULT_PAGE_GRADIENT = 'linear-gradient(135deg, rgba(59, 130, 246, 0.65) 0%, rgba(236, 72, 153, 0.6) 100%)';
const FALLBACK_AVATAR = 'https://api.dicebear.com/9.x/identicon/svg';

const LANGUAGE_CARD_FALLBACKS = [
  'linear-gradient(135deg, rgba(244, 114, 182, 0.65), rgba(251, 191, 36, 0.55))',
  'linear-gradient(135deg, rgba(14, 165, 233, 0.65), rgba(59, 130, 246, 0.55))',
  'linear-gradient(135deg, rgba(139, 92, 246, 0.65), rgba(236, 72, 153, 0.55))',
  'linear-gradient(135deg, rgba(16, 185, 129, 0.65), rgba(20, 184, 166, 0.55))'
];

type ProfileLanguage = {
  id: number | string;
  name: string;
  level: string | null;
  bannerUrl: string | null;
  bannerGradient: string | null;
  imageUrl: string | null;
};

type ProfileOverviewBlock = {
  id: string;
  render: () => React.ReactNode;
};

const getFeedVisuals = (type: string | null | undefined) => {
  switch (type) {
    case 'goal_completed':
      return { icon: '🎯', tone: 'bg-emerald-500/15 text-emerald-200' };
    case 'xp_gain':
      return { icon: '✨', tone: 'bg-amber-500/15 text-amber-200' };
    case 'habit_check':
      return { icon: '✅', tone: 'bg-sky-500/15 text-sky-200' };
    case 'language_progress':
      return { icon: '🈴', tone: 'bg-indigo-500/15 text-indigo-200' };
    case 'course_progress':
      return { icon: '📚', tone: 'bg-purple-500/15 text-purple-200' };
    case 'shifts_plan':
      return { icon: '🗓️', tone: 'bg-cyan-500/15 text-cyan-200' };
    case 'loan_due':
      return { icon: '💳', tone: 'bg-rose-500/15 text-rose-200' };
    case 'page':
      return { icon: '📄', tone: 'bg-blue-500/15 text-blue-200' };
    case 'note':
    default:
      return { icon: '📝', tone: 'bg-white/10 text-white/90' };
  }
};

const getFeedTypeLabel = (type: string | null | undefined) => {
  if (!type) return null;
  switch (type) {
    case 'goal_completed':
      return 'Годовая цель';
    case 'xp_gain':
      return 'Опыт';
    case 'habit_check':
      return 'Привычка';
    case 'language_progress':
      return 'Язык';
    case 'course_progress':
      return 'Курс';
    case 'shifts_plan':
      return 'График';
    case 'loan_due':
      return 'Платёж';
    case 'page':
      return 'Страница';
    case 'note':
      return 'Заметка';
    default: {
      const humanized = type.replace(/_/g, ' ');
      return humanized.charAt(0).toUpperCase() + humanized.slice(1);
    }
  }
};

const formatFeedDate = (value: any) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  try {
    return date.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return date.toLocaleString('ru-RU');
  }
};

const resolveMediaUrl = (value: string | null | undefined) => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return resolveApiUrl(value);
};

const pickFirstString = (...values: any[]): string | null => {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length === 0) continue;
    return trimmed;
  }
  return null;
};

const mapProfileLanguage = (entry: any, index: number): ProfileLanguage => ({
  id: entry.id ?? entry.language_id ?? entry.slug ?? `${entry.name ?? 'language'}_${index}`,
  name: entry.name ?? 'Неизвестный язык',
  level: entry.level ?? entry.level_label ?? null,
  bannerUrl: entry.banner_url ?? entry.bannerUrl ?? null,
  bannerGradient: entry.banner_gradient ?? entry.bannerGradient ?? null,
  imageUrl: entry.image_url ?? entry.imageUrl ?? null
});

const getLanguageInitials = (name: string) => {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
};

const getLanguageBannerStyle = (language: ProfileLanguage, index: number): React.CSSProperties => {
  const resolvedBannerUrl = resolveMediaUrl(language.bannerUrl);
  if (resolvedBannerUrl) {
    return {
      backgroundImage: `url(${resolvedBannerUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center'
    };
  }

  if (typeof language.bannerGradient === 'string' && language.bannerGradient.trim().length > 0) {
    return {
      backgroundImage: language.bannerGradient
    };
  }

  return {
    backgroundImage: LANGUAGE_CARD_FALLBACKS[index % LANGUAGE_CARD_FALLBACKS.length]
  };
};

const normalizeProfileLink = (value: string) => {
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
};

const PAGE_PREVIEW_MASK_STYLE: React.CSSProperties = {
  clipPath: 'polygon(28% 0%, 100% 0%, 100% 100%, 0% 100%)'
};

const PAGE_PREVIEW_OVERLAY_STYLE: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(115deg, rgba(12, 12, 12, 0.9) 0%, rgba(12, 12, 12, 0.65) 35%, rgba(12, 12, 12, 0.35) 60%, rgba(12, 12, 12, 0) 100%)'
};

const PAGE_META_KEYS = [
  'page',
  'page_info',
  'pageInfo',
  'page_data',
  'pageData',
  'page_meta',
  'pageMeta'
];

type PageVisual = {
  bannerUrl: string | null;
  bannerGradient: string | null;
};

const isLikelyJson = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  );
};

const safeParseJson = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const buildGradientFromColors = (colors: string[], angle?: string | number | null) => {
  if (colors.length < 2) return null;
  let angleValue = '135deg';
  if (typeof angle === 'number' && Number.isFinite(angle)) {
    angleValue = `${angle}deg`;
  } else if (typeof angle === 'string' && angle.trim()) {
    angleValue = angle.trim();
  }
  return `linear-gradient(${angleValue}, ${colors.join(', ')})`;
};

const extractColorFromUnknown = (value: any): string | null => {
  if (value == null) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (isLikelyJson(trimmed)) {
      const parsed = safeParseJson(trimmed);
      return parsed ? extractColorFromUnknown(parsed) : null;
    }
    if (/gradient\s*\(/i.test(trimmed)) return null;
    if (/^https?:\/\//i.test(trimmed)) return null;
    if (trimmed.startsWith('url(')) return null;
    return trimmed;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const color = extractColorFromUnknown(item);
      if (color) return color;
    }
    return null;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, any>;
    if (typeof obj.color === 'string' && obj.color.trim()) return obj.color.trim();
    if (typeof obj.value === 'string') {
      const trimmed = obj.value.trim();
      if (trimmed && !/gradient\s*\(/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
        return trimmed;
      }
    }
    if (typeof obj.hex === 'string' && obj.hex.trim()) return obj.hex.trim();
    if (typeof obj.code === 'string' && obj.code.trim()) return obj.code.trim();
    for (const nested of Object.values(obj)) {
      const color = extractColorFromUnknown(nested);
      if (color) return color;
    }
  }

  return null;
};

const extractUrlFromUnknown = (value: any): string | null => {
  if (value == null) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (isLikelyJson(trimmed)) {
      const parsed = safeParseJson(trimmed);
      return parsed ? extractUrlFromUnknown(parsed) : null;
    }
    if (/gradient\s*\(/i.test(trimmed)) return null;
    if (trimmed.startsWith('url(')) return null;
    const looksLikeUrl =
      /^https?:\/\//i.test(trimmed) ||
      trimmed.startsWith('/') ||
      trimmed.startsWith('data:image') ||
      trimmed.startsWith('blob:') ||
      trimmed.includes('/') ||
      /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(trimmed);
    if (looksLikeUrl) {
      return trimmed;
    }
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const url = extractUrlFromUnknown(item);
      if (url) return url;
    }
    return null;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, any>;
    const prioritizedKeys = [
      'url',
      'src',
      'href',
      'path',
      'image',
      'file',
      'original',
      'default',
      'large',
      'medium',
      'small',
      'value'
    ];
    for (const key of prioritizedKeys) {
      if (key in obj) {
        const candidate = extractUrlFromUnknown(obj[key]);
        if (candidate) return candidate;
      }
    }
    for (const nested of Object.values(obj)) {
      const candidate = extractUrlFromUnknown(nested);
      if (candidate) return candidate;
    }
  }

  return null;
};

const extractGradientFromUnknown = (value: any): string | null => {
  if (value == null) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (isLikelyJson(trimmed)) {
      const parsed = safeParseJson(trimmed);
      return parsed ? extractGradientFromUnknown(parsed) : null;
    }
    if (/gradient\s*\(/i.test(trimmed)) return trimmed;
    return null;
  }

  if (Array.isArray(value)) {
    const colors: string[] = [];
    for (const item of value) {
      const gradient = extractGradientFromUnknown(item);
      if (gradient) return gradient;
      const color = extractColorFromUnknown(item);
      if (color) colors.push(color);
    }
    if (colors.length >= 2) {
      const built = buildGradientFromColors(colors);
      if (built) return built;
    }
    return null;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, any>;
    if (typeof obj.css === 'string' && obj.css.trim()) {
      const css = obj.css.trim();
      if (/gradient\s*\(/i.test(css)) return css;
    }
    if (typeof obj.value === 'string' && obj.value.trim()) {
      const val = obj.value.trim();
      if (/gradient\s*\(/i.test(val)) return val;
    }
    const colors: string[] = [];
    const collectColors = (input: any) => {
      const color = extractColorFromUnknown(input);
      if (color) colors.push(color);
    };
    collectColors(obj.from);
    collectColors(obj.start);
    collectColors(obj.begin);
    if (Array.isArray(obj.colors)) {
      for (const entry of obj.colors) collectColors(entry);
    }
    if (Array.isArray(obj.stops)) {
      for (const stop of obj.stops) {
        collectColors((stop as any)?.color ?? (stop as any)?.value ?? stop);
      }
    }
    collectColors(obj.to);
    collectColors(obj.end);
    if (colors.length >= 2) {
      const angleSource = obj.angle ?? obj.rotation ?? obj.deg ?? null;
      const built = buildGradientFromColors(colors, angleSource as string | number | null | undefined);
      if (built) return built;
    }
    for (const nested of Object.values(obj)) {
      const gradient = extractGradientFromUnknown(nested);
      if (gradient) return gradient;
    }
  }

  return null;
};

const BANNER_SOURCE_KEYS = [
  'banner_url',
  'bannerUrl',
  'banner',
  'cover_url',
  'coverUrl',
  'cover',
  'image_url',
  'imageUrl',
  'image',
  'thumbnail_url',
  'thumbnailUrl',
  'thumbnail',
  'preview_url',
  'previewUrl',
  'preview',
  'hero',
  'hero_image',
  'heroImage',
  'background_image',
  'backgroundImage',
  'background',
  'media',
  'assets',
  'visual',
  'visuals',
  'header'
];

const GRADIENT_SOURCE_KEYS = [
  'banner_gradient',
  'bannerGradient',
  'gradient',
  'cover_gradient',
  'coverGradient',
  'background_gradient',
  'backgroundGradient',
  'background',
  'appearance',
  'style',
  'theme',
  'visual',
  'visuals',
  'media'
];

const collectPageMetaCandidates = (entry: any): Record<string, any>[] => {
  const visited = new Set<any>();
  const queue: any[] = [];
  const result: Record<string, any>[] = [];

  const push = (value: any) => {
    if (!value || typeof value !== 'object') return;
    if (visited.has(value)) return;
    visited.add(value);
    queue.push(value);
  };

  push(entry);
  push(entry?.meta);
  push(entry?.page);
  push(entry?.page_info);
  push(entry?.pageInfo);
  push(entry?.page_data);
  push(entry?.pageData);
  push(entry?.page_meta);
  push(entry?.pageMeta);
  push(entry?.resource);
  push(entry?.data);
  push(entry?.payload);

  const keysToFollow = new Set<string>([
    ...PAGE_META_KEYS,
    'meta',
    'data',
    'attributes',
    'details',
    'page',
    'info',
    'appearance',
    'style',
    'background',
    'visual',
    'visuals',
    'media',
    'asset',
    'assets',
    'content',
    'config',
    'options',
    'theme',
    'header',
    'cover',
    'banner',
    'preview',
    'resource',
    'payload',
    'entity'
  ]);

  while (queue.length > 0 && result.length < 64) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (Array.isArray(current)) {
      for (const item of current) push(item);
      continue;
    }

    result.push(current as Record<string, any>);

    for (const [key, rawValue] of Object.entries(current as Record<string, any>)) {
      if (!rawValue) continue;

      if (typeof rawValue === 'string') {
        const trimmed = rawValue.trim();
        if (isLikelyJson(trimmed)) {
          const parsed = safeParseJson(trimmed);
          if (parsed && typeof parsed === 'object') {
            push(parsed);
          }
        }
      }

      if (typeof rawValue === 'object') {
        if (Array.isArray(rawValue)) {
          for (const item of rawValue) push(item);
        } else if (
          keysToFollow.has(key) ||
          key.endsWith('_meta') ||
          key.endsWith('Meta') ||
          key.endsWith('_data') ||
          key.endsWith('Data') ||
          key.endsWith('_info') ||
          key.endsWith('Info')
        ) {
          push(rawValue);
        }
      }
    }
  }

  return result;
};

const resolvePageVisual = (entry: any): PageVisual | null => {
  if (!entry || typeof entry !== 'object') return null;
  const candidates = collectPageMetaCandidates(entry);

  for (const candidate of candidates) {
    let bannerUrl: string | null = null;
    for (const key of BANNER_SOURCE_KEYS) {
      if (key in candidate) {
        const extracted = extractUrlFromUnknown((candidate as any)[key]);
        if (extracted) {
          bannerUrl = extracted;
          break;
        }
      }
    }

    let bannerGradient: string | null = null;
    for (const key of GRADIENT_SOURCE_KEYS) {
      if (key in candidate) {
        const extracted = extractGradientFromUnknown((candidate as any)[key]);
        if (extracted) {
          bannerGradient = extracted;
          break;
        }
      }
    }

    if (bannerUrl || bannerGradient) {
      return {
        bannerUrl: bannerUrl ? resolveMediaUrl(bannerUrl) : null,
        bannerGradient
      };

    }
  }

  return null;
};

const getPagePreviewStyle = (entry: any): React.CSSProperties | null => {
  const directBanner = pickFirstString(
    entry?.page_banner_url,
    entry?.pageBannerUrl,
    entry?.linked_page?.banner_url,
    entry?.linked_page?.bannerUrl,
    entry?.linkedPage?.banner_url,
    entry?.linkedPage?.bannerUrl,
    entry?.page_visual?.banner_url,
    entry?.page_visual?.bannerUrl,
    entry?.meta?.page_banner_url,
    entry?.meta?.page_bannerUrl
  );
  const resolvedDirectBanner = resolveMediaUrl(directBanner);
  if (resolvedDirectBanner) {
    return {
      backgroundImage: `url(${resolvedDirectBanner})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center'
    };
  }

  const directGradient = pickFirstString(
    entry?.page_banner_gradient,
    entry?.pageBannerGradient,
    entry?.linked_page?.banner_gradient,
    entry?.linked_page?.bannerGradient,
    entry?.linkedPage?.banner_gradient,
    entry?.linkedPage?.bannerGradient,
    entry?.page_visual?.banner_gradient,
    entry?.page_visual?.bannerGradient,
    entry?.meta?.page_banner_gradient,
    entry?.meta?.page_bannerGradient
  );
  if (directGradient) {
    return {
      backgroundImage: directGradient
    };
  }

  const visual = resolvePageVisual(entry);
  if (!visual) return null;

  if (visual.bannerUrl) {
    return {
      backgroundImage: `url(${visual.bannerUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center'
    };
  }

  if (visual.bannerGradient) {
    return {
      backgroundImage: visual.bannerGradient
    };
  }

  return {
    backgroundImage: DEFAULT_PAGE_GRADIENT
  };
};

export default function ProfileFull() {
  const [data, setData] = useState<any>(null);
  const [journal, setJournal] = useState<any[]>([]);
  const [visibleCount, setVisibleCount] = useState(JOURNAL_BATCH_SIZE);
  const [languages, setLanguages] = useState<ProfileLanguage[]>([]);
  const [nextEvent, setNextEvent] = useState<any | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [profileLink, setProfileLink] = useState('');
  const [avatarFrameMain, setAvatarFrameMain] = useState<string>(DEFAULT_AVATAR_FRAME_ID);
  const [avatarFrameMini, setAvatarFrameMini] = useState<string>(DEFAULT_AVATAR_FRAME_ID);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState<string | null>(null);
  const [openEdit, setOpenEdit] = useState(false);
  const [activeEditTab, setActiveEditTab] = useState<'basic' | 'avatar'>('basic');
  const { token } = useAuth();
  const { pushError } = useNotifications();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const isLoadingMoreRef = useRef(false);
  const profileLanguagesLayout = useReorderableList<ProfileLanguage>(
    'languages:active',
    languages,
    (language) => language.id,
  );

  const overviewBlocks = useMemo<ProfileOverviewBlock[]>(() => {
    const badges = Array.isArray(data?.badges) ? data.badges : [];

    return [
      {
        id: 'badges',
        render: () => (
          <>
            <div className="font-medium mb-2">Значки</div>
            {badges.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {badges.map((b: any) => (
                  <div
                    key={b.id}
                    className="p-2 rounded-xl bg-white/5 border border-white/10 text-center"
                  >
                    <div className="text-xl leading-none">🏅</div>
                    <div className="text-[11px] mt-1 truncate text-white/70">{b.name}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="opacity-70 text-sm">Нет значков</div>
            )}
          </>
        ),
      },
      {
        id: 'languages',
        render: () => (
          <>
            <div className="font-medium mb-2">Изучаемые языки</div>
            {profileLanguagesLayout.items.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" {...profileLanguagesLayout.getContainerProps()}>
                {profileLanguagesLayout.items.map((language, index) => {
                  const dragProps = profileLanguagesLayout.getDraggableProps(language.id);
                  const canDrag = dragProps.draggable;
                  const isDragging = profileLanguagesLayout.activeId === String(language.id);
                  const isOver = profileLanguagesLayout.overId === String(language.id);
                  const bannerStyle = getLanguageBannerStyle(language, index);
                  const avatarUrl = resolveMediaUrl(language.imageUrl);
                  return (
                    <div
                      key={language.id}
                      {...dragProps}
                      data-dragging={isDragging ? 'true' : undefined}
                      data-drop-target={isOver && !isDragging ? 'true' : undefined}
                      className={classNames(
                        'relative overflow-hidden rounded-xl border border-white/10 bg-white/5 transition-all duration-200 ease-out select-none',
                        { 'cursor-grab active:cursor-grabbing': canDrag },
                        {
                          'ring-2 ring-white/70 border-white/40 scale-[0.98] shadow-2xl shadow-black/40': isDragging,
                          'border-white/30 ring-1 ring-white/40': isOver && !isDragging,
                          'hover:-translate-y-0.5': !isDragging,
                        },
                      )}
                    >
                      <div className="absolute inset-0" style={bannerStyle} />
                      <div className="absolute inset-0 bg-black/40" />
                      <div className="relative p-2.5 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg border border-white/15 bg-black/40 overflow-hidden flex items-center justify-center text-xs font-semibold uppercase tracking-wide">
                          {avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt={`Изображение ${language.name}`}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <span>{getLanguageInitials(language.name)}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate text-white/90">{language.name}</div>
                          <div className="text-[11px] opacity-80">
                            {language.level ? `Уровень ${language.level}` : 'Уровень не указан'}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="opacity-70 text-sm">Нет данных</div>
            )}
          </>
        ),
      },
      {
        id: 'next-event',
        render: () => (
          <>
            <div className="font-medium mb-2">Ближайшее событие</div>
            {nextEvent ? (
              <div className="text-sm">
                <b>{nextEvent.title}</b>
                <div className="opacity-70">{nextEvent.date}</div>
              </div>
            ) : (
              <div className="opacity-70 text-sm">Событий нет</div>
            )}
          </>
        ),
      },
    ];
  }, [data?.badges, nextEvent, profileLanguagesLayout]);

  const overviewBlocksLayout = useReorderableList<ProfileOverviewBlock>(
    'profile:overview-blocks',
    overviewBlocks,
    (block) => block.id,
  );
  const load = async () => {
    const d = await api.get('/api/life/profile');
    setData(d);
    setDisplayName(d?.user?.name || '');
    setBio(d?.user?.bio || '');
    setCity(d?.user?.city || '');
    setProfileLink(d?.user?.profile_url || '');
    setAvatarFrameMain(resolveAvatarFrameId(d?.user?.avatar_frame_main));
    setAvatarFrameMini(resolveAvatarFrameId(d?.user?.avatar_frame_mini));
    setAvatarFile(null);
    setBannerFile(null);
    setAvatarPreviewUrl(null);
    setBannerPreviewUrl(null);

    // ✅ Лента (только feed, без страниц)
    const feed = await api.get('/api/life/feed');
    const normalized = (feed.items || []).map((item: any) => {
      const rawTs = item.ts ?? item.created_at ?? item.date ?? null;
      let meta = item.meta;
      if (typeof meta === 'string') {
        try {
          meta = JSON.parse(meta);
        } catch {
          // ignore malformed meta
        }
      }
      let tsValue: number | null = null;
      if (typeof rawTs === 'number') {
        tsValue = rawTs;
      } else if (typeof rawTs === 'string') {
        const parsed = Date.parse(rawTs);
        tsValue = Number.isNaN(parsed) ? null : parsed;
      }
      return {
        ...item,
        ts: rawTs,
        tsValue,
        type: item.type || 'note',
        meta
      };
    });
    const sorted = normalized.sort((a: any, b: any) => (b.tsValue ?? 0) - (a.tsValue ?? 0));
    setJournal(sorted);
    setVisibleCount(Math.min(JOURNAL_BATCH_SIZE, sorted.length));
    isLoadingMoreRef.current = false;

    const langs = await api.get('/api/life/languages');
    setLanguages((langs.items || []).map((entry: any, index: number) => mapProfileLanguage(entry, index)));

    const cal = await api.get('/api/life/calendar');
    const today = new Date().toISOString().slice(0, 10);
    const future = (cal.items || [])
      .filter((x: any) => x.date >= today)
      .sort((a: any, b: any) => a.date.localeCompare(b.date));
    setNextEvent(future[0] || null);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (openEdit) {
      setActiveEditTab('basic');
    }
  }, [openEdit]);

  useEffect(() => () => {
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    if (bannerPreviewUrl) URL.revokeObjectURL(bannerPreviewUrl);
  }, [avatarPreviewUrl, bannerPreviewUrl]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          if (isLoadingMoreRef.current) return;
          if (visibleCount >= journal.length) {
            isLoadingMoreRef.current = false;
            return;
          }
          isLoadingMoreRef.current = true;
          setVisibleCount((prev) => Math.min(prev + JOURNAL_BATCH_SIZE, journal.length));
        } else {
          isLoadingMoreRef.current = false;
        }
      },
      { rootMargin: '200px 0px 200px 0px', threshold: 0 }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [journal.length, visibleCount]);

  const visibleJournal = journal.slice(0, visibleCount);

  const level = data?.xp?.level || 1;
  const xp = data?.xp?.xp || 0;
  const prevLevel = Math.max(0, level - 1);
  const base = prevLevel * prevLevel * 100;
  const nextLevel = level * level * 100;
  const ratio = nextLevel === base ? 0 : Math.max(0, Math.min(1, (xp - base) / (nextLevel - base)));
  const prog = Math.round(ratio * 100);

  const save = async () => {
    if (!token) {
      pushError('Не удалось сохранить профиль: требуется авторизация');
      return;
    }
    const fd = new FormData();
    fd.append('display_name', displayName);
    fd.append('bio', bio);
    fd.append('city', city.trim());
    fd.append('profile_link', profileLink.trim());
    fd.append('avatar_frame_main', avatarFrameMain);
    fd.append('avatar_frame_mini', avatarFrameMini);
    if (avatarFile) fd.append('avatar', avatarFile);
    if (bannerFile) fd.append('banner', bannerFile);

    const res = await fetch(resolveApiUrl('/api/life/profile'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd
    });

    if (!res.ok) { alert('Ошибка сохранения'); return; }
    await load();
    setOpenEdit(false);
    alert('Профиль обновлён!');
  };

  const handleAvatarFileChange = (file: File | null) => {
    setAvatarFile(file);
    setAvatarPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  };

  const handleBannerFileChange = (file: File | null) => {
    setBannerFile(file);
    setBannerPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  };

  const currentAvatarSrc = avatarPreviewUrl
    ? avatarPreviewUrl
    : data?.user?.avatar_url
    ? resolveApiUrl(data.user.avatar_url)
    : FALLBACK_AVATAR;

  const currentBannerSrc = bannerPreviewUrl
    ? bannerPreviewUrl
    : data?.user?.banner_url
    ? resolveApiUrl(data.user.banner_url)
    : null;

  const renderFramedAvatar = (frameId: string, sizeClass: string, src: string, alt: string) => {
    const option = getAvatarFrameOption(frameId);
    const innerClassName = option.innerClass || 'rounded-3xl bg-brand-night/95 border border-white/10';
    return (
      <div className={classNames('relative flex items-center justify-center', sizeClass)}>
        <div className={classNames('w-full h-full flex items-center justify-center', option.wrapperClass)}>
          <div className={classNames('w-full h-full overflow-hidden flex items-center justify-center', innerClassName)}>
            <img src={src} alt={alt} className="h-full w-full object-cover" />
          </div>
        </div>
      </div>
    );
  };

  const savedMainFrameId = resolveAvatarFrameId(data?.user?.avatar_frame_main);
  const savedMiniFrameId = resolveAvatarFrameId(data?.user?.avatar_frame_mini);
  const savedProfileLink = typeof data?.user?.profile_url === 'string' ? data.user.profile_url.trim() : '';
  const profileLinkHref = savedProfileLink ? normalizeProfileLink(savedProfileLink) : '';
  const profileLinkLabel = savedProfileLink.replace(/^https?:\/\//i, '');
  const editTabs: { id: 'basic' | 'avatar'; label: string; description: string; icon: LucideIcon }[] = [
    {
      id: 'basic',
      label: 'Основное',
      description: 'Никнейм, био и контакты',
      icon: User,
    },
    {
      id: 'avatar',
      label: 'Аватар',
      description: 'Загрузка, рамка и баннер',
      icon: ImageIcon,
    },
  ];

  return (
    <Shell>
      <div className="relative overflow-hidden rounded-3xl border border-brand-slate/40 bg-brand-night/85 shadow-brand-soft">
        <div
          className="relative h-40 bg-gradient-to-r from-purple-600/40 to-blue-600/40"
          style={{
            backgroundImage: data?.user?.banner_url
              ? `url(${resolveApiUrl(data.user.banner_url)})`
              : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          <div className="absolute inset-0 bg-black/30" />
        </div>
        <div className="relative px-5 pb-5 pt-8 sm:pt-10">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between sm:gap-6">
            <div className="flex items-end gap-4">
              <div className="relative -mt-14 sm:-mt-16">
                {renderFramedAvatar(
                  savedMainFrameId,
                  'w-24 h-24 sm:w-28 sm:h-28',
                  data?.user?.avatar_url ? resolveApiUrl(data.user.avatar_url) : FALLBACK_AVATAR,
                  data?.user?.name || 'Аватар профиля'
                )}
              </div>
              <div className="mt-4 sm:mt-0">
                <div className="text-lg sm:text-xl font-semibold">
                  {data?.user?.name || 'Мой профиль'}
                </div>
                {savedProfileLink && profileLinkHref && (
                  <a
                    href={profileLinkHref}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-brand-mint/90 hover:text-brand-mint"
                  >
                    <Link2 size={14} className="opacity-70" />
                    <span className="truncate max-w-[200px] sm:max-w-[240px]">{profileLinkLabel}</span>
                  </a>
                )}
                {data?.user?.city && (
                  <div className="mt-1 flex items-center gap-2 text-sm text-white/70">
                    <MapPin className="h-4 w-4 opacity-70" />
                    <span>{data.user.city}</span>
                  </div>
                )}
                {data?.user?.bio && (
                  <div className="text-sm opacity-70">{data.user.bio}</div>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div>
              <div className="text-sm text-white/70">
                Уровень {level} · XP {xp}
              </div>
              <div className="w-full h-2 bg-white/10 rounded mt-2 overflow-hidden">
                <div className="h-2 bg-brand-mint" style={{ width: `${prog}%` }} />
              </div>
            </div>

            <button
              onClick={() => setOpenEdit(true)}
              className="justify-self-end px-3 py-1.5 rounded-xl border border-white/20 bg-white/10 text-xs font-medium uppercase tracking-wide text-white/80 transition hover:border-brand-mint/60 hover:text-brand-mint"
            >
              ✎ Изменить профиль
            </button>
          </div>
        </div>
      </div>

      {/* ---------- Панель с тремя блоками ---------- */}
      <div className="grid md:grid-cols-3 gap-4 mt-6" {...overviewBlocksLayout.getContainerProps()}>
        {overviewBlocksLayout.items.map((block) => {
          const dragProps = overviewBlocksLayout.getDraggableProps(block.id);
          const isDragging = overviewBlocksLayout.activeId === String(block.id);
          const isDropTarget = overviewBlocksLayout.overId === String(block.id) && !isDragging;
          return (
            <div
              key={block.id}
              {...dragProps}
              data-dragging={isDragging ? 'true' : undefined}
              data-drop-target={isDropTarget ? 'true' : undefined}
              className={classNames(
                'card px-4 py-3 sm:px-5 sm:py-4 transition-all duration-200 ease-out select-none',
                { 'cursor-grab active:cursor-grabbing': dragProps.draggable },
                {
                  'ring-2 ring-white/70 border-white/40 scale-[0.99] shadow-xl shadow-black/40': isDragging,
                  'border-white/30 ring-1 ring-white/40': isDropTarget,
                },
              )}
            >
              {block.render()}
            </div>
          );
        })}
      </div>

      {/* ---------- Лента дневника ---------- */}
      <div className="card mt-6">
        <div className="font-medium mb-2">Последние события</div>
        {visibleJournal.length > 0 ? (
          <div className="space-y-3">
            {visibleJournal.map((j: any) => {
              const { icon, tone } = getFeedVisuals(j.type);
              const dateLabel = formatFeedDate(j.ts ?? j.tsValue);
              const typeLabel = getFeedTypeLabel(j.type);
              const pagePreviewStyle = getPagePreviewStyle(j);
              const previewBackgroundStyle = pagePreviewStyle
                ? {
                    ...pagePreviewStyle,
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: (pagePreviewStyle as any).backgroundSize ?? 'cover',
                    backgroundPosition: (pagePreviewStyle as any).backgroundPosition ?? 'center'
                  }
                : null;
              return (
                <div
                  key={j.id || `${j.type}_${j.ts}`}
                  className="relative overflow-hidden rounded-3xl border border-white/10 bg-brand-night/75 backdrop-blur"
                >
                  <div className="relative z-10 flex items-start gap-3 p-3 sm:p-4 pr-4 sm:pr-40">
                    <div
                      className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-lg font-semibold ${tone} shadow-lg shadow-black/50`}
                    >
                      <span>{icon}</span>
                    </div>
                    <div className="flex-1 min-w-0 text-sm text-white/80">
                      <div className="flex flex-wrap items-center gap-2 justify-between text-xs text-white/50">
                        <span className="whitespace-nowrap">{dateLabel}</span>
                        {typeLabel && <span className="font-medium text-white/60">{typeLabel}</span>}
                      </div>
                      {j.title && (
                        <div className="mt-1 font-semibold text-white truncate sm:whitespace-normal">
                          {j.title}
                        </div>
                      )}
                      {j.text && (
                        <div className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-white/80">
                          {j.text}
                        </div>
                      )}
                    </div>
                  </div>
                  {previewBackgroundStyle && (
                    <div
                      className="hidden sm:block absolute inset-y-0 right-0 w-36 md:w-48 overflow-hidden"
                      style={PAGE_PREVIEW_MASK_STYLE}
                    >
                      <div className="absolute inset-0" style={previewBackgroundStyle} />
                      <div className="absolute inset-0" style={PAGE_PREVIEW_OVERLAY_STYLE} />
                      <div className="absolute inset-0 bg-black/15" />
                    </div>
                  )}
                </div>
              );
            })}
            <div
              ref={visibleCount < journal.length ? loadMoreRef : null}
              className={`text-center text-xs opacity-60 ${visibleCount < journal.length ? 'py-2' : ''}`}
            >
              {visibleCount < journal.length ? 'Загружаем ещё записи…' : null}
            </div>
          </div>
        ) : (
          <div className="opacity-70 text-sm">Записей пока нет</div>
        )}
      </div>

      {/* ---------- Модалка редактирования ---------- */}
      <Modal
        open={openEdit}
        onClose={() => setOpenEdit(false)}
        overlayClassName="bg-black/70 backdrop-blur-sm"
        containerClassName="items-center justify-center"
        contentClassName="w-full max-w-3xl overflow-hidden rounded-3xl border border-white/20 bg-brand-night/95 shadow-2xl"
      >
        <div className="border-b border-white/10 bg-white/5 px-6 py-5">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles size={18} className="text-brand-mint" />
            <span>Редактировать профиль</span>
          </div>
          <div className="mt-1 text-sm text-white/60">
            Обновите информацию, чтобы профиль выглядел ещё лучше.
          </div>
        </div>

        <div className="flex flex-col gap-6 px-6 py-5 sm:flex-row">
          <aside className="sm:w-48">
            <nav className="flex flex-row gap-2 sm:flex-col">
              {editTabs.map((tab) => {
                const active = activeEditTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveEditTab(tab.id)}
                    className={classNames(
                      'group flex-1 rounded-2xl border px-3 py-3 text-left transition sm:flex-none',
                      active
                        ? 'border-brand-mint/70 bg-brand-mint/15 text-white shadow-[0_0_30px_rgba(56,189,248,0.15)]'
                        : 'border-white/10 bg-white/5 text-white/70 hover:border-brand-mint/50 hover:text-white'
                    )}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className={active ? 'text-brand-mint' : 'text-white/60'}>
                        <Icon size={16} />
                      </span>
                      <span>{tab.label}</span>
                    </div>
                    <div className="mt-1 text-xs text-white/45">{tab.description}</div>
                  </button>
                );
              })}
            </nav>
          </aside>

          <div className="flex-1">
            {activeEditTab === 'basic' ? (
              <div className="space-y-5">
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-white/80">
                    <User size={16} className="opacity-70" />
                    Никнейм
                  </label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Отображаемое имя"
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-brand-mint/60 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-white/80">
                    <Sparkles size={16} className="opacity-70" />
                    О себе
                  </label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Расскажите о себе, интересах и целях."
                    rows={4}
                    className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-brand-mint/60 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-white/80">
                    <Link2 size={16} className="opacity-70" />
                    Личная ссылка
                  </label>
                  <input
                    value={profileLink}
                    onChange={(e) => setProfileLink(e.target.value)}
                    placeholder="example.com/me"
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-brand-mint/60 focus:outline-none"
                  />
                  <p className="mt-1 text-xs text-white/45">
                    Ссылка появится под именем и откроется в новой вкладке.
                  </p>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-white/80">
                    <MapPin size={16} className="opacity-70" />
                    Город
                  </label>
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Например, Москва"
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-brand-mint/60 focus:outline-none"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium text-white/80">
                        <ImageIcon size={16} className="opacity-80" />
                        Превью аватарки
                      </div>
                      <p className="mt-1 text-xs text-white/45">
                        Поддерживаются изображения PNG и JPG размером до 5 МБ.
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-6">
                        <div className="flex flex-col items-center gap-2">
                          {renderFramedAvatar(avatarFrameMain, 'w-24 h-24', currentAvatarSrc, displayName || 'Аватар')}
                          <span className="text-xs text-white/50">Основной профиль</span>
                        </div>
                        <div className="flex flex-col items-center gap-2">
                          {renderFramedAvatar(avatarFrameMini, 'w-16 h-16', currentAvatarSrc, displayName || 'Аватар')}
                          <span className="text-xs text-white/50">Мини-профиль</span>
                        </div>
                      </div>
                    </div>
                    <div className="w-full sm:w-48">
                      <label className="relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 bg-black/40 px-4 py-6 text-center text-sm text-white/70 transition hover:border-brand-mint/60 hover:bg-brand-mint/10">
                        <input
                          type="file"
                          accept="image/*"
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                          onChange={(e) => handleAvatarFileChange(e.target.files?.[0] || null)}
                        />
                        <ImageIcon size={20} className="text-brand-mint" />
                        <span>{avatarFile ? 'Заменить аватар' : 'Загрузить аватар'}</span>
                        {avatarFile && (
                          <span className="text-xs text-white/40">{avatarFile.name}</span>
                        )}
                      </label>
                      {avatarFile && (
                        <button
                          type="button"
                          onClick={() => handleAvatarFileChange(null)}
                          className="mt-3 w-full text-xs text-white/50 transition hover:text-brand-mint"
                        >
                          Очистить выбор
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-white/80">
                    <Palette size={16} className="opacity-80" />
                    Рамка основного профиля
                  </div>
                  <p className="mt-1 text-xs text-white/45">
                    Выберите стиль рамки, который будет виден в большом профиле.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {AVATAR_FRAME_OPTIONS.map((option) => {
                      const active = avatarFrameMain === option.id;
                      return (
                        <button
                          key={`main-${option.id}`}
                          type="button"
                          onClick={() => setAvatarFrameMain(option.id)}
                          className={classNames(
                            'w-full rounded-2xl border px-3 py-3 text-left transition hover:border-brand-mint/50 hover:bg-brand-mint/10',
                            active
                              ? 'border-brand-mint/70 bg-brand-mint/15 shadow-[0_0_24px_rgba(56,189,248,0.18)]'
                              : 'border-white/10 bg-white/5'
                          )}
                        >
                          <div className="flex items-center gap-3">
                            {renderFramedAvatar(option.id, 'w-12 h-12', currentAvatarSrc, option.label)}
                            <div>
                              <div className="text-sm font-medium text-white">{option.label}</div>
                              <div className="text-xs text-white/60">{option.description}</div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-white/80">
                    <Palette size={16} className="opacity-80" />
                    Рамка мини-профиля
                  </div>
                  <p className="mt-1 text-xs text-white/45">
                    Этот стиль будет использоваться в мини-карточках и боковом меню.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {AVATAR_FRAME_OPTIONS.map((option) => {
                      const active = avatarFrameMini === option.id;
                      return (
                        <button
                          key={`mini-${option.id}`}
                          type="button"
                          onClick={() => setAvatarFrameMini(option.id)}
                          className={classNames(
                            'w-full rounded-2xl border px-3 py-3 text-left transition hover:border-brand-mint/50 hover:bg-brand-mint/10',
                            active
                              ? 'border-brand-mint/70 bg-brand-mint/15 shadow-[0_0_24px_rgba(56,189,248,0.18)]'
                              : 'border-white/10 bg-white/5'
                          )}
                        >
                          <div className="flex items-center gap-3">
                            {renderFramedAvatar(option.id, 'w-10 h-10', currentAvatarSrc, option.label)}
                            <div>
                              <div className="text-sm font-medium text-white">{option.label}</div>
                              <div className="text-xs text-white/60">{option.description}</div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-white/80">
                    <ImageIcon size={16} className="opacity-80" />
                    Баннер профиля
                  </div>
                  <p className="mt-1 text-xs text-white/45">
                    Баннер отображается в шапке профиля и задаёт атмосферу страницы.
                  </p>
                  <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] sm:items-center">
                    <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
                      {currentBannerSrc ? (
                        <div
                          className="h-32 w-full bg-cover bg-center"
                          style={{ backgroundImage: `url(${currentBannerSrc})` }}
                        />
                      ) : (
                        <div className="flex h-32 items-center justify-center text-sm text-white/35">
                          Предпросмотр баннера
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 bg-black/40 px-4 py-6 text-center text-sm text-white/70 transition hover:border-brand-mint/60 hover:bg-brand-mint/10">
                        <input
                          type="file"
                          accept="image/*"
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                          onChange={(e) => handleBannerFileChange(e.target.files?.[0] || null)}
                        />
                        <ImageIcon size={20} className="text-brand-mint" />
                        <span>{bannerFile ? 'Заменить баннер' : 'Загрузить баннер'}</span>
                        {bannerFile && (
                          <span className="text-xs text-white/40">{bannerFile.name}</span>
                        )}
                      </label>
                      {bannerFile && (
                        <button
                          type="button"
                          onClick={() => handleBannerFileChange(null)}
                          className="mt-3 w-full text-xs text-white/50 transition hover:text-brand-mint"
                        >
                          Очистить выбор
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 bg-black/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-white/40">
            Нажмите «Сохранить», чтобы применить изменения.
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOpenEdit(false)}
              className="rounded-2xl border border-white/15 px-4 py-2 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={save}
              className="rounded-2xl bg-brand-mint/90 px-5 py-2 text-sm font-semibold text-brand-night transition hover:bg-brand-mint"
            >
              Сохранить
            </button>
          </div>
        </div>
      </Modal>
    </Shell>
  );
}

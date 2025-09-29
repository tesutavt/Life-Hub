import React, { useEffect, useRef, useState } from 'react';
import Shell from '../components/Shell';
import { Modal } from '../components/ui/Modal';
import { api, resolveApiUrl } from '../api';
import { useAuth } from '../AuthContext';
import { useNotifications } from '../notifications/NotificationProvider';

const JOURNAL_BATCH_SIZE = 10;

const DEFAULT_PAGE_GRADIENT = 'linear-gradient(135deg, rgba(59, 130, 246, 0.65) 0%, rgba(236, 72, 153, 0.6) 100%)';

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

const PAGE_PREVIEW_MASK_STYLE: React.CSSProperties = {
  maskImage: 'radial-gradient(140% 120% at 110% 50%, rgba(0, 0, 0, 1) 55%, rgba(0, 0, 0, 0) 85%)',
  WebkitMaskImage: 'radial-gradient(140% 120% at 110% 50%, rgba(0, 0, 0, 1) 55%, rgba(0, 0, 0, 0) 85%)'
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
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [openEdit, setOpenEdit] = useState(false);
  const { token } = useAuth();
  const { pushError } = useNotifications();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const isLoadingMoreRef = useRef(false);

  const load = async () => {
    const d = await api.get('/api/life/profile');
    setData(d);
    setDisplayName(d?.user?.name || '');
    setBio(d?.user?.bio || '');

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

  return (
    <Shell>
      <div className="rounded-2xl overflow-hidden border border-white/15 relative">
        <div
          className="h-40 bg-gradient-to-r from-purple-600/40 to-blue-600/40"
          style={{
            backgroundImage: data?.user?.banner_url
              ? `url(${resolveApiUrl(data.user.banner_url)})`
              : undefined,
            backgroundSize: 'cover'
          }}
        />
        <div className="p-4 relative">
          <img
            src={
              data?.user?.avatar_url
                ? resolveApiUrl(data.user.avatar_url)
                : 'https://api.dicebear.com/9.x/identicon/svg'
            }
            className="w-20 h-20 rounded-2xl border-4 border-black -mt-12"
          />
          <div className="mt-2 text-xl font-semibold">
            {data?.user?.name || 'Мой профиль'}
          </div>
          {data?.user?.bio && (
            <div className="text-sm opacity-70">{data.user.bio}</div>
          )}
          <div className="mt-2">
            Уровень {level} · XP {xp}
            <div className="w-full h-2 bg-white/10 rounded mt-1">
              <div className="h-2 bg-white rounded" style={{ width: `${prog}%` }} />
            </div>
          </div>

          <button
            onClick={() => setOpenEdit(true)}
            className="absolute top-4 right-4 px-3 py-1 rounded bg-white/10 border border-white/20 text-sm hover:bg-white/20"
          >
            ✎ Изменить профиль
          </button>
        </div>
      </div>

      {/* ---------- Панель с тремя блоками ---------- */}
      <div className="grid md:grid-cols-3 gap-6 mt-6">
        {/* Значки */}
        <div className="card">
          <div className="font-medium mb-2">Значки</div>
          <div className="grid grid-cols-3 gap-2">
            {(data?.badges || []).length > 0 ? (
              data.badges.map((b: any) => (
                <div
                  key={b.id}
                  className="p-2 rounded-xl bg-white/5 border border-white/10 text-center"
                >
                  <div className="text-2xl">🏅</div>
                  <div className="text-[11px] mt-1 truncate">{b.name}</div>
                </div>
              ))
            ) : (
              <div className="opacity-70 text-sm">Нет значков</div>
            )}
          </div>
        </div>

        {/* Языки */}
        <div className="card">
          <div className="font-medium mb-2">Изучаемые языки</div>
          {languages.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {languages.map((language, index) => {
                const bannerStyle = getLanguageBannerStyle(language, index);
                const avatarUrl = resolveMediaUrl(language.imageUrl);
                return (
                  <div
                    key={language.id}
                    className="relative overflow-hidden rounded-xl border border-white/10 bg-white/5"
                  >
                    <div className="absolute inset-0" style={bannerStyle} />
                    <div className="absolute inset-0 bg-black/40" />
                    <div className="relative p-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg border border-white/20 bg-black/40 overflow-hidden flex items-center justify-center text-sm font-semibold uppercase tracking-wide">
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
                        <div className="text-sm font-semibold truncate">{language.name}</div>
                        <div className="text-xs opacity-80">
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
        </div>

        {/* Ближайшее событие */}
        <div className="card">
          <div className="font-medium mb-2">Ближайшее событие</div>
          {nextEvent ? (
            <div className="text-sm">
              <b>{nextEvent.title}</b>
              <div className="opacity-70">{nextEvent.date}</div>
            </div>
          ) : (
            <div className="opacity-70 text-sm">Событий нет</div>
          )}
        </div>
      </div>

      {/* ---------- Лента дневника ---------- */}
      <div className="card mt-6">
        <div className="font-medium mb-2">Последние записи</div>
        {visibleJournal.length > 0 ? (
          <div className="space-y-3">
            {visibleJournal.map((j: any) => {
              const { icon, tone } = getFeedVisuals(j.type);
              const dateLabel = formatFeedDate(j.ts ?? j.tsValue);
              const typeLabel = getFeedTypeLabel(j.type);
              const pagePreviewStyle = getPagePreviewStyle(j);
              return (
                <div
                  key={j.id || `${j.type}_${j.ts}`}
                  className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10"
                >
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg ${tone}`}>
                    <span>{icon}</span>
                  </div>
                  <div className="flex-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2 justify-between text-xs opacity-70">
                      <span>{dateLabel}</span>
                      {typeLabel && <span className="font-medium text-white/60">{typeLabel}</span>}
                    </div>
                    {j.title && (
                      <div className="mt-1 font-medium text-white/90">
                        {j.title}
                      </div>
                    )}
                    {j.text && (
                      <div className="mt-1 text-white/80 whitespace-pre-line">
                        {j.text}
                      </div>
                    )}
                  </div>
                  {pagePreviewStyle && (
                    <div className="hidden sm:block w-24 h-16 relative flex-shrink-0">
                      <div
                        className="absolute inset-0 rounded-xl"
                        style={{
                          ...pagePreviewStyle,
                          ...PAGE_PREVIEW_MASK_STYLE,
                          backgroundRepeat: 'no-repeat'
                        }}
                      />
                      <div className="absolute inset-0 rounded-xl bg-black/20" />
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
        contentClassName="w-full max-w-md space-y-3 rounded-2xl border border-white/20 bg-black p-6 shadow-2xl"
      >
        <div className="text-lg font-semibold mb-2">Редактировать профиль</div>

        <input
          placeholder="Имя"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          className="w-full px-3 py-2 rounded bg-white/10"
        />
        <textarea
          placeholder="О себе"
          value={bio}
          onChange={e => setBio(e.target.value)}
          className="w-full px-3 py-2 rounded bg-white/10"
        />
        <label className="text-sm opacity-70">Аватар</label>
        <input
          type="file"
          accept="image/*"
          onChange={e => setAvatarFile(e.target.files?.[0] || null)}
        />
        <label className="text-sm opacity-70">Баннер</label>
        <input
          type="file"
          accept="image/*"
          onChange={e => setBannerFile(e.target.files?.[0] || null)}
        />

        <div className="flex justify-between mt-4">
          <button
            onClick={() => setOpenEdit(false)}
            className="px-4 py-2 rounded bg-white/10 hover:bg-white/20"
          >
            Отмена
          </button>
          <button
            onClick={save}
            className="px-4 py-2 rounded bg-green-600 hover:bg-green-700"
          >
            Сохранить
          </button>
        </div>
      </Modal>
    </Shell>
  );
}

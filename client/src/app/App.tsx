import React, { useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { api, resolveApiUrl } from '../api';
import {
  LayoutDashboard,
  CalendarDays,
  Languages as LanguagesIcon,
  GraduationCap,
  Target,
  NotebookPen,
  CheckSquare,
  Plane,
  Share2,
  Settings as SettingsIcon,
  UserCircle,
  Search,
  BarChart3,
  Link2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Palette,
  Type,
  LogOut
} from 'lucide-react';
import { onHiddenMenuItemsChange, onMenuCountersRefresh, onMenuVisibilityChange, notifyHiddenMenuItems } from '../menuBus';
import SiteSearch from '../components/SiteSearch';
import { Modal } from '../components/ui/Modal';
import ReportReminders from '../components/reports/ReportReminders';
import { getAvatarFrameOption, resolveAvatarFrameId } from '../constants/avatarFrames';

type MenuCounters = {
  languages: number;
  courses: number;
  goals: number;
};

type MenuGroupId = 'core' | 'learning' | 'lifestyle' | 'system';

export type MenuItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  counterKey?: keyof MenuCounters;
  group: MenuGroupId;
};

export const MENU_ITEMS: MenuItem[] = [
  { to: '/profile-full', label: 'Профиль', icon: UserCircle, group: 'core' },
  { to: '/dashboard', label: 'Дэшборд', icon: LayoutDashboard, group: 'core' },
  { to: '/calendar', label: 'Календарь', icon: CalendarDays, group: 'core' },
  { to: '/languages', label: 'Языки', icon: LanguagesIcon, counterKey: 'languages', group: 'learning' },
  { to: '/courses', label: 'Курсы', icon: GraduationCap, counterKey: 'courses', group: 'learning' },
  { to: '/year-goals', label: 'Цели на год', icon: Target, counterKey: 'goals', group: 'learning' },
  { to: '/pages', label: 'Страницы', icon: NotebookPen, group: 'lifestyle' },
  { to: '/habits', label: 'Привычки', icon: CheckSquare, group: 'lifestyle' },
  { to: '/travel', label: 'Путешествие', icon: Plane, group: 'lifestyle' },
  { to: '/socials', label: 'Соцсети', icon: Share2, group: 'lifestyle' },
  { to: '/reports', label: 'Отчёты', icon: BarChart3, group: 'system' },
  { to: '/settings', label: 'Настройки', icon: SettingsIcon, group: 'system' }
];

const MENU_GROUP_ORDER: MenuGroupId[] = ['core', 'learning', 'lifestyle', 'system'];

const EMPTY_COUNTERS: MenuCounters = { languages: 0, courses: 0, goals: 0 };
const FALLBACK_AVATAR = 'https://api.dicebear.com/9.x/identicon/svg';

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div
      className="min-h-screen grid text-slate-100 transition-[grid-template-columns] duration-300"
      style={{ gridTemplateColumns: sidebarCollapsed ? '88px 1fr' : '260px 1fr' }}
    >
      <div className="relative min-h-screen">
        <Sidebar collapsed={sidebarCollapsed} />
        <div
          className={classNames(
            'absolute top-1/2 right-0 z-40 flex -translate-y-1/2 translate-x-1/2 items-center gap-1 transition-all duration-300',
            sidebarCollapsed ? 'pr-1' : 'pr-0'
          )}
        >
          <span
            className={classNames(
              'inline-block rounded-r-full border border-l-0 border-brand-slate/40 bg-brand-night/80 shadow-brand-soft transition-all duration-300',
              sidebarCollapsed ? 'h-10 w-3' : 'h-12 w-4'
            )}
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            className={classNames(
              'group inline-flex items-center justify-center rounded-full border bg-brand-night/80 text-slate-200/80 shadow-brand-soft transition hover:border-brand-mint/60 hover:text-brand-mint',
              sidebarCollapsed ? 'h-10 w-10 border-brand-slate/50' : 'h-11 w-11 border-brand-slate/40'
            )}
            aria-label={sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню'}
          >
            <span className="sr-only">{sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню'}</span>
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
      </div>
      <main className="p-6 transition-[padding] duration-300">
        <ReportReminders />
        <Outlet />
      </main>
    </div>
  );
}

type SidebarProps = {
  collapsed: boolean;
};

function Sidebar({ collapsed }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { setToken } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [counters, setCounters] = useState<MenuCounters>(EMPTY_COUNTERS);
  const [showCounters, setShowCounters] = useState(true);
  const [hiddenMenuItems, setHiddenMenuItems] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [clockSettingsOpen, setClockSettingsOpen] = useState(false);
  const [clockColor, setClockColor] = useState<string>('#f8fafc');
  const [clockFont, setClockFont] = useState<string>('font-mono');
  const [now, setNow] = useState<Date>(new Date());
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const clockSettingsRef = useRef<HTMLDivElement | null>(null);

  const renderFramedAvatar = (frameId: string, sizeClass: string, src: string, alt: string) => {
    const option = getAvatarFrameOption(frameId);
    const innerClassName = option.innerClass || 'rounded-xl bg-brand-night/95 border border-white/10';
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

  const miniFrameId = resolveAvatarFrameId(profile?.avatar_frame_mini);
  const miniAvatarSrc = profile?.avatar_url ? resolveApiUrl(profile.avatar_url) : FALLBACK_AVATAR;
  const profileLinkRaw = typeof profile?.profile_url === 'string' ? profile.profile_url.trim() : '';
  const profileLinkHref = profileLinkRaw
    ? /^https?:\/\//i.test(profileLinkRaw)
      ? profileLinkRaw
      : `https://${profileLinkRaw}`
    : '';
  const profileLinkLabel = profileLinkRaw ? profileLinkRaw.replace(/^https?:\/\//i, '') : '';

  useEffect(() => {
    setSearchOpen(false);
    setProfileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    (async () => {
      try {
        const response = await api.get('/api/life/profile');
        setProfile(response?.user || null);
      } catch {
        setProfile(null);
      }
    })();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadCounters = async () => {
      try {
        const data = await api.get('/api/life/menu-counters');
        if (!cancelled) {
          setCounters({
            languages: Number(data?.languages) || 0,
            courses: Number(data?.courses) || 0,
            goals: Number(data?.goals) || 0
          });
        }
      } catch {
        if (!cancelled) setCounters(EMPTY_COUNTERS);
      }
    };

    const loadVisibility = async () => {
      try {
        const data = await api.get('/api/life/ui-settings');
        if (!cancelled) {
          setShowCounters(data?.show_menu_counters !== false);
          const hidden = Array.isArray(data?.hidden_menu_items)
            ? data.hidden_menu_items.filter((entry: unknown): entry is string => typeof entry === 'string')
            : [];
          setHiddenMenuItems(hidden);
          notifyHiddenMenuItems(hidden);
        }
      } catch {
        if (!cancelled) {
          setShowCounters(true);
          setHiddenMenuItems([]);
          notifyHiddenMenuItems([]);
        }
      }
    };

    loadVisibility();
    loadCounters();

    const disposeCounters = onMenuCountersRefresh(() => {
      loadCounters();
    });
    const disposeVisibility = onMenuVisibilityChange((show) => {
      setShowCounters(show);
    });
    const disposeHidden = onHiddenMenuItemsChange(hidden => {
      setHiddenMenuItems(hidden);
    });

    return () => {
      cancelled = true;
      disposeCounters();
      disposeVisibility();
      disposeHidden();
    };
  }, []);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        profileMenuOpen &&
        profileMenuRef.current &&
        !profileMenuRef.current.contains(target)
      ) {
        setProfileMenuOpen(false);
      }
      if (
        clockSettingsOpen &&
        clockSettingsRef.current &&
        !clockSettingsRef.current.contains(target)
      ) {
        setClockSettingsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
    };
  }, [profileMenuOpen, clockSettingsOpen]);

  const formattedTime = now.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const clockColorOptions = ['#f8fafc', '#38bdf8', '#f472b6', '#34d399', '#f97316', '#c084fc'];
  const clockFontOptions: { label: string; className: string }[] = [
    { label: 'Моно', className: 'font-mono' },
    { label: 'Санс', className: 'font-sans' },
    { label: 'Сериф', className: 'font-serif' },
  ];

  const filteredMenuItems = MENU_ITEMS.filter((item) => !hiddenMenuItems.includes(item.to));
  const visibleGroups = MENU_GROUP_ORDER.map((groupId) => ({
    id: groupId,
    items: filteredMenuItems.filter((item) => item.group === groupId),
  })).filter((group) => group.items.length > 0);

  return (
    <aside
      className={classNames(
        'flex h-full min-h-screen flex-col gap-4 border-r border-brand-slate/40 bg-brand-night/75 shadow-brand-soft backdrop-blur-xl transition-[padding,width] duration-300',
        collapsed ? 'items-center p-3' : 'p-4 pr-6'
      )}
    >
      {profile && (
        <div ref={profileMenuRef} className="relative w-full">
          <div
            className={classNames(
              'relative rounded-3xl border border-brand-slate/40 bg-brand-night/80 shadow-brand-soft overflow-visible',
              collapsed ? 'pb-4 pt-3 px-2 flex flex-col items-center gap-3' : ''
            )}
          >
            <div
              className={classNames(
                'relative w-full overflow-visible bg-brand-mint/10',
                collapsed ? 'h-16 rounded-2xl' : 'h-20 rounded-3xl'
              )}
              style={{
                backgroundImage: profile.banner_url ? `url(${resolveApiUrl(profile.banner_url)})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: profile.banner_url ? 'saturate(80%)' : undefined,
              }}
            >
              <div className="absolute inset-0 bg-brand-night/30" aria-hidden />
              <div
                className={classNames(
                  'absolute flex gap-2',
                  collapsed ? 'top-1 left-1/2 -translate-x-1/2' : 'top-2 left-2'
                )}
                ref={clockSettingsRef}
              >
                <button
                  type="button"
                  onClick={() => setClockSettingsOpen((prev) => !prev)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-brand-slate/40 bg-brand-night/70 text-slate-200/80 transition hover:border-brand-mint/60 hover:text-brand-mint"
                  aria-label="Настройки часов"
                >
                  <Palette size={16} />
                </button>
                {clockSettingsOpen && (
                  <div className="absolute left-0 top-11 z-50 w-48 rounded-2xl border border-brand-slate/40 bg-brand-night/95 p-3 text-xs text-slate-200/80 shadow-brand-soft">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-200/60">
                      <Palette size={14} /> Цвет
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {clockColorOptions.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setClockColor(color)}
                          className={classNames(
                            'h-6 w-6 rounded-full border transition',
                            color === clockColor
                              ? 'border-brand-mint/80 ring-2 ring-brand-mint/60'
                              : 'border-white/20 hover:border-brand-mint/60'
                          )}
                          style={{ backgroundColor: color }}
                          aria-label={`Выбрать цвет ${color}`}
                        />
                      ))}
                    </div>
                    <div className="mt-3 border-t border-brand-slate/40 pt-3">
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-200/60">
                        <Type size={14} /> Шрифт
                      </div>
                      <div className="mt-2 space-y-1">
                        {clockFontOptions.map((option) => (
                          <button
                            key={option.className}
                            type="button"
                            onClick={() => setClockFont(option.className)}
                            className={classNames(
                              'w-full rounded-xl border border-transparent px-3 py-1.5 text-left transition hover:border-brand-mint/60 hover:text-brand-mint',
                              option.className,
                              clockFont === option.className ? 'border-brand-mint/70 text-brand-mint' : 'text-slate-200/80'
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div
                className={classNames(
                  'absolute flex',
                  collapsed
                    ? 'bottom-2 left-1/2 -translate-x-1/2'
                    : 'bottom-2 right-2'
                )}
              >
                <div
                  className={classNames(
                    'rounded-xl bg-brand-night/75 px-3 py-1 text-sm font-semibold shadow-brand-soft transition-colors',
                    clockFont
                  )}
                  style={{ color: clockColor }}
                >
                  {formattedTime}
                </div>
              </div>
            </div>
            <div
              className={classNames(
                'w-full',
                collapsed ? 'px-2 pt-3' : 'px-4 pb-4 pt-8'
              )}
            >
              <div
                className={classNames(
                  'flex w-full items-center gap-3',
                  collapsed ? 'flex-col justify-center' : ''
                )}
              >
                {renderFramedAvatar(
                  miniFrameId,
                  collapsed ? 'w-14 h-14' : 'w-12 h-12',
                  miniAvatarSrc,
                  profile.name || 'Аватар пользователя'
                )}
                {!collapsed && (
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold leading-tight truncate">{profile.name || 'Без имени'}</div>
                    {profileLinkHref && (
                      <a
                        href={profileLinkHref}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[11px] text-brand-mint/80 hover:text-brand-mint"
                      >
                        <Link2 size={12} className="opacity-70" />
                        <span className="truncate">{profileLinkLabel}</span>
                      </a>
                    )}
                    {profile.city && <div className="mt-1 text-xs text-slate-200/60 truncate">{profile.city}</div>}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((prev) => !prev)}
                  className={classNames(
                    'inline-flex items-center justify-center rounded-full border border-brand-slate/40 bg-brand-night/70 text-slate-200/80 transition hover:border-brand-mint/60 hover:text-brand-mint',
                    collapsed ? 'mt-2 h-9 w-9' : 'ml-auto h-9 w-9'
                  )}
                  aria-label={profileMenuOpen ? 'Скрыть меню профиля' : 'Открыть меню профиля'}
                >
                  {profileMenuOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </div>
            </div>
          </div>
          {profileMenuOpen && (
            <div className="absolute left-0 right-0 z-30 mt-3 rounded-3xl border border-brand-slate/40 bg-brand-night/95 p-3 shadow-brand-soft">
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    navigate('/profile-full');
                    setProfileMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-2xl border border-transparent px-3 py-2 text-sm text-slate-200/80 transition hover:border-brand-mint/60 hover:bg-brand-night/70 hover:text-brand-mint"
                >
                  <SettingsIcon size={16} className="shrink-0" />
                  <span className="truncate">Настройки профиля</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setToken(null);
                    setProfileMenuOpen(false);
                    navigate('/login');
                  }}
                  className="flex w-full items-center gap-2 rounded-2xl border border-transparent px-3 py-2 text-sm text-slate-200/80 transition hover:border-brand-mint/60 hover:bg-brand-night/70 hover:text-brand-mint"
                >
                  <LogOut size={16} className="shrink-0" />
                  <span className="truncate">Выйти</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        title="Поиск по сайту"
        className={classNames(
          'flex items-center gap-2 rounded-2xl border border-brand-slate/40 bg-brand-night/70 py-2 text-sm text-slate-200/80 transition hover:border-brand-mint/60 hover:bg-brand-night/60 hover:text-brand-mint',
          collapsed ? 'justify-center px-2' : 'px-3'
        )}
      >
        <Search size={16} className="opacity-80" />
        {!collapsed && <span className="truncate">Поиск по сайту…</span>}
      </button>

      <div className={classNames('w-full flex flex-col', collapsed ? 'items-center' : '')}>
        {!collapsed && <div className="text-lg font-semibold mb-2 text-brand-mint w-full">Life Hub</div>}
        <nav className={classNames('w-full flex flex-col', collapsed ? 'items-center gap-3' : 'gap-4')}>
          {visibleGroups.map((group, index) => {
            const isLastGroup = index === visibleGroups.length - 1;
            return (
              <div
                key={group.id}
                className={classNames(
                  'w-full space-y-1',
                  collapsed ? 'flex flex-col items-center gap-1' : '',
                  !isLastGroup && 'pb-3 mb-3 border-b border-brand-slate/40'
                )}
              >
                {group.items.map((item) => (
                  <NavItem
                    key={item.to}
                    item={item}
                    counters={counters}
                    showCounters={showCounters}
                    collapsed={collapsed}
                  />
                ))}
              </div>
            );
          })}
        </nav>
      </div>

      {profile ? (
        <div className="mt-auto" />
      ) : (
        <button
          type="button"
          onClick={() => {
            setToken(null);
            navigate('/login');
          }}
          className="mt-auto text-sm text-slate-300/70 transition hover:text-brand-mint"
        >
          Выйти
        </button>
      )}

      <Modal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        overlayClassName="bg-brand-deep/80 backdrop-blur-xl"
        containerClassName="items-start justify-center overflow-y-auto pt-10 sm:pt-20"
        contentClassName="relative w-full max-w-3xl"
      >
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => setSearchOpen(false)}
            className="rounded-full border border-brand-mint/40 bg-brand-night/70 px-4 py-1 text-xs uppercase tracking-wide text-slate-200/80 transition hover:border-brand-mint/70 hover:text-brand-mint"
          >
            Закрыть
          </button>
        </div>
        <SiteSearch
          className="bg-brand-night/80 border-brand-slate/40 shadow-brand-soft"
          autoFocus
          onSelectPage={(page) => {
            navigate(`/pages/${page.id}`);
            setSearchOpen(false);
          }}
        />
      </Modal>
    </aside>
  );
}

function NavItem({
  item,
  counters,
  showCounters,
  collapsed,
}: {
  item: MenuItem;
  counters: MenuCounters;
  showCounters: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  const count = item.counterKey ? counters[item.counterKey] : 0;
  const shouldShowCounter = Boolean(item.counterKey && showCounters && count > 0);

  return (
    <NavLink
      to={item.to}
      title={item.label}
      className={({ isActive }) =>
        classNames(
          'group flex items-center gap-3 rounded-2xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-mint/60',
          collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2',
          isActive
            ? 'border-brand-mint/60 bg-brand-mint/15 text-brand-mint shadow-brand-glow'
            : 'border-transparent text-slate-300/80 hover:border-brand-slate/50 hover:bg-brand-night/60'
        )
      }
    >
      <div className="relative">
        <Icon size={18} className="shrink-0" />
        {shouldShowCounter && collapsed && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full border border-brand-mint/60 bg-brand-mint/20 px-1 text-[10px] font-semibold text-brand-mint">
            {count}
          </span>
        )}
      </div>
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {shouldShowCounter && !collapsed && (
        <span className="ml-auto px-2 py-0.5 rounded-full border border-brand-mint/40 bg-brand-mint/10 text-[10px] font-semibold text-brand-mint">
          {count}
        </span>
      )}
    </NavLink>
  );
}

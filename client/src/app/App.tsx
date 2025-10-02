import React, { useEffect, useState } from 'react';
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
  Link2
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

export type MenuItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  counterKey?: keyof MenuCounters;
};

export const MENU_ITEMS: MenuItem[] = [
  { to: '/profile-full', label: 'Профиль', icon: UserCircle },
  { to: '/dashboard', label: 'Дэшборд', icon: LayoutDashboard },
  { to: '/calendar', label: 'Календарь', icon: CalendarDays },
  { to: '/languages', label: 'Языки', icon: LanguagesIcon, counterKey: 'languages' },
  { to: '/courses', label: 'Курсы', icon: GraduationCap, counterKey: 'courses' },
  { to: '/year-goals', label: 'Цели на год', icon: Target, counterKey: 'goals' },
  { to: '/pages', label: 'Страницы', icon: NotebookPen },
  { to: '/habits', label: 'Привычки', icon: CheckSquare },
  { to: '/travel', label: 'Путешествие', icon: Plane },
  { to: '/socials', label: 'Соцсети', icon: Share2 },
  { to: '/reports', label: 'Отчёты', icon: BarChart3 },
  { to: '/settings', label: 'Настройки', icon: SettingsIcon }
];

const EMPTY_COUNTERS: MenuCounters = { languages: 0, courses: 0, goals: 0 };
const FALLBACK_AVATAR = 'https://api.dicebear.com/9.x/identicon/svg';

export default function App() {
  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr] text-slate-100">
      <Sidebar />
      <main className="p-6">
        <ReportReminders />
        <Outlet />
      </main>
    </div>
  );
}

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setToken } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [counters, setCounters] = useState<MenuCounters>(EMPTY_COUNTERS);
  const [showCounters, setShowCounters] = useState(true);
  const [hiddenMenuItems, setHiddenMenuItems] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);

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

  return (
    <aside className="p-4 border-r border-brand-slate/40 bg-brand-night/75 backdrop-blur-xl flex flex-col gap-4 shadow-brand-soft">
      {profile && (
        <div className="relative rounded-3xl border border-brand-slate/40 bg-brand-night/80 shadow-brand-soft overflow-hidden">
          <div
            className="h-20 bg-brand-mint/10"
            style={{
              backgroundImage: profile.banner_url
                ? `url(${resolveApiUrl(profile.banner_url)})`
                : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: profile.banner_url ? 'saturate(80%)' : undefined,
            }}
          />
          <div className="px-4 pb-4 pt-8 flex items-center gap-3">
            {renderFramedAvatar(miniFrameId, 'w-12 h-12', miniAvatarSrc, profile.name || 'Аватар пользователя')}
            <div className="min-w-0">
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
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="flex items-center gap-2 rounded-2xl border border-brand-slate/40 bg-brand-night/70 px-3 py-2 text-sm text-slate-200/80 transition hover:border-brand-mint/60 hover:bg-brand-night/60 hover:text-brand-mint"
      >
        <Search size={16} className="opacity-80" />
        <span className="truncate">Поиск по сайту…</span>
      </button>

      <div>
        <div className="text-lg font-semibold mb-2 text-brand-mint">Life Hub</div>
        <nav className="space-y-1">
          {MENU_ITEMS.filter(item => !hiddenMenuItems.includes(item.to)).map(item => (
            <NavItem key={item.to} item={item} counters={counters} showCounters={showCounters} />
          ))}
        </nav>
      </div>

      <button
        onClick={() => {
          setToken(null);
          navigate('/login');
        }}
        className="mt-auto text-sm text-slate-300/70 transition hover:text-brand-mint"
      >
        Выйти
      </button>

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

function NavItem({ item, counters, showCounters }: { item: MenuItem; counters: MenuCounters; showCounters: boolean }) {
  const Icon = item.icon;
  const count = item.counterKey ? counters[item.counterKey] : 0;
  const shouldShowCounter = Boolean(item.counterKey && showCounters && count > 0);

  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-2xl border transition ${
          isActive
            ? 'border-brand-mint/60 bg-brand-mint/15 text-brand-mint shadow-brand-glow'
            : 'border-transparent text-slate-300/80 hover:border-brand-slate/50 hover:bg-brand-night/60'
        }`
      }
    >
      <Icon size={18} className="shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {shouldShowCounter && (
        <span className="ml-auto px-2 py-0.5 rounded-full border border-brand-mint/40 bg-brand-mint/10 text-[10px] font-semibold text-brand-mint">
          {count}
        </span>
      )}
    </NavLink>
  );
}

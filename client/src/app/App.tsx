import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { api } from '../api';
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
  UserCircle
} from 'lucide-react';
import { onMenuCountersRefresh, onMenuVisibilityChange } from '../menuBus';

type MenuCounters = {
  languages: number;
  courses: number;
  goals: number;
};

type MenuItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  counterKey?: keyof MenuCounters;
};

const MENU_ITEMS: MenuItem[] = [
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
  { to: '/settings', label: 'Настройки', icon: SettingsIcon }
];

const EMPTY_COUNTERS: MenuCounters = { languages: 0, courses: 0, goals: 0 };

export default function App() {
  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr]">
      <Sidebar />
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}

function Sidebar() {
  const navigate = useNavigate();
  const { setToken } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [counters, setCounters] = useState<MenuCounters>(EMPTY_COUNTERS);
  const [showCounters, setShowCounters] = useState(true);

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
        if (!cancelled) setShowCounters(data?.show_menu_counters !== false);
      } catch {
        if (!cancelled) setShowCounters(true);
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

    return () => {
      cancelled = true;
      disposeCounters();
      disposeVisibility();
    };
  }, []);

  return (
    <aside className="p-4 border-r border-white/10 bg-white/5 flex flex-col gap-4">
      {profile && (
        <div className="rounded-xl overflow-hidden border border-white/10">
          <div
            className="h-16 bg-gradient-to-r from-purple-600/40 to-blue-600/40"
            style={{
              backgroundImage: profile.banner_url
                ? `url(${import.meta.env.VITE_API_URL}${profile.banner_url})`
                : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          />
          <div className="flex items-center p-3 gap-3 -mt-8">
            <img
              src={profile.avatar_url
                ? `${import.meta.env.VITE_API_URL}${profile.avatar_url}`
                : 'https://api.dicebear.com/9.x/identicon/svg'}
              className="w-12 h-12 rounded-xl border-2 border-black"
            />
            <div className="font-semibold leading-tight">{profile.name || '��� ��䨫�'}</div>
          </div>
        </div>
      )}

      <div>
        <div className="text-lg font-semibold mb-2">Life Hub</div>
        <nav className="space-y-1">
          {MENU_ITEMS.map(item => (
            <NavItem key={item.to} item={item} counters={counters} showCounters={showCounters} />
          ))}
        </nav>
      </div>

      <button
        onClick={() => {
          setToken(null);
          navigate('/login');
        }}
        className="mt-auto text-sm opacity-80 hover:opacity-100"
      >
        ���
      </button>
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
        `flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
          isActive ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-white/80'
        }`
      }
    >
      <Icon size={18} className="shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {shouldShowCounter && (
        <span className="ml-auto px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-[10px] font-semibold">
          {count}
        </span>
      )}
    </NavLink>
  );
}

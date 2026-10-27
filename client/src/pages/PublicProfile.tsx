import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BadgeCheck, BookOpen, MapPin, NotebookPen, Plane, UserRound } from 'lucide-react';
import { api, resolveApiUrl } from '../api';

type PublicProfileResponse = {
  user: {
    id: number;
    name: string;
    username: string;
    bio: string;
    city: string;
    avatar_url: string | null;
    banner_url: string | null;
    profile_url: string | null;
    role: string;
    is_verified: boolean;
  };
  stats: {
    pages: number;
    languages: number;
    courses: number;
    travel: number;
  };
};

const FALLBACK_AVATAR = 'https://api.dicebear.com/9.x/identicon/svg';

export default function PublicProfile() {
  const { username } = useParams();
  const [data, setData] = useState<PublicProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!username) return;
      try {
        const response = await api.get(`/api/public/profiles/${encodeURIComponent(username)}`, { silentError: true });
        setData(response);
        setError(null);
      } catch (err: any) {
        setData(null);
        setError(err?.message || 'Profile not found');
      }
    })();
  }, [username]);

  const profile = data?.user;

  return (
    <div className="min-h-screen bg-[#081018] px-4 py-10 text-white">
      <div className="mx-auto max-w-4xl overflow-hidden rounded-[28px] border border-white/10 bg-[#10202c]">
        <div
          className="h-48 bg-gradient-to-br from-cyan-500/30 via-sky-500/20 to-emerald-500/20"
          style={profile?.banner_url ? { backgroundImage: `url(${resolveApiUrl(profile.banner_url)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
        />
        <div className="px-6 pb-8">
          <div className="-mt-14 flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-end gap-4">
              <img
                src={profile?.avatar_url ? resolveApiUrl(profile.avatar_url) : FALLBACK_AVATAR}
                alt={profile?.name || 'avatar'}
                className="h-28 w-28 rounded-3xl border-4 border-[#10202c] object-cover"
              />
              <div className="pb-2">
                <div className="flex items-center gap-2 text-2xl font-semibold">
                  <span>{profile?.name || 'Профиль'}</span>
                  {profile?.is_verified ? <BadgeCheck className="h-5 w-5 text-sky-300" /> : null}
                </div>
                <div className="text-sm text-white/60">@{profile?.username || username}</div>
                {profile?.city ? <div className="mt-2 flex items-center gap-2 text-sm text-white/70"><MapPin className="h-4 w-4" />{profile.city}</div> : null}
              </div>
            </div>
            <Link to="/login" className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/10">
              Войти
            </Link>
          </div>

          {error ? <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">{error}</div> : null}

          {profile ? (
            <>
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-white/80">
                {profile.bio || 'Пользователь пока не добавил описание.'}
              </div>
              <div className="mt-6 grid gap-3 md:grid-cols-4">
                <StatCard icon={NotebookPen} label="Страницы" value={data?.stats.pages || 0} />
                <StatCard icon={BookOpen} label="Языки" value={data?.stats.languages || 0} />
                <StatCard icon={UserRound} label="Курсы" value={data?.stats.courses || 0} />
                <StatCard icon={Plane} label="Путешествия" value={data?.stats.travel || 0} />
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <Icon className="h-5 w-5 text-white/65" />
      <div className="mt-3 text-2xl font-semibold">{value}</div>
      <div className="text-sm text-white/55">{label}</div>
    </div>
  );
}

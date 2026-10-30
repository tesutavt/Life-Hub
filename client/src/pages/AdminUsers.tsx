import React, { useEffect, useState } from 'react';
import { BadgeCheck, Shield, ShieldCheck, User as UserIcon } from 'lucide-react';
import Shell from '../components/Shell';
import { api, resolveApiUrl } from '../api';
import { useAuth } from '../AuthContext';

type AdminUser = {
  id: number;
  email: string;
  name: string;
  username: string;
  role: 'user' | 'moderator' | 'admin';
  is_verified: boolean;
  avatar_url: string | null;
};

const FALLBACK_AVATAR = 'https://api.dicebear.com/9.x/identicon/svg';

export default function AdminUsers() {
  const { user } = useAuth();
  const [items, setItems] = useState<AdminUser[]>([]);

  const load = async () => {
    const response = await api.get('/api/admin/users');
    setItems(Array.isArray(response?.items) ? response.items : []);
  };

  useEffect(() => {
    load();
  }, []);

  const canChangeRoles = user?.role === 'admin';

  return (
    <Shell>
      <div className="space-y-4">
        <div className="rounded-[28px] border border-white/10 bg-brand-night p-6">
          <div className="text-2xl font-semibold text-white">Пользователи</div>
          <div className="mt-2 text-sm text-white/60">
            Модератор может выдавать верификацию. Администратор может выдавать верификацию и менять роли.
          </div>
        </div>

        <div className="grid gap-3">
          {items.map((entry) => (
            <div key={entry.id} className="rounded-3xl border border-white/10 bg-brand-night p-4 text-white">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <img
                    src={entry.avatar_url ? resolveApiUrl(entry.avatar_url) : FALLBACK_AVATAR}
                    alt={entry.name}
                    className="h-14 w-14 rounded-2xl object-cover"
                  />
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      <span>{entry.name}</span>
                      {entry.is_verified ? <BadgeCheck className="h-4 w-4 text-sky-300" /> : null}
                    </div>
                    <div className="text-sm text-white/60">@{entry.username}</div>
                    <div className="text-xs text-white/45">{entry.email}</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await api.patch(`/api/admin/users/${entry.id}`, { is_verified: !entry.is_verified });
                      await load();
                    }}
                    className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
                  >
                    {entry.is_verified ? 'Снять верификацию' : 'Выдать верификацию'}
                  </button>

                  {canChangeRoles ? (
                    <button
                      type="button"
                      onClick={async () => {
                        const password = window.prompt(`Новый пароль для ${entry.name} (не короче 4 символов):`);
                        if (!password) return;
                        await api.patch(`/api/admin/users/${entry.id}`, { password }, { notifySuccess: 'Пароль изменён' });
                      }}
                      className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
                    >
                      Сбросить пароль
                    </button>
                  ) : null}

                  {canChangeRoles ? (
                    <select
                      value={entry.role}
                      onChange={async (event) => {
                        await api.patch(`/api/admin/users/${entry.id}`, { role: event.target.value });
                        await load();
                      }}
                      className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none"
                    >
                      <option value="user">user</option>
                      <option value="moderator">moderator</option>
                      <option value="admin">admin</option>
                    </select>
                  ) : (
                    <div className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white/75">{entry.role}</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}

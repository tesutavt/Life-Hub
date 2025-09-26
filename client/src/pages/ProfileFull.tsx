import React, { useEffect, useState } from 'react';
import Shell from '../components/Shell';
import { api, resolveApiUrl } from '../api';
import { useAuth } from '../AuthContext';
import { useNotifications } from '../notifications/NotificationProvider';

export default function ProfileFull() {
  const [data, setData] = useState<any>(null);
  const [journal, setJournal] = useState<any[]>([]);
  const [languages, setLanguages] = useState<any[]>([]);
  const [nextEvent, setNextEvent] = useState<any | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [openEdit, setOpenEdit] = useState(false);
  const { token } = useAuth();
  const { pushError } = useNotifications();

  const load = async () => {
    const d = await api.get('/api/life/profile');
    setData(d);
    setDisplayName(d?.user?.name || '');
    setBio(d?.user?.bio || '');

    // ✅ Лента (только feed, без страниц)
    const feed = await api.get('/api/life/feed');
    const normalized = (feed.items || []).map((item: any) => ({
      ...item,
      ts: item.ts || item.created_at || item.date || null
    }));
    setJournal(normalized.sort((a: any, b: any) => (b.ts || 0) - (a.ts || 0)));

    const langs = await api.get('/api/life/languages');
    setLanguages(langs.items || []);

    const cal = await api.get('/api/life/calendar');
    const today = new Date().toISOString().slice(0, 10);
    const future = (cal.items || [])
      .filter((x: any) => x.date >= today)
      .sort((a: any, b: any) => a.date.localeCompare(b.date));
    setNextEvent(future[0] || null);
  };

  useEffect(() => { load(); }, []);

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

    try {
      await api.post('/api/life/profile', fd, {
        notifySuccess: { message: 'Профиль обновлён!', title: 'Сохранение профиля' },
        notifyError: { message: 'Не удалось сохранить профиль', title: 'Сохранение профиля' }
      });
      await load();
      setOpenEdit(false);
    } catch (error) {
      console.error('Failed to save profile', error);
    }
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
            <ul className="space-y-1 text-sm">
              {languages.map((l:any)=>(
                <li key={l.id} className="flex justify-between">
                  <span>{l.name}</span>
                  <span className="opacity-70">уровень {l.level}</span>
                </li>
              ))}
            </ul>
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
        {journal.length > 0 ? (
          <div className="space-y-3">
            {journal.map((j:any)=>(
              <div key={j.id} className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="text-xs opacity-70">
                  {j.ts ? new Date(j.ts).toLocaleString('ru-RU') : '-'}
                </div>
                <div className="mt-1">{j.text}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="opacity-70 text-sm">Записей пока нет</div>
        )}
      </div>

      {/* ---------- Модалка редактирования ---------- */}
      {openEdit && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-black p-6 rounded-2xl border border-white/20 w-96 space-y-3">
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
          </div>
        </div>
      )}
    </Shell>
  );
}

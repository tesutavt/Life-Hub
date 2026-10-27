import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import classNames from 'classnames';
import { Pin, Trophy } from 'lucide-react';
import { api } from '../../api';
import { rarityStyle } from '../../achievements';

export type ProfileAchievement = {
  id: number;
  title: string;
  description: string | null;
  icon: string;
  rarity: string;
  earned: boolean;
  earned_at?: string | null;
  progress: number;
  threshold: number;
  xp_reward: number;
  unit?: string | null;
  hidden?: boolean;
};

const MAX_SHOWCASE = 6;

/** Вкладка «Ачивки» в профиле: витрина (до 6 закреплённых), ближайшие цели и все полученные. */
export default function ProfileAchievements({
  items,
  showcaseIds,
  onShowcaseChange,
}: {
  items: ProfileAchievement[];
  showcaseIds: number[];
  onShowcaseChange: (ids: number[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const earned = useMemo(() => items.filter((i) => i.earned).sort((a, b) => (b.earned_at || '').localeCompare(a.earned_at || '')), [items]);
  const nextUp = useMemo(
    () =>
      items
        .filter((i) => !i.earned && !i.hidden && i.progress > 0)
        .sort((a, b) => b.progress / b.threshold - a.progress / a.threshold)
        .slice(0, 3),
    [items]
  );

  const togglePin = async (id: number) => {
    const next = showcaseIds.includes(id) ? showcaseIds.filter((x) => x !== id) : [...showcaseIds, id].slice(-MAX_SHOWCASE);
    onShowcaseChange(next);
    const res = await api.put('/api/achievements/showcase', { ids: next }, { silentSuccess: true });
    if (Array.isArray(res?.ids)) onShowcaseChange(res.ids);
  };

  return (
    <div className="space-y-3">
      {nextUp.length > 0 && (
        <div className="card !p-4">
          <div className="mb-2 text-sm font-semibold text-white">Совсем скоро 🎯</div>
          <div className="grid gap-2 md:grid-cols-3">
            {nextUp.map((item) => {
              const pct = Math.round((item.progress * 100) / Math.max(1, item.threshold));
              return (
                <div key={item.id} className="flex items-center gap-3 rounded-2xl bg-black/25 p-3">
                  <span className="text-2xl grayscale-[40%]">{item.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">{item.title}</div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-gradient-to-r from-sky-300 to-violet-400" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-0.5 text-[10px] text-white/45">
                      {item.progress}/{item.threshold} {item.unit || ''} · +{item.xp_reward} XP
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card !p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-white">
            Полученные ачивки <span className="text-white/45">· {earned.length}</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className={classNames(
                'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs transition',
                editing ? 'bg-amber-300 text-brand-deep' : 'border border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
              )}
            >
              <Pin size={12} /> {editing ? `Готово (${showcaseIds.length}/${MAX_SHOWCASE})` : 'Настроить витрину'}
            </button>
            <Link to="/achievements" className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 hover:bg-white/10">
              <Trophy size={12} /> Все ачивки
            </Link>
          </div>
        </div>
        {editing && <div className="mb-3 rounded-xl bg-amber-300/10 px-3 py-2 text-xs text-amber-100">Нажимайте на ачивки, чтобы закрепить их в витрине профиля (до {MAX_SHOWCASE}).</div>}
        {earned.length === 0 ? (
          <div className="text-sm text-white/55">
            Пока пусто — первые ачивки придут сами, просто пользуйтесь приложением. <Link to="/achievements" className="text-brand-mint hover:underline">Посмотреть, какие бывают</Link>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {earned.map((item) => {
              const style = rarityStyle(item.rarity);
              const pinned = showcaseIds.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => editing && togglePin(item.id)}
                  title={`${item.title}${item.description ? ` — ${item.description}` : ''}`}
                  className={classNames(
                    'relative flex flex-col items-center rounded-2xl border bg-gradient-to-br p-2.5 text-center transition',
                    style.ring,
                    style.bg,
                    editing ? 'cursor-pointer hover:scale-105' : 'cursor-default',
                    editing && pinned && 'ring-2 ring-amber-300'
                  )}
                >
                  {pinned && <Pin size={12} className="absolute right-1.5 top-1.5 fill-amber-300 text-amber-300" />}
                  <span className="text-3xl leading-none">{item.icon}</span>
                  <span className="mt-1.5 line-clamp-2 text-[11px] leading-tight text-white/85">{item.title}</span>
                  <span className={classNames('mt-0.5 text-[9px] font-semibold uppercase', style.text)}>{style.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

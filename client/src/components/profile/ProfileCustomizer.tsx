import React, { useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import { ArrowDown, ArrowUp, Check, ImagePlus, Pin, Star } from 'lucide-react';
import { api, resolveApiUrl } from '../../api';
import { useAuth } from '../../AuthContext';
import { Modal } from '../ui/Modal';
import { rarityStyle } from '../../achievements';
import type { ProfileAchievement } from './ProfileAchievements';
import { BACKGROUND_PRESETS, ProfileStyle, SHOWCASES, ShowcaseId } from './profileStyle';

type Tab = 'showcases' | 'featured' | 'background';
const MAX_PINNED = 6;

/** Настройка профиля: витрины и их порядок, главное достижение, закреплённые ачивки, фон. */
export default function ProfileCustomizer({
  open,
  onClose,
  style,
  achievements,
  pinnedIds,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  style: ProfileStyle;
  achievements: ProfileAchievement[];
  pinnedIds: number[];
  onSaved: () => void;
}) {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>('showcases');
  const [showcases, setShowcases] = useState<ShowcaseId[]>(style.showcases);
  const [featured, setFeatured] = useState<number | null>(style.featured_id);
  const [pinned, setPinned] = useState<number[]>(pinnedIds);
  const [preset, setPreset] = useState(style.background_preset);
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [bgPreview, setBgPreview] = useState<string | null>(null);
  const [clearImage, setClearImage] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setShowcases(style.showcases);
    setFeatured(style.featured_id);
    setPinned(pinnedIds);
    setPreset(style.background_preset);
    setBgFile(null);
    setBgPreview(null);
    setClearImage(false);
  }, [open, style, pinnedIds]);

  const earned = useMemo(
    () => achievements.filter((a) => a.earned).sort((a, b) => (b.earned_at || '').localeCompare(a.earned_at || '')),
    [achievements]
  );

  const move = (index: number, delta: number) =>
    setShowcases((list) => {
      const next = [...list];
      const target = index + delta;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });

  const toggleShowcase = (id: ShowcaseId) => setShowcases((list) => (list.includes(id) ? list.filter((s) => s !== id) : [...list, id]));
  const togglePin = (id: number) =>
    setPinned((list) => (list.includes(id) ? list.filter((p) => p !== id) : list.length >= MAX_PINNED ? list : [...list, id]));

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/api/life/profile/style', { showcases, featured_id: featured, ...(!bgFile && clearImage ? { background_preset: preset } : {}) }, { silentSuccess: true });
      await api.put('/api/achievements/showcase', { ids: pinned }, { silentSuccess: true });
      if (bgFile || clearImage) {
        const form = new FormData();
        if (bgFile) form.append('background', bgFile);
        else form.append('background_clear', '1');
        await fetch(resolveApiUrl('/api/life/profile'), { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const currentImage = bgPreview || (!clearImage && style.background_url ? resolveApiUrl(style.background_url) : null);

  return (
    <Modal open={open} onClose={onClose} showCloseButton contentClassName="w-full max-w-2xl rounded-3xl border border-white/10 bg-brand-night p-5 shadow-2xl">
      <div className="space-y-4">
        <div className="pr-8">
          <div className="text-lg font-semibold text-white">Оформление профиля</div>
          <div className="text-sm text-white/55">Как в Steam: фон, главное достижение и витрины снизу.</div>
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-black/30 p-1 text-sm">
          {(
            [
              ['showcases', 'Витрины'],
              ['featured', 'Достижения'],
              ['background', 'Фон'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={classNames('rounded-xl py-1.5', tab === id ? 'bg-brand-mint text-brand-deep font-semibold' : 'text-white/60 hover:text-white')}>
              {label}
            </button>
          ))}
        </div>

        <div className="max-h-[55vh] overflow-y-auto pr-1">
          {tab === 'showcases' && (
            <div className="space-y-2">
              <div className="text-xs text-white/50">Включите нужные витрины и расставьте их по порядку — так они пойдут сверху вниз.</div>
              {[...showcases, ...SHOWCASES.map((s) => s.id).filter((id) => !showcases.includes(id))].map((id) => {
                const meta = SHOWCASES.find((s) => s.id === id)!;
                const index = showcases.indexOf(id);
                const on = index !== -1;
                return (
                  <div key={id} className={classNames('flex items-center gap-3 rounded-2xl border px-3 py-2', on ? 'border-brand-mint/30 bg-brand-mint/[0.06]' : 'border-white/10 bg-white/[0.02] opacity-70')}>
                    <button
                      type="button"
                      onClick={() => toggleShowcase(id)}
                      className={classNames('flex h-6 w-6 items-center justify-center rounded-lg border', on ? 'border-brand-mint bg-brand-mint text-brand-deep' : 'border-white/20')}
                      aria-label={on ? 'Скрыть витрину' : 'Показать витрину'}
                    >
                      {on && <Check size={14} />}
                    </button>
                    <span className="text-xl">{meta.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-white">{meta.title}</div>
                      <div className="text-xs text-white/45">{meta.hint}</div>
                    </div>
                    {on && (
                      <div className="flex">
                        <button type="button" disabled={index === 0} onClick={() => move(index, -1)} className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 disabled:opacity-20" aria-label="Выше">
                          <ArrowUp size={14} />
                        </button>
                        <button type="button" disabled={index === showcases.length - 1} onClick={() => move(index, 1)} className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 disabled:opacity-20" aria-label="Ниже">
                          <ArrowDown size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'featured' && (
            <div className="space-y-3">
              <div className="text-xs text-white/50">
                <Star size={12} className="inline text-amber-300" /> — главное достижение (большое, вверху профиля). <Pin size={12} className="inline text-brand-mint" /> — в витрину достижений (до {MAX_PINNED}).
              </div>
              {earned.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-white/50">Пока нет полученных ачивок — самое время заработать первую!</div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {earned.map((a) => {
                    const r = rarityStyle(a.rarity);
                    const isFeatured = featured === a.id;
                    const isPinned = pinned.includes(a.id);
                    return (
                      <div key={a.id} className={classNames('relative rounded-2xl border bg-gradient-to-br p-3 text-center', r.ring, r.bg, isFeatured && 'ring-2 ring-amber-300')}>
                        <div className="text-3xl">{a.icon}</div>
                        <div className="mt-1 line-clamp-2 text-xs text-white/85">{a.title}</div>
                        <div className="mt-2 flex justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => setFeatured(isFeatured ? null : a.id)}
                            className={classNames('rounded-lg p-1.5', isFeatured ? 'bg-amber-300 text-brand-deep' : 'bg-black/30 text-white/60 hover:text-amber-200')}
                            title="Главное достижение"
                          >
                            <Star size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => togglePin(a.id)}
                            disabled={!isPinned && pinned.length >= MAX_PINNED}
                            className={classNames('rounded-lg p-1.5 disabled:opacity-30', isPinned ? 'bg-brand-mint text-brand-deep' : 'bg-black/30 text-white/60 hover:text-brand-mint')}
                            title="В витрину"
                          >
                            <Pin size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'background' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {BACKGROUND_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPreset(p.id);
                      setBgFile(null);
                      setBgPreview(null);
                      setClearImage(true);
                    }}
                    className={classNames('h-20 overflow-hidden rounded-2xl border-2 text-left', !currentImage && preset === p.id ? 'border-brand-mint' : 'border-white/10 hover:border-white/30')}
                    style={{ background: p.css }}
                  >
                    <span className="m-2 inline-block rounded-full bg-black/40 px-2 py-0.5 text-[11px] text-white/85">{p.title}</span>
                  </button>
                ))}
              </div>
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-white/15 p-3 hover:border-brand-mint/50">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setBgFile(file);
                    setBgPreview(URL.createObjectURL(file));
                    setClearImage(false);
                  }}
                />
                <ImagePlus className="text-brand-mint" />
                <div className="text-sm">
                  <div className="text-white">Своя картинка</div>
                  <div className="text-xs text-white/45">Арт, скриншот любимой игры, фото — растянется на всю страницу профиля</div>
                </div>
              </label>
              {currentImage && (
                <div className="relative h-32 overflow-hidden rounded-2xl border border-white/10 bg-cover bg-center" style={{ backgroundImage: `url(${currentImage})` }}>
                  <button
                    type="button"
                    onClick={() => {
                      setBgFile(null);
                      setBgPreview(null);
                      setClearImage(true);
                    }}
                    className="absolute right-2 top-2 rounded-full bg-black/60 px-3 py-1 text-xs text-white hover:bg-black/80"
                  >
                    Убрать картинку
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <button type="button" disabled={saving} onClick={save} className="w-full rounded-xl bg-brand-mint py-2.5 text-sm font-bold text-brand-deep disabled:opacity-50">
          {saving ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </div>
    </Modal>
  );
}

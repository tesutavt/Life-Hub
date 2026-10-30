import React, { useEffect, useMemo, useState } from 'react';
import { Check, Monitor, Moon, Pencil, Plus, Sun, Trash2 } from 'lucide-react';
import { api } from '../../../api';
import {
  ACCENTS,
  FONTS,
  PRESETS,
  ThemePalette,
  ThemeSettings,
  allPalettes,
  loadLocalTheme,
  onThemeChange,
  paletteOf,
  setTheme,
} from '../../../theme';

const card = 'rounded-3xl border border-white/10 bg-white/[0.04] p-5';
const label = 'mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/50';

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; icon?: React.ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-full border border-white/10 bg-black/20 p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm transition ${value === o.id ? 'bg-brand-mint text-brand-deep shadow-brand-glow' : 'text-white/70 hover:text-white'}`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, title, hint }: { checked: boolean; onChange: (v: boolean) => void; title: string; hint: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center gap-4 rounded-2xl px-1 py-2 text-left">
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-brand-mint' : 'bg-white/15'}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-6' : 'left-1'}`} />
      </span>
      <span>
        <span className="block text-sm text-white">{title}</span>
        <span className="block text-xs text-white/50">{hint}</span>
      </span>
    </button>
  );
}

/** Мини-превью темы: как будет выглядеть интерфейс. */
function ThemePreview({ palette, accent }: { palette: ThemePalette; accent: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10" style={{ background: `linear-gradient(160deg, ${palette.deep}, ${palette.night} 55%, ${palette.slate})` }}>
      <div className="flex gap-1.5 p-2">
        <div className="w-1/4 space-y-1.5 rounded-lg p-1.5" style={{ background: `${palette.night}cc` }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-1.5 rounded-full" style={{ background: i === 0 ? accent : 'rgba(255,255,255,0.18)' }} />
          ))}
        </div>
        <div className="flex-1 space-y-1.5">
          <div className="h-2.5 w-2/3 rounded-full bg-white/70" />
          <div className="flex gap-1.5">
            <div className="h-6 flex-1 rounded-md" style={{ background: `${palette.night}` , border: `1px solid ${palette.slate}` }} />
            <div className="h-6 w-6 rounded-md" style={{ background: accent }} />
          </div>
        </div>
      </div>
    </div>
  );
}

const newPalette = (base: ThemePalette): ThemePalette => ({
  id: `custom-${Date.now().toString(36)}`,
  name: 'Моя тема',
  deep: base.deep,
  night: base.night,
  slate: base.slate,
  accent: base.accent,
  custom: true,
});

/** Раздел «Оформление»: режим, тема, акцент, плотность, шрифт, скругления, анимации, свои темы. */
export default function AppearanceSettings() {
  const [theme, setLocal] = useState<ThemeSettings>(loadLocalTheme);
  const [editing, setEditing] = useState<ThemePalette | null>(null);
  const [toast, setToast] = useState(false);
  const palette = paletteOf(theme);
  const accent = theme.accent || palette.accent;
  const palettes = useMemo(() => allPalettes(theme), [theme]);

  useEffect(() => onThemeChange(setLocal), []);

  // Применяем сразу, на сервер — через полсекунды после последнего изменения
  const update = (patch: Partial<ThemeSettings>) => {
    const next = { ...theme, ...patch };
    setLocal(next);
    setTheme(next);
  };
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        await api.put('/api/life/ui-settings', { theme }, { silentSuccess: true, silentError: true });
        setToast(true);
        window.setTimeout(() => setToast(false), 1600);
      } catch {
        // сеть пропала — тема всё равно сохранена на этом устройстве
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [theme]);

  const saveCustom = (p: ThemePalette) => {
    const exists = theme.customThemes.some((t) => t.id === p.id);
    const customThemes = exists ? theme.customThemes.map((t) => (t.id === p.id ? p : t)) : [...theme.customThemes, p];
    update({ customThemes, preset: p.id, accent: null });
    setEditing(null);
  };

  return (
    <div className="space-y-5">
      <div className={card}>
        <div className={label}>Режим</div>
        <Segmented
          value={theme.mode}
          onChange={(mode) => update({ mode })}
          options={[
            { id: 'auto', label: 'Авто', icon: <Monitor className="h-4 w-4" /> },
            { id: 'light', label: 'Светлая', icon: <Sun className="h-4 w-4" /> },
            { id: 'dark', label: 'Тёмная', icon: <Moon className="h-4 w-4" /> },
          ]}
        />
        <div className="mt-2 text-xs text-white/45">«Авто» следует за настройкой Windows / телефона.</div>
      </div>

      <div className={card}>
        <div className="mb-3 flex items-center justify-between">
          <div className={label.replace('mb-3 ', '')}>Тема</div>
          <button type="button" onClick={() => setEditing(newPalette(palette))} className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10">
            <Plus className="h-3.5 w-3.5" /> Своя тема
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {palettes.map((p) => {
            const active = p.id === theme.preset;
            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => update({ preset: p.id, accent: null })}
                onKeyDown={(e) => e.key === 'Enter' && update({ preset: p.id, accent: null })}
                className={`group cursor-pointer rounded-2xl border p-2 transition ${active ? 'border-brand-mint shadow-brand-glow' : 'border-white/10 hover:border-white/30'}`}
              >
                <ThemePreview palette={p} accent={p.accent} />
                <div className="mt-2 flex items-center gap-2 px-1">
                  <span className="h-3 w-3 rounded-full" style={{ background: p.accent }} />
                  <span className="flex-1 truncate text-sm text-white">{p.name}</span>
                  {active ? <Check className="h-4 w-4 text-brand-mint" /> : null}
                  {p.custom ? (
                    <>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setEditing(p); }} className="text-white/40 opacity-0 transition hover:text-white group-hover:opacity-100" title="Изменить"><Pencil className="h-3.5 w-3.5" /></button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!window.confirm(`Удалить тему «${p.name}»?`)) return;
                          update({ customThemes: theme.customThemes.filter((t) => t.id !== p.id), preset: active ? 'lifehub' : theme.preset });
                        }}
                        className="text-white/40 opacity-0 transition hover:text-red-300 group-hover:opacity-100"
                        title="Удалить"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={card}>
        <div className={label}>Акцентный цвет</div>
        <div className="flex flex-wrap items-center gap-3">
          {ACCENTS.map((c) => {
            const active = accent.toLowerCase() === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => update({ accent: c })}
                className={`h-10 w-10 rounded-full border-2 transition ${active ? 'scale-110 border-white' : 'border-transparent hover:scale-105'}`}
                style={{ background: `radial-gradient(circle at 35% 30%, #ffffffaa, ${c} 45%)`, boxShadow: active ? `0 0 22px ${c}` : `0 0 12px ${c}55` }}
                title={c}
              />
            );
          })}
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-white/15 px-3 text-xs text-white/70 hover:bg-white/10">
            Свой
            <input type="color" value={accent} onChange={(e) => update({ accent: e.target.value })} className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0" />
          </label>
          {theme.accent ? (
            <button type="button" onClick={() => update({ accent: null })} className="text-xs text-white/50 underline-offset-4 hover:underline">как в теме</button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className={card}>
          <div className={label}>Плотность</div>
          <input
            type="range"
            min={0}
            max={2}
            step={1}
            value={theme.density === 'relaxed' ? 0 : theme.density === 'standard' ? 1 : 2}
            onChange={(e) => update({ density: (['relaxed', 'standard', 'compact'] as const)[Number(e.target.value)] })}
            className="w-full accent-[rgb(var(--brand-mint-rgb))]"
          />
          <div className="mt-1 flex justify-between text-xs text-white/50">
            <span>Свободно</span>
            <span>Обычно</span>
            <span>Плотно</span>
          </div>

          <div className={`${label} mt-6`}>Шрифт</div>
          <select value={theme.font} onChange={(e) => update({ font: e.target.value })} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white outline-none">
            {FONTS.map((f) => (
              <option key={f.id} value={f.id} style={{ fontFamily: f.css }}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <div className={card}>
          <div className={label}>Скругление углов</div>
          <input type="range" min={4} max={20} step={2} value={theme.radius} onChange={(e) => update({ radius: Number(e.target.value) })} className="w-full accent-[rgb(var(--brand-mint-rgb))]" />
          <div className="mt-1 flex justify-between text-xs text-white/50">
            {[4, 8, 12, 16, 20].map((v) => (
              <span key={v} className={v === theme.radius ? 'font-semibold text-brand-mint' : ''}>{v}</span>
            ))}
          </div>
          <div className="mt-5 space-y-1">
            <Toggle checked={theme.animations} onChange={(animations) => update({ animations })} title="Плавные анимации" hint="Переходы и анимации элементов интерфейса" />
            <Toggle checked={theme.boldFocus} onChange={(boldFocus) => update({ boldFocus })} title="Заметные рамки фокуса" hint="Ярче подсвечивать выбранную кнопку или поле — удобно с клавиатуры" />
          </div>
        </div>
      </div>

      {editing ? <CustomThemeEditor value={editing} onCancel={() => setEditing(null)} onSave={saveCustom} /> : null}

      {toast ? (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border border-white/10 bg-brand-night/95 px-4 py-3 text-sm text-white shadow-brand-soft">
          <span className="h-4 w-4 rounded" style={{ background: accent }} /> Тема обновлена
        </div>
      ) : null}
    </div>
  );
}

/** Редактор своей темы: имя, три цвета фона и акцент с живым превью. */
function CustomThemeEditor({ value, onCancel, onSave }: { value: ThemePalette; onCancel: () => void; onSave: (p: ThemePalette) => void }) {
  const [draft, setDraft] = useState(value);
  const field = (key: 'deep' | 'night' | 'slate' | 'accent', title: string) => (
    <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
      {title}
      <span className="flex items-center gap-2">
        <span className="text-xs text-white/40">{draft[key]}</span>
        <input type="color" value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} className="h-8 w-10 cursor-pointer rounded-lg border-0 bg-transparent" />
      </span>
    </label>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-brand-night p-6 shadow-brand-soft" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 text-lg font-semibold text-white">{value.name === 'Моя тема' && value.custom ? 'Новая тема' : 'Своя тема'}</div>
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="mb-4 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2.5 text-white outline-none" placeholder="Название темы" />
        <div className="grid gap-2">
          {field('deep', 'Фон')}
          {field('night', 'Карточки и панели')}
          {field('slate', 'Рамки и подсветка')}
          {field('accent', 'Акцент')}
        </div>
        <div className="mt-4">
          <ThemePreview palette={draft} accent={draft.accent} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2 text-sm text-white/70 hover:bg-white/10">Отмена</button>
          <button type="button" onClick={() => onSave({ ...draft, name: draft.name.trim() || 'Моя тема', custom: true })} className="rounded-xl bg-brand-mint px-4 py-2 text-sm font-semibold text-brand-deep">Сохранить и применить</button>
        </div>
      </div>
    </div>
  );
}

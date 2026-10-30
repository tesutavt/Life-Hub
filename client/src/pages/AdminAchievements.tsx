import React, { useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import { Copy, Eye, EyeOff, Gift, Loader2, Pencil, Plus, RefreshCcw, RotateCcw, Search, Sparkles, Trash2, Trophy, Upload, Users } from 'lucide-react';
import Shell from '../components/Shell';
import { Modal } from '../components/ui/Modal';
import { api, resolveApiUrl } from '../api';
import { rarityStyle, RARITY_STYLES } from '../achievements';
import { AchievementsImportModal, AchievementsTemplateModal } from '../components/admin/AchievementsImport';

type CatalogAction = { key: string; label: string; category: string; kind: 'event' | 'client' | 'stat' | 'manual'; unit: string | null };

type AdminAchievement = {
  id: number;
  code: string | null;
  title: string;
  description: string | null;
  icon: string;
  category: string | null;
  action: string;
  action_label: string;
  action_kind: CatalogAction['kind'] | null;
  condition_type: 'count' | 'days' | 'streak' | 'value';
  threshold: number;
  xp_reward: number;
  rarity: string;
  is_active: boolean;
  is_hidden: boolean;
  sort_order: number;
  earned_count: number;
};

type Draft = Omit<AdminAchievement, 'id' | 'action_label' | 'action_kind' | 'earned_count'> & { id?: number };

const EMPTY_DRAFT: Draft = {
  code: '',
  title: '',
  description: '',
  icon: '🏆',
  category: '',
  action: '',
  condition_type: 'count',
  threshold: 1,
  xp_reward: 50,
  rarity: 'common',
  is_active: true,
  is_hidden: false,
  sort_order: 0,
};

const KIND_LABEL: Record<CatalogAction['kind'], { label: string; cls: string; hint: string }> = {
  event: { label: 'событие', cls: 'bg-sky-400/15 text-sky-200', hint: 'засчитывается автоматически при действии на сайте' },
  client: { label: 'интерфейс', cls: 'bg-violet-400/15 text-violet-200', hint: 'визит страницы или использование функции' },
  stat: { label: 'показатель', cls: 'bg-brand-mint/15 text-brand-mint/90', hint: 'значение считается из данных пользователя, учитывает историю' },
  manual: { label: 'вручную', cls: 'bg-amber-400/15 text-amber-200', hint: 'выдаёт только администратор' },
};

const ICON_PRESETS = ['🏆', '🥇', '🎖️', '⭐', '🌟', '🔥', '⚡', '💎', '👑', '🎯', '🚀', '🎉', '💪', '🧠', '📚', '🗣️', '🎓', '✅', '👟', '🌍', '🦉', '🐦', '🎁', '🕊️'];

export function describeCondition(kind: CatalogAction['kind'] | null | undefined, condition: string, threshold: number, unit?: string | null) {
  const n = new Intl.NumberFormat('ru-RU').format(threshold);
  if (kind === 'manual') return 'выдаётся вручную';
  if (kind === 'stat' || condition === 'value') return `≥ ${n}${unit ? ` ${unit}` : ''}`;
  if (condition === 'days') return `в ${n} разных днях`;
  if (condition === 'streak') return `${n} дней подряд`;
  return threshold === 1 ? 'один раз' : `${n} раз`;
}

export default function AdminAchievements() {
  const [items, setItems] = useState<AdminAchievement[]>([]);
  const [catalog, setCatalog] = useState<CatalogAction[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [holdersFor, setHoldersFor] = useState<AdminAchievement | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const actionsByKey = useMemo(() => new Map(catalog.map((a) => [a.key, a])), [catalog]);

  const load = async () => {
    const [list, actions] = await Promise.all([api.get('/api/admin/achievements'), catalog.length ? null : api.get('/api/admin/achievements/actions')]);
    setItems(Array.isArray(list?.items) ? list.items : []);
    setUsersTotal(list?.users_total || 0);
    if (actions) setCatalog(actions.items || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => [i.title, i.description, i.action, i.action_label, i.code].some((v) => (v || '').toLowerCase().includes(q)));
  }, [items, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, AdminAchievement[]>();
    for (const item of filtered) {
      const group = item.category || actionsByKey.get(item.action)?.category || 'Другое';
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(item);
    }
    return Array.from(map.entries());
  }, [filtered, actionsByKey]);

  const runBusy = async (key: string, fn: () => Promise<any>) => {
    setBusy(key);
    try {
      await fn();
      await load();
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!draft) return;
    const { id, ...body } = draft;
    await runBusy('save', () => (id ? api.put(`/api/admin/achievements/${id}`, body) : api.post('/api/admin/achievements', body)));
    setDraft(null);
  };

  const toggle = (item: AdminAchievement, patch: Partial<Draft>) =>
    runBusy(`t${item.id}`, () => api.put(`/api/admin/achievements/${item.id}`, { ...item, ...patch }, { silentSuccess: true }));

  return (
    <Shell>
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/20 text-amber-200">
              <Trophy size={24} />
            </div>
            <div>
              <div className="text-xl font-semibold text-white">Ачивки</div>
              <div className="text-sm text-white/60">
                {items.length} ачивок · {catalog.length} действий для привязки · пользователей: {usersTotal}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => runBusy('recalc', () => api.post('/api/admin/achievements/recalculate', {}, { notifySuccess: 'Пересчитано для всех пользователей' }))}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
              title="Проверить условия всех ачивок у всех пользователей"
            >
              {busy === 'recalc' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />} Пересчитать
            </button>
            <button
              type="button"
              onClick={() => runBusy('defaults', () => api.post('/api/admin/achievements/restore-defaults', {}, { notifySuccess: 'Стандартные ачивки восстановлены' }))}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
              title="Добавить недостающие ачивки из стандартного набора"
            >
              <RotateCcw size={14} /> Стандартный набор
            </button>
            <button
              type="button"
              onClick={() => setTemplateOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
              title="Промпт для нейросети со списком всех действий проекта"
            >
              <Sparkles size={14} className="text-amber-200" /> Шаблон для ИИ
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
            >
              <Upload size={14} /> Импорт ачивок
            </button>
            <button
              type="button"
              onClick={() => setDraft({ ...EMPTY_DRAFT })}
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-300 px-4 py-2 text-xs font-semibold text-brand-deep hover:brightness-110"
            >
              <Plus size={14} /> Новая ачивка
            </button>
          </div>
        </section>

        <AchievementsTemplateModal open={templateOpen} onClose={() => setTemplateOpen(false)} />
        <AchievementsImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={load} />

        <div className="relative max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по названию или действию…"
            className="w-full rounded-full border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-amber-300/60"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-white/60">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Загружаем…
          </div>
        ) : (
          grouped.map(([group, list]) => (
            <section key={group} className="space-y-2">
              <div className="px-1 text-xs font-semibold uppercase tracking-wider text-white/50">{group}</div>
              <div className="overflow-hidden rounded-2xl border border-white/10">
                {list.map((item, index) => {
                  const style = rarityStyle(item.rarity);
                  const action = actionsByKey.get(item.action);
                  const kind = item.action_kind ? KIND_LABEL[item.action_kind] : null;
                  return (
                    <div
                      key={item.id}
                      className={classNames('flex flex-wrap items-center gap-3 bg-white/[0.03] px-3 py-2.5 transition hover:bg-white/[0.06]', index > 0 && 'border-t border-white/5', !item.is_active && 'opacity-50')}
                    >
                      <div className={classNames('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-gradient-to-br text-xl', style.ring, style.bg)}>{item.icon}</div>
                      <div className="min-w-[200px] flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-white">{item.title}</span>
                          <span className={classNames('text-[10px] font-semibold uppercase', style.text)}>{style.label}</span>
                          {item.is_hidden && <span className="rounded-full bg-white/10 px-1.5 text-[10px] text-white/60">секретная</span>}
                        </div>
                        <div className="truncate text-xs text-white/55">{item.description}</div>
                      </div>
                      <div className="min-w-[220px] flex-1 text-xs">
                        <div className="flex items-center gap-1.5">
                          {kind && <span className={classNames('rounded-full px-1.5 py-0.5 text-[10px]', kind.cls)}>{kind.label}</span>}
                          <span className="truncate text-white/80">{item.action_label}</span>
                        </div>
                        <div className="mt-0.5 text-white/45">
                          Условие: {describeCondition(item.action_kind, item.condition_type, item.threshold, action?.unit)} · +{item.xp_reward} XP
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setHoldersFor(item)}
                        className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10"
                        title="Кто получил / выдать вручную"
                      >
                        <Users size={12} /> {item.earned_count}/{usersTotal}
                      </button>
                      <div className="flex items-center gap-1">
                        <label className="relative inline-flex cursor-pointer items-center" title={item.is_active ? 'Включена' : 'Выключена'}>
                          <input type="checkbox" className="peer sr-only" checked={item.is_active} onChange={() => toggle(item, { is_active: !item.is_active })} />
                          <span className="h-5 w-9 rounded-full bg-white/15 transition peer-checked:bg-brand-mint/70" />
                          <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-4" />
                        </label>
                        <IconButton title={item.is_hidden ? 'Сделать видимой' : 'Сделать секретной'} onClick={() => toggle(item, { is_hidden: !item.is_hidden })}>
                          {item.is_hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                        </IconButton>
                        <IconButton title="Дублировать" onClick={() => setDraft({ ...item, id: undefined, code: '', title: `${item.title} (копия)` })}>
                          <Copy size={14} />
                        </IconButton>
                        <IconButton title="Редактировать" onClick={() => setDraft({ ...item })}>
                          <Pencil size={14} />
                        </IconButton>
                        <IconButton
                          title="Удалить"
                          danger
                          onClick={() => {
                            if (window.confirm(`Удалить ачивку «${item.title}»? Она пропадёт и у получивших её пользователей.`)) {
                              runBusy(`d${item.id}`, () => api.del(`/api/admin/achievements/${item.id}`));
                            }
                          }}
                        >
                          <Trash2 size={14} />
                        </IconButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      {draft && (
        <AchievementEditor
          draft={draft}
          catalog={catalog}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSave={save}
          saving={busy === 'save'}
        />
      )}
      {holdersFor && <HoldersModal achievement={holdersFor} onClose={() => { setHoldersFor(null); load(); }} />}
    </Shell>
  );
}

function IconButton({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={classNames('flex h-7 w-7 items-center justify-center rounded-full text-white/60 transition hover:text-white', danger ? 'hover:bg-rose-500/30' : 'hover:bg-white/10')}
    >
      {children}
    </button>
  );
}

function AchievementEditor({
  draft,
  catalog,
  onChange,
  onClose,
  onSave,
  saving,
}: {
  draft: Draft;
  catalog: CatalogAction[];
  onChange: (draft: Draft) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [actionQuery, setActionQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | CatalogAction['kind']>('all');
  const selected = catalog.find((a) => a.key === draft.action) || null;
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });

  const actionGroups = useMemo(() => {
    const q = actionQuery.trim().toLowerCase();
    const map = new Map<string, CatalogAction[]>();
    for (const action of catalog) {
      if (kindFilter !== 'all' && action.kind !== kindFilter) continue;
      if (q && !`${action.label} ${action.key} ${action.category}`.toLowerCase().includes(q)) continue;
      if (!map.has(action.category)) map.set(action.category, []);
      map.get(action.category)!.push(action);
    }
    return Array.from(map.entries());
  }, [catalog, actionQuery, kindFilter]);

  const pickAction = (action: CatalogAction) => {
    const condition = action.kind === 'stat' ? 'value' : draft.condition_type === 'value' ? 'count' : draft.condition_type;
    set({ action: action.key, condition_type: condition, title: draft.title || action.label });
  };

  const inputCls = 'w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-amber-300/60';
  const canSave = !!draft.title.trim() && !!selected;

  return (
    <Modal showCloseButton open onClose={onClose} contentClassName="w-full max-w-4xl rounded-3xl border border-white/10 bg-brand-night p-5 shadow-2xl">
      <div className="mb-4 flex items-center justify-between pr-10">
        <div className="text-lg font-semibold text-white">{draft.id ? 'Редактирование ачивки' : 'Новая ачивка'}</div>
        <div className={classNames('flex h-12 w-12 items-center justify-center rounded-2xl border bg-gradient-to-br text-2xl', rarityStyle(draft.rarity).ring, rarityStyle(draft.rarity).bg)}>{draft.icon}</div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Left: description */}
        <div className="space-y-3">
          <Field label="Название">
            <input className={inputCls} value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="Например: Неделя силы" />
          </Field>
          <Field label="Описание (видит пользователь)">
            <textarea className={classNames(inputCls, 'min-h-[64px]')} value={draft.description || ''} onChange={(e) => set({ description: e.target.value })} placeholder="Отмечайте привычки 7 дней подряд" />
          </Field>
          <Field label="Иконка">
            <div className="flex flex-wrap gap-1">
              {ICON_PRESETS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => set({ icon })}
                  className={classNames('h-8 w-8 rounded-lg text-lg transition', draft.icon === icon ? 'bg-amber-300/30 ring-1 ring-amber-300' : 'bg-white/5 hover:bg-white/10')}
                >
                  {icon}
                </button>
              ))}
              <input className="h-8 w-16 rounded-lg border border-white/10 bg-black/30 text-center text-lg outline-none" value={draft.icon} onChange={(e) => set({ icon: e.target.value })} title="Любой эмодзи" />
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Редкость">
              <select className={inputCls} value={draft.rarity} onChange={(e) => set({ rarity: e.target.value })}>
                {Object.entries(RARITY_STYLES).map(([key, s]) => (
                  <option key={key} value={key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Награда, XP">
              <input type="number" min={0} className={inputCls} value={draft.xp_reward} onChange={(e) => set({ xp_reward: Number(e.target.value) })} />
            </Field>
            <Field label="Категория (необязательно)">
              <input className={inputCls} value={draft.category || ''} onChange={(e) => set({ category: e.target.value })} placeholder={selected?.category || 'Как у действия'} />
            </Field>
            <Field label="Порядок">
              <input type="number" className={inputCls} value={draft.sort_order} onChange={(e) => set({ sort_order: Number(e.target.value) })} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-white/80">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draft.is_active} onChange={(e) => set({ is_active: e.target.checked })} /> Активна
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draft.is_hidden} onChange={(e) => set({ is_hidden: e.target.checked })} /> Секретная (условие скрыто)
            </label>
          </div>
        </div>

        {/* Right: action binding */}
        <div className="space-y-3">
          <Field label={`Действие на сайте (${catalog.length})`}>
            <div className="mb-2 flex gap-1">
              {(['all', 'event', 'client', 'stat', 'manual'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKindFilter(k)}
                  className={classNames('rounded-full px-2 py-0.5 text-[11px]', kindFilter === k ? 'bg-amber-300 text-brand-deep' : 'bg-white/5 text-white/60 hover:bg-white/10')}
                >
                  {k === 'all' ? 'все' : KIND_LABEL[k].label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input className={classNames(inputCls, 'pl-8')} value={actionQuery} onChange={(e) => setActionQuery(e.target.value)} placeholder="Найти действие: привычка, урок, шаги…" />
            </div>
            <div className="mt-2 h-56 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-1">
              {actionGroups.map(([category, actions]) => (
                <div key={category}>
                  <div className="sticky top-0 bg-brand-night/95 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">{category}</div>
                  {actions.map((action) => (
                    <button
                      key={action.key}
                      type="button"
                      onClick={() => pickAction(action)}
                      className={classNames(
                        'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition',
                        draft.action === action.key ? 'bg-amber-300/20 text-white' : 'text-white/75 hover:bg-white/5'
                      )}
                    >
                      <span className={classNames('shrink-0 rounded-full px-1.5 text-[9px]', KIND_LABEL[action.kind].cls)}>{KIND_LABEL[action.kind].label}</span>
                      <span className="flex-1 truncate">{action.label}</span>
                      <span className="shrink-0 font-mono text-[9px] text-white/30">{action.key}</span>
                    </button>
                  ))}
                </div>
              ))}
              {actionGroups.length === 0 && <div className="p-4 text-center text-xs text-white/50">Ничего не найдено</div>}
            </div>
          </Field>

          {selected && (
            <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="text-xs text-white/50">{KIND_LABEL[selected.kind].hint}</div>
              {selected.kind !== 'manual' && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Условие">
                    {selected.kind === 'stat' ? (
                      <div className={classNames(inputCls, 'text-white/60')}>значение ≥ порога</div>
                    ) : (
                      <select className={inputCls} value={draft.condition_type} onChange={(e) => set({ condition_type: e.target.value as Draft['condition_type'] })}>
                        <option value="count">Сколько раз всего</option>
                        <option value="days">В скольких разных днях</option>
                        <option value="streak">Дней подряд (серия)</option>
                      </select>
                    )}
                  </Field>
                  <Field label={`Порог${selected.unit ? `, ${selected.unit}` : ''}`}>
                    <input type="number" min={1} className={inputCls} value={draft.threshold} onChange={(e) => set({ threshold: Math.max(1, Number(e.target.value)) })} />
                  </Field>
                </div>
              )}
              <div className="rounded-xl bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
                Выдаётся, когда: <b>«{selected.label}»</b> — {describeCondition(selected.kind, draft.condition_type, draft.threshold, selected.unit)}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm text-white/70 hover:bg-white/10">
          Отмена
        </button>
        <button
          type="button"
          disabled={!canSave || saving}
          onClick={onSave}
          className="inline-flex items-center gap-2 rounded-full bg-amber-300 px-5 py-2 text-sm font-semibold text-brand-deep hover:brightness-110 disabled:opacity-50"
        >
          {saving && <Loader2 size={14} className="animate-spin" />} Сохранить
        </button>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-white/50">{label}</span>
      {children}
    </label>
  );
}

type Holder = { id: number; name: string; username: string; avatar_url: string | null; earned_at: string; granted_by: number | null };
type UserRow = { id: number; name: string; username: string };

function HoldersModal({ achievement, onClose }: { achievement: AdminAchievement; onClose: () => void }) {
  const [holders, setHolders] = useState<Holder[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userId, setUserId] = useState<number | ''>('');

  const load = async () => {
    const [h, u] = await Promise.all([api.get(`/api/admin/achievements/${achievement.id}/holders`), api.get('/api/admin/users')]);
    setHolders(h?.items || []);
    setUsers(u?.items || []);
  };
  useEffect(() => {
    load();
  }, [achievement.id]);

  const holderIds = new Set(holders.map((h) => h.id));

  return (
    <Modal showCloseButton open onClose={onClose} contentClassName="w-full max-w-lg rounded-3xl border border-white/10 bg-brand-night p-5 shadow-2xl">
      <div className="mb-3 flex items-center gap-3">
        <span className="text-3xl">{achievement.icon}</span>
        <div>
          <div className="font-semibold text-white">{achievement.title}</div>
          <div className="text-xs text-white/50">Получили: {holders.length}</div>
        </div>
      </div>
      <div className="mb-3 flex gap-2">
        <select value={userId} onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : '')} className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none">
          <option value="">Выдать пользователю…</option>
          {users.filter((u) => !holderIds.has(u.id)).map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} (@{u.username})
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!userId}
          onClick={async () => {
            await api.post(`/api/admin/achievements/${achievement.id}/grant`, { user_id: userId }, { notifySuccess: 'Ачивка выдана' });
            setUserId('');
            load();
          }}
          className="inline-flex items-center gap-1 rounded-full bg-amber-300 px-3 py-2 text-xs font-semibold text-brand-deep disabled:opacity-50"
        >
          <Gift size={14} /> Выдать
        </button>
      </div>
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {holders.map((h) => (
          <div key={h.id} className="flex items-center gap-2 rounded-xl bg-white/5 px-2 py-1.5">
            <img src={h.avatar_url ? resolveApiUrl(h.avatar_url) : 'https://api.dicebear.com/9.x/identicon/svg'} alt="" className="h-7 w-7 rounded-full object-cover" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-white">{h.name}</div>
              <div className="text-[11px] text-white/45">
                {new Date(h.earned_at).toLocaleString('ru-RU')} {h.granted_by ? '· выдана вручную' : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                await api.post(`/api/admin/achievements/${achievement.id}/revoke`, { user_id: h.id }, { notifySuccess: 'Ачивка отозвана' });
                load();
              }}
              className="rounded-full px-2 py-1 text-[11px] text-white/50 hover:bg-rose-500/20 hover:text-white"
            >
              Отозвать
            </button>
          </div>
        ))}
        {holders.length === 0 && <div className="py-6 text-center text-sm text-white/50">Пока никто не получил</div>}
      </div>
    </Modal>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';

export type GoalAction = { key: string; label: string; category: string };
export type GoalAuto = { auto_action: string | null; auto_min: number };

let actionsCache: Promise<GoalAction[]> | null = null;
export const loadGoalActions = () => {
  if (!actionsCache) {
    actionsCache = api
      .get('/api/achievements/actions', { silentError: true })
      .then((res: any) => (Array.isArray(res?.items) ? res.items : []))
      .catch(() => {
        actionsCache = null;
        return [];
      });
  }
  return actionsCache;
};

/** Выбор действия в проекте, которое само отмечает день у цели на год. */
export default function GoalAutoPicker({ value, onChange }: { value: GoalAuto; onChange: (value: GoalAuto) => void }) {
  const [actions, setActions] = useState<GoalAction[]>([]);

  useEffect(() => {
    loadGoalActions().then(setActions);
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, GoalAction[]>();
    actions.forEach((action) => {
      if (!map.has(action.category)) map.set(action.category, []);
      map.get(action.category)!.push(action);
    });
    return Array.from(map.entries());
  }, [actions]);

  const field = 'rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none transition focus:border-white/40';

  return (
    <div className="space-y-2">
      <label className="text-xs uppercase tracking-wide text-white/60">Автоотметка</label>
      <select
        className={`${field} w-full`}
        value={value.auto_action || ''}
        onChange={(e) => onChange({ ...value, auto_action: e.target.value || null })}
      >
        <option value="" className="bg-brand-night">
          Нет — отмечаю вручную
        </option>
        {groups.map(([category, items]) => (
          <optgroup key={category} label={category} className="bg-brand-night">
            {items.map((action) => (
              <option key={action.key} value={action.key} className="bg-brand-night">
                {action.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {value.auto_action && (
        <label className="flex flex-wrap items-center gap-2 text-sm text-white/70">
          День засчитается, когда сделаю это
          <input
            type="number"
            min={1}
            max={1000}
            value={value.auto_min}
            onChange={(e) => onChange({ ...value, auto_min: Math.max(1, Number(e.target.value) || 1) })}
            className={`${field} w-20 py-1`}
          />
          раз за день
        </label>
      )}
    </div>
  );
}

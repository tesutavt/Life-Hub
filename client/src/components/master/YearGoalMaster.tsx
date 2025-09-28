import React, { useState } from "react";
import Master from "./Master";
import { api } from "../../api";

type YearGoalMasterProps = {
  onCreated: () => Promise<void> | void;
};

type FormState = {
  title: string;
  target: number;
};

const INITIAL_FORM: FormState = {
  title: "",
  target: 30,
};

export default function YearGoalMaster({ onCreated }: YearGoalMasterProps) {
  const [form, setForm] = useState<FormState>({ ...INITIAL_FORM });
  const [saving, setSaving] = useState(false);

  const submit = async (close: () => void) => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await api.post("/api/life/yearly-goals", form);
      setForm({ ...INITIAL_FORM });
      await onCreated?.();
      close();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Master
      title="Новая годовая цель"
      description="Определите ключевую цель на год и отмечайте ежедневный прогресс."
    >
      {({ close }) => (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(close);
          }}
          className="grid gap-3"
        >
          <input
            autoFocus
            placeholder="Название цели"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:border-white/40 outline-none transition"
          />
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-white/60">Целевой прогресс</label>
            <input
              type="number"
              min={1}
              value={form.target}
              onChange={(event) =>
                setForm({ ...form, target: Math.max(1, Number(event.target.value) || 1) })
              }
              className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:border-white/40 outline-none transition"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setForm({ ...INITIAL_FORM });
                close();
              }}
              className="px-4 py-2 rounded-lg bg-white/10 text-white/80 hover:bg-white/20 transition"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-white text-black font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        </form>
      )}
    </Master>
  );
}

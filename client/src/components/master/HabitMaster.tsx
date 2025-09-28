import React, { useState } from "react";
import Master from "./Master";
import { api } from "../../api";
import TagSelector from "../tags/TagSelector";

type TagOption = { id: number; label: string; color: string };

type HabitMasterProps = {
  tagOptions: TagOption[];
  onCreated: () => Promise<void> | void;
};

type FormState = {
  title: string;
  target_per_week: number;
};

const INITIAL_FORM: FormState = {
  title: "",
  target_per_week: 3,
};

export default function HabitMaster({ tagOptions, onCreated }: HabitMasterProps) {
  const [form, setForm] = useState<FormState>({ ...INITIAL_FORM });
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const submit = async (close: () => void) => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await api.post("/api/life/habits", { ...form, tags: tagIds });
      await api.post("/api/life/xp/add", { amount: 15, note: "habit add" });
      setForm({ ...INITIAL_FORM });
      setTagIds([]);
      await onCreated?.();
      close();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Master title="Новая привычка" description="Добавьте привычку и отслеживайте выполнения в течение недели.">
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
            placeholder="Название привычки"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:border-white/40 outline-none transition"
          />
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-white/60">Цель в неделю</label>
            <input
              type="number"
              min={0}
              value={form.target_per_week}
              onChange={(event) =>
                setForm({ ...form, target_per_week: Math.max(0, Number(event.target.value) || 0) })
              }
              className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:border-white/40 outline-none transition"
            />
          </div>
          <TagSelector
            tags={tagOptions}
            selectedIds={tagIds}
            onChange={setTagIds}
            label="Теги привычки"
            className="mt-1"
            emptyState="Нет доступных тэгов. Создайте их на странице Страницы."
            onManageTags={() => window.open("/pages", "_blank")}
          />
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setForm({ ...INITIAL_FORM });
                setTagIds([]);
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

import React, { useState } from "react";
import Master from "./Master";
import { api } from "../../api";
import TagSelector from "../tags/TagSelector";

type TagOption = { id: number; label: string; color: string };

type TravelMasterProps = {
  tagOptions: TagOption[];
  onCreated: () => Promise<void> | void;
};

type FormState = {
  title: string;
  location: string;
  date_from: string;
  date_to: string;
  status: string;
};

const INITIAL_FORM: FormState = {
  title: "",
  location: "",
  date_from: "",
  date_to: "",
  status: "planned",
};

export default function TravelMaster({ tagOptions, onCreated }: TravelMasterProps) {
  const [form, setForm] = useState<FormState>({ ...INITIAL_FORM });
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const submit = async (close: () => void) => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await api.post("/api/life/travel", { ...form, tags: tagIds });
      await api.post("/api/life/xp/add", { amount: 20 });
      setForm({ ...INITIAL_FORM });
      setTagIds([]);
      await onCreated?.();
      close();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Master title="Новое путешествие" description="Запланируйте поездку и сохраните детали о месте и датах.">
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
            placeholder="Название"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:border-white/40 outline-none transition"
          />
          <input
            placeholder="Локация"
            value={form.location}
            onChange={(event) => setForm({ ...form, location: event.target.value })}
            className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:border-white/40 outline-none transition"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-white/60">Дата начала</label>
              <input
                type="date"
                value={form.date_from}
                onChange={(event) => setForm({ ...form, date_from: event.target.value })}
                className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:border-white/40 outline-none transition"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-white/60">Дата окончания</label>
              <input
                type="date"
                value={form.date_to}
                onChange={(event) => setForm({ ...form, date_to: event.target.value })}
                className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:border-white/40 outline-none transition"
              />
            </div>
          </div>
          <TagSelector
            tags={tagOptions}
            selectedIds={tagIds}
            onChange={setTagIds}
            label="Теги путешествия"
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

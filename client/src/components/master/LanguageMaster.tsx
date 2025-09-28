import React, { useState } from "react";
import Master from "./Master";
import { api } from "../../api";
import TagSelector from "../tags/TagSelector";

type TagOption = { id: number; label: string; color: string };

type LanguageMasterProps = {
  tagOptions: TagOption[];
  onCreated: () => Promise<void> | void;
};

type FormState = {
  name: string;
  level: string;
  minutes_today: number;
  imageUrl: string;
  bannerUrl: string;
};

const INITIAL_FORM: FormState = {
  name: "",
  level: "A1",
  minutes_today: 0,
  imageUrl: "",
  bannerUrl: "",
};

export default function LanguageMaster({ tagOptions, onCreated }: LanguageMasterProps) {
  const [form, setForm] = useState<FormState>({ ...INITIAL_FORM });
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const submit = async (close: () => void) => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const imageUrl = form.imageUrl.trim();
      const bannerUrl = form.bannerUrl.trim();
      await api.post("/api/life/languages", {
        name: form.name,
        level: form.level,
        minutes_today: form.minutes_today,
        image_url: imageUrl.length > 0 ? imageUrl : null,
        banner_url: bannerUrl.length > 0 ? bannerUrl : null,
        tags: tagIds,
      });
      await api.post("/api/life/xp/add", { amount: 15 });
      setForm({ ...INITIAL_FORM });
      setTagIds([]);
      await onCreated?.();
      close();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Master
      title="Добавить язык"
      description="Создайте новый язык обучения и отметьте прогресс."
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
            placeholder="Название языка"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:border-white/40 outline-none transition"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-white/60">Уровень</label>
              <select
                value={form.level}
                onChange={(event) => setForm({ ...form, level: event.target.value })}
                className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:border-white/40 outline-none transition"
              >
                {["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-white/60">Минут сегодня</label>
              <input
                type="number"
                min={0}
                value={form.minutes_today}
                onChange={(event) =>
                  setForm({ ...form, minutes_today: Math.max(0, Number(event.target.value) || 0) })
                }
                className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:border-white/40 outline-none transition"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              placeholder="Ссылка на изображение (опционально)"
              value={form.imageUrl}
              onChange={(event) => setForm({ ...form, imageUrl: event.target.value })}
              className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:border-white/40 outline-none transition"
            />
            <input
              placeholder="Ссылка на баннер (опционально)"
              value={form.bannerUrl}
              onChange={(event) => setForm({ ...form, bannerUrl: event.target.value })}
              className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:border-white/40 outline-none transition"
            />
          </div>
          <TagSelector
            tags={tagOptions}
            selectedIds={tagIds}
            onChange={setTagIds}
            label="Теги языка"
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

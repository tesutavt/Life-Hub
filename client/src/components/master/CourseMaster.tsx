import React, { useMemo, useState } from "react";
import Master from "./Master";
import { api } from "../../api";
import TagSelector from "../tags/TagSelector";

type TagOption = { id: number; label: string; color: string };
type Language = { id: number; name: string };

export const COURSE_TYPES = [
  { value: "study", label: "Учёба" },
  { value: "other", label: "Другое" },
] as const;

export type CourseType = (typeof COURSE_TYPES)[number]["value"];

type CourseMasterProps = {
  tagOptions: TagOption[];
  languages: Language[];
  onCreated: () => Promise<void> | void;
};

type FormState = {
  title: string;
  provider: string;
  course_type: CourseType;
  language_id: number | null;
  progress: number;
};

const INITIAL_FORM: FormState = {
  title: "",
  provider: "",
  course_type: COURSE_TYPES[0].value,
  language_id: null,
  progress: 0,
};

export default function CourseMaster({ tagOptions, languages, onCreated }: CourseMasterProps) {
  const [form, setForm] = useState<FormState>({ ...INITIAL_FORM });
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const languageOptions = useMemo(
    () => [...languages].sort((a, b) => a.name.localeCompare(b.name)),
    [languages],
  );

  const parseLanguageId = (value: string) => {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const submit = async (close: () => void) => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        language_id: form.language_id ?? null,
        tags: tagIds,
      };
      await api.post("/api/life/courses", payload);
      await api.post("/api/life/xp/add", { amount: 25 });
      setForm({ ...INITIAL_FORM });
      setTagIds([]);
      await onCreated?.();
      close();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Master title="Добавить курс" description="Запланируйте новый курс и отслеживайте прогресс.">
      {({ close }) => (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(close);
          }}
          className="grid gap-3"
        >
          <input
            placeholder="Название курса"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:border-white/40 outline-none transition"
          />
          <input
            placeholder="Платформа"
            value={form.provider}
            onChange={(event) => setForm({ ...form, provider: event.target.value })}
            className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:border-white/40 outline-none transition"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-white/60">Тип курса</label>
              <select
                value={form.course_type}
                onChange={(event) => setForm({ ...form, course_type: event.target.value as CourseType })}
                className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:border-white/40 outline-none transition"
              >
                {COURSE_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-white/60">Язык</label>
              <select
                value={form.language_id != null ? String(form.language_id) : ""}
                onChange={(event) =>
                  setForm({ ...form, language_id: parseLanguageId(event.target.value) })
                }
                className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:border-white/40 outline-none transition"
              >
                <option value="">Без языка</option>
                {languageOptions.map((language) => (
                  <option key={language.id} value={language.id}>
                    {language.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-white/60">Прогресс, %</label>
            <input
              type="number"
              min={0}
              max={100}
              value={form.progress}
              onChange={(event) =>
                setForm({ ...form, progress: Math.min(100, Math.max(0, Number(event.target.value) || 0)) })
              }
              className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:border-white/40 outline-none transition"
            />
          </div>
          <TagSelector
            tags={tagOptions}
            selectedIds={tagIds}
            onChange={setTagIds}
            label="Теги курса"
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

import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Shell from "../components/Shell";
import { api } from "../api";
import { requestMenuCountersRefresh } from "../menuBus";
import SiteSearch from "../components/SiteSearch";
import TagBadge from "../components/tags/TagBadge";
import TagSelector from "../components/tags/TagSelector";
import LanguageMaster from "../components/master/LanguageMaster";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type TagOption = { id: number; label: string; color: string };

type Lang = {
  id: number;
  name: string;
  level?: string;
  minutes_today?: number;
  tags: TagOption[];
};

type LanguagePage = {
  id: number;
  language_id: number;
  page_id: number;
  page_title: string;
  done: boolean;
  done_at?: string | null;
};

type PageOption = { id: number; title: string };

const Badge = ({ children }: { children: React.ReactNode }) => (
  <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-xs">
    {children}
  </span>
);

export default function Languages() {
  const [items, setItems] = useState<Lang[]>([]);
  const [archivedLanguages, setArchivedLanguages] = useState<Lang[]>([]);
  const [editing, setEditing] = useState<Lang | null>(null);
  const [editingTagIds, setEditingTagIds] = useState<number[]>([]);
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  const [history, setHistory] = useState<Record<string, number[]>>({});
  const [pages, setPages] = useState<PageOption[]>([]);
  const [languagePages, setLanguagePages] = useState<LanguagePage[]>([]);
  const [pickerLanguageId, setPickerLanguageId] = useState<number | null>(null);

  const mapLanguage = (entry: any): Lang => ({
    id: entry.id,
    name: entry.name,
    level: entry.level,
    minutes_today: entry.minutes_today,
    tags: Array.isArray(entry?.tags)
      ? entry.tags.map((tag: any) => ({ id: tag.id, label: tag.label, color: tag.color }))
      : [],
  });

  const loadLanguages = async () => {
    const res = await api.get("/api/life/languages");
    const activeSource = Array.isArray(res?.items)
      ? res.items
      : Array.isArray(res?.active)
      ? res.active
      : Array.isArray(res)
      ? res
      : [];
    const archivedSource = Array.isArray(res?.archived) ? res.archived : [];
    setItems(activeSource.map(mapLanguage));
    setArchivedLanguages(archivedSource.map(mapLanguage));
    requestMenuCountersRefresh();
  };

  const loadLanguagePages = async () => {
    const res = await api.get("/api/life/language-pages");
    const normalized = (res.items || []).map((entry: any) => ({
      id: entry.id,
      language_id: entry.language_id,
      page_id: entry.page_id,
      page_title: entry.page_title || "Без названия",
      done: !!entry.done,
      done_at: entry.done_at ?? null,
    }));
    setLanguagePages(normalized);
  };

  const loadPages = async () => {
    const res = await api.get("/api/life/pages");
    const normalized = (res.items || []).map((row: any) => ({
      id: row.id,
      title: (row.title || "").trim() || "Без названия",
    }));
    setPages(normalized);
  };

  const loadTagOptions = async () => {
    const res = await api.get("/api/life/pages/tags", { silentError: true });
    const options = (res.items || []).map((tag: any) => ({
      id: tag.id,
      label: tag.label,
      color: tag.color,
    }));
    setTagOptions(options);
  };

  useEffect(() => {
    loadLanguages();
    loadLanguagePages();
    loadPages();
    loadTagOptions();
  }, []);

  const totalMinutes = useMemo(
    () =>
      (items || []).reduce((acc, lang) => acc + (lang.minutes_today || 0), 0),
    [items],
  );

  const languagePageMap = useMemo(() => {
    const map = new Map<number, LanguagePage[]>();
    for (const link of languagePages) {
      if (!map.has(link.language_id)) map.set(link.language_id, []);
      map.get(link.language_id)!.push(link);
    }
    for (const [, links] of map) {
      links.sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return a.page_title.localeCompare(b.page_title, "ru");
      });
    }
    return map;
  }, [languagePages]);

  const saveEdit = async () => {
    if (!editing) return;
    await api.put(`/api/life/languages/${editing.id}`, {
      name: editing.name,
      level: editing.level,
      minutes_today: editing.minutes_today || 0,
      tags: editingTagIds,
    });
    setEditing(null);
    setEditingTagIds([]);
    await loadLanguages();
  };

  const archiveLanguage = async (id: number) => {
    if (!confirm("Переместить язык в архив?")) return;
    await api.del("/api/life/languages/" + id);
    await loadLanguages();
  };

  const restoreLanguage = async (id: number) => {
    await api.post("/api/life/languages/" + id + "/restore");
    await loadLanguages();
  };

  const toggleLinkDone = async (link: LanguagePage) => {
    try {
      const res = await api.patch(`/api/life/language-pages/${link.id}`, {
        done: !link.done,
      });
      if (res?.item) {
        setLanguagePages((prev) =>
          prev.map((item) => (item.id === link.id ? res.item : item)),
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const removeLink = async (link: LanguagePage) => {
    if (!confirm("Удалить учебную страницу?")) return;
    try {
      await api.del(`/api/life/language-pages/${link.id}`);
      setLanguagePages((prev) => prev.filter((item) => item.id !== link.id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleAttachPage = async (languageId: number, pageId: number) => {
    try {
      const res = await api.post("/api/life/language-pages", {
        language_id: languageId,
        page_id: pageId,
      });
      if (res?.item) {
        const it = res.item;
        setLanguagePages((prev) => [
          ...prev,
          {
            id: it.id,
            language_id: it.language_id ?? languageId,
            page_id: it.page_id ?? pageId,
            page_title:
              it.page_title ||
              pages.find((p) => p.id === pageId)?.title ||
              "Без названия",
            done: !!it.done,
            done_at: it.done_at ?? null,
          },
        ]);
      } else {
        setLanguagePages((prev) => [
          ...prev,
          {
            id: Date.now(),
            language_id: languageId,
            page_id: pageId,
            page_title:
              pages.find((p) => p.id === pageId)?.title || "Без названия",
            done: false,
            done_at: null,
          },
        ]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const pickerLanguage =
    pickerLanguageId != null
      ? items.find((l) => l.id === pickerLanguageId) || null
      : null;
  const pickerAttachments = pickerLanguage
    ? languagePageMap.get(pickerLanguage.id) || []
    : [];

  const streak =
    items.filter((lang) => (lang.minutes_today || 0) > 0).length > 0 ? 1 : 0;

  return (
    <Shell>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="text-2xl font-semibold">Языки</div>
          <div className="text-sm opacity-80">
            Минут сегодня: <b>{totalMinutes}</b>
          </div>
        </div>
        <LanguageMaster tagOptions={tagOptions} onCreated={loadLanguages} />
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {(items || []).map((language) => {
          const attachments = languagePageMap.get(language.id) || [];
          const streak = (language.minutes_today || 0) > 0 ? 1 : 0;
          return (
            <div
              key={language.id}
              className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold">{language.name}</div>
                <Badge>{language.level || "A1"}</Badge>
              </div>

              <div className="text-sm opacity-80">
                Минут сегодня: <b>{language.minutes_today || 0} мин</b>
              </div>

              {language.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 text-xs">
                  {language.tags.map((tag) => (
                    <TagBadge key={tag.id} tag={tag} compact />
                  ))}
                </div>
              )}

              <div className="h-16">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={(
                      history[language.name] || [
                        5,
                        10,
                        7,
                        16,
                        12,
                        18,
                        language.minutes_today || 0,
                      ]
                    ).map((v, i) => ({ i, v }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="i" hide />
                    <YAxis hide />
                    <Tooltip />
                    <Line type="monotone" dataKey="v" stroke="#ffffff" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wide opacity-70">
                  Учебные страницы
                </div>

                {attachments.length === 0 ? (
                  <div className="text-xs opacity-60">
                    Учебные страницы ещё не добавлены.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {attachments.map((link) => (
                      <div
                        key={link.id}
                        className={`flex items-center gap-3 px-3 py-2 rounded border border-white/10 bg-white/5`}
                      >
                        <Link
                          to={`/pages/${link.page_id}`}
                          className={`flex-1 min-w-0 text-sm truncate`}
                        >
                          {link.page_title}
                        </Link>
                        <button
                          onClick={() => toggleLinkDone(link)}
                          className={`text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20`}
                        >
                          {link.done ? "Снять отметку" : "Отметить пройденной"}
                        </button>
                        <button
                          onClick={() => removeLink(link)}
                          className="text-xs px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/40"
                        >
                          Удалить
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setPickerLanguageId(language.id);
                  }}
                  className="w-full px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm"
                >
                  Добавить учебную страницу
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <Badge>Текущий стрик: {streak} дн.</Badge>
                <button
                  onClick={() => {
                    setEditing(language);
                    setEditingTagIds(language.tags.map((tag) => tag.id));
                  }}
                  className="ml-auto px-2 py-1 rounded bg-white/10 hover:bg-white/20"
                >
                  Редактировать
                </button>
                <button
                  onClick={() => archiveLanguage(language.id)}
                  className="px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/40"
                >
                  Удалить
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <div className="font-medium">Архив языков</div>
          {archivedLanguages.length > 0 && (
            <span className="text-xs opacity-70">{archivedLanguages.length}</span>
          )}
        </div>
        {archivedLanguages.length === 0 ? (
          <div className="text-sm opacity-60">Архив пуст.</div>
        ) : (
          <div className="space-y-2">
            {archivedLanguages.map((language) => (
              <div
                key={language.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              >
                <div>
                  <div className="font-medium">{language.name}</div>
                  <div className="text-xs opacity-70">
                    Уровень: {language.level || "A1"}
                  </div>
                  {language.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1 text-xs">
                      {language.tags.map((tag) => (
                        <TagBadge key={tag.id} tag={tag} compact />
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => restoreLanguage(language.id)}
                  className="text-xs px-3 py-1 rounded bg-white text-black hover:bg-white/80"
                >
                  Восстановить
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-black p-6 rounded-xl w-96 border border-white/20 space-y-3">
            <div className="text-lg font-medium">
              Редактирование языка: {editing.name}
            </div>
            <input
              className="px-3 py-2 rounded bg-white/10 w-full"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <select
              className="px-3 py-2 rounded bg-white/10 w-full"
              value={editing.level || "A1"}
              onChange={(e) => setEditing({ ...editing, level: e.target.value })}
            >
              {["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              className="px-3 py-2 rounded bg-white/10 w-full"
              value={editing.minutes_today || 0}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  minutes_today: Number(e.target.value) || 0,
                })
              }
            />
            <TagSelector
              tags={tagOptions}
              selectedIds={editingTagIds}
              onChange={setEditingTagIds}
              label="Теги языка"
              emptyState="Нет доступных тэгов. Создайте их на странице Страницы."
              onManageTags={() => window.open('/pages', '_blank')}
            />
            <div className="flex justify-between">
              <button
                onClick={() => {
                  setEditing(null);
                  setEditingTagIds([]);
                }}
                className="px-3 py-2 rounded bg-white/10 hover:bg-white/20"
              >
                Отмена
              </button>
              <button
                onClick={saveEdit}
                className="px-3 py-2 rounded bg-green-600 hover:bg-green-700"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {pickerLanguage && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-black p-6 rounded-xl w-[32rem] max-w-full border border-white/20 space-y-4 max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Учебные страницы</div>
                <div className="text-sm opacity-70">{pickerLanguage.name}</div>
              </div>
              <button
                onClick={() => {
                  setPickerLanguageId(null);
                }}
                className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-xs"
              >
                Отмена
              </button>
            </div>

            <SiteSearch
              sections={['pages']}
              className="mt-2 bg-black/25 border-white/15"
              placeholder="Поиск по страницам..."
              onSelectPage={(page) => {
                if (!pickerLanguage) return;
                if (pickerAttachments.some((link) => link.page_id === page.id)) return;
                handleAttachPage(pickerLanguage.id, page.id);
              }}
            />

            {pickerAttachments.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs uppercase opacity-60">Уже прикреплены</div>
                <div className="space-y-1">
                  {pickerAttachments.map((link) => (
                    <div
                      key={link.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded border border-white/10 bg-white/5"
                    >
                      <div className="flex-1 min-w-0 text-sm truncate">
                        {link.page_title}
                      </div>
                      <button
                        onClick={() => toggleLinkDone(link)}
                        className={`text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20`}
                      >
                        {link.done ? "Снять отметку" : "Отметить пройденной"}
                      </button>
                      <button
                        onClick={() => removeLink(link)}
                        className="text-xs px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/40"
                      >
                        Удалить
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}

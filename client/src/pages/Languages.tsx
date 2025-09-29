import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Circle, CircleCheck, ExternalLink, FileText, PencilLine, Trash2 } from "lucide-react";
import Shell from "../components/Shell";
import { api } from "../api";
import { requestMenuCountersRefresh } from "../menuBus";
import SiteSearch from "../components/SiteSearch";
import TagBadge from "../components/tags/TagBadge";
import TagSelector from "../components/tags/TagSelector";
import { Modal } from "../components/ui/Modal";
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
  imageUrl?: string | null;
  bannerUrl?: string | null;
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

type LanguagePdfPage = {
  id: number;
  language_id: number;
  title: string;
  pdf_url: string;
  page_number?: number | null;
  done: boolean;
  done_at?: string | null;
  original_name?: string | null;
};

type LanguageAttachment =
  | (LanguagePage & { kind: "page" })
  | (LanguagePdfPage & { kind: "pdf" });

type PageOption = { id: number; title: string };

const Badge = ({ children }: { children: React.ReactNode }) => (
  <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-xs">
    {children}
  </span>
);

const sanitizeUrl = (value: string | null | undefined) => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getInitials = (value: string) => {
  if (!value) return "";
  const parts = value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return value.slice(0, 1).toUpperCase();
  return parts
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");
};

const BANNER_FALLBACKS = [
  "from-rose-500/40 via-orange-500/30 to-amber-400/40",
  "from-indigo-500/40 via-sky-500/30 to-emerald-400/40",
  "from-purple-500/40 via-pink-500/30 to-red-400/40",
  "from-sky-500/40 via-cyan-500/30 to-blue-500/40",
];

export default function Languages() {
  const [items, setItems] = useState<Lang[]>([]);
  const [archivedLanguages, setArchivedLanguages] = useState<Lang[]>([]);
  const [editing, setEditing] = useState<Lang | null>(null);
  const [editingTagIds, setEditingTagIds] = useState<number[]>([]);
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  const [history, setHistory] = useState<Record<string, number[]>>({});
  const [pages, setPages] = useState<PageOption[]>([]);
  const [languagePages, setLanguagePages] = useState<LanguagePage[]>([]);
  const [languagePdfPages, setLanguagePdfPages] = useState<LanguagePdfPage[]>([]);
  const [pickerLanguageId, setPickerLanguageId] = useState<number | null>(null);
  const [pdfForm, setPdfForm] = useState({
    title: "",
    page: "",
    url: "",
    file: null as File | null,
    uploading: false,
    error: null as string | null,
    originalName: null as string | null,
  });

  const mapLanguage = (entry: any): Lang => ({
    id: entry.id,
    name: entry.name,
    level: entry.level,
    minutes_today: entry.minutes_today,
    imageUrl: entry.image_url ?? entry.imageUrl ?? null,
    bannerUrl: entry.banner_url ?? entry.bannerUrl ?? null,
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

  const loadLanguagePdfPages = async () => {
    const res = await api.get("/api/life/language-pdf-pages");
    const normalized = (res.items || []).map((entry: any) => ({
      id: entry.id,
      language_id: entry.language_id,
      title: entry.title || "PDF материал",
      pdf_url: entry.pdf_url,
      page_number: entry.page_number ?? null,
      done: !!entry.done,
      done_at: entry.done_at ?? null,
      original_name: entry.original_name ?? null,
    }));
    setLanguagePdfPages(normalized);
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
    loadLanguagePdfPages();
    loadPages();
    loadTagOptions();
  }, []);

  const totalMinutes = useMemo(
    () =>
      (items || []).reduce((acc, lang) => acc + (lang.minutes_today || 0), 0),
    [items],
  );

  const languagePageMap = useMemo(() => {
    const map = new Map<number, LanguageAttachment[]>();
    for (const link of languagePages) {
      if (!map.has(link.language_id)) map.set(link.language_id, []);
      map.get(link.language_id)!.push({ ...link, kind: "page" });
    }
    for (const entry of languagePdfPages) {
      if (!map.has(entry.language_id)) map.set(entry.language_id, []);
      map.get(entry.language_id)!.push({ ...entry, kind: "pdf" });
    }
    for (const [, attachments] of map) {
      attachments.sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        const titleA = a.kind === "page" ? a.page_title : a.title;
        const titleB = b.kind === "page" ? b.page_title : b.title;
        return titleA.localeCompare(titleB, "ru");
      });
    }
    return map;
  }, [languagePages, languagePdfPages]);

  const saveEdit = async () => {
    if (!editing) return;
    await api.put(`/api/life/languages/${editing.id}`, {
      name: editing.name,
      level: editing.level,
      minutes_today: editing.minutes_today || 0,
      tags: editingTagIds,
      image_url: sanitizeUrl(editing.imageUrl),
      banner_url: sanitizeUrl(editing.bannerUrl),
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

  const togglePageLinkDone = async (link: LanguagePage) => {
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

  const removePageLink = async (link: LanguagePage) => {
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

  const handleAttachPdf = async (
    languageId: number,
    input: { title: string; pdfUrl: string; pageNumber?: number | null; originalName?: string | null }
  ) => {
    try {
      const payload: Record<string, unknown> = {
        language_id: languageId,
        title: input.title,
        pdf_url: input.pdfUrl,
      };
      if (input.pageNumber != null) payload.page_number = input.pageNumber;
      if (input.originalName) payload.original_name = input.originalName;
      const res = await api.post("/api/life/language-pdf-pages", payload);
      if (res?.item) {
        const item = res.item;
        setLanguagePdfPages((prev) => [
          ...prev,
          {
            id: item.id,
            language_id: item.language_id ?? languageId,
            title: item.title || input.title,
            pdf_url: item.pdf_url || input.pdfUrl,
            page_number: item.page_number ?? input.pageNumber ?? null,
            done: !!item.done,
            done_at: item.done_at ?? null,
            original_name: item.original_name ?? input.originalName ?? null,
          },
        ]);
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const togglePdfLinkDone = async (link: LanguagePdfPage) => {
    try {
      const res = await api.patch(`/api/life/language-pdf-pages/${link.id}`, {
        done: !link.done,
      });
      if (res?.item) {
        setLanguagePdfPages((prev) =>
          prev.map((item) =>
            item.id === link.id
              ? {
                  id: res.item.id,
                  language_id: res.item.language_id ?? link.language_id,
                  title: res.item.title ?? link.title,
                  pdf_url: res.item.pdf_url ?? link.pdf_url,
                  page_number: res.item.page_number ?? link.page_number ?? null,
                  done: !!res.item.done,
                  done_at: res.item.done_at ?? null,
                  original_name: res.item.original_name ?? link.original_name ?? null,
                }
              : item,
          ),
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const removePdfLink = async (link: LanguagePdfPage) => {
    if (!confirm("Удалить PDF материал?")) return;
    try {
      await api.del(`/api/life/language-pdf-pages/${link.id}`);
      setLanguagePdfPages((prev) => prev.filter((item) => item.id !== link.id));
    } catch (err) {
      console.error(err);
    }
  };

  const submitPdfAttachment = async () => {
    if (!pickerLanguage || pdfForm.uploading) return;
    const trimmedUrl = pdfForm.url.trim();
    if (!pdfForm.file && !trimmedUrl) {
      setPdfForm((prev) => ({ ...prev, error: "Загрузите файл или укажите ссылку" }));
      return;
    }
    let pageNumber: number | null = null;
    if (pdfForm.page.trim()) {
      const parsed = Number.parseInt(pdfForm.page.trim(), 10);
      if (Number.isNaN(parsed) || parsed <= 0) {
        setPdfForm((prev) => ({ ...prev, error: "Неверный номер страницы" }));
        return;
      }
      pageNumber = parsed;
    }

    setPdfForm((prev) => ({ ...prev, uploading: true, error: null }));

    try {
      let pdfUrl = trimmedUrl;
      let originalName = pdfForm.originalName;

      if (pdfForm.file) {
        const formData = new FormData();
        formData.append("file", pdfForm.file);
        const upload = await api.post("/api/life/uploads/pdf", formData, { silentSuccess: true });
        pdfUrl = upload?.url;
        originalName = upload?.original_name ?? pdfForm.file.name;
      }

      if (!pdfUrl) throw new Error("Не удалось получить ссылку на PDF");

      const title = pdfForm.title.trim() || originalName || "PDF материал";

      await handleAttachPdf(pickerLanguage.id, {
        title,
        pdfUrl,
        pageNumber,
        originalName,
      });

      setPdfForm({ title: "", page: "", url: "", file: null, uploading: false, error: null, originalName: null });
    } catch (err: any) {
      setPdfForm((prev) => ({
        ...prev,
        uploading: false,
        error: err?.message || "Не удалось добавить PDF",
      }));
    }
  };

  const pickerLanguage =
    pickerLanguageId != null
      ? items.find((l) => l.id === pickerLanguageId) || null
      : null;
  const pickerAttachments = pickerLanguage
    ? languagePageMap.get(pickerLanguage.id) || []
    : [];

  useEffect(() => {
    if (!pickerLanguage) {
      setPdfForm({ title: "", page: "", url: "", file: null, uploading: false, error: null, originalName: null });
    }
  }, [pickerLanguage]);

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
              className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden flex flex-col"
            >
              <div className="relative h-28 overflow-hidden">
                {language.bannerUrl ? (
                  <img
                    src={language.bannerUrl}
                    alt={`Баннер ${language.name}`}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className={`absolute inset-0 bg-gradient-to-r ${
                      BANNER_FALLBACKS[language.id % BANNER_FALLBACKS.length]
                    }`}
                  />
                )}
                <div className="absolute inset-0 bg-black/30" />
              </div>

              <div className="p-4 pt-0 flex flex-col flex-1">
                <div className="relative -mt-10 flex items-start gap-3">
                  <div className="shrink-0 w-16 h-16 rounded-xl border-2 border-black/60 overflow-hidden bg-black/60 flex items-center justify-center text-lg font-semibold text-white">
                    {language.imageUrl ? (
                      <img
                        src={language.imageUrl}
                        alt={`Изображение ${language.name}`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span>{getInitials(language.name)}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pt-2">
                    <div className="flex items-center gap-2">
                      <div className="text-lg font-semibold truncate">
                        {language.name}
                      </div>
                      <Badge>{language.level || "A1"}</Badge>
                    </div>
                    <div className="mt-1 text-sm opacity-80">
                      Минут сегодня: <b>{language.minutes_today || 0} мин</b>
                    </div>
                  </div>
                </div>

                {language.tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1 text-xs">
                    {language.tags.map((tag) => (
                      <TagBadge key={tag.id} tag={tag} compact />
                    ))}
                  </div>
                )}

                <div className="mt-4 h-16">
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

                <div className="mt-4 space-y-2">
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
                          key={`${link.kind}-${link.id}`}
                          className="flex items-center gap-3 rounded border border-white/10 bg-white/0 px-3 py-2 transition hover:bg-white/5"
                        >
                          {link.kind === "page" ? (
                            <Link
                              to={`/pages/${link.page_id}`}
                              className="flex-1 min-w-0 truncate text-sm hover:underline"
                            >
                              {link.page_title}
                            </Link>
                          ) : (
                            <div className="flex-1 min-w-0 text-sm">
                              <a
                                href={`${link.pdf_url}${link.page_number ? `#page=${link.page_number}` : ""}`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 hover:underline"
                              >
                                <FileText className="h-4 w-4" />
                                <span className="truncate">{link.title}</span>
                                <ExternalLink className="h-3 w-3 opacity-60" />
                              </a>
                              {link.page_number != null && (
                                <div className="text-xs opacity-60">Страница {link.page_number}</div>
                              )}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              link.kind === "page"
                                ? togglePageLinkDone(link)
                                : togglePdfLinkDone(link)
                            }
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/0 text-white/80 transition hover:bg-white/10"
                            title={link.done ? "Снять отметку" : "Отметить пройденной"}
                            aria-label={link.done ? "Снять отметку" : "Отметить пройденной"}
                          >
                            {link.done ? (
                              <CircleCheck className="h-4 w-4 text-emerald-300" />
                            ) : (
                              <Circle className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              link.kind === "page" ? removePageLink(link) : removePdfLink(link)
                            }
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-red-400/40 bg-red-500/10 text-red-200 transition hover:bg-red-500/20"
                            title="Удалить"
                            aria-label="Удалить"
                          >
                            <Trash2 className="h-4 w-4" />
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

                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  <Badge>Текущий стрик: {streak} дн.</Badge>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(language);
                        setEditingTagIds(language.tags.map((tag) => tag.id));
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/0 text-white/80 transition hover:bg-white/10"
                      title="Редактировать"
                      aria-label="Редактировать"
                    >
                      <PencilLine className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => archiveLanguage(language.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-red-400/40 bg-red-500/10 text-red-200 transition hover:bg-red-500/20"
                      title="Удалить"
                      aria-label="Удалить"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
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

      <Modal
        open={Boolean(editing)}
        onClose={() => {
          setEditing(null);
          setEditingTagIds([]);
        }}
        contentClassName="w-full max-w-lg space-y-3 rounded-2xl border border-white/20 bg-black p-6 shadow-2xl"
      >
        {editing && (
          <>
            <div className="text-lg font-medium">Редактирование языка: {editing.name}</div>
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
            <input
              className="px-3 py-2 rounded bg-white/10 w-full"
              placeholder="Ссылка на изображение (опционально)"
              value={editing.imageUrl || ""}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  imageUrl: e.target.value,
                })
              }
            />
            <input
              className="px-3 py-2 rounded bg-white/10 w-full"
              placeholder="Ссылка на баннер (опционально)"
              value={editing.bannerUrl || ""}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  bannerUrl: e.target.value,
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
          </>
        )}
      </Modal>

      <Modal
        open={Boolean(pickerLanguage)}
        onClose={() => {
          setPickerLanguageId(null);
        }}
        contentClassName="w-full max-w-3xl space-y-4 rounded-2xl border border-white/20 bg-black p-6 shadow-2xl max-h-[80vh] overflow-hidden"
      >
        {pickerLanguage && (
          <>
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
                if (pickerAttachments.some((link) => link.kind === "page" && link.page_id === page.id)) return;
                handleAttachPage(pickerLanguage.id, page.id);
              }}
            />

            <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm font-medium">Добавить страницу из PDF</div>
              <div className="text-xs opacity-70">
                Загрузите файл в формате PDF или укажите прямую ссылку. Можно добавить название и номер страницы.
              </div>
              {pdfForm.error && <div className="text-xs text-red-300">{pdfForm.error}</div>}
              <div className="space-y-2">
                <input
                  value={pdfForm.title}
                  onChange={(event) => setPdfForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Название материала"
                  className="w-full px-3 py-2 rounded bg-white/10 text-sm"
                />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="flex-1 px-3 py-2 rounded bg-white/10 text-sm cursor-pointer flex items-center justify-between gap-2">
                    <span className="truncate">
                      {pdfForm.file ? `Выбран файл: ${pdfForm.file.name}` : 'Выбрать PDF файл'}
                    </span>
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      disabled={pdfForm.uploading}
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        setPdfForm((prev) => ({
                          ...prev,
                          file,
                          originalName: file ? file.name : prev.originalName,
                          error: null,
                        }));
                        if (event.target) event.target.value = "";
                      }}
                    />
                  </label>
                  <input
                    value={pdfForm.url}
                    onChange={(event) => setPdfForm((prev) => ({ ...prev, url: event.target.value }))}
                    placeholder="Ссылка на PDF (опционально)"
                    className="flex-1 px-3 py-2 rounded bg-white/10 text-sm"
                    disabled={pdfForm.uploading}
                  />
                </div>
                <input
                  value={pdfForm.page}
                  onChange={(event) => setPdfForm((prev) => ({ ...prev, page: event.target.value }))}
                  placeholder="Номер страницы (опционально)"
                  className="w-full px-3 py-2 rounded bg-white/10 text-sm"
                  disabled={pdfForm.uploading}
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={submitPdfAttachment}
                  disabled={pdfForm.uploading}
                  className="px-3 py-2 rounded bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-60 disabled:cursor-not-allowed text-sm"
                >
                  {pdfForm.uploading ? "Добавление…" : "Добавить PDF"}
                </button>
                {pdfForm.file && (
                  <button
                    type="button"
                    onClick={() => setPdfForm((prev) => ({ ...prev, file: null, originalName: null }))}
                    className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20"
                    disabled={pdfForm.uploading}
                  >
                    Очистить файл
                  </button>
                )}
              </div>
            </div>

            {pickerAttachments.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs uppercase opacity-60">Уже прикреплены</div>
                <div className="space-y-1">
                  {pickerAttachments.map((link) => (
                    <div
                      key={link.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded border border-white/10 bg-white/5"
                    >
                      {link.kind === "page" ? (
                        <>
                          <div className="flex-1 min-w-0 text-sm truncate">
                            {link.page_title}
                          </div>
                          <button
                            onClick={() => togglePageLinkDone(link)}
                            className={`text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20`}
                          >
                            {link.done ? "Снять отметку" : "Отметить пройденной"}
                          </button>
                          <button
                            onClick={() => removePageLink(link)}
                            className="text-xs px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/40"
                          >
                            Удалить
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0 text-sm truncate">
                            {link.title}
                            {link.page_number != null && (
                              <span className="ml-2 text-xs opacity-60">Стр. {link.page_number}</span>
                            )}
                          </div>
                          <button
                            onClick={() => togglePdfLinkDone(link)}
                            className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20"
                          >
                            {link.done ? "Снять отметку" : "Отметить пройденной"}
                          </button>
                          <button
                            onClick={() => removePdfLink(link)}
                            className="text-xs px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/40"
                          >
                            Удалить
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Modal>
    </Shell>
  );
}

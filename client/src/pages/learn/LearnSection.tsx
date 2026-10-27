import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import classNames from 'classnames';
import { Copy, Download, FileJson, GraduationCap, Loader2, Sparkles, Upload } from 'lucide-react';
import { api } from '../../api';
import { Modal } from '../../components/ui/Modal';
import { requestAchievementCheck, trackClientAction } from '../../achievements';

export type LearnCourse = {
  id: number;
  linked_course_id?: number | null;
  language_id: number | null;
  title: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  units_count: number;
  lessons_total: number;
  lessons_done: number;
  xp_total: number;
  progress_pct: number;
};

type LanguageOption = { id: number; name: string };

/** Блок «Курсы-тренировки» для страницы «Курсы». */
export default function LearnSection({ languages, onChanged }: { languages: LanguageOption[]; onChanged?: () => void }) {
  const [courses, setCourses] = useState<LearnCourse[]>([]);
  const [params, setParams] = useSearchParams();
  const [importOpen, setImportOpen] = useState(params.get('import') === '1');
  const [templateOpen, setTemplateOpen] = useState(params.get('template') === '1');

  useEffect(() => {
    if (params.get('import') === '1') setImportOpen(true);
    if (params.get('template') === '1') setTemplateOpen(true);
    if (params.has('import') || params.has('template')) setParams({}, { replace: true });
  }, [params]);

  const unlinked = courses.filter((course) => !course.linked_course_id);
  const load = () => api.get('/api/learn/courses').then((data) => setCourses(data?.items || []));
  useEffect(() => {
    load();
  }, []);

  return (
    <section className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#58cc02]/20 text-[#89e219]">
            <GraduationCap size={20} />
          </div>
          <div>
            <div className="text-base font-semibold text-white">Курсы-тренировки</div>
            <div className="text-xs text-white/55">Уроки в стиле Duolingo: запоминай слова, переводи, собирай фразы</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setTemplateOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10">
            <Sparkles size={14} className="text-amber-200" /> Шаблон для ИИ
          </button>
          <button type="button" onClick={() => setImportOpen(true)} className="inline-flex items-center gap-1.5 rounded-full bg-[#58cc02] px-3 py-1.5 text-xs font-bold text-white shadow-[0_3px_0_#46a302] hover:brightness-110">
            <Upload size={14} /> Импорт курса
          </button>
        </div>
      </div>

      {/* Курсы с карточкой во вкладке «Курсы» показываются только там — без дублей.
          Здесь остаются лишь импортированные без карточки, чтобы до них можно было добраться. */}
      {courses.length === 0 ? (
        <button
          type="button"
          onClick={() => setTemplateOpen(true)}
          className="flex w-full items-center gap-4 rounded-2xl border-2 border-dashed border-white/10 p-4 text-left transition hover:border-[#58cc02]/50 hover:bg-white/[0.03]"
        >
          <div className="text-4xl">🦉</div>
          <div>
            <div className="text-sm font-semibold text-white">Пока нет ни одного курса</div>
            <div className="text-xs text-white/55">
              Скопируйте шаблон, попросите ИИ сгенерировать курс по нему и импортируйте полученный JSON — получится полноценный курс с уроками.
            </div>
          </div>
        </button>
      ) : unlinked.length === 0 ? null : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {unlinked.map((course) => {
            const color = course.color || '#58cc02';
            const lang = languages.find((l) => l.id === course.language_id);
            return (
              <Link
                key={course.id}
                to={`/learn/${course.id}`}
                className="group flex items-center gap-3 rounded-2xl border-2 border-white/10 bg-white/[0.03] p-3 transition hover:-translate-y-0.5 hover:border-white/20"
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl" style={{ backgroundColor: `${color}33` }}>
                  {course.icon || '📘'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-white">{course.title}</div>
                  <div className="truncate text-[11px] text-white/50">
                    {course.units_count} разд. · {course.lessons_total} уроков{lang ? ` · ${lang.name}` : ''}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full transition-all" style={{ width: `${course.progress_pct}%`, backgroundColor: color }} />
                    </div>
                    <span className="text-[11px] font-semibold text-white/60">{course.progress_pct}%</span>
                  </div>
                </div>
                <span className="rounded-xl px-3 py-1.5 text-[11px] font-extrabold uppercase text-white" style={{ backgroundColor: color }}>
                  {course.lessons_done === 0 ? 'Начать' : course.lessons_done >= course.lessons_total ? 'Повтор' : 'Дальше'}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        languages={languages}
        onImported={() => {
          setImportOpen(false);
          load();
          onChanged?.();
          requestAchievementCheck();
        }}
      />
      <TemplateModal open={templateOpen} onClose={() => setTemplateOpen(false)} />
    </section>
  );
}

function ImportModal({ open, onClose, languages, onImported }: { open: boolean; onClose: () => void; languages: LanguageOption[]; onImported: () => void }) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [languageId, setLanguageId] = useState<number | ''>('');
  const [createCourse, setCreateCourse] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setText('');
      setFileName('');
      setError('');
    }
  }, [open]);

  const readFile = async (file: File) => {
    setFileName(file.name);
    setText(await file.text());
    setError('');
  };

  const submit = async () => {
    setError('');
    let parsed: any;
    try {
      // ИИ часто оборачивает ответ в ```json … ``` — срезаем обёртку.
      const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
      parsed = JSON.parse(cleaned);
    } catch (e: any) {
      setError(`Это не похоже на корректный JSON: ${e.message}`);
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/learn/courses/import', { course: parsed, language_id: languageId || null, create_course: createCourse }, { notifySuccess: 'Курс импортирован 🎉', silentError: true });
      onImported();
    } catch (e: any) {
      setError(e.message || 'Не удалось импортировать курс');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal showCloseButton open={open} onClose={onClose} contentClassName="w-full max-w-2xl rounded-3xl border border-white/10 bg-brand-night p-5 shadow-2xl">
      <div className="mb-1 text-lg font-semibold text-white">Импорт курса-тренировки</div>
      <div className="mb-4 text-sm text-white/55">Загрузите .json файл или вставьте текст, который сгенерировал ИИ по шаблону.</div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) readFile(file);
        }}
        onClick={() => fileRef.current?.click()}
        className="mb-3 flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-white/15 p-4 transition hover:border-[#58cc02]/60 hover:bg-white/[0.03]"
      >
        <FileJson size={28} className="text-[#89e219]" />
        <div className="text-sm">
          <div className="font-medium text-white">{fileName || 'Перетащите файл сюда или нажмите, чтобы выбрать'}</div>
          <div className="text-xs text-white/45">Формат lifehub-course@1 (.json)</div>
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='…или вставьте JSON: { "format": "lifehub-course@1", "title": "...", "units": [ ... ] }'
        className="h-48 w-full resize-none rounded-2xl border border-white/10 bg-black/30 p-3 font-mono text-xs text-white/85 outline-none focus:border-[#58cc02]/60"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="text-sm text-white/70">Привязать к языку:</label>
        <select value={languageId} onChange={(e) => setLanguageId(e.target.value ? Number(e.target.value) : '')} className="rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white outline-none">
          <option value="">— не привязывать —</option>
          {languages.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-white/40">слова из уроков попадут в словарь, занятия — в стрик языка</span>
      </div>
      <label className="mt-2 flex items-center gap-2 text-sm text-white/70">
        <input type="checkbox" checked={createCourse} onChange={(e) => setCreateCourse(e.target.checked)} />
        Добавить в список «Курсы» — прогресс будет считаться автоматически по пройденным урокам
      </label>

      {error && <div className="mt-3 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</div>}

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm text-white/70 hover:bg-white/10">
          Отмена
        </button>
        <button
          type="button"
          disabled={!text.trim() || busy}
          onClick={submit}
          className="inline-flex items-center gap-2 rounded-full bg-[#58cc02] px-5 py-2 text-sm font-bold text-white shadow-[0_3px_0_#46a302] disabled:opacity-50"
        >
          {busy && <Loader2 size={14} className="animate-spin" />} Импортировать
        </button>
      </div>
    </Modal>
  );
}

function TemplateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<{ prompt: string; example: any } | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'prompt' | 'example'>('prompt');

  useEffect(() => {
    if (open && !data) api.get('/api/learn/template').then(setData);
  }, [open, data]);

  const copy = async () => {
    if (!data) return;
    const value = tab === 'prompt' ? data.prompt : JSON.stringify(data.example, null, 2);
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const area = document.createElement('textarea');
      area.value = value;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
    trackClientAction('learn.template_copy');
    window.setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data.example, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lifehub-course-example.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal showCloseButton open={open} onClose={onClose} contentClassName="w-full max-w-3xl rounded-3xl border border-white/10 bg-brand-night p-5 shadow-2xl">
      <div className="mb-1 text-lg font-semibold text-white">Как сделать курс с помощью ИИ</div>
      <ol className="mb-4 list-inside list-decimal space-y-0.5 text-sm text-white/65">
        <li>Скопируйте промпт и вставьте его в ChatGPT / Claude / любую нейросеть.</li>
        <li>Замените в нём параметры в &lt;угловых скобках&gt;: язык, уровень, тему, количество уроков.</li>
        <li>Сохраните ответ в .json файл (или просто скопируйте) и нажмите «Импорт курса».</li>
      </ol>
      <div className="mb-2 flex gap-1">
        {(['prompt', 'example'] as const).map((id) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={classNames('rounded-full px-3 py-1 text-xs', tab === id ? 'bg-amber-300 text-brand-deep' : 'bg-white/5 text-white/60 hover:bg-white/10')}>
            {id === 'prompt' ? 'Промпт для ИИ' : 'Пример курса (JSON)'}
          </button>
        ))}
      </div>
      <pre className="h-80 overflow-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-white/80">
        {data ? (tab === 'prompt' ? data.prompt : JSON.stringify(data.example, null, 2)) : 'Загрузка…'}
      </pre>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={download} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/10">
          <Download size={14} /> Скачать пример
        </button>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-brand-deep hover:brightness-110">
          <Copy size={14} /> {copied ? 'Скопировано!' : 'Копировать'}
        </button>
      </div>
    </Modal>
  );
}

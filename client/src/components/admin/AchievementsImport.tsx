import React, { useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { Copy, Download, FileJson, Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { api } from '../../api';
import { rarityStyle } from '../../achievements';

type Preview = { title: string; icon: string; description: string | null; action: string; condition_type: string; threshold: number; xp_reward: number; rarity: string; is_hidden: number };
type ImportResult = { created: number; valid: number; skipped: number; errors: { index: number; title: string | null; error: string }[]; dry_run: boolean; preview: Preview[] };

const CONDITION_LABEL: Record<string, string> = { count: 'раз', days: 'дн.', streak: 'дн. подряд', value: '' };

/** Промпт для ИИ: список всех действий проекта подставляется сервером. */
export function AchievementsTemplateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<{ prompt: string; example: unknown } | null>(null);
  const [tab, setTab] = useState<'prompt' | 'example'>('prompt');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open && !data) api.get('/api/admin/achievements/template').then(setData);
  }, [open, data]);

  const text = data ? (tab === 'prompt' ? data.prompt : JSON.stringify(data.example, null, 2)) : 'Загрузка…';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Modal showCloseButton open={open} onClose={onClose} contentClassName="w-full max-w-3xl rounded-3xl border border-white/10 bg-brand-night p-5 shadow-2xl">
      <div className="mb-1 text-lg font-semibold text-white">Ачивки с помощью ИИ</div>
      <ol className="mb-4 list-inside list-decimal space-y-0.5 text-sm text-white/65">
        <li>Скопируйте промпт и вставьте в ChatGPT / Claude / любую нейросеть.</li>
        <li>Замените параметры в &lt;угловых скобках&gt;: тему, количество, сложность.</li>
        <li>Скопируйте ответ (JSON) и нажмите «Импорт ачивок».</li>
      </ol>
      <div className="mb-2 flex gap-1">
        {(['prompt', 'example'] as const).map((id) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={classNames('rounded-full px-3 py-1 text-xs', tab === id ? 'bg-amber-300 text-brand-deep' : 'bg-white/5 text-white/60 hover:bg-white/10')}>
            {id === 'prompt' ? 'Промпт для ИИ' : 'Пример (JSON)'}
          </button>
        ))}
      </div>
      <pre className="h-80 overflow-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-white/80">{text}</pre>
      <div className="mt-4 flex justify-end">
        <button type="button" onClick={copy} disabled={!data} className="inline-flex items-center gap-1.5 rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-brand-deep hover:brightness-110 disabled:opacity-50">
          <Copy size={14} /> {copied ? 'Скопировано!' : 'Копировать'}
        </button>
      </div>
    </Modal>
  );
}

/** Импорт: вставить JSON или выбрать файл → проверка → импорт. */
export function AchievementsImportModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [check, setCheck] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setText('');
    setFileName('');
    setError('');
    setCheck(null);
  }, [open]);

  const parse = () => {
    // ИИ часто оборачивает ответ в ```json … ```
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    return JSON.parse(cleaned);
  };

  const run = async (dryRun: boolean) => {
    setError('');
    let body: any;
    try {
      body = parse();
    } catch (e: any) {
      setError(`Это не похоже на корректный JSON: ${e.message}`);
      return;
    }
    setBusy(true);
    try {
      const res = (await api.post(`/api/admin/achievements/import${dryRun ? '?dry_run=1' : ''}`, Array.isArray(body) ? { achievements: body } : body, {
        silentSuccess: true,
        silentError: true,
      })) as ImportResult;
      if (dryRun) setCheck(res);
      else {
        onImported();
        onClose();
      }
    } catch (e: any) {
      setError(e?.message || 'Не удалось импортировать');
    } finally {
      setBusy(false);
    }
  };

  const exportCurrent = async () => {
    const data = await api.get('/api/admin/achievements/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lifehub-achievements.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal showCloseButton open={open} onClose={onClose} contentClassName="w-full max-w-3xl rounded-3xl border border-white/10 bg-brand-night p-5 shadow-2xl">
      <div className="mb-1 text-lg font-semibold text-white">Импорт ачивок</div>
      <div className="mb-4 text-sm text-white/55">Вставьте JSON от ИИ (формат lifehub-achievements@1) или выберите файл. Повторы и ачивки с неизвестными действиями пропустятся.</div>
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={async (e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) {
            setFileName(file.name);
            setText(await file.text());
            setCheck(null);
          }
        }}
        className="mb-3 flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-white/15 p-4 hover:border-amber-300/60"
      >
        <FileJson size={26} className="text-amber-200" />
        <div className="text-sm text-white">{fileName || 'Перетащите .json сюда или нажмите, чтобы выбрать'}</div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setFileName(file.name);
            setText(await file.text());
            setCheck(null);
          }}
        />
      </div>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setCheck(null);
        }}
        placeholder='…или вставьте JSON: { "format": "lifehub-achievements@1", "achievements": [ ... ] }'
        className="h-40 w-full resize-none rounded-2xl border border-white/10 bg-black/30 p-3 font-mono text-xs text-white/85 outline-none focus:border-amber-300/60"
      />
      {error && <div className="mt-3 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</div>}

      {check && (
        <div className="mt-3 space-y-2">
          <div className="text-sm text-white/80">
            Будет добавлено: <b className="text-brand-mint">{check.valid}</b>
            {check.skipped > 0 && <> · уже есть: {check.skipped}</>}
            {check.errors.length > 0 && <> · с ошибками: <span className="text-rose-300">{check.errors.length}</span></>}
          </div>
          {check.errors.length > 0 && (
            <ul className="max-h-24 overflow-auto rounded-xl bg-rose-500/10 p-2 text-xs text-rose-100">
              {check.errors.map((e) => (
                <li key={e.index}>
                  #{e.index + 1} {e.title ? `«${e.title}»` : ''}: {e.error}
                </li>
              ))}
            </ul>
          )}
          <div className="grid max-h-56 gap-2 overflow-auto sm:grid-cols-2">
            {check.preview.map((p, i) => {
              const r = rarityStyle(p.rarity);
              return (
                <div key={i} className={classNames('flex items-center gap-2 rounded-xl border bg-gradient-to-br p-2', r.ring, r.bg)}>
                  <span className="text-2xl">{p.icon}</span>
                  <div className="min-w-0 text-xs">
                    <div className="truncate font-semibold text-white">
                      {p.is_hidden ? '🤫 ' : ''}
                      {p.title}
                    </div>
                    <div className="truncate text-white/55">
                      {p.action} · {p.threshold} {CONDITION_LABEL[p.condition_type] ?? ''} · +{p.xp_reward} XP
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap justify-between gap-2">
        <button type="button" onClick={exportCurrent} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs text-white/60 hover:bg-white/10 hover:text-white">
          <Download size={14} /> Экспорт текущих ачивок
        </button>
        <div className="flex gap-2">
          <button type="button" disabled={!text.trim() || busy} onClick={() => run(true)} className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50">
            Проверить
          </button>
          <button
            type="button"
            disabled={!check || check.valid === 0 || busy}
            onClick={() => run(false)}
            className="inline-flex items-center gap-2 rounded-full bg-amber-300 px-5 py-2 text-sm font-bold text-brand-deep disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />} Импортировать {check ? check.valid : ''}
          </button>
        </div>
      </div>
    </Modal>
  );
}

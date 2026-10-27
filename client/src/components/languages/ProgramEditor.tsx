import React, { useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import { ArrowDown, ArrowUp, Lock, Plus, Trash2, Unlock } from 'lucide-react';
import { api } from '../../api';
import { Modal } from '../ui/Modal';

type ProgramCourse = { id: number; title: string; progress: number; learn_course_id: number | null; provider: string };
type ProgramStage = { stage: number; title: string; unlock_pct: number; progress_pct: number; unlocked: boolean; reason: string | null; courses: ProgramCourse[] };
type DraftStage = { key: number; title: string; unlock_pct: number; course_ids: number[] };

const UNLOCK_OPTIONS = [0, 25, 50, 75, 100];
let keySeq = 1;

/**
 * Программа изучения языка: этапы курсов.
 * Курсы одного этапа идут параллельно, этап 1 открыт сразу,
 * следующий открывается, когда предыдущий пройден на заданный процент.
 */
export default function ProgramEditor({
  language,
  open,
  onClose,
  onSaved,
}: {
  language: { id: number; name: string } | null;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [courses, setCourses] = useState<Map<number, ProgramCourse>>(new Map());
  const [saved, setSaved] = useState<ProgramStage[]>([]);
  const [stages, setStages] = useState<DraftStage[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !language) return;
    setLoading(true);
    api
      .get(`/api/life/languages/${language.id}/program`)
      .then((data: { stages: ProgramStage[] }) => {
        const list = data?.stages || [];
        setSaved(list);
        setCourses(new Map(list.flatMap((s) => s.courses).map((c) => [c.id, c])));
        setStages(list.map((s) => ({ key: keySeq++, title: s.title, unlock_pct: s.unlock_pct || 100, course_ids: s.courses.map((c) => c.id) })));
      })
      .finally(() => setLoading(false));
  }, [open, language]);

  const allIds = useMemo(() => Array.from(courses.keys()), [courses]);

  const update = (key: number, patch: Partial<DraftStage>) => setStages((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  const moveCourse = (courseId: number, target: number | 'new') => {
    setStages((list) => {
      const next = list.map((s) => ({ ...s, course_ids: s.course_ids.filter((id) => id !== courseId) }));
      if (target === 'new') next.push({ key: keySeq++, title: `Этап ${next.length + 1}`, unlock_pct: 100, course_ids: [courseId] });
      else next.find((s) => s.key === target)?.course_ids.push(courseId);
      return next;
    });
  };

  const moveStage = (index: number, delta: number) => {
    setStages((list) => {
      const next = [...list];
      const target = index + delta;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  const removeStage = (index: number) => {
    setStages((list) => {
      if (list.length <= 1) return list;
      const removed = list[index]!;
      const next = list.filter((_, i) => i !== index);
      // Курсы удалённого этапа переходят в соседний
      const receiver = next[Math.max(0, index - 1)]!;
      receiver.course_ids = [...receiver.course_ids, ...removed.course_ids];
      return next;
    });
  };

  const applyPreset = (preset: 'together' | 'sequence') => {
    const ordered = stages.flatMap((s) => s.course_ids);
    if (preset === 'together') setStages([{ key: keySeq++, title: 'Всё сразу', unlock_pct: 100, course_ids: ordered }]);
    else setStages(ordered.map((id, i) => ({ key: keySeq++, title: courses.get(id)?.title || `Этап ${i + 1}`, unlock_pct: 100, course_ids: [id] })));
  };

  const save = async () => {
    if (!language) return;
    setSaving(true);
    try {
      await api.put(
        `/api/life/languages/${language.id}/program`,
        { stages: stages.map((s) => ({ title: s.title, unlock_pct: s.unlock_pct, course_ids: s.course_ids })) },
        { notifySuccess: 'Программа сохранена' }
      );
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  // Предпросмотр открытости по текущему черновику и реальному прогрессу курсов
  const preview = useMemo(() => {
    let prevUnlocked = true;
    let prevProgress = 100;
    let prevEmpty = true;
    return stages.map((stage, index) => {
      const unlocked = index === 0 ? true : prevUnlocked && (prevEmpty || prevProgress >= stage.unlock_pct);
      const progress = stage.course_ids.length
        ? Math.round(stage.course_ids.reduce((sum, id) => sum + (courses.get(id)?.progress || 0), 0) / stage.course_ids.length)
        : 0;
      prevUnlocked = unlocked;
      prevProgress = progress;
      prevEmpty = stage.course_ids.length === 0;
      return { unlocked, progress };
    });
  }, [stages, courses]);

  const input = 'rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm text-white outline-none focus:border-brand-mint/60';

  return (
    <Modal open={open} onClose={onClose} showCloseButton contentClassName="w-full max-w-3xl rounded-3xl border border-white/10 bg-brand-night p-5 shadow-2xl">
      <div className="max-h-[80vh] space-y-4 overflow-y-auto pr-1">
        <div className="pr-8">
          <div className="text-lg font-semibold text-white">Программа обучения · {language?.name}</div>
          <div className="text-sm text-white/60">
            Курсы одного этапа проходятся параллельно. Первый этап открыт сразу, следующий — когда предыдущий пройден на нужный процент. Закрытые курсы-тренировки нельзя начать раньше времени.
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-white/50">Загружаем…</div>
        ) : allIds.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-white/60">
            У языка пока нет курсов. Привяжите курсы к языку на странице «Курсы» или импортируйте курс-тренировку.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="py-1 text-white/45">Быстро:</span>
              <button type="button" onClick={() => applyPreset('together')} className="rounded-full bg-white/5 px-3 py-1 text-white/80 hover:bg-white/10">
                Всё сразу, параллельно
              </button>
              <button type="button" onClick={() => applyPreset('sequence')} className="rounded-full bg-white/5 px-3 py-1 text-white/80 hover:bg-white/10">
                Строго по очереди
              </button>
            </div>

            <div className="space-y-3">
              {stages.map((stage, index) => {
                const state = preview[index];
                return (
                  <div key={stage.key} className={classNames('rounded-2xl border p-3', state?.unlocked ? 'border-brand-mint/25 bg-brand-mint/[0.04]' : 'border-white/10 bg-white/[0.02]')}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={classNames('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold', state?.unlocked ? 'bg-brand-mint text-brand-deep' : 'bg-white/10 text-white/60')}>
                        {index + 1}
                      </span>
                      <input className={classNames(input, 'min-w-0 flex-1 font-semibold')} value={stage.title} onChange={(e) => update(stage.key, { title: e.target.value })} placeholder={`Этап ${index + 1}`} />
                      <span className="inline-flex items-center gap-1 text-xs text-white/50">
                        {state?.unlocked ? <Unlock size={13} className="text-brand-mint" /> : <Lock size={13} />}
                        {state?.unlocked ? 'открыт' : 'закрыт'} · {state?.progress ?? 0}%
                      </span>
                      <div className="flex">
                        <IconButton title="Выше" disabled={index === 0} onClick={() => moveStage(index, -1)}>
                          <ArrowUp size={14} />
                        </IconButton>
                        <IconButton title="Ниже" disabled={index === stages.length - 1} onClick={() => moveStage(index, 1)}>
                          <ArrowDown size={14} />
                        </IconButton>
                        <IconButton title="Удалить этап (курсы перейдут в соседний)" disabled={stages.length <= 1} onClick={() => removeStage(index)}>
                          <Trash2 size={14} />
                        </IconButton>
                      </div>
                    </div>

                    {index > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/60">
                        Откроется, когда этап {index} пройден на
                        <div className="flex gap-1">
                          {UNLOCK_OPTIONS.map((pct) => (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => update(stage.key, { unlock_pct: pct })}
                              className={classNames('rounded-full px-2 py-0.5', stage.unlock_pct === pct ? 'bg-brand-mint text-brand-deep' : 'bg-white/5 hover:bg-white/10')}
                            >
                              {pct === 0 ? 'сразу' : `${pct}%`}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-3 space-y-1.5">
                      {stage.course_ids.length === 0 && <div className="text-xs text-white/40">Пустой этап — перенесите сюда курс</div>}
                      {stage.course_ids.map((id) => {
                        const course = courses.get(id);
                        if (!course) return null;
                        return (
                          <div key={id} className="flex items-center gap-2 rounded-xl bg-black/25 px-3 py-2">
                            <span className="text-base">{course.learn_course_id ? '🦉' : '📘'}</span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm text-white">{course.title}</div>
                              <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                                <div className="h-full rounded-full bg-brand-mint" style={{ width: `${course.progress}%` }} />
                              </div>
                            </div>
                            <span className="text-xs text-white/50">{course.progress}%</span>
                            <select
                              value={stage.key}
                              onChange={(e) => moveCourse(id, e.target.value === 'new' ? 'new' : Number(e.target.value))}
                              className="rounded-lg border border-white/10 bg-brand-night px-1.5 py-1 text-xs text-white"
                              title="Перенести в этап"
                            >
                              {stages.map((s, i) => (
                                <option key={s.key} value={s.key}>
                                  Этап {i + 1}
                                </option>
                              ))}
                              <option value="new">+ Новый этап</option>
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setStages((list) => [...list, { key: keySeq++, title: `Этап ${list.length + 1}`, unlock_pct: 100, course_ids: [] }])}
              className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-white/15 py-2 text-sm text-white/60 hover:border-white/30 hover:text-white"
            >
              <Plus size={15} /> Добавить этап
            </button>

            {saved.some((s) => !s.unlocked) && (
              <div className="text-xs text-white/40">Сейчас закрыто этапов: {saved.filter((s) => !s.unlocked).length}. Пустые этапы при сохранении удаляются.</div>
            )}

            <button type="button" disabled={saving} onClick={save} className="w-full rounded-xl bg-brand-mint py-2.5 text-sm font-bold text-brand-deep disabled:opacity-50">
              {saving ? 'Сохраняем…' : 'Сохранить программу'}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

function IconButton({ children, title, disabled, onClick }: { children: React.ReactNode; title: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick} className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-25 disabled:hover:bg-transparent">
      {children}
    </button>
  );
}

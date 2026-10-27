import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import classNames from 'classnames';
import { ArrowLeft, BookOpen, Check, Download, Lock, Star, Trash2 } from 'lucide-react';
import { api } from '../../api';
import { Modal } from '../../components/ui/Modal';

type LessonNode = { id: number; title: string; description: string | null; xp: number; words_count: number; status: 'locked' | 'current' | 'done'; completed_count: number; best_score: number };
type Checkpoint = { attempts: number; best_score: number; passed: boolean; pass_score: number };
type Unit = { id: number; title: string; description: string | null; color: string | null; guide: string | null; lessons: LessonNode[]; done_count: number; checkpoint?: Checkpoint };
type CourseInfo = { id: number; title: string; description: string | null; icon: string | null; color: string | null; lessons_total: number; lessons_done: number; xp_total: number; progress_pct: number; locked?: boolean; lock_reason?: string | null; speech_lang?: string | null; language_id?: number | null };

const UNIT_COLORS = ['#58cc02', '#1cb0f6', '#ce82ff', '#ff9600', '#ff4b4b', '#2b70c9', '#00cd9c'];
// Смещения узлов дорожки по горизонтали — «змейка» как в Duolingo.
const OFFSETS = [0, 44, 70, 44, 0, -44, -70, -44];

export default function CoursePath() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<CourseInfo | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [guide, setGuide] = useState<Unit | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    api.get(`/api/learn/courses/${courseId}`).then((data) => {
      setCourse(data.course);
      setUnits(data.units || []);
    });
  }, [courseId]);

  const exportCourse = async () => {
    const data = await api.get(`/api/learn/courses/${courseId}/export`);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(course?.title || 'course').replace(/[^\p{L}\p{N}]+/gu, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const removeCourse = async () => {
    if (!window.confirm('Удалить курс и весь прогресс по нему?')) return;
    await api.del(`/api/learn/courses/${courseId}`);
    navigate('/courses');
  };

  if (!course) return <div className="py-20 text-center text-white/50">Загружаем курс…</div>;

  return (
    <div className="mx-auto w-full max-w-2xl pb-16">
      <div className="sticky top-0 z-20 -mx-2 mb-4 flex items-center gap-3 rounded-b-2xl bg-brand-deep/85 px-2 py-3 backdrop-blur">
        <Link to="/courses" className="rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Назад">
          <ArrowLeft size={20} />
        </Link>
        <div className="text-3xl">{course.icon || '📘'}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold text-white">{course.title}</div>
          <div className="flex items-center gap-2 text-xs text-white/55">
            <div className="h-2 w-32 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[#58cc02]" style={{ width: `${course.progress_pct}%` }} />
            </div>
            {course.lessons_done}/{course.lessons_total} уроков · ⚡ {course.xp_total} XP
          </div>
        </div>
        {course.language_id && (course.speech_lang || '').toLowerCase().startsWith('ja') && (
          <Link
            to={`/languages/${course.language_id}/practice?mode=kana`}
            className="rounded-full border border-rose-300/30 bg-rose-400/10 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-400/20"
            title="Кана-тренажёр: закрепить хирагану и катакану"
          >
            あ Кана
          </Link>
        )}
        <button type="button" onClick={exportCourse} className="rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white" title="Экспорт в JSON">
          <Download size={18} />
        </button>
        <button type="button" onClick={removeCourse} className="rounded-full p-2 text-white/50 hover:bg-rose-500/20 hover:text-white" title="Удалить курс">
          <Trash2 size={18} />
        </button>
      </div>

      {course.locked && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4">
          <Lock size={22} className="mt-0.5 shrink-0 text-amber-200" />
          <div className="text-sm">
            <div className="font-semibold text-amber-100">Курс пока закрыт программой обучения</div>
            <div className="text-white/70">{course.lock_reason}</div>
            <Link to="/languages" className="mt-1 inline-block text-xs text-amber-200 underline-offset-4 hover:underline">
              Изменить программу языка →
            </Link>
          </div>
        </div>
      )}

      {units.map((unit, unitIndex) => {
        const color = unit.color || UNIT_COLORS[unitIndex % UNIT_COLORS.length]!;
        return (
          <section key={unit.id} className="mb-10">
            <div className="mb-8 flex items-center justify-between gap-3 rounded-2xl px-5 py-4 text-white" style={{ backgroundColor: color, boxShadow: `0 4px 0 ${color}99` }}>
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase tracking-wider opacity-80">
                  Раздел {unitIndex + 1} · {unit.done_count}/{unit.lessons.length}
                </div>
                <div className="truncate text-lg font-extrabold">{unit.title}</div>
                {unit.description ? <div className="truncate text-sm opacity-90">{unit.description}</div> : null}
              </div>
              {unit.guide ? (
                <button type="button" onClick={() => setGuide(unit)} className="flex shrink-0 items-center gap-1.5 rounded-xl border-2 border-white/40 px-3 py-2 text-xs font-bold uppercase hover:bg-white/10">
                  <BookOpen size={16} /> Справочник
                </button>
              ) : null}
            </div>

            <div className="flex flex-col items-center gap-5">
              {unit.lessons.map((lesson, index) => {
                const offset = OFFSETS[index % OFFSETS.length];
                const isOpen = selected === lesson.id;
                const locked = lesson.status === 'locked' || !!course.locked;
                return (
                  <div key={lesson.id} className={classNames('relative', isOpen && 'z-30')} style={{ transform: `translateX(${offset}px)` }}>
                    {lesson.status === 'current' && !course.locked && !isOpen && (
                      <div className="absolute -top-10 left-1/2 z-10 -translate-x-1/2 animate-bounce whitespace-nowrap rounded-xl border-2 border-white/15 bg-brand-night px-3 py-1.5 text-xs font-extrabold uppercase" style={{ color }}>
                        Начать
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelected(isOpen ? null : lesson.id)}
                      className={classNames('relative flex h-[70px] w-[76px] items-center justify-center rounded-[50%] text-white transition active:translate-y-[4px]', locked && 'cursor-pointer')}
                      style={{
                        backgroundColor: locked ? '#37464f' : lesson.status === 'done' ? '#ffc800' : color,
                        boxShadow: `0 7px 0 ${locked ? '#232f36' : lesson.status === 'done' ? '#cd9900' : `${color}aa`}`,
                      }}
                      aria-label={lesson.title}
                    >
                      {locked ? <Lock size={28} className="text-white/40" /> : lesson.status === 'done' ? (lesson.best_score >= 100 ? <Star size={32} className="fill-white" /> : <Check size={34} strokeWidth={3} />) : <Star size={32} className="fill-white" />}
                      {lesson.status === 'current' && !course.locked && <span className="absolute -inset-2 rounded-[50%] border-4 opacity-40" style={{ borderColor: color }} />}
                    </button>

                    {isOpen && (
                      <div className="absolute left-1/2 top-[88px] z-30 w-64 -translate-x-1/2 rounded-2xl p-4 text-white shadow-2xl" style={{ backgroundColor: locked ? '#37464f' : color }}>
                        <div className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45" style={{ backgroundColor: locked ? '#37464f' : color }} />
                        <div className="font-extrabold">{lesson.title}</div>
                        <div className="mt-0.5 text-sm opacity-90">{course.locked ? course.lock_reason : locked ? 'Пройдите предыдущие уроки, чтобы открыть этот' : lesson.description || `${lesson.words_count} новых слов`}</div>
                        {course.locked ? null : locked ? (
                          <button type="button" onClick={() => navigate(`/learn/lesson/${lesson.id}`)} className="mt-3 w-full rounded-xl bg-white/15 py-2 text-xs font-bold uppercase text-white/80 hover:bg-white/20">
                            Всё равно попробовать
                          </button>
                        ) : (
                          <button type="button" onClick={() => navigate(`/learn/lesson/${lesson.id}`)} className="mt-3 w-full rounded-xl bg-white py-2.5 text-sm font-extrabold uppercase shadow-[0_4px_0_rgba(0,0,0,0.2)]" style={{ color }}>
                            {lesson.status === 'done' ? `Повторить +${Math.ceil(lesson.xp / 2)} XP` : `Начать +${lesson.xp} XP`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {unit.lessons.length > 0 && unit.checkpoint && (
                <CheckpointNode
                  unit={unit}
                  color={color}
                  isLast={unitIndex === units.length - 1}
                  courseLocked={!!course.locked}
                  open={selected === -unit.id}
                  onToggle={() => setSelected(selected === -unit.id ? null : -unit.id)}
                  onStart={() => navigate(`/learn/unit/${unit.id}/checkpoint`)}
                />
              )}
            </div>
          </section>
        );
      })}

      {units.length > 0 && units.every((u) => u.done_count === u.lessons.length) && (
        <div className="rounded-3xl border-2 border-amber-300/40 bg-amber-300/10 p-6 text-center">
          <div className="text-5xl">🏆</div>
          <div className="mt-2 text-xl font-bold text-amber-200">Курс пройден полностью!</div>
          <div className="text-sm text-white/60">Можно повторять уроки, чтобы закрепить слова.</div>
        </div>
      )}

      <Modal showCloseButton open={!!guide} onClose={() => setGuide(null)} contentClassName="w-full max-w-lg rounded-3xl border border-white/10 bg-brand-night p-6 shadow-2xl">
        {guide && (
          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-wider text-white/50">Справочник</div>
            <div className="mb-3 text-xl font-bold text-white">{guide.title}</div>
            <div className="whitespace-pre-line leading-relaxed text-white/80">{guide.guide}</div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Контрольная в конце раздела: случайные задания из уроков, 80% — раздел засчитан и открыт следующий. */
function CheckpointNode({
  unit,
  color,
  isLast,
  courseLocked,
  open,
  onToggle,
  onStart,
}: {
  unit: Unit;
  color: string;
  isLast: boolean;
  courseLocked: boolean;
  open: boolean;
  onToggle: () => void;
  onStart: () => void;
}) {
  const cp = unit.checkpoint!;
  const allDone = unit.done_count >= unit.lessons.length;
  const bg = cp.passed ? '#ffc800' : courseLocked ? '#37464f' : allDone ? color : '#4b5c66';
  return (
    <div className={classNames('relative mt-2', open && 'z-30')}>
      <button
        type="button"
        onClick={onToggle}
        className="relative flex h-[84px] w-[96px] flex-col items-center justify-center rounded-[28px] text-white transition active:translate-y-[4px]"
        style={{ backgroundColor: bg, boxShadow: `0 7px 0 ${cp.passed ? '#cd9900' : 'rgba(0,0,0,0.35)'}` }}
        aria-label={`Контрольная: ${unit.title}`}
      >
        <span className="text-4xl leading-none">{cp.passed ? '🏆' : '🏰'}</span>
        {cp.attempts > 0 && <span className="mt-0.5 text-[11px] font-extrabold">{cp.best_score}%</span>}
      </button>
      {open && (
        <div className="absolute left-1/2 top-[100px] z-30 w-72 -translate-x-1/2 rounded-2xl bg-brand-night p-4 text-white shadow-2xl ring-2 ring-white/10">
          <div className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 bg-brand-night" />
          <div className="font-extrabold">Контрольная раздела</div>
          <div className="mt-1 text-sm text-white/70">
            {courseLocked
              ? 'Курс пока закрыт программой обучения.'
              : cp.passed
              ? `Сдана с результатом ${cp.best_score}%. Можно пересдать, чтобы освежить материал.`
              : `Случайные задания из всех уроков раздела, без подсказок и сердечек. Наберите ${cp.pass_score}%, чтобы понять, что вы готовы${isLast ? '' : ' — и сразу открыть следующий раздел'}.`}
          </div>
          {!allDone && !cp.passed && !courseLocked && <div className="mt-1 text-xs text-amber-200/80">Уроки ещё не все пройдены — можно сдать заранее, если уверены в себе.</div>}
          {cp.attempts > 0 && <div className="mt-1 text-xs text-white/45">Попыток: {cp.attempts} · лучший результат {cp.best_score}%</div>}
          {!courseLocked && (
            <button
              type="button"
              onClick={onStart}
              className="mt-3 w-full rounded-xl py-2.5 text-sm font-extrabold uppercase text-white shadow-[0_4px_0_rgba(0,0,0,0.25)]"
              style={{ backgroundColor: cp.passed ? '#cd9900' : color }}
            >
              {cp.passed ? 'Пересдать' : 'Начать контрольную'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

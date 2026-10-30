import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import classNames from 'classnames';
import { Heart, Lightbulb, Loader2, Snail, Volume2, X } from 'lucide-react';
import { api } from '../../api';
import { requestAchievementCheck, trackClientAction } from '../../achievements';
import { Exercise, gradeText, isGraded, playTone, shuffle, speak, Word } from './learnUtils';

type Lesson = {
  id: number;
  course_id: number;
  course_title: string;
  course_icon: string | null;
  unit_title: string;
  guide: string | null;
  title: string;
  xp: number;
  speech_lang: string | null;
  words: Word[];
  exercises: Exercise[];
  completed_count: number;
  checkpoint?: boolean;
  best_score?: number;
  pass_score?: number;
};

type CheckpointResult = {
  score: number;
  passed: boolean;
  pass_score: number;
  first_pass: boolean;
  xp_earned: number;
  weak_lessons: { id: number; title: string }[];
  next_unit: { id: number; title: string } | null;
  achievements: { id: number; title: string; icon: string }[];
};

type QueueItem = { key: string; exercise: Exercise; retry: boolean };
type Feedback = { status: 'correct' | 'typo' | 'wrong'; answer?: string; note?: string } | null;
type Result = { xp_earned: number; perfect: boolean; score: number; repeat: boolean; streak: number | null; achievements: { id: number; title: string; icon: string }[] };

const MAX_HEARTS = 5;
const PRAISE = ['Отлично!', 'Супер!', 'Так держать!', 'Великолепно!', 'В точку!', 'Молодец!'];

export default function LessonPlayer() {
  const { lessonId, unitId } = useParams<{ lessonId?: string; unitId?: string }>();
  // Контрольная раздела: задания из разных уроков, без сердечек и повторов — честная проверка
  const isCheckpoint = !!unitId;
  const [checkpointResult, setCheckpointResult] = useState<CheckpointResult | null>(null);
  const weakLessons = useRef(new Set<number>());
  const navigate = useNavigate();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [pos, setPos] = useState(0);
  const [hearts, setHearts] = useState(MAX_HEARTS);
  const [answer, setAnswer] = useState<any>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [phase, setPhase] = useState<'loading' | 'playing' | 'saving' | 'result' | 'failed'>('loading');
  const [result, setResult] = useState<Result | null>(null);
  const [startedAt] = useState(() => Date.now());
  const firstTry = useRef(new Map<string, boolean>());
  const mistakes = useRef(0);
  // Строки из заданий с ошибками — сервер найдёт по ним слова и поставит их в «Работу над ошибками»
  const mistakeWords = useRef(new Set<string>());

  const load = useCallback(async () => {
    setPhase('loading');
    const data = (await api.get(isCheckpoint ? `/api/learn/units/${unitId}/checkpoint` : `/api/learn/lessons/${lessonId}`)) as Lesson;
    setCheckpointResult(null);
    weakLessons.current = new Set();
    setLesson(data);
    setQueue(data.exercises.map((exercise, index) => ({ key: `e${index}`, exercise, retry: false })));
    setPos(0);
    setHearts(MAX_HEARTS);
    setAnswer(null);
    setFeedback(null);
    firstTry.current = new Map();
    mistakes.current = 0;
    mistakeWords.current = new Set();
    setPhase('playing');
  }, [lessonId, unitId, isCheckpoint]);

  useEffect(() => {
    load().catch(() => navigate(-1));
  }, [load]);

  const current = queue[pos] || null;
  const gradedTotal = useMemo(() => queue.filter((q) => !q.retry && isGraded(q.exercise)).length, [queue]);
  const progressPct = queue.length ? Math.round((pos * 100) / queue.length) : 0;

  const finish = useCallback(
    async (failed = false) => {
      if (!lesson) return;
      setPhase('saving');
      const correct = Array.from(firstTry.current.values()).filter(Boolean).length;
      if (isCheckpoint) {
        try {
          const res = await api.post(
            `/api/learn/units/${lesson.id}/checkpoint/complete`,
            {
              total: Math.max(1, gradedTotal),
              correct,
              weak_lessons: Array.from(weakLessons.current),
              mistake_words: Array.from(mistakeWords.current),
              duration_sec: Math.round((Date.now() - startedAt) / 1000),
            },
            { silentSuccess: true }
          );
          requestAchievementCheck();
          setCheckpointResult(res as CheckpointResult);
          playTone('finish');
          setPhase('result');
        } catch {
          setPhase('playing');
        }
        return;
      }
      try {
        const res = await api.post(
          `/api/learn/lessons/${lesson.id}/complete`,
          {
            total: Math.max(1, gradedTotal),
            correct,
            mistakes: mistakes.current,
            failed,
            duration_sec: Math.round((Date.now() - startedAt) / 1000),
            mistake_words: Array.from(mistakeWords.current),
          },
          { silentSuccess: true }
        );
        requestAchievementCheck();
        if (failed) {
          setPhase('failed');
        } else {
          setResult(res as Result);
          playTone('finish');
          setPhase('result');
        }
      } catch {
        setPhase(failed ? 'failed' : 'playing');
      }
    },
    [lesson, gradedTotal, isCheckpoint]
  );

  const advance = useCallback(() => {
    setFeedback(null);
    setAnswer(null);
    if (hearts <= 0 && !isCheckpoint) {
      finish(true);
      return;
    }
    if (pos + 1 >= queue.length) finish(false);
    else setPos((p) => p + 1);
  }, [pos, queue.length, hearts, finish, isCheckpoint]);

  const registerResult = useCallback(
    (ok: boolean, info: Omit<NonNullable<Feedback>, 'status'> & { typo?: boolean } = {}) => {
      if (!current) return;
      if (!firstTry.current.has(current.key) && !current.retry) firstTry.current.set(current.key, ok);
      if (ok) {
        playTone('correct');
        setFeedback({ status: info.typo ? 'typo' : 'correct', answer: info.answer, note: info.note });
      } else {
        playTone('wrong');
        mistakes.current += 1;
        const ex: any = current.exercise;
        if (typeof ex.lesson_id === 'number') weakLessons.current.add(ex.lesson_id);
        [ex.question, ex.prompt, ex.answer, ex.text, ...(Array.isArray(ex.answers) ? ex.answers : [])]
          .filter((v) => typeof v === 'string' && v.length <= 80)
          .forEach((v: string) => mistakeWords.current.add(v));
        setFeedback({ status: 'wrong', answer: info.answer, note: info.note });
        if (!isCheckpoint) {
          setHearts((h) => h - 1);
          // Как в Duolingo: ошибочное задание вернётся в конце урока.
          setQueue((q) => [...q, { key: `${current.key}r${q.length}`, exercise: current.exercise, retry: true }]);
        }
      }
    },
    [current, isCheckpoint]
  );

  const check = useCallback(() => {
    if (!current || feedback) return;
    const ex = current.exercise;
    switch (ex.type) {
      case 'choice':
        registerResult(answer === ex.answer, { answer: ex.answer });
        break;
      case 'translate':
      case 'listen': {
        const answers = ex.type === 'listen' ? ex.answers : ex.answers;
        const grade = gradeText(String(answer || ''), answers);
        registerResult(grade !== 'wrong', { answer: answers[0], typo: grade === 'typo', note: grade === 'typo' ? 'Небольшая опечатка — засчитано' : undefined });
        break;
      }
      case 'fill': {
        const grade = ex.options ? (answer === ex.answer ? 'exact' : 'wrong') : gradeText(String(answer || ''), [ex.answer]);
        registerResult(grade !== 'wrong', { answer: ex.answer, typo: grade === 'typo', note: ex.translation || undefined });
        break;
      }
      case 'assemble': {
        const picked: number[] = Array.isArray(answer) ? answer : [];
        const built = picked.map((i) => ex.tokens[i]).join(ex.separator);
        const target = ex.answer_tokens.join(ex.separator);
        const grade = gradeText(built, [target]);
        registerResult(grade === 'exact', { answer: target });
        break;
      }
      default:
        break;
    }
  }, [current, feedback, answer, registerResult]);

  const skip = () => {
    if (!current || feedback) return;
    const ex = current.exercise;
    const correctAnswer =
      ex.type === 'choice' || ex.type === 'fill' ? ex.answer : ex.type === 'translate' || ex.type === 'listen' ? ex.answers[0] : ex.type === 'assemble' ? ex.answer_tokens.join(ex.separator) : undefined;
    registerResult(false, { answer: correctAnswer });
  };

  const canCheck = useMemo(() => {
    if (!current) return false;
    const ex = current.exercise;
    if (ex.type === 'assemble') return Array.isArray(answer) && answer.length > 0;
    return answer !== null && String(answer).trim().length > 0;
  }, [current, answer]);

  const ungraded = current && !isGraded(current.exercise);
  const isMatch = current?.exercise.type === 'match';

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (phase !== 'playing') return;
      if (event.key === 'Enter') {
        event.preventDefault();
        if (feedback || ungraded) advance();
        else if (canCheck) check();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, feedback, ungraded, canCheck, advance, check]);

  const exit = () => navigate(lesson ? `/learn/${lesson.course_id}` : '/courses');

  if (phase === 'loading' || !lesson) {
    return (
      <Overlay>
        <div className="flex flex-1 items-center justify-center text-white/60">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" /> {isCheckpoint ? 'Собираем контрольную…' : 'Готовим урок…'}
        </div>
      </Overlay>
    );
  }

  if (phase === 'result' && isCheckpoint && checkpointResult) {
    const r = checkpointResult;
    return (
      <Overlay>
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          <div className="animate-[achievement-pop_700ms_ease-out] text-7xl">{r.passed ? '🎓' : '📚'}</div>
          <div>
            <div className={classNames('text-3xl font-extrabold', r.passed ? 'text-amber-300' : 'text-sky-200')}>
              {r.passed ? (r.next_unit ? 'Вы готовы идти дальше!' : 'Раздел освоен!') : 'Пока рановато'}
            </div>
            <div className="mt-1 text-white/60">
              {r.passed
                ? r.next_unit
                  ? `Раздел «${r.next_unit.title}» открыт.`
                  : 'Это был последний раздел курса.'
                : `Нужно ${r.pass_score}% — повторите уроки ниже и попробуйте снова.`}
            </div>
          </div>
          <div className="grid w-full max-w-md grid-cols-2 gap-3">
            <StatTile label="Результат" value={`${r.score}%`} color={r.passed ? 'border-brand-mint text-brand-mint/90' : 'border-sky-400 text-sky-200'} />
            <StatTile label="Опыт" value={`+${r.xp_earned} XP`} color="border-amber-300 text-amber-200" />
          </div>
          {r.weak_lessons.length > 0 && (
            <div className="w-full max-w-md text-left">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/50">Стоит повторить</div>
              <div className="space-y-2">
                {r.weak_lessons.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => navigate(`/learn/lesson/${l.id}`)}
                    className="flex w-full items-center justify-between rounded-2xl border-2 border-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/5"
                  >
                    {l.title}
                    <span className="text-xs text-[#89e219]">повторить →</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {r.achievements?.length ? (
            <div className="flex flex-wrap justify-center gap-2">
              {r.achievements.map((a) => (
                <span key={a.id} className="rounded-full bg-amber-400/15 px-3 py-1 text-sm text-amber-100">
                  {a.icon} {a.title}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <BottomBar>
          <button type="button" onClick={load} className="rounded-2xl border-2 border-white/15 px-6 py-3 text-sm font-bold uppercase tracking-wide text-white/80 hover:bg-white/5">
            {r.passed ? 'Ещё раз' : 'Пересдать'}
          </button>
          <PrimaryButton onClick={exit}>К курсу</PrimaryButton>
        </BottomBar>
      </Overlay>
    );
  }

  if (phase === 'result' && result) {
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    return (
      <Overlay>
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="animate-[achievement-pop_700ms_ease-out] text-7xl">{result.perfect ? '🏆' : '🎉'}</div>
          <div>
            <div className="text-3xl font-extrabold text-amber-300">{result.perfect ? 'Без единой ошибки!' : 'Урок пройден!'}</div>
            <div className="mt-1 text-white/60">{lesson.title}</div>
          </div>
          <div className="grid w-full max-w-md grid-cols-3 gap-3">
            <StatTile label="Опыт" value={`+${result.xp_earned} XP`} color="border-amber-300 text-amber-200" />
            <StatTile label="Точность" value={`${result.score}%`} color="border-brand-mint text-brand-mint/90" />
            <StatTile label="Время" value={`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`} color="border-sky-400 text-sky-200" />
          </div>
          {result.streak ? <div className="text-sm text-orange-300">🔥 Серия занятий: {result.streak} дн.</div> : null}
          {result.achievements?.length ? (
            <div className="flex flex-wrap justify-center gap-2">
              {result.achievements.map((a) => (
                <span key={a.id} className="rounded-full bg-amber-400/15 px-3 py-1 text-sm text-amber-100">
                  {a.icon} {a.title}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <BottomBar>
          <button type="button" onClick={load} className="rounded-2xl border-2 border-white/15 px-6 py-3 text-sm font-bold uppercase tracking-wide text-white/80 hover:bg-white/5">
            Ещё раз
          </button>
          <PrimaryButton onClick={exit}>Продолжить</PrimaryButton>
        </BottomBar>
      </Overlay>
    );
  }

  if (phase === 'failed') {
    return (
      <Overlay>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="text-7xl">💔</div>
          <div className="text-2xl font-bold text-white">Сердечки закончились</div>
          <div className="max-w-sm text-white/60">Ничего страшного — ошибки помогают запоминать. Попробуйте ещё раз!</div>
        </div>
        <BottomBar>
          <button type="button" onClick={exit} className="rounded-2xl border-2 border-white/15 px-6 py-3 text-sm font-bold uppercase tracking-wide text-white/80 hover:bg-white/5">
            Выйти
          </button>
          <PrimaryButton onClick={load}>Попробовать снова</PrimaryButton>
        </BottomBar>
      </Overlay>
    );
  }

  return (
    <Overlay>
      {/* Top bar */}
      <div className="mx-auto flex w-full max-w-3xl items-center gap-4 px-4 pt-5">
        <button type="button" onClick={exit} className="rounded-full p-1.5 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Выйти из урока">
          <X size={22} />
        </button>
        <div className="h-4 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className="relative h-full rounded-full bg-[#58cc02] transition-all duration-500" style={{ width: `${Math.max(3, progressPct)}%` }}>
            <div className="absolute left-2 right-2 top-1 h-1 rounded-full bg-white/30" />
          </div>
        </div>
        {isCheckpoint ? (
          <div className="rounded-full bg-amber-300/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-200">🏰 Контрольная</div>
        ) : (
          <div className={classNames('flex items-center gap-1 font-bold', hearts <= 1 ? 'text-rose-400' : 'text-rose-300')}>
            <Heart size={22} className={classNames('fill-current', feedback?.status === 'wrong' && 'animate-[lesson-shake_400ms]')} /> {hearts}
          </div>
        )}
      </div>

      {/* Exercise */}
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-6">
        {current?.retry && <div className="mb-3 text-xs font-bold uppercase tracking-wider text-orange-300">↻ Повторим ошибку</div>}
        {isCheckpoint && current && (current.exercise as any).lesson_title && (
          <div className="mb-3 text-xs font-bold uppercase tracking-wider text-white/35">Из урока «{(current.exercise as any).lesson_title}»</div>
        )}
        {current && (
          <ExerciseView
            key={current.key}
            exercise={current.exercise}
            speechLang={lesson.speech_lang}
            answer={answer}
            setAnswer={setAnswer}
            locked={!!feedback}
            onMatchDone={(errors) => {
              mistakes.current += errors;
              registerResult(true, { note: errors ? `Ошибок при сопоставлении: ${errors}` : undefined });
            }}
          />
        )}
      </div>

      {/* Bottom bar */}
      <div
        className={classNames(
          'border-t-2 transition-colors',
          feedback?.status === 'wrong' ? 'border-rose-500/30 bg-rose-500/15' : feedback ? 'border-brand-mint/30 bg-brand-mint/15' : 'border-white/10'
        )}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-5">
          {feedback ? (
            <div className="flex min-w-0 items-center gap-3">
              <div className={classNames('flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl', feedback.status === 'wrong' ? 'bg-rose-500/25' : 'bg-brand-mint/25')}>
                {feedback.status === 'wrong' ? '✖' : '✔'}
              </div>
              <div className="min-w-0">
                <div className={classNames('text-lg font-bold', feedback.status === 'wrong' ? 'text-rose-300' : 'text-brand-mint')}>
                  {feedback.status === 'wrong' ? 'Неправильно' : PRAISE[pos % PRAISE.length]}
                </div>
                {feedback.status === 'wrong' && feedback.answer ? (
                  <div className="text-sm text-rose-100">
                    Правильный ответ: <b>{feedback.answer}</b>
                  </div>
                ) : null}
                {feedback.note ? <div className="text-xs text-white/60">{feedback.note}</div> : null}
              </div>
            </div>
          ) : ungraded || isMatch ? (
            <div className="text-sm text-white/40">{isMatch ? 'Соедините все пары' : 'Нажмите Enter, чтобы продолжить'}</div>
          ) : (
            <button type="button" onClick={skip} className="rounded-2xl border-2 border-white/15 px-5 py-3 text-sm font-bold uppercase tracking-wide text-white/60 hover:bg-white/5">
              Не знаю
            </button>
          )}

          {feedback || ungraded ? (
            <PrimaryButton danger={feedback?.status === 'wrong'} onClick={advance}>
              {phase === 'saving' ? <Loader2 className="h-5 w-5 animate-spin" /> : ungraded && current?.exercise.type === 'learn' ? 'Запомнил!' : 'Продолжить'}
            </PrimaryButton>
          ) : !isMatch ? (
            <PrimaryButton disabled={!canCheck} onClick={check}>
              Проверить
            </PrimaryButton>
          ) : null}
        </div>
      </div>
    </Overlay>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[80] flex flex-col overflow-y-auto bg-brand-deep text-white">{children}</div>;
}

function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t-2 border-white/10">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-5 py-5">{children}</div>
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={classNames(
        'min-w-[150px] rounded-2xl px-6 py-3 text-sm font-extrabold uppercase tracking-wide transition active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed',
        disabled
          ? 'bg-white/10 text-white/30'
          : danger
          ? 'bg-rose-500 text-white shadow-[0_4px_0_#9f1239] hover:brightness-110'
          : 'bg-[#58cc02] text-white shadow-[0_4px_0_#46a302] hover:brightness-110'
      )}
    >
      {children}
    </button>
  );
}

function StatTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={classNames('overflow-hidden rounded-2xl border-2', color)}>
      <div className="bg-white/5 py-1 text-[10px] font-bold uppercase tracking-wider">{label}</div>
      <div className="py-3 text-lg font-extrabold text-white">{value}</div>
    </div>
  );
}

function SpeakButton({ text, lang, size = 'md', word }: { text: string; lang: string | null; size?: 'md' | 'lg'; word?: Word }) {
  if (!lang && !word?.audio) return null;
  return (
    <button
      type="button"
      onClick={() => {
        speak(text, lang, 1, { reading: word?.reading, audio: word?.audio });
        trackClientAction('learn.listen');
      }}
      className={classNames('inline-flex items-center justify-center rounded-2xl bg-sky-500 text-white shadow-[0_4px_0_#0369a1] transition hover:brightness-110 active:translate-y-[2px] active:shadow-none', size === 'lg' ? 'h-20 w-20' : 'h-10 w-10')}
      aria-label="Прослушать"
    >
      <Volume2 size={size === 'lg' ? 34 : 18} />
    </button>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-6 text-2xl font-bold text-white">{children}</h2>;
}

function OptionTile({ children, selected, onClick, index, disabled }: { children: React.ReactNode; selected: boolean; onClick: () => void; index?: number; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={classNames(
        'flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-base font-medium transition active:translate-y-[2px]',
        selected ? 'border-sky-400 bg-sky-400/15 text-sky-100 shadow-[0_3px_0_#0284c7]' : 'border-white/15 bg-white/[0.03] text-white/90 shadow-[0_3px_0_rgba(255,255,255,0.12)] hover:bg-white/[0.07]'
      )}
    >
      {index !== undefined && <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-white/15 text-xs text-white/50">{index + 1}</span>}
      <span>{children}</span>
    </button>
  );
}

type ViewProps = {
  exercise: Exercise;
  speechLang: string | null;
  answer: any;
  setAnswer: (value: any) => void;
  locked: boolean;
  onMatchDone: (errors: number) => void;
};

function ExerciseView({ exercise, speechLang, answer, setAnswer, locked, onMatchDone }: ViewProps) {
  // Цифры 1–9 выбирают вариант в заданиях с вариантами.
  useEffect(() => {
    const options = exercise.type === 'choice' ? exercise.options : exercise.type === 'fill' && exercise.options ? exercise.options : null;
    if (!options) return;
    const onKey = (event: KeyboardEvent) => {
      if (locked || (event.target as HTMLElement)?.tagName === 'INPUT') return;
      const n = Number(event.key);
      if (n >= 1 && n <= options.length) setAnswer(options[n - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exercise, locked, setAnswer]);

  useEffect(() => {
    if (exercise.type === 'listen') speak(exercise.text, speechLang);
    if (exercise.type === 'learn' && (speechLang || exercise.word.audio)) {
      speak(exercise.word.term, speechLang, 1, { reading: exercise.word.reading, audio: exercise.word.audio });
    }
  }, [exercise, speechLang]);

  switch (exercise.type) {
    case 'learn': {
      const w = exercise.word;
      return (
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-violet-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-violet-200">✨ Новое слово</div>
          <div className="rounded-3xl border-2 border-white/10 bg-white/[0.03] p-6 text-center">
            {w.emoji ? <div className="mb-2 text-6xl">{w.emoji}</div> : null}
            <div className="flex items-center justify-center gap-3">
              <div className="text-4xl font-bold text-white">{w.term}</div>
              <SpeakButton text={w.term} lang={speechLang} word={w} />
            </div>
            {w.reading ? <div className="mt-1 text-lg text-white/50">{w.reading}</div> : null}
            <div className="mt-4 text-2xl font-semibold text-brand-mint">{w.translation}</div>
            {w.note ? <div className="mt-3 text-sm text-white/60">💡 {w.note}</div> : null}
            {w.example ? (
              <div className="mt-4 rounded-2xl bg-black/25 p-3 text-left text-sm">
                <div className="text-white/85">{w.example}</div>
                {w.example_translation ? <div className="text-white/50">{w.example_translation}</div> : null}
              </div>
            ) : null}
          </div>
          <div className="mt-3 text-center text-sm text-white/45">Запомните слово — дальше будем его переводить</div>
        </div>
      );
    }
    case 'theory':
      return (
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-400/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-200">
            <Lightbulb size={14} /> Подсказка
          </div>
          <div className="rounded-3xl border-2 border-amber-300/20 bg-amber-300/5 p-6">
            <div className="mb-2 text-xl font-bold text-white">{exercise.title}</div>
            <div className="whitespace-pre-line leading-relaxed text-white/80">{exercise.text}</div>
          </div>
        </div>
      );
    case 'choice':
      return (
        <div>
          <Title>{exercise.prompt}</Title>
          {exercise.question ? (
            <div className="mb-6 flex items-center gap-3">
              <SpeakButton text={exercise.question} lang={speechLang} />
              <div className="rounded-2xl border-2 border-white/15 px-4 py-2 text-2xl font-semibold">{exercise.question}</div>
            </div>
          ) : null}
          <div className="grid gap-2.5 sm:grid-cols-2">
            {exercise.options.map((option, index) => (
              <OptionTile key={option} index={index} disabled={locked} selected={answer === option} onClick={() => setAnswer(option)}>
                {option}
              </OptionTile>
            ))}
          </div>
        </div>
      );
    case 'translate':
      return <TypeAnswer title="Переведите" prompt={exercise.prompt} hint={exercise.hint} answer={answer} setAnswer={setAnswer} locked={locked} speakText={exercise.direction === 'to_native' ? exercise.prompt : null} speechLang={speechLang} placeholder={exercise.direction === 'to_native' ? 'Напишите по-русски' : 'Напишите на изучаемом языке'} />;
    case 'listen':
      return (
        <div>
          <Title>{exercise.prompt}</Title>
          <div className="mb-6 flex items-center gap-4">
            <SpeakButton text={exercise.text} lang={speechLang || 'en-US'} size="lg" />
            <button type="button" onClick={() => speak(exercise.text, speechLang, 0.6)} className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/30 text-sky-100 hover:bg-sky-500/40" aria-label="Медленно">
              <Snail size={24} />
            </button>
          </div>
          <AnswerInput value={answer} onChange={setAnswer} locked={locked} placeholder="Напишите, что услышали" />
        </div>
      );
    case 'fill': {
      const [before, after] = exercise.sentence.split('___');
      return (
        <div>
          <Title>{exercise.prompt}</Title>
          <div className="mb-6 flex flex-wrap items-center gap-2 text-2xl">
            <span>{before}</span>
            <span className={classNames('min-w-[90px] border-b-2 px-2 text-center', answer ? 'border-sky-400 text-sky-200' : 'border-white/30 text-white/30')}>{answer || '?'}</span>
            <span>{after}</span>
          </div>
          {exercise.translation ? <div className="-mt-4 mb-5 text-sm text-white/45">{exercise.translation}</div> : null}
          {exercise.options ? (
            <div className="flex flex-wrap gap-2">
              {exercise.options.map((option, index) => (
                <div key={option} className="min-w-[120px]">
                  <OptionTile index={index} disabled={locked} selected={answer === option} onClick={() => setAnswer(option)}>
                    {option}
                  </OptionTile>
                </div>
              ))}
            </div>
          ) : (
            <AnswerInput value={answer} onChange={setAnswer} locked={locked} placeholder="Впишите слово" />
          )}
        </div>
      );
    }
    case 'assemble':
      return <AssembleView exercise={exercise} answer={answer} setAnswer={setAnswer} locked={locked} />;
    case 'match':
      return <MatchView exercise={exercise} onDone={onMatchDone} speechLang={speechLang} />;
    default:
      return null;
  }
}

function AnswerInput({ value, onChange, locked, placeholder }: { value: any; onChange: (v: string) => void; locked: boolean; placeholder: string }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <textarea
      ref={ref}
      value={value || ''}
      disabled={locked}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, ''))}
      placeholder={placeholder}
      rows={3}
      className="w-full resize-none rounded-2xl border-2 border-white/15 bg-black/25 p-4 text-lg text-white outline-none placeholder:text-white/30 focus:border-sky-400"
    />
  );
}

function TypeAnswer({ title, prompt, hint, answer, setAnswer, locked, speakText, speechLang, placeholder }: { title: string; prompt: string; hint: string | null; answer: any; setAnswer: (v: any) => void; locked: boolean; speakText: string | null; speechLang: string | null; placeholder: string }) {
  const [showHint, setShowHint] = useState(false);
  return (
    <div>
      <Title>{title}</Title>
      <div className="mb-5 flex items-center gap-3">
        {speakText ? <SpeakButton text={speakText} lang={speechLang} /> : null}
        <div className="rounded-2xl border-2 border-white/15 px-4 py-2 text-2xl font-semibold">{prompt}</div>
        {hint ? (
          <button type="button" onClick={() => setShowHint((v) => !v)} className="text-sm text-amber-200/80 underline decoration-dotted">
            {showHint ? hint : 'подсказка'}
          </button>
        ) : null}
      </div>
      <AnswerInput value={answer} onChange={setAnswer} locked={locked} placeholder={placeholder} />
    </div>
  );
}

function AssembleView({ exercise, answer, setAnswer, locked }: { exercise: Extract<Exercise, { type: 'assemble' }>; answer: any; setAnswer: (v: any) => void; locked: boolean }) {
  const chosen: number[] = Array.isArray(answer) ? answer : [];
  const choose = (next: number[]) => setAnswer(next.length ? next : null);
  return (
    <div>
      <Title>Соберите перевод</Title>
      <div className="mb-4 rounded-2xl border-2 border-white/15 px-4 py-2 text-xl font-semibold">{exercise.prompt}</div>
      <div className="mb-6 flex min-h-[64px] flex-wrap items-start gap-2 border-b-2 border-t-2 border-white/10 py-3">
        {chosen.map((i, position) => (
          <button key={`${i}-${position}`} type="button" disabled={locked} onClick={() => choose(chosen.filter((_, p) => p !== position))} className="rounded-xl border-2 border-white/20 bg-white/[0.06] px-3 py-1.5 text-lg shadow-[0_3px_0_rgba(255,255,255,0.12)]">
            {exercise.tokens[i]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {exercise.tokens.map((token, i) => {
          const used = chosen.includes(i);
          return (
            <button
              key={`${token}-${i}`}
              type="button"
              disabled={locked || used}
              onClick={() => choose([...chosen, i])}
              className={classNames('rounded-xl border-2 px-3 py-1.5 text-lg transition', used ? 'border-white/5 bg-white/5 text-transparent' : 'border-white/20 bg-white/[0.06] shadow-[0_3px_0_rgba(255,255,255,0.12)] hover:bg-white/10')}
            >
              {token}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MatchView({ exercise, onDone, speechLang }: { exercise: Extract<Exercise, { type: 'match' }>; onDone: (errors: number) => void; speechLang: string | null }) {
  const left = useMemo(() => shuffle(exercise.pairs.map(([a], i) => ({ i, text: a }))), [exercise]);
  const right = useMemo(() => shuffle(exercise.pairs.map(([, b], i) => ({ i, text: b }))), [exercise]);
  const [selLeft, setSelLeft] = useState<number | null>(null);
  const [selRight, setSelRight] = useState<number | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [wrong, setWrong] = useState<[number, number] | null>(null);
  const errors = useRef(0);
  const done = useRef(false);

  useEffect(() => {
    if (selLeft === null || selRight === null) return;
    if (selLeft === selRight) {
      const next = new Set(matched);
      next.add(selLeft);
      setMatched(next);
      playTone('correct');
      if (next.size === exercise.pairs.length && !done.current) {
        done.current = true;
        window.setTimeout(() => onDone(errors.current), 300);
      }
    } else {
      errors.current += 1;
      playTone('wrong');
      setWrong([selLeft, selRight]);
      window.setTimeout(() => setWrong(null), 500);
    }
    setSelLeft(null);
    setSelRight(null);
  }, [selLeft, selRight]);

  const tile = (side: 'l' | 'r', item: { i: number; text: string }) => {
    const isMatched = matched.has(item.i);
    const selected = side === 'l' ? selLeft === item.i : selRight === item.i;
    const isWrong = wrong && (side === 'l' ? wrong[0] === item.i : wrong[1] === item.i);
    return (
      <button
        key={`${side}${item.i}`}
        type="button"
        disabled={isMatched}
        onClick={() => {
          if (side === 'l') {
            setSelLeft(item.i);
            speak(item.text, speechLang);
          } else setSelRight(item.i);
        }}
        className={classNames(
          'w-full rounded-2xl border-2 px-4 py-3 text-lg font-medium transition',
          isMatched && 'border-white/5 bg-transparent text-white/20',
          !isMatched && isWrong && 'animate-[lesson-shake_400ms] border-rose-400 bg-rose-500/15 text-rose-100',
          !isMatched && !isWrong && selected && 'border-sky-400 bg-sky-400/15 text-sky-100',
          !isMatched && !isWrong && !selected && 'border-white/15 bg-white/[0.03] shadow-[0_3px_0_rgba(255,255,255,0.12)] hover:bg-white/[0.07]'
        )}
      >
        {item.text}
      </button>
    );
  };

  return (
    <div>
      <Title>{exercise.prompt}</Title>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2.5">{left.map((item) => tile('l', item))}</div>
        <div className="space-y-2.5">{right.map((item) => tile('r', item))}</div>
      </div>
    </div>
  );
}

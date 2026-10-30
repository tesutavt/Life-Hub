import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import classNames from 'classnames';
import { CheckCircle2, Flame, Loader2, Sparkles, Target, XCircle } from 'lucide-react';
import Shell from '../components/Shell';
import { api } from '../api';
import KanaTrainerBlock from '../components/KanaTrainerBlock';
import { requestAchievementCheck } from '../achievements';

type Mode = 'mix' | 'review' | 'mistakes' | 'new';

type Exercise = {
  vocab_id: number;
  term: string;
  unit_label: string | null;
  type: 'choice' | 'translate';
  direction?: 'forward' | 'reverse';
  note?: string | null;
  options?: string[];
  answer: string;
};

type Stats = {
  name: string;
  daily_goal_xp: number;
  xp_today: number;
  minutes_today: number;
  due_count: number;
  new_count: number;
  mistakes_count: number;
  words_total: number;
  streak: number;
};

type CompleteResponse = {
  exercises_done: number;
  correct_count: number;
  xp_earned: number;
  streak: number;
  streak_best: number;
};

const MODES: { id: Mode; emoji: string; title: string; hint: string; count?: keyof Stats }[] = [
  { id: 'mix', emoji: '🎯', title: 'Тренировка', hint: 'повторение, ошибки и немного новых слов' },
  { id: 'review', emoji: '🔁', title: 'Повторение', hint: 'слова, которые пора освежить', count: 'due_count' },
  { id: 'mistakes', emoji: '🩹', title: 'Работа над ошибками', hint: 'слова, на которых вы ошибались', count: 'mistakes_count' },
  { id: 'new', emoji: '🌱', title: 'Новые слова', hint: 'ещё ни разу не тренировали', count: 'new_count' },
];
const SIZES = [5, 10, 20];
const GOALS = [20, 50, 100, 150];

// Без регистра, пунктуации и лишних пробелов; «ё» = «е»
const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.,!?;:"'«»()\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function distance(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length]![b.length]!;
}

/** Ответ засчитывается, если совпал с любым вариантом перевода («дом, жилище» / «дом; здание»); одна опечатка в длинном слове — тоже. */
function grade(input: string, answer: string): 'exact' | 'typo' | 'wrong' {
  const given = normalize(input);
  if (!given) return 'wrong';
  const variants = [answer, ...answer.split(/[,;/]/)].map(normalize).filter(Boolean);
  if (variants.includes(given)) return 'exact';
  if (variants.some((v) => v.length >= 5 && distance(v, given) <= 1)) return 'typo';
  return 'wrong';
}

export default function LanguagePractice() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [stats, setStats] = useState<Stats | null>(null);
  const [mode, setMode] = useState<Mode>((params.get('mode') as Mode) || 'mix');
  const [size, setSize] = useState(10);
  const [phase, setPhase] = useState<'start' | 'loading' | 'playing' | 'result' | 'kana'>(params.get('mode') === 'kana' ? 'kana' : 'start');
  const [queue, setQueue] = useState<Exercise[]>([]);
  const [initialCount, setInitialCount] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'typo' | 'incorrect' | null>(null);
  const [textAnswer, setTextAnswer] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [result, setResult] = useState<CompleteResponse | null>(null);
  const [mistakesThisRound, setMistakesThisRound] = useState(0);
  const resultsRef = useRef<Map<number, boolean>>(new Map());
  const startedAtRef = useRef(Date.now());
  const finishingRef = useRef(false);

  const loadStats = useCallback(() => {
    if (!id) return;
    api.get(`/api/life/languages/${id}/stats`).then((data: Stats) => setStats(data));
  }, [id]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const start = useCallback(
    async (selectedMode: Mode = mode) => {
      if (!id) return;
      setMode(selectedMode);
      setPhase('loading');
      const session = await api.get(`/api/life/languages/${id}/practice/session?size=${size}&mode=${selectedMode}`);
      const exercises: Exercise[] = session?.exercises || [];
      setQueue(exercises);
      setInitialCount(exercises.length);
      resultsRef.current = new Map();
      startedAtRef.current = Date.now();
      finishingRef.current = false;
      setFeedback(null);
      setTextAnswer('');
      setSelectedOption(null);
      setResult(null);
      setMistakesThisRound(0);
      setPhase(exercises.length ? 'playing' : 'start');
    },
    [id, mode, size]
  );

  const current = queue[0] || null;
  const progressPct = initialCount > 0 ? Math.min(100, Math.round((resultsRef.current.size * 100) / initialCount)) : 0;

  const finishSession = useCallback(async () => {
    if (!id || finishingRef.current) return;
    finishingRef.current = true;
    const results = Array.from(resultsRef.current.entries()).map(([vocab_id, correct]) => ({ vocab_id, correct }));
    const response = (await api.post(`/api/life/languages/${id}/practice/complete`, {
      results,
      duration_sec: Math.round((Date.now() - startedAtRef.current) / 1000),
    })) as CompleteResponse;
    setResult(response);
    setPhase('result');
    loadStats();
  }, [id, loadStats]);

  const record = (isCorrect: boolean) => {
    if (!current) return;
    if (!resultsRef.current.has(current.vocab_id)) resultsRef.current.set(current.vocab_id, isCorrect);
    if (!isCorrect) setMistakesThisRound((n) => n + 1);
  };

  const handleChoiceAnswer = (option: string) => {
    if (!current || feedback) return;
    setSelectedOption(option);
    const isCorrect = option === current.answer;
    setFeedback(isCorrect ? 'correct' : 'incorrect');
    record(isCorrect);
  };

  const handleTranslateSubmit = () => {
    if (!current || feedback || !textAnswer.trim()) return;
    const verdict = grade(textAnswer, current.answer);
    setFeedback(verdict === 'exact' ? 'correct' : verdict === 'typo' ? 'typo' : 'incorrect');
    record(verdict !== 'wrong');
  };

  const handleContinue = useCallback(() => {
    if (!current) return;
    const wasCorrect = feedback !== 'incorrect';
    // Ошибочное слово вернётся в конце раунда
    const rest = wasCorrect ? queue.slice(1) : [...queue.slice(1), { ...current }];
    setQueue(rest);
    setFeedback(null);
    setTextAnswer('');
    setSelectedOption(null);
    if (!rest.length) finishSession();
  }, [current, feedback, queue, finishSession]);

  // Enter — дальше, 1–4 — вариант ответа
  useEffect(() => {
    if (phase !== 'playing') return;
    const onKey = (event: KeyboardEvent) => {
      if (feedback && event.key === 'Enter') {
        event.preventDefault();
        handleContinue();
        return;
      }
      if (!feedback && current?.type === 'choice' && /^[1-4]$/.test(event.key)) {
        const option = current.options?.[Number(event.key) - 1];
        if (option) handleChoiceAnswer(option);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const saveGoal = async (goal: number) => {
    if (!id) return;
    await api.put(`/api/life/languages/${id}`, { daily_goal_xp: goal }, { notifySuccess: `Цель дня: ${goal} XP` });
    loadStats();
  };

  const accuracyPct = useMemo(() => {
    if (!result || result.exercises_done === 0) return 0;
    return Math.round((result.correct_count * 100) / result.exercises_done);
  }, [result]);

  const goalPct = stats ? Math.min(100, Math.round((stats.xp_today * 100) / Math.max(1, stats.daily_goal_xp))) : 0;
  const card = 'rounded-3xl border border-white/10 bg-white/5';

  return (
    <Shell>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm uppercase tracking-wide text-slate-300/80">
            <Sparkles size={18} className="text-amber-300" />
            Практика · {stats?.name || 'Язык'}
          </div>
          <button
            type="button"
            onClick={() => (phase === 'playing' || phase === 'kana' ? setPhase('start') : navigate('/languages'))}
            className="text-sm text-slate-300/70 hover:text-white"
          >
            {phase === 'playing' ? 'Прервать' : phase === 'kana' ? 'К режимам' : 'Выйти'}
          </button>
        </div>

        {phase === 'kana' && id && <KanaSession languageId={id} onSaved={loadStats} />}

        {stats && phase !== 'playing' && phase !== 'kana' && (
          <div className={classNames(card, 'p-4')}>
            <div className="flex flex-wrap items-center gap-3">
              <Target className="h-5 w-5 text-amber-300" />
              <div className="text-sm text-white">
                Цель дня: <b>{stats.xp_today}</b> / {stats.daily_goal_xp} XP
              </div>
              <div className="ml-auto flex items-center gap-3 text-xs text-white/60">
                <span>⏱ {stats.minutes_today} мин сегодня</span>
                {stats.streak > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-300">
                    <Flame className="h-3.5 w-3.5" /> {stats.streak}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-rose-400 transition-all" style={{ width: `${goalPct}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-white/50">
              Цель:
              {GOALS.map((goal) => (
                <button
                  key={goal}
                  type="button"
                  onClick={() => saveGoal(goal)}
                  className={classNames('rounded-full px-2 py-0.5', stats.daily_goal_xp === goal ? 'bg-amber-300 text-brand-deep' : 'bg-white/5 hover:bg-white/10')}
                >
                  {goal} XP
                </button>
              ))}
            </div>
          </div>
        )}

        {phase === 'start' && stats && (
          stats.words_total === 0 ? (
            <div className={classNames(card, 'p-10 text-center text-slate-200/70')}>
              В словаре пока нет слов. Добавьте их на странице «Языки» или пройдите урок курса-тренировки — слова попадут сюда сами.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                {MODES.map((m) => {
                  const count = m.count ? Number(stats[m.count]) || 0 : null;
                  const disabled = count === 0;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => start(m.id)}
                      className={classNames(
                        'flex items-start gap-3 rounded-2xl border p-4 text-left transition',
                        disabled ? 'cursor-not-allowed border-white/5 bg-white/[0.02] opacity-50' : 'border-white/10 bg-white/5 hover:-translate-y-0.5 hover:border-amber-300/50'
                      )}
                    >
                      <span className="text-3xl">{m.emoji}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 font-semibold text-white">
                          {m.title}
                          {count !== null && <span className="rounded-full bg-white/10 px-2 text-xs text-white/70">{count}</span>}
                        </span>
                        <span className="block text-xs text-white/55">{m.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {/япон|japan|日本/i.test(stats.name) && (
                <button
                  type="button"
                  onClick={() => setPhase('kana')}
                  className="flex w-full items-start gap-3 rounded-2xl border border-rose-300/30 bg-rose-400/10 p-4 text-left transition hover:-translate-y-0.5 hover:border-rose-300/60"
                >
                  <span className="text-3xl">あ</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-white">Кана-тренажёр</span>
                    <span className="block text-xs text-white/55">
                      Хирагана и катакана: знак → чтение. Ошибки запоминаются и повторяются чаще. Засчитывается в цель дня и стрик.
                    </span>
                  </span>
                </button>
              )}
              <div className="flex items-center justify-center gap-2 text-xs text-white/50">
                Слов за раунд:
                {SIZES.map((n) => (
                  <button key={n} type="button" onClick={() => setSize(n)} className={classNames('rounded-full px-2.5 py-0.5', size === n ? 'bg-white text-black' : 'bg-white/5 hover:bg-white/10')}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )
        )}

        {(phase === 'loading' || (phase === 'start' && !stats)) && (
          <div className={classNames(card, 'flex items-center justify-center py-16 text-slate-200/80')}>
            <Loader2 className="mr-3 h-5 w-5 animate-spin" /> Готовим упражнения…
          </div>
        )}

        {phase === 'result' && result && (
          <div className={classNames(card, 'flex flex-col items-center gap-4 p-8 text-center')}>
            <Flame className="h-10 w-10 text-amber-300" />
            <div className="text-2xl font-semibold text-white">Раунд завершён!</div>
            <div className="grid w-full grid-cols-2 gap-3 text-sm text-slate-200/80">
              <div className="rounded-2xl bg-white/5 p-4">
                <div className="text-2xl font-semibold text-white">{result.exercises_done}</div>
                слов
              </div>
              <div className="rounded-2xl bg-white/5 p-4">
                <div className="text-2xl font-semibold text-white">{accuracyPct}%</div>
                точность
              </div>
              <div className="rounded-2xl bg-white/5 p-4">
                <div className="text-2xl font-semibold text-amber-200">+{result.xp_earned}</div>
                XP
              </div>
              <div className="rounded-2xl bg-white/5 p-4">
                <div className="inline-flex items-center gap-1 text-2xl font-semibold text-white">
                  {result.streak}
                  <Flame className="h-5 w-5 text-amber-300" />
                </div>
                дней подряд (лучший: {result.streak_best})
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => start(mode)} className="rounded-full bg-gradient-to-r from-amber-400 via-rose-400 to-purple-500 px-5 py-2.5 text-sm font-semibold text-brand-night hover:brightness-110">
                Ещё раунд
              </button>
              {mistakesThisRound > 0 && mode !== 'mistakes' && (
                <button type="button" onClick={() => start('mistakes')} className="rounded-full border border-white/15 px-5 py-2.5 text-sm text-white hover:bg-white/10">
                  🩹 Работа над ошибками
                </button>
              )}
              <button type="button" onClick={() => setPhase('start')} className="rounded-full px-5 py-2.5 text-sm text-white/70 hover:bg-white/10">
                Другой режим
              </button>
            </div>
          </div>
        )}

        {phase === 'playing' && current && (
          <div className="flex flex-col gap-5">
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-300 via-rose-400 to-purple-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
            </div>

            <div className={classNames(card, 'p-8 text-center')}>
              {current.unit_label && <div className="mb-2 text-xs uppercase tracking-wide text-slate-300/60">{current.unit_label}</div>}
              <div className="text-3xl font-semibold text-white">{current.term}</div>
              <div className="mt-1 text-sm text-slate-300/60">
                {current.direction === 'reverse'
                  ? current.type === 'choice'
                    ? `Выберите, как это на языке «${stats?.name || ''}»`
                    : `Напишите на языке «${stats?.name || ''}»`
                  : current.type === 'choice'
                  ? 'Выберите перевод'
                  : 'Введите перевод'}
              </div>
            </div>

            {current.type === 'choice' ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(current.options || []).map((option, index) => {
                  const isSelected = selectedOption === option;
                  const isAnswer = option === current.answer;
                  const showState = feedback && (isSelected || (feedback === 'incorrect' && isAnswer));
                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={!!feedback}
                      onClick={() => handleChoiceAnswer(option)}
                      className={classNames(
                        'flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition',
                        showState
                          ? isAnswer
                            ? 'border-brand-mint/60 bg-brand-mint/10 text-brand-mint/90'
                            : 'border-rose-300/60 bg-rose-400/10 text-rose-200'
                          : 'border-white/10 bg-white/5 text-white hover:border-amber-300/50 hover:bg-white/10'
                      )}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-white/15 text-xs text-white/50">{index + 1}</span>
                      {option}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <input
                  type="text"
                  autoFocus
                  disabled={!!feedback}
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !feedback) {
                      e.stopPropagation();
                      handleTranslateSubmit();
                    }
                  }}
                  placeholder={current.direction === 'reverse' ? 'Слово' : 'Ваш перевод'}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-amber-300/60"
                />
                {!feedback && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleTranslateSubmit}
                      disabled={!textAnswer.trim()}
                      className="rounded-full bg-white/10 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Проверить
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFeedback('incorrect');
                        record(false);
                      }}
                      className="rounded-full px-4 py-2 text-sm text-white/50 hover:bg-white/10 hover:text-white"
                    >
                      Не помню
                    </button>
                  </div>
                )}
              </div>
            )}

            {feedback && (
              <div
                className={classNames(
                  'flex items-center justify-between gap-3 rounded-2xl border px-5 py-4',
                  feedback === 'incorrect' ? 'border-rose-300/40 bg-rose-400/10 text-rose-200' : 'border-brand-mint/40 bg-brand-mint/10 text-brand-mint/90'
                )}
              >
                <div className="min-w-0 text-sm">
                  <div className="inline-flex items-center gap-2 font-semibold">
                    {feedback === 'incorrect' ? <XCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                    {feedback === 'correct' ? 'Верно!' : feedback === 'typo' ? 'Засчитано, но с опечаткой' : 'Не совсем — слово вернётся в конце раунда'}
                  </div>
                  {feedback !== 'correct' && <div className="mt-1 text-white/80">Правильно: {current.answer}</div>}
                  {current.note && <div className="mt-0.5 text-xs text-white/50">{current.note}</div>}
                </div>
                <button type="button" onClick={handleContinue} className="shrink-0 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-white/80">
                  Далее
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}

const KANA_SAVE_EVERY = 25;

/**
 * Кана-тренажёр внутри обучения: состояние (выбранные наборы, сложные знаки) хранится
 * на этом устройстве, а результат раунда засчитывается в XP, цель дня и стрик языка.
 */
function KanaSession({ languageId, onSaved }: { languageId: string; onSaved: () => void }) {
  const storageKey = `lifehub:kana:${languageId}`;
  const [state, setState] = useState<any>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || 'null');
    } catch {
      return null;
    }
  });
  const [session, setSession] = useState({ total: 0, correct: 0 });
  const [saved, setSaved] = useState<{ xp: number; streak: number } | null>(null);
  const startedAt = useRef(Date.now());
  const pending = useRef({ total: 0, correct: 0 });

  const persist = useCallback(
    (next: any) => {
      setState(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // нет доступа к хранилищу — просто не запомним наборы
      }
    },
    [storageKey]
  );

  const flush = useCallback(async () => {
    const { total, correct } = pending.current;
    if (!total) return;
    pending.current = { total: 0, correct: 0 };
    const duration = Math.round((Date.now() - startedAt.current) / 1000);
    startedAt.current = Date.now();
    try {
      const res = await api.post(`/api/life/languages/${languageId}/kana`, { total, correct, duration_sec: duration }, { silentSuccess: true, silentError: true });
      setSaved((prev) => ({ xp: (prev?.xp || 0) + (res?.xp_earned || 0), streak: res?.streak || prev?.streak || 0 }));
      requestAchievementCheck();
      onSaved();
    } catch {
      // не отправилось — вернём в очередь
      pending.current.total += total;
      pending.current.correct += correct;
    }
  }, [languageId, onSaved]);

  const onAnswer = useCallback(
    (correct: boolean) => {
      pending.current.total += 1;
      if (correct) pending.current.correct += 1;
      setSession((prev) => ({ total: prev.total + 1, correct: prev.correct + (correct ? 1 : 0) }));
      if (pending.current.total >= KANA_SAVE_EVERY) flush();
    },
    [flush]
  );

  // Уходим со страницы — сохраняем то, что успели
  useEffect(() => () => void flush(), [flush]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
        <span className="text-2xl">あ</span>
        <span className="flex-1">
          Раунд: <b>{session.correct}</b> из {session.total} с первой попытки
          {saved ? ` · +${saved.xp} XP · 🔥 ${saved.streak}` : ''}
        </span>
        <button
          type="button"
          onClick={() => flush()}
          disabled={!session.total}
          className="rounded-full bg-gradient-to-r from-amber-400 via-rose-400 to-purple-500 px-4 py-1.5 text-xs font-semibold text-brand-night disabled:opacity-40"
        >
          Засчитать
        </button>
      </div>
      <KanaTrainerBlock value={state} onChange={persist} onAnswer={onAnswer} large />
      <div className="text-center text-xs text-white/40">Результат засчитывается автоматически каждые {KANA_SAVE_EVERY} знаков и при выходе.</div>
    </div>
  );
}

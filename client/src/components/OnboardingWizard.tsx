import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import classNames from 'classnames';
import { Camera, Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { notifyHiddenMenuItems, requestMenuCountersRefresh } from '../menuBus';
import { notifyProfileUpdated } from '../profileBus';
import { requestAchievementCheck } from '../achievements';
import { desktop } from '../desktop';
import { applyDesktopChoice, DEFAULT_DESKTOP_CHOICE, DesktopChoice, DesktopSetupFields } from './DesktopSetup';

/** Интересы → пункты меню, которые остаются видимыми. */
const INTERESTS = [
  { id: 'languages', emoji: '🗣️', title: 'Языки', text: 'Словарь, уроки, стрик', menu: ['/languages', '/courses'] },
  { id: 'courses', emoji: '🎓', title: 'Курсы', text: 'Учёба и материалы', menu: ['/courses'] },
  { id: 'goals', emoji: '🎯', title: 'Цели на год', text: 'Большие планы по шагам', menu: ['/year-goals'] },
  { id: 'habits', emoji: '✅', title: 'Привычки', text: 'Ежедневные ритуалы', menu: ['/habits'] },
  { id: 'missions', emoji: '🔥', title: 'Задания и ачивки', text: 'Очки, XP, награды', menu: ['/daily-missions', '/achievements'] },
  { id: 'pages', emoji: '📝', title: 'Заметки и страницы', text: 'Дневник, конспекты', menu: ['/pages'] },
  { id: 'finance', emoji: '💳', title: 'Финансы', text: 'Кредиты и расходы', menu: [] },
  { id: 'travel', emoji: '✈️', title: 'Путешествия', text: 'Планы поездок', menu: ['/travel'] },
] as const;
type InterestId = (typeof INTERESTS)[number]['id'];
const OPTIONAL_MENU = Array.from(new Set(INTERESTS.flatMap((i) => i.menu)));

const HABIT_PRESETS = ['💧 Пить воду', '🚶 Прогулка', '📖 Читать 20 минут', '🧘 Медитация', '🏋️ Зарядка', '😴 Лечь до 23:00'];
const LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1'];

type StepId = 'hello' | 'interests' | 'start' | 'desktop' | 'done';

/** Мастер первого запуска: имя и аватар, интересы (настраивают меню) и быстрый старт. */
export default function OnboardingWizard() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<StepId>('hello');
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [interests, setInterests] = useState<Set<InterestId>>(new Set(['languages', 'habits', 'missions', 'pages']));

  const [language, setLanguage] = useState('');
  const [level, setLevel] = useState('A1');
  const [habits, setHabits] = useState<Set<string>>(new Set());
  const [goal, setGoal] = useState('');
  const [goalTarget, setGoalTarget] = useState(52);
  const [page, setPage] = useState('');
  const [created, setCreated] = useState<string[]>([]);
  const [desktopChoice, setDesktopChoice] = useState<DesktopChoice>(DEFAULT_DESKTOP_CHOICE);
  const isDesktop = !!desktop()?.setDesktopSettings;
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    api.get('/api/onboarding', { silentError: true }).then((res) => setOpen(!!res?.show)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    setName((prev) => prev || user.name || '');
    setUsername((prev) => prev || user.username || '');
  }, [user]);

  useEffect(() => {
    if (!avatar) return;
    const url = URL.createObjectURL(avatar);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatar]);

  // На компьютере добавляется шаг про автозапуск, трей и уведомления Windows
  const steps: StepId[] = isDesktop ? ['hello', 'interests', 'start', 'desktop', 'done'] : ['hello', 'interests', 'start', 'done'];
  const index = steps.indexOf(step);
  const has = (id: InterestId) => interests.has(id);

  const saveDesktop = async () => {
    setSaving(true);
    try {
      await applyDesktopChoice(desktopChoice);
      setStep('done');
    } finally {
      setSaving(false);
    }
  };

  const finish = async (skip = false) => {
    await api.post('/api/onboarding', { state: 'done' }, { silentSuccess: true, silentError: true });
    setOpen(false);
    if (!skip) navigate('/dashboard');
  };

  const saveHello = async () => {
    setSaving(true);
    try {
      const form = new FormData();
      if (name.trim()) form.append('display_name', name.trim());
      if (username.trim()) form.append('username', username.trim());
      if (avatar) form.append('avatar', avatar);
      await api.post('/api/life/profile', form, { silentSuccess: true });
      notifyProfileUpdated();
      refreshUser();
      setStep('interests');
    } finally {
      setSaving(false);
    }
  };

  const saveInterests = async () => {
    setSaving(true);
    try {
      const visible = new Set(INTERESTS.filter((i) => interests.has(i.id)).flatMap((i) => i.menu));
      const hidden = OPTIONAL_MENU.filter((path) => !visible.has(path));
      await api.put('/api/life/ui-settings', { hidden_menu_items: hidden }, { silentSuccess: true });
      notifyHiddenMenuItems(hidden);
      setStep('start');
    } finally {
      setSaving(false);
    }
  };

  const saveStart = async () => {
    setSaving(true);
    const done: string[] = [];
    const quiet = { silentSuccess: true } as const;
    try {
      if (has('languages') && language.trim()) {
        await api.post('/api/life/languages', { name: language.trim(), level }, quiet);
        done.push(`Язык «${language.trim()}»`);
      }
      if (has('habits')) {
        for (const habit of habits) {
          await api.post('/api/life/habits', { title: habit, target_per_week: 7 }, quiet);
        }
        if (habits.size) done.push(`Привычки: ${habits.size}`);
      }
      if (has('goals') && goal.trim()) {
        await api.post('/api/life/yearly-goals', { title: goal.trim(), target: goalTarget }, quiet);
        done.push(`Цель «${goal.trim()}»`);
      }
      if (has('pages') && page.trim()) {
        await api.post('/api/life/pages', { title: page.trim(), blocks: [] }, quiet);
        done.push(`Страница «${page.trim()}»`);
      }
      setCreated(done);
      requestMenuCountersRefresh();
      requestAchievementCheck();
      setStep(isDesktop ? 'desktop' : 'done');
    } finally {
      setSaving(false);
    }
  };

  const nothingToStart = useMemo(() => !['languages', 'habits', 'goals', 'pages'].some((id) => interests.has(id as InterestId)), [interests]);

  if (!open) return null;

  const input = 'w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-brand-mint/60';

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-brand-deep/85 p-4 backdrop-blur-md">
      <div className="relative w-full max-w-2xl animate-[auth-in_500ms_cubic-bezier(0.22,1,0.36,1)] overflow-hidden rounded-3xl border border-white/10 bg-brand-night shadow-2xl">
        {/* Прогресс */}
        <div className="flex items-center gap-2 px-6 pt-5">
          {steps.map((s, i) => (
            <div key={s} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div className={classNames('h-full rounded-full bg-brand-mint transition-all duration-500', i <= index ? 'w-full' : 'w-0')} />
            </div>
          ))}
          {step !== 'done' && (
            <button type="button" onClick={() => finish(true)} className="ml-2 text-xs text-white/40 hover:text-white">
              Пропустить
            </button>
          )}
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-6">
          {step === 'hello' && (
            <div>
              <div className="text-4xl">👋</div>
              <h2 className="mt-2 text-2xl font-bold text-white">Добро пожаловать в Life Hub!</h2>
              <p className="mt-1 text-sm text-white/60">Пара шагов — и всё будет настроено под вас. Начнём со знакомства.</p>
              <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="group relative mx-auto flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-white/20 bg-white/5 transition hover:border-brand-mint/60 sm:mx-0"
                >
                  {avatarPreview ? <img src={avatarPreview} alt="" className="h-full w-full object-cover" /> : <Camera size={28} className="text-white/40 group-hover:text-brand-mint" />}
                  <span className="absolute bottom-0 w-full bg-black/50 py-1 text-[10px] text-white/80">аватар</span>
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => setAvatar(e.target.files?.[0] || null)} />
                <div className="flex-1 space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-white/50">Как вас зовут?</span>
                    <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-white/50">Ник (адрес профиля)</span>
                    <div className="flex items-center rounded-xl border border-white/10 bg-black/30 pl-3 focus-within:border-brand-mint/60">
                      <span className="text-sm text-white/40">@</span>
                      <input className="w-full bg-transparent px-1 py-2.5 text-sm text-white outline-none" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))} />
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {step === 'interests' && (
            <div>
              <div className="text-4xl">✨</div>
              <h2 className="mt-2 text-2xl font-bold text-white">Что вы хотите получить от приложения?</h2>
              <p className="mt-1 text-sm text-white/60">Выберите всё, что интересно. Остальное спрячем из меню — вернуть можно в настройках.</p>
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {INTERESTS.map((item) => {
                  const active = interests.has(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        setInterests((prev) => {
                          const next = new Set(prev);
                          if (next.has(item.id)) next.delete(item.id);
                          else next.add(item.id);
                          return next;
                        })
                      }
                      className={classNames(
                        'relative rounded-2xl border-2 p-3 text-left transition hover:-translate-y-0.5',
                        active ? 'border-brand-mint bg-brand-mint/10' : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                      )}
                    >
                      {active && <Check size={14} className="absolute right-2 top-2 text-brand-mint" />}
                      <div className="text-2xl">{item.emoji}</div>
                      <div className="mt-1 text-sm font-semibold text-white">{item.title}</div>
                      <div className="text-[11px] text-white/50">{item.text}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 'start' && (
            <div>
              <div className="text-4xl">🚀</div>
              <h2 className="mt-2 text-2xl font-bold text-white">Быстрый старт</h2>
              <p className="mt-1 text-sm text-white/60">Всё необязательно — заполните то, с чего хотите начать.</p>
              <div className="mt-5 space-y-4">
                {nothingToStart && <div className="rounded-2xl bg-white/5 p-4 text-sm text-white/60">Здесь нечего заполнять — можно сразу идти дальше.</div>}
                {has('languages') && (
                  <Block emoji="🗣️" title="Какой язык изучаете?">
                    <div className="flex gap-2">
                      <input className={input} value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="Например: Японский" />
                      <select className="rounded-xl border border-white/10 bg-black/30 px-2 text-sm text-white outline-none" value={level} onChange={(e) => setLevel(e.target.value)}>
                        {LEVELS.map((l) => (
                          <option key={l}>{l}</option>
                        ))}
                      </select>
                    </div>
                    <div className="mt-1 text-[11px] text-white/40">Курс с уроками можно будет сгенерировать ИИ во вкладке «Курсы».</div>
                  </Block>
                )}
                {has('habits') && (
                  <Block emoji="✅" title="Какие привычки хотите отслеживать?">
                    <div className="flex flex-wrap gap-1.5">
                      {HABIT_PRESETS.map((h) => (
                        <button
                          key={h}
                          type="button"
                          onClick={() =>
                            setHabits((prev) => {
                              const next = new Set(prev);
                              if (next.has(h)) next.delete(h);
                              else next.add(h);
                              return next;
                            })
                          }
                          className={classNames('rounded-full px-3 py-1.5 text-xs transition', habits.has(h) ? 'bg-brand-mint text-brand-deep' : 'bg-white/5 text-white/70 hover:bg-white/10')}
                        >
                          {h}
                        </button>
                      ))}
                    </div>
                  </Block>
                )}
                {has('goals') && (
                  <Block emoji="🎯" title="Главная цель на год">
                    <div className="flex gap-2">
                      <input className={input} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Например: Прочитать 52 книги" />
                      <input type="number" min={1} className="w-24 rounded-xl border border-white/10 bg-black/30 px-2 text-sm text-white outline-none" value={goalTarget} onChange={(e) => setGoalTarget(Math.max(1, Number(e.target.value)))} title="Сколько отметок до цели" />
                    </div>
                  </Block>
                )}
                {has('pages') && (
                  <Block emoji="📝" title="Первая страница">
                    <input className={input} value={page} onChange={(e) => setPage(e.target.value)} placeholder="Например: Дневник" />
                  </Block>
                )}
              </div>
            </div>
          )}

          {step === 'desktop' && (
            <div>
              <div className="text-4xl">🖥️</div>
              <h2 className="mt-2 text-2xl font-bold text-white">Life Hub на этом компьютере</h2>
              <p className="mb-5 mt-1 text-sm text-white/60">Добавить приложение в автозапуск Windows? Тогда напоминания будут приходить, даже если вы его не открывали.</p>
              <DesktopSetupFields value={desktopChoice} onChange={setDesktopChoice} />
            </div>
          )}

          {step === 'done' && (
            <div className="py-4 text-center">
              <div className="animate-[achievement-pop_700ms_ease-out] text-6xl">🎉</div>
              <h2 className="mt-3 text-2xl font-bold text-white">Всё готово{name ? `, ${name}` : ''}!</h2>
              <p className="mt-1 text-sm text-white/60">Пользуйтесь приложением — за действия начисляются XP и ачивки.</p>
              {created.length > 0 && (
                <div className="mx-auto mt-4 max-w-sm space-y-1 text-left">
                  {created.map((line) => (
                    <div key={line} className="flex items-center gap-2 rounded-xl bg-brand-mint/10 px-3 py-2 text-sm text-brand-mint/90">
                      <Check size={14} /> {line}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-6 py-4">
          {index > 0 && step !== 'done' ? (
            <button type="button" onClick={() => setStep(steps[index - 1] as StepId)} className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm text-white/60 hover:bg-white/10">
              <ChevronLeft size={16} /> Назад
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            disabled={saving || (step === 'interests' && interests.size === 0)}
            onClick={() =>
              step === 'hello' ? saveHello() : step === 'interests' ? saveInterests() : step === 'start' ? saveStart() : step === 'desktop' ? saveDesktop() : finish()
            }
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-mint px-5 py-2.5 text-sm font-bold text-brand-deep shadow-[0_4px_14px_rgba(39,233,181,0.3)] transition hover:brightness-110 disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
            {step === 'done' ? 'Поехали!' : 'Далее'}
            {step !== 'done' && !saving ? <ChevronRight size={16} /> : null}
          </button>
        </div>
      </div>
    </div>
  );
}

function Block({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-2 text-sm font-semibold text-white">
        {emoji} {title}
      </div>
      {children}
    </div>
  );
}

// Быстрые переходы для поиска: разделы и частые действия. keywords — синонимы для поиска.
export type SearchCommand = { id: string; emoji: string; label: string; hint: string; path: string; keywords: string };

export const SEARCH_COMMANDS: SearchCommand[] = [
  { id: 'dashboard', emoji: '🏠', label: 'Дэшборд', hint: 'главная', path: '/dashboard', keywords: 'главная домой дашборд dashboard обзор' },
  { id: 'profile', emoji: '👤', label: 'Профиль', hint: 'уровень, активность, витрина', path: '/profile-full', keywords: 'профиль я аватар уровень xp витрина' },
  { id: 'calendar', emoji: '📅', label: 'Календарь', hint: 'события и смены', path: '/calendar', keywords: 'календарь события смены даты расписание' },
  { id: 'finance', emoji: '💰', label: 'Финансы', hint: 'расходы, доходы, выписки', path: '/finance', keywords: 'финансы деньги расходы доходы траты выписка банк кредит бюджет' },
  { id: 'import-statement', emoji: '🧾', label: 'Загрузить выписку', hint: 'CSV из банка', path: '/finance?import=1', keywords: 'выписка импорт банк csv загрузить сбер тинькофф' },
  { id: 'study-plan', emoji: '🧠', label: 'План обучения', hint: 'расставить уроки в календаре', path: '/calendar?plan=1', keywords: 'план обучения расписание учёба учеба срок' },
  { id: 'languages', emoji: '🗣️', label: 'Языки', hint: 'словарь и тренировка', path: '/languages', keywords: 'языки язык словарь слова тренировка практика японский английский' },
  { id: 'courses', emoji: '🎓', label: 'Курсы', hint: 'курсы и курсы-тренировки', path: '/courses', keywords: 'курсы курс уроки обучение учеба учёба duolingo дуолинго' },
  { id: 'import-course', emoji: '📦', label: 'Импорт курса', hint: 'загрузить JSON от ИИ', path: '/courses?import=1', keywords: 'импорт курса загрузить json ии' },
  { id: 'ai-template', emoji: '✨', label: 'Шаблон курса для ИИ', hint: 'промпт и пример', path: '/courses?template=1', keywords: 'шаблон промпт ии нейросеть chatgpt claude пример' },
  { id: 'goals', emoji: '🎯', label: 'Цели на год', hint: 'прогресс и отметки', path: '/year-goals', keywords: 'цели цель год годовые' },
  { id: 'pages', emoji: '📝', label: 'Страницы', hint: 'заметки и конспекты', path: '/pages', keywords: 'страницы заметки дневник конспект журнал' },
  { id: 'habits', emoji: '✅', label: 'Привычки', hint: 'отметить за сегодня', path: '/habits', keywords: 'привычки привычка отметить трекер' },
  { id: 'missions', emoji: '🔥', label: 'Ежедневные задания', hint: 'награды и очки', path: '/daily-missions', keywords: 'задания миссии награды очки квесты ежедневные' },
  { id: 'achievements', emoji: '🏆', label: 'Ачивки', hint: 'все достижения', path: '/achievements', keywords: 'ачивки достижения награды значки' },
  { id: 'travel', emoji: '✈️', label: 'Путешествия', hint: 'планы поездок', path: '/travel', keywords: 'путешествия поездки отпуск' },
  { id: 'reports', emoji: '📊', label: 'Отчёты', hint: 'итоги недели и месяца', path: '/reports', keywords: 'отчеты отчёты статистика итоги' },
  { id: 'reminders', emoji: '🔔', label: 'Напоминания', hint: 'настройки уведомлений', path: '/settings', keywords: 'напоминания уведомления сова настройки' },
  { id: 'settings', emoji: '⚙️', label: 'Настройки', hint: 'интеграции и интерфейс', path: '/settings', keywords: 'настройки параметры погода google напоминания' },
];

const normalize = (value: string) => value.toLowerCase().replace(/ё/g, 'е').trim();

export function matchCommands(query: string, limit = 6): SearchCommand[] {
  const q = normalize(query);
  if (!q) return [];
  return SEARCH_COMMANDS.map((command) => {
    const label = normalize(command.label);
    const haystack = `${label} ${normalize(command.keywords)} ${normalize(command.hint)}`;
    const score = label.startsWith(q) ? 3 : label.includes(q) ? 2 : haystack.includes(q) ? 1 : 0;
    return { command, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.command);
}

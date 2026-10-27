// Стартовый набор ачивок. Добавляется один раз при первом запуске (по коду `code`),
// дальше всё редактируется в админке: Пользователи → Ачивки.
// [code, title, description, icon, action, condition, threshold, xp, rarity]
const RAW = [
  // Общее
  ['first_login', 'Добро пожаловать!', 'Впервые войдите в Life Hub', '👋', 'app.open', 'count', 1, 10, 'common'],
  ['week_regular', 'Завсегдатай', 'Заходите в приложение 7 разных дней', '📅', 'app.open', 'days', 7, 50, 'common'],
  ['month_regular', 'Свой человек', 'Заходите в приложение 30 разных дней', '🏠', 'app.open', 'days', 30, 150, 'rare'],
  ['streak_7', 'Неделя без пропусков', 'Открывайте приложение 7 дней подряд', '🔥', 'app.open', 'streak', 7, 100, 'rare'],
  ['streak_30', 'Железная дисциплина', 'Открывайте приложение 30 дней подряд', '⚡', 'app.open', 'streak', 30, 400, 'epic'],
  ['night_owl', 'Сова', 'Загляните в приложение глубокой ночью', '🦉', 'app.open_night', 'count', 1, 20, 'rare'],
  ['early_bird', 'Жаворонок', 'Откройте приложение до 8 утра', '🐦', 'app.open_morning', 'count', 1, 20, 'rare'],
  ['explorer', 'Исследователь', 'Найдите поиск по сайту и воспользуйтесь им', '🔎', 'search.use', 'count', 1, 15, 'common'],
  ['desktop', 'На рабочем столе', 'Откройте десктоп-версию Life Hub', '🖥️', 'app.desktop_open', 'count', 1, 30, 'rare'],
  ['mobile', 'В кармане', 'Откройте Life Hub на телефоне', '📱', 'app.mobile_open', 'count', 1, 30, 'rare'],
  ['mobile_week', 'Всегда с собой', 'Открывайте приложение на телефоне 7 дней подряд', '🤳', 'app.mobile_open', 'streak', 7, 120, 'epic'],

  // Профиль
  ['avatar', 'Новое лицо', 'Загрузите аватар', '🖼️', 'profile.avatar', 'count', 1, 20, 'common'],
  ['banner', 'Красота!', 'Загрузите баннер профиля', '🎨', 'profile.banner', 'count', 1, 20, 'common'],
  ['about_me', 'Пару слов о себе', 'Заполните поле «О себе»', '✍️', 'profile.bio', 'count', 1, 15, 'common'],

  // Уровни
  ['level_5', 'Разогрев', 'Достигните 5 уровня', '⭐', 'stat.level', 'value', 5, 50, 'common'],
  ['level_10', 'В ударе', 'Достигните 10 уровня', '🌟', 'stat.level', 'value', 10, 150, 'rare'],
  ['level_25', 'Легенда', 'Достигните 25 уровня', '👑', 'stat.level', 'value', 25, 500, 'legendary'],
  ['collector_10', 'Коллекционер', 'Получите 10 ачивок', '🏅', 'stat.achievements', 'value', 10, 100, 'rare'],

  // Привычки
  ['habit_first', 'Первый шаг', 'Создайте первую привычку', '🌱', 'habit.create', 'count', 1, 15, 'common'],
  ['habit_check_1', 'Начало положено', 'Отметьте привычку впервые', '✅', 'stat.habit_checks', 'value', 1, 10, 'common'],
  ['habit_check_50', 'Привычка — вторая натура', 'Сделайте 50 отметок привычек', '💪', 'stat.habit_checks', 'value', 50, 100, 'rare'],
  ['habit_check_365', 'Год упорства', 'Сделайте 365 отметок привычек', '🏆', 'stat.habit_checks', 'value', 365, 500, 'legendary'],
  ['habit_streak_7', 'Семь дней силы', 'Отмечайте привычки 7 дней подряд', '🔗', 'habit.check', 'streak', 7, 100, 'rare'],
  ['habit_combo', 'Комбо', 'Отметьте 5 привычек за один день', '🎯', 'stat.habit_best_day', 'value', 5, 60, 'rare'],

  // Языки
  ['lang_first', 'Полиглот-новичок', 'Добавьте первый язык', '🗣️', 'language.create', 'count', 1, 15, 'common'],
  ['lang_two', 'Полиглот', 'Изучайте 3 языка одновременно', '🌍', 'stat.languages', 'value', 3, 100, 'epic'],
  ['vocab_10', 'Первые слова', 'Добавьте 10 слов в словарь', '📖', 'stat.vocab', 'value', 10, 20, 'common'],
  ['vocab_100', 'Словарный запас', 'Соберите 100 слов в словаре', '📚', 'stat.vocab', 'value', 100, 120, 'rare'],
  ['vocab_learned_50', 'Запомнил!', 'Выучите 50 слов (3+ верных повтора)', '🧠', 'stat.vocab_learned', 'value', 50, 150, 'epic'],
  ['practice_first', 'Тренировка', 'Пройдите первую тренировку словаря', '🎮', 'practice.complete', 'count', 1, 15, 'common'],
  ['practice_perfect', 'Без единой ошибки', 'Пройдите тренировку без ошибок', '💯', 'practice.perfect', 'count', 1, 40, 'rare'],
  ['lang_streak_7', 'Языковая неделя', 'Занимайтесь языком 7 дней подряд', '🔥', 'stat.language_streak', 'value', 7, 120, 'rare'],

  // Обучение (уроки)
  ['learn_import', 'Свой курс', 'Импортируйте курс-тренировку', '📦', 'learn.course_import', 'count', 1, 20, 'common'],
  ['lesson_first', 'Урок 1 пройден', 'Пройдите первый урок', '🎓', 'learn.lesson_complete', 'count', 1, 20, 'common'],
  ['lesson_10', 'Ученик', 'Пройдите 10 уроков', '📘', 'stat.learn_lessons', 'value', 10, 100, 'rare'],
  ['lesson_50', 'Отличник', 'Пройдите 50 уроков', '🎖️', 'stat.learn_lessons', 'value', 50, 300, 'epic'],
  ['lesson_perfect_5', 'Перфекционист', 'Пройдите 5 уроков без ошибок', '💎', 'learn.lesson_perfect', 'count', 5, 120, 'rare'],
  ['lesson_streak_5', 'Пять дней учёбы', 'Проходите уроки 5 дней подряд', '📆', 'learn.lesson_complete', 'streak', 5, 120, 'rare'],
  ['unit_done', 'Раздел закрыт', 'Завершите раздел курса', '🧩', 'learn.unit_complete', 'count', 1, 80, 'rare'],
  ['course_done', 'Выпускник', 'Пройдите курс-тренировку полностью', '🎉', 'learn.course_complete', 'count', 1, 300, 'legendary'],

  // Курсы
  ['course_first', 'Студент', 'Добавьте первый курс', '🎒', 'course.create', 'count', 1, 15, 'common'],
  ['course_finished', 'Дошёл до конца', 'Завершите курс на 100%', '🏁', 'stat.courses_done', 'value', 1, 120, 'rare'],

  // Цели
  ['goal_first', 'Мечтатель', 'Поставьте годовую цель', '🎯', 'goal.create', 'count', 1, 15, 'common'],
  ['goal_checks_30', 'Шаг за шагом', 'Отметьте прогресс по целям 30 раз', '🪜', 'stat.goal_checkins', 'value', 30, 100, 'rare'],
  ['goal_done', 'Цель достигнута', 'Выполните годовую цель', '🥇', 'stat.goals_done', 'value', 1, 300, 'epic'],

  // Задания
  ['mission_first', 'Охотник за наградами', 'Заберите первую награду за задание', '🎁', 'mission.claim', 'count', 1, 10, 'common'],
  ['mission_50', 'Исполнительный', 'Заберите 50 наград за задания', '📋', 'stat.missions_claimed', 'value', 50, 150, 'rare'],
  ['mission_full_day', 'Идеальный день', 'Наберите 500 очков заданий за день', '☀️', 'stat.mission_full_days', 'value', 1, 80, 'rare'],
  ['mission_full_10', 'Десять идеальных дней', 'Наберите 500 очков за день 10 раз', '🌈', 'stat.mission_full_days', 'value', 10, 300, 'epic'],
  ['weekly_first', 'Неделя удалась', 'Выполните задание недели', '🗓️', 'stat.weekly_missions', 'value', 1, 50, 'common'],

  // Фитнес
  ['steps_10k', '10 000 шагов', 'Пройдите 10 000 шагов за день', '👟', 'stat.steps_best_day', 'value', 10000, 60, 'common'],
  ['steps_20k', 'Марафонец', 'Пройдите 20 000 шагов за день', '🏃', 'stat.steps_best_day', 'value', 20000, 150, 'epic'],
  ['steps_million', 'Миллионер', 'Пройдите миллион шагов суммарно', '🌍', 'stat.steps_total', 'value', 1000000, 400, 'legendary'],
  ['sleep_good', 'Выспался', '7 ночей со сном 7+ часов', '😴', 'stat.sleep_good_days', 'value', 7, 60, 'common'],

  // Страницы, календарь, финансы, путешествия
  ['page_first', 'Писатель', 'Создайте первую страницу', '📝', 'page.create', 'count', 1, 10, 'common'],
  ['page_25', 'Летописец', 'Создайте 25 страниц', '📜', 'stat.pages', 'value', 25, 120, 'rare'],
  ['calendar_first', 'Планировщик', 'Добавьте событие в календарь', '🗓️', 'calendar.create', 'count', 1, 10, 'common'],
  ['travel_first', 'Путешественник', 'Запланируйте поездку', '✈️', 'travel.create', 'count', 1, 20, 'common'],
  ['bank_import', 'Бухгалтер', 'Импортируйте банковскую выписку', '🏦', 'bank.import', 'count', 1, 20, 'common'],
  ['loan_closed', 'Свобода от долгов', 'Закройте кредит', '🕊️', 'stat.loans_closed', 'value', 1, 200, 'epic'],
];

export const DEFAULT_ACHIEVEMENTS = RAW.map(
  ([code, title, description, icon, action, condition_type, threshold, xp_reward, rarity], index) => ({
    code,
    title,
    description,
    icon,
    category: null,
    action,
    condition_type,
    threshold,
    xp_reward,
    rarity,
    sort_order: index,
  })
);

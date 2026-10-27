// Каталог действий, к которым можно привязать ачивку.
//
// kind:
//   event  — серверное событие: засчитывается автоматически, когда успешный запрос к API
//            совпадает с `match` (или когда код явно вызывает trackAction с этим ключом).
//   client — событие из интерфейса (визит страницы, использование функции); клиент шлёт
//            POST /api/achievements/track. Принимаются только ключи с kind=client.
//   stat   — значение считается из базы на лету (`compute`). Удобно для накопительных
//            показателей, которые существовали ещё до появления ачивок.
//   manual — ачивку выдаёт только администратор вручную.
//
// Для event/client ачивок условие задаётся типом: count (сколько раз всего),
// days (в скольких разных днях), streak (лучшая серия дней подряд).
// Для stat — всегда value (значение >= порога).

const id = '(\\d+)';
const p = (pattern) => new RegExp(`^${pattern}/?$`);
const truthy = (value) => value === undefined || value === null ? true : !!value && value !== 'false' && value !== 0;

const one = async (db, sql, params) => {
  const row = await db.get(sql, params);
  if (!row) return 0;
  const value = Object.values(row)[0];
  return Number(value) || 0;
};

const ev = (category, key, label, method, path, extra = {}) => ({
  key,
  label,
  category,
  kind: 'event',
  match: { method, path: p(path), ...extra },
});

const explicit = (category, key, label, extra = {}) => ({ key, label, category, kind: 'event', ...extra });
const client = (category, key, label) => ({ key, label, category, kind: 'client' });
const stat = (category, key, label, compute, unit) => ({ key, label, category, kind: 'stat', unit, compute });

export const ACTION_CATALOG = [
  // ───────── Общее ─────────
  explicit('Общее', 'auth.login', 'Вход в аккаунт'),
  explicit('Общее', 'auth.register', 'Регистрация аккаунта'),
  client('Общее', 'app.open', 'Открыть приложение'),
  explicit('Общее', 'app.open_night', 'Открыть приложение ночью (00:00–05:00)'),
  explicit('Общее', 'app.open_morning', 'Открыть приложение рано утром (05:00–08:00)'),
  explicit('Общее', 'app.open_weekend', 'Открыть приложение в выходной'),
  client('Общее', 'app.desktop_open', 'Открыть десктоп-приложение (Electron)'),
  client('Общее', 'app.mobile_open', 'Открыть приложение для Android'),
  client('Общее', 'search.use', 'Воспользоваться поиском по сайту'),
  client('Общее', 'menu.collapse', 'Свернуть боковое меню'),
  client('Общее', 'theme.customize', 'Настроить часы / оформление в меню'),
  ev('Общее', 'feed.add', 'Добавить запись в ленту', 'POST', '/api/life/feed/add'),
  ev('Общее', 'xp.manual', 'Начислить XP вручную', 'POST', '/api/life/xp/add'),
  client('Общее', 'report.view', 'Открыть отчёт'),
  client('Общее', 'report.download', 'Скачать отчёт картинкой'),
  ev('Общее', 'pdf.upload', 'Загрузить PDF', 'POST', '/api/life/uploads/pdf'),
  client('Общее', 'pdf.read', 'Открыть PDF в читалке'),
  client('Общее', 'timer.complete', 'Дождаться окончания таймера обратного отсчёта'),
  client('Общее', 'master.use', 'Воспользоваться мастером создания'),
  client('Общее', 'quick_setup.complete', 'Пройти быструю настройку'),

  // ───────── Визиты страниц ─────────
  client('Навигация', 'visit.dashboard', 'Открыть Дэшборд'),
  client('Навигация', 'visit.profile', 'Открыть свой профиль'),
  client('Навигация', 'visit.public_profile', 'Открыть публичный профиль'),
  client('Навигация', 'visit.calendar', 'Открыть Календарь'),
  client('Навигация', 'visit.languages', 'Открыть Языки'),
  client('Навигация', 'visit.learn', 'Открыть курс-тренировку'),
  client('Навигация', 'visit.courses', 'Открыть Курсы'),
  client('Навигация', 'visit.goals', 'Открыть Цели на год'),
  client('Навигация', 'visit.pages', 'Открыть Страницы'),
  client('Навигация', 'visit.habits', 'Открыть Привычки'),
  client('Навигация', 'visit.missions', 'Открыть Ежедневные задания'),
  client('Навигация', 'visit.weekly_missions', 'Открыть Задания недели'),
  client('Навигация', 'visit.travel', 'Открыть Путешествия'),
  client('Навигация', 'visit.reports', 'Открыть Отчёты'),
  client('Навигация', 'visit.finance', 'Открыть Финансы'),
  client('Навигация', 'visit.settings', 'Открыть Настройки'),
  client('Навигация', 'visit.achievements', 'Открыть список ачивок'),

  // ───────── Профиль и настройки ─────────
  ev('Профиль', 'profile.update', 'Обновить профиль', 'POST', '/api/life/profile'),
  ev('Профиль', 'profile.avatar', 'Загрузить аватар', 'POST', '/api/life/profile', { when: (req) => !!req.files?.avatar }),
  ev('Профиль', 'profile.banner', 'Загрузить баннер профиля', 'POST', '/api/life/profile', { when: (req) => !!req.files?.banner }),
  ev('Профиль', 'profile.bio', 'Заполнить «О себе»', 'POST', '/api/life/profile', { when: (req) => typeof req.body?.bio === 'string' && req.body.bio.trim().length > 0 }),
  ev('Профиль', 'profile.city', 'Указать город', 'POST', '/api/life/profile', { when: (req) => typeof req.body?.city === 'string' && req.body.city.trim().length > 0 }),
  ev('Профиль', 'settings.ui', 'Изменить настройки интерфейса', 'PUT', '/api/life/ui-settings'),
  ev('Профиль', 'settings.weather', 'Настроить погоду', 'POST', '/api/life/settings/weather'),
  ev('Профиль', 'settings.google', 'Подключить Google', 'POST', '/api/life/settings/google'),

  // ───────── Финансы ─────────
  ev('Финансы', 'loan.create', 'Добавить кредит', 'POST', '/api/loans'),
  ev('Финансы', 'loan.update', 'Изменить кредит', 'PUT', `/api/loans/${id}`),
  ev('Финансы', 'loan.delete', 'Удалить кредит', 'DELETE', `/api/loans/${id}`),
  ev('Финансы', 'bank.import', 'Импортировать банковскую выписку', 'POST', '/api/banks/import/csv'),
  ev('Финансы', 'expense.add', 'Записать расход или доход вручную', 'POST', '/api/banks/transactions'),
  ev('Финансы', 'expense.delete', 'Удалить запись о расходе', 'DELETE', `/api/banks/transactions/${id}`),

  // ───────── Календарь ─────────
  ev('Календарь', 'calendar.create', 'Создать событие в календаре', 'POST', '/api/life/calendar'),
  ev('Календарь', 'calendar.update', 'Изменить событие', 'PUT', `/api/life/calendar/${id}`),
  ev('Календарь', 'calendar.delete', 'Удалить событие', 'DELETE', `/api/life/calendar/${id}`),
  ev('Календарь', 'calendar.shifts_auto', 'Сгенерировать смены автоматически', 'POST', '/api/life/calendar/auto-shifts'),
  ev('Календарь', 'calendar.shifts_clear', 'Очистить смены', 'POST', '/api/life/calendar/clear-shifts'),
  ev('Календарь', 'calendar.mood', 'Отметить настроение в событии', 'POST', '/api/life/calendar', { when: (req) => req.body?.mood != null }),

  // ───────── Языки ─────────
  ev('Языки', 'language.create', 'Добавить язык', 'POST', '/api/life/languages'),
  ev('Языки', 'language.update', 'Изменить язык', 'PUT', `/api/life/languages/${id}`),
  ev('Языки', 'language.archive', 'Отправить язык в архив', 'DELETE', `/api/life/languages/${id}`),
  ev('Языки', 'language.restore', 'Вернуть язык из архива', 'POST', `/api/life/languages/${id}/restore`),
  ev('Языки', 'language.page_link', 'Привязать страницу к языку', 'POST', '/api/life/language-pages'),
  ev('Языки', 'language.page_done', 'Отметить страницу языка изученной', 'PATCH', `/api/life/language-pages/${id}`, { when: (req) => req.body?.done === true || req.body?.done === 1 }),
  ev('Языки', 'language.pdf_add', 'Добавить PDF-страницу к языку', 'POST', '/api/life/language-pdf-pages'),
  ev('Языки', 'language.pdf_done', 'Отметить PDF-страницу языка изученной', 'PATCH', `/api/life/language-pdf-pages/${id}`, { when: (req) => req.body?.done === true || req.body?.done === 1 }),
  ev('Языки', 'vocab.add', 'Добавить слово в словарь (за каждое слово)', 'POST', `/api/life/languages/${id}/vocab`, {
    amount: (req) => (Array.isArray(req.body?.items) ? req.body.items.length : 1),
  }),
  ev('Языки', 'vocab.bulk_add', 'Массово добавить 10+ слов за раз', 'POST', `/api/life/languages/${id}/vocab`, {
    when: (req) => Array.isArray(req.body?.items) && req.body.items.length >= 10,
  }),
  ev('Языки', 'vocab.edit', 'Отредактировать слово', 'PUT', `/api/life/languages/vocab/${id}`),
  ev('Языки', 'vocab.delete', 'Удалить слово', 'DELETE', `/api/life/languages/vocab/${id}`),
  explicit('Языки', 'practice.complete', 'Завершить тренировку словаря'),
  explicit('Языки', 'practice.perfect', 'Пройти тренировку словаря без ошибок'),
  explicit('Языки', 'practice.correct', 'Верный ответ в тренировке (за каждый)'),
  explicit('Языки', 'practice.goal_reached', 'Выполнить дневную цель по XP языка'),
  client('Языки', 'kana.train', 'Потренироваться в тренажёре каны'),

  // ───────── Курсы-тренировки (как Duolingo) ─────────
  explicit('Обучение', 'learn.course_import', 'Импортировать курс-тренировку'),
  explicit('Обучение', 'learn.course_delete', 'Удалить курс-тренировку'),
  explicit('Обучение', 'learn.course_export', 'Экспортировать курс-тренировку'),
  explicit('Обучение', 'learn.lesson_complete', 'Пройти урок'),
  explicit('Обучение', 'learn.lesson_perfect', 'Пройти урок без ошибок'),
  explicit('Обучение', 'learn.lesson_repeat', 'Повторить уже пройденный урок'),
  explicit('Обучение', 'learn.unit_complete', 'Закончить раздел курса'),
  explicit('Обучение', 'learn.checkpoint_complete', 'Написать контрольную раздела'),
  explicit('Языки', 'practice.kana', 'Угадать знак каны в тренажёре (за каждый)'),
  explicit('Обучение', 'learn.checkpoint_pass', 'Сдать контрольную раздела (80%+)'),
  explicit('Обучение', 'learn.course_complete', 'Пройти курс-тренировку целиком'),
  explicit('Обучение', 'learn.correct', 'Верный ответ в уроке (за каждый)'),
  explicit('Обучение', 'learn.words_learned', 'Выучить новое слово в уроке (за каждое)'),
  explicit('Обучение', 'learn.lesson_fail', 'Потерять все сердечки в уроке'),
  client('Обучение', 'learn.template_copy', 'Скопировать шаблон курса для ИИ'),
  client('Обучение', 'learn.listen', 'Прослушать произношение слова'),

  // ───────── Курсы ─────────
  ev('Курсы', 'course.create', 'Добавить курс', 'POST', '/api/life/courses'),
  ev('Курсы', 'course.update', 'Обновить курс', 'PUT', `/api/life/courses/${id}`),
  ev('Курсы', 'course.complete', 'Завершить курс (100%)', 'PUT', `/api/life/courses/${id}`, {
    when: (req) => Number(req.body?.progress) >= 100 || req.body?.status === 'done' || req.body?.status === 'completed',
  }),
  ev('Курсы', 'course.archive', 'Отправить курс в архив', 'DELETE', `/api/life/courses/${id}`),
  ev('Курсы', 'course.restore', 'Вернуть курс из архива', 'POST', `/api/life/courses/${id}/restore`),
  ev('Курсы', 'course.page_link', 'Привязать страницу к курсу', 'POST', '/api/life/course-pages'),
  ev('Курсы', 'course.page_done', 'Отметить страницу курса пройденной', 'PATCH', `/api/life/course-pages/${id}`, { when: (req) => req.body?.done === true || req.body?.done === 1 }),
  ev('Курсы', 'course.pdf_add', 'Добавить PDF-страницу к курсу', 'POST', '/api/life/course-pdf-pages'),
  ev('Курсы', 'course.pdf_done', 'Отметить PDF-страницу курса пройденной', 'PATCH', `/api/life/course-pdf-pages/${id}`, { when: (req) => req.body?.done === true || req.body?.done === 1 }),

  // ───────── Цели ─────────
  ev('Цели', 'goal.create', 'Поставить годовую цель', 'POST', '/api/life/yearly-goals'),
  ev('Цели', 'goal.update', 'Изменить цель', 'PATCH', `/api/life/yearly-goals/${id}`),
  ev('Цели', 'goal.archive', 'Архивировать цель', 'PATCH', `/api/life/yearly-goals/${id}`, { when: (req) => req.body?.status === 'archived' }),
  ev('Цели', 'goal.delete', 'Удалить цель', 'DELETE', `/api/life/yearly-goals/${id}`),
  ev('Цели', 'goal.check', 'Отметить прогресс по цели', 'POST', `/api/life/yearly-goals/${id}/check`, { when: (req) => truthy(req.body?.checked) }),
  ev('Цели', 'goal.uncheck', 'Снять отметку по цели', 'POST', `/api/life/yearly-goals/${id}/check`, { when: (req) => req.body?.checked === false }),

  // ───────── Привычки ─────────
  ev('Привычки', 'habit.create', 'Создать привычку', 'POST', '/api/life/habits'),
  ev('Привычки', 'habit.update', 'Изменить привычку', 'PUT', `/api/life/habits/${id}`),
  ev('Привычки', 'habit.delete', 'Удалить привычку', 'DELETE', `/api/life/habits/${id}`),
  ev('Привычки', 'habit.check', 'Отметить выполнение привычки', 'POST', '/api/life/habits/checks', { when: (req) => truthy(req.body?.done) }),
  ev('Привычки', 'habit.uncheck', 'Снять отметку привычки', 'POST', '/api/life/habits/checks', { when: (req) => req.body?.done === false }),

  // ───────── Задания ─────────
  ev('Задания', 'mission.claim', 'Забрать награду за ежедневное задание', 'POST', `/api/life/daily-missions/${id}/complete`),
  ev('Задания', 'mission.unclaim', 'Отменить выполнение задания', 'DELETE', `/api/life/daily-missions/${id}/complete`),
  ev('Задания', 'mission.create', 'Создать своё задание', 'POST', '/api/life/daily-missions'),
  ev('Задания', 'mission.update', 'Изменить задание', 'PUT', `/api/life/daily-missions/${id}`),
  ev('Задания', 'mission.delete', 'Удалить задание', 'DELETE', `/api/life/daily-missions/${id}`),
  explicit('Задания', 'mission.weekly_complete', 'Выполнить задание недели'),
  explicit('Задания', 'mission.daily_bonus', 'Получить бонус за все ежедневные задания'),

  // ───────── Страницы ─────────
  ev('Страницы', 'page.create', 'Создать страницу', 'POST', '/api/life/pages'),
  ev('Страницы', 'page.update', 'Отредактировать страницу', 'PUT', `/api/life/pages/${id}`),
  ev('Страницы', 'page.delete', 'Удалить страницу', 'DELETE', `/api/life/pages/${id}`),
  ev('Страницы', 'page.tags', 'Проставить теги странице', 'PUT', `/api/life/pages/${id}/tags`),
  ev('Страницы', 'tag.create', 'Создать тег', 'POST', '/api/life/pages/tags'),
  ev('Страницы', 'tag.update', 'Изменить тег', 'PUT', `/api/life/pages/tags/${id}`),
  ev('Страницы', 'tag.delete', 'Удалить тег', 'DELETE', `/api/life/pages/tags/${id}`),
  ev('Страницы', 'journal.create', 'Создать запись дневника', 'POST', '/api/life/journal'),
  ev('Страницы', 'journal.page_create', 'Создать страницу журнала', 'POST', '/api/life/journal-pages'),
  ev('Страницы', 'journal.page_update', 'Изменить страницу журнала', 'PUT', `/api/life/journal-pages/${id}`),

  // ───────── Путешествия ─────────
  ev('Путешествия', 'travel.create', 'Запланировать путешествие', 'POST', '/api/life/travel'),
  ev('Путешествия', 'travel.update', 'Изменить путешествие', 'PUT', `/api/life/travel/${id}`),
  ev('Путешествия', 'travel.done', 'Отметить путешествие завершённым', 'PUT', `/api/life/travel/${id}`, { when: (req) => req.body?.status === 'done' || req.body?.status === 'completed' }),
  ev('Путешествия', 'travel.delete', 'Удалить путешествие', 'DELETE', `/api/life/travel/${id}`),

  // ───────── Соцсети ─────────

  // ───────── Администрирование ─────────
  ev('Админ', 'admin.user_update', 'Изменить пользователя в админке', 'PATCH', `/api/admin/users/${id}`),
  ev('Админ', 'admin.achievement_edit', 'Создать / изменить ачивку', 'POST', '/api/admin/achievements'),

  // ───────── Статистика (считается из базы) ─────────
  stat('Прогресс', 'stat.xp_total', 'Всего XP', (db, uid) => one(db, 'SELECT xp FROM user_xp WHERE user_id=?', [uid]), 'XP'),
  stat('Прогресс', 'stat.level', 'Уровень', (db, uid) => one(db, 'SELECT level FROM user_xp WHERE user_id=?', [uid]), 'ур.'),
  stat('Прогресс', 'stat.achievements', 'Получено ачивок', (db, uid) => one(db, 'SELECT COUNT(*) FROM user_achievements WHERE user_id=?', [uid]), 'шт.'),
  stat('Прогресс', 'stat.account_age_days', 'Дней с регистрации (по первому действию)', async (db, uid) => {
    const first = await db.get('SELECT MIN(date) AS d FROM user_action_log WHERE user_id=?', [uid]);
    if (!first?.d) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(`${first.d}T00:00:00Z`).getTime()) / 86400000));
  }, 'дн.'),
  stat('Прогресс', 'stat.active_days', 'Дней, когда вы заходили в приложение', (db, uid) => one(db, "SELECT COUNT(DISTINCT date) FROM user_action_log WHERE user_id=?", [uid]), 'дн.'),
  stat('Прогресс', 'stat.feed_entries', 'Записей в ленте активности', (db, uid) => one(db, 'SELECT COUNT(*) FROM life_feed WHERE user_id=?', [uid]), 'шт.'),

  stat('Привычки', 'stat.habits', 'Количество привычек', (db, uid) => one(db, 'SELECT COUNT(*) FROM habits WHERE user_id=?', [uid]), 'шт.'),
  stat('Привычки', 'stat.habit_checks', 'Всего отметок привычек', (db, uid) => one(db, 'SELECT COUNT(*) FROM habit_checks WHERE user_id=?', [uid]), 'раз'),
  stat('Привычки', 'stat.habit_days', 'Дней с отмеченными привычками', (db, uid) => one(db, 'SELECT COUNT(DISTINCT date) FROM habit_checks WHERE user_id=?', [uid]), 'дн.'),
  stat('Привычки', 'stat.habit_best_day', 'Максимум привычек за один день', (db, uid) => one(db, 'SELECT MAX(c) FROM (SELECT COUNT(*) c FROM habit_checks WHERE user_id=? GROUP BY date)', [uid]), 'шт.'),

  stat('Языки', 'stat.languages', 'Изучаемых языков', (db, uid) => one(db, 'SELECT COUNT(*) FROM languages WHERE user_id=?', [uid]), 'шт.'),
  stat('Языки', 'stat.vocab', 'Слов в словаре', (db, uid) => one(db, 'SELECT COUNT(*) FROM language_vocab WHERE user_id=?', [uid]), 'слов'),
  stat('Языки', 'stat.vocab_learned', 'Выученных слов (3+ верных повтора)', (db, uid) => one(db, 'SELECT COUNT(*) FROM language_vocab_srs WHERE user_id=? AND repetitions>=3', [uid]), 'слов'),
  stat('Языки', 'stat.language_streak', 'Лучшая серия занятий языком', (db, uid) => one(db, 'SELECT MAX(COALESCE(streak_best,0)) FROM languages WHERE user_id=?', [uid]), 'дн.'),
  stat('Языки', 'stat.practice_sessions', 'Дней с тренировкой словаря', (db, uid) => one(db, 'SELECT COUNT(*) FROM language_practice_sessions WHERE user_id=?', [uid]), 'дн.'),
  stat('Языки', 'stat.practice_correct', 'Верных ответов в тренировках словаря', (db, uid) => one(db, 'SELECT SUM(correct_count) FROM language_practice_sessions WHERE user_id=?', [uid]), 'отв.'),
  stat('Языки', 'stat.practice_xp', 'XP за тренировки словаря', (db, uid) => one(db, 'SELECT SUM(xp_earned) FROM language_practice_sessions WHERE user_id=?', [uid]), 'XP'),
  stat('Языки', 'stat.language_pages_done', 'Изученных страниц по языкам', (db, uid) => one(db, 'SELECT COUNT(*) FROM language_pages WHERE user_id=? AND done=1', [uid]), 'стр.'),

  stat('Обучение', 'stat.learn_courses', 'Курсов-тренировок импортировано', (db, uid) => one(db, 'SELECT COUNT(*) FROM lang_courses WHERE user_id=?', [uid]), 'шт.'),
  stat('Обучение', 'stat.learn_lessons', 'Пройдено уроков', (db, uid) => one(db, 'SELECT COUNT(*) FROM lang_lesson_progress WHERE user_id=? AND completed_count>0', [uid]), 'ур.'),
  stat('Обучение', 'stat.learn_perfect', 'Уроков пройдено на 100%', (db, uid) => one(db, 'SELECT COUNT(*) FROM lang_lesson_progress WHERE user_id=? AND best_score>=100', [uid]), 'ур.'),
  stat('Обучение', 'stat.learn_xp', 'XP за уроки', (db, uid) => one(db, 'SELECT SUM(xp_total) FROM lang_lesson_progress WHERE user_id=?', [uid]), 'XP'),
  stat('Обучение', 'stat.learn_courses_done', 'Курсов-тренировок пройдено полностью', (db, uid) =>
    one(
      db,
      `SELECT COUNT(*) FROM lang_courses c
       WHERE c.user_id=? AND (SELECT COUNT(*) FROM lang_lessons l WHERE l.course_id=c.id) > 0
         AND (SELECT COUNT(*) FROM lang_lessons l WHERE l.course_id=c.id)
           = (SELECT COUNT(*) FROM lang_lessons l JOIN lang_lesson_progress pr ON pr.lesson_id=l.id AND pr.user_id=c.user_id
              WHERE l.course_id=c.id AND pr.completed_count>0)`,
      [uid]
    ), 'шт.'),

  stat('Курсы', 'stat.courses', 'Курсов добавлено', (db, uid) => one(db, 'SELECT COUNT(*) FROM courses WHERE user_id=?', [uid]), 'шт.'),
  stat('Курсы', 'stat.courses_done', 'Курсов завершено', (db, uid) => one(db, "SELECT COUNT(*) FROM courses WHERE user_id=? AND (progress>=100 OR status IN ('done','completed'))", [uid]), 'шт.'),
  stat('Курсы', 'stat.course_pages_done', 'Пройденных страниц курсов', (db, uid) => one(db, 'SELECT COUNT(*) FROM course_pages WHERE user_id=? AND done=1', [uid]), 'стр.'),

  stat('Цели', 'stat.goals', 'Годовых целей', (db, uid) => one(db, 'SELECT COUNT(*) FROM yearly_goals WHERE user_id=?', [uid]), 'шт.'),
  stat('Цели', 'stat.goals_done', 'Выполненных годовых целей', (db, uid) => one(db, 'SELECT COUNT(*) FROM yearly_goals WHERE user_id=? AND target>0 AND completed>=target', [uid]), 'шт.'),
  stat('Цели', 'stat.goal_checkins', 'Отметок прогресса по целям', (db, uid) => one(db, 'SELECT COUNT(*) FROM yearly_goal_logs WHERE user_id=?', [uid]), 'раз'),
  stat('Цели', 'stat.goal_streak', 'Лучшая серия по цели', (db, uid) => one(db, 'SELECT MAX(COALESCE(streak_best,0)) FROM yearly_goals WHERE user_id=?', [uid]), 'дн.'),

  stat('Задания', 'stat.missions_claimed', 'Всего полученных наград за задания', (db, uid) => one(db, 'SELECT COUNT(*) FROM daily_mission_completions WHERE user_id=?', [uid]), 'шт.'),
  stat('Задания', 'stat.mission_points', 'Очков заданий за всё время', (db, uid) => one(db, 'SELECT SUM(points_awarded) FROM daily_mission_completions WHERE user_id=?', [uid]), 'очк.'),
  stat('Задания', 'stat.mission_full_days', 'Дней, когда набрано 500+ очков', (db, uid) => one(db, 'SELECT COUNT(*) FROM (SELECT date FROM daily_mission_completions WHERE user_id=? GROUP BY date HAVING SUM(points_awarded)>=500)', [uid]), 'дн.'),
  stat('Задания', 'stat.weekly_missions', 'Выполненных заданий недели', (db, uid) => one(db, 'SELECT COUNT(*) FROM weekly_mission_completions WHERE user_id=?', [uid]), 'шт.'),

  stat('Страницы', 'stat.pages', 'Создано страниц', (db, uid) => one(db, 'SELECT COUNT(*) FROM journal_pages WHERE user_id=?', [uid]), 'стр.'),
  stat('Страницы', 'stat.tags', 'Создано тегов', (db, uid) => one(db, 'SELECT COUNT(*) FROM tags WHERE user_id=?', [uid]), 'шт.'),
  stat('Календарь', 'stat.calendar_events', 'Событий в календаре', (db, uid) => one(db, 'SELECT COUNT(*) FROM calendar_events WHERE user_id=?', [uid]), 'шт.'),
  stat('Путешествия', 'stat.travels', 'Запланированных путешествий', (db, uid) => one(db, 'SELECT COUNT(*) FROM travel_plans WHERE user_id=?', [uid]), 'шт.'),
  stat('Путешествия', 'stat.travels_done', 'Завершённых путешествий', (db, uid) => one(db, "SELECT COUNT(*) FROM travel_plans WHERE user_id=? AND status IN ('done','completed')", [uid]), 'шт.'),
  stat('Финансы', 'stat.loans', 'Кредитов в учёте', (db, uid) => one(db, 'SELECT COUNT(*) FROM loans WHERE user_id=?', [uid]), 'шт.'),
  stat('Финансы', 'stat.loans_closed', 'Закрытых кредитов (остаток 0)', (db, uid) => one(db, 'SELECT COUNT(*) FROM loans WHERE user_id=? AND COALESCE(remaining,0)<=0', [uid]), 'шт.'),
  stat('Финансы', 'stat.transactions', 'Импортированных транзакций', (db, uid) => one(db, 'SELECT COUNT(*) FROM transactions WHERE user_id=?', [uid]), 'шт.'),

  stat('Фитнес', 'stat.steps_best_day', 'Рекорд шагов за день', (db, uid) => one(db, 'SELECT MAX(steps) FROM fitness_daily WHERE user_id=?', [uid]), 'шагов'),
  stat('Фитнес', 'stat.steps_total', 'Шагов за всё время', (db, uid) => one(db, 'SELECT SUM(steps) FROM fitness_daily WHERE user_id=?', [uid]), 'шагов'),
  stat('Фитнес', 'stat.days_10k', 'Дней с 10 000+ шагов', (db, uid) => one(db, 'SELECT COUNT(*) FROM fitness_daily WHERE user_id=? AND steps>=10000', [uid]), 'дн.'),
  stat('Фитнес', 'stat.days_5k', 'Дней с 5 000+ шагов', (db, uid) => one(db, 'SELECT COUNT(*) FROM fitness_daily WHERE user_id=? AND steps>=5000', [uid]), 'дн.'),
  stat('Фитнес', 'stat.calories_best_day', 'Рекорд активных калорий за день', (db, uid) => one(db, 'SELECT MAX(active_calories) FROM fitness_daily WHERE user_id=?', [uid]), 'ккал'),
  stat('Фитнес', 'stat.sleep_good_days', 'Ночей со сном 7+ часов', (db, uid) => one(db, 'SELECT COUNT(*) FROM fitness_daily WHERE user_id=? AND sleep_hours>=7', [uid]), 'ноч.'),
  stat('Фитнес', 'stat.fitness_days', 'Дней с данными фитнеса', (db, uid) => one(db, 'SELECT COUNT(*) FROM fitness_daily WHERE user_id=?', [uid]), 'дн.'),

  // ───────── Ручная выдача ─────────
  { key: 'manual', label: 'Выдаётся администратором вручную', category: 'Особые', kind: 'manual' },
];

export const ACTIONS_BY_KEY = new Map(ACTION_CATALOG.map((entry) => [entry.key, entry]));
export const MATCHABLE_ACTIONS = ACTION_CATALOG.filter((entry) => entry.match);

export const CONDITION_TYPES = {
  count: 'Сколько раз всего',
  days: 'В скольких разных днях',
  streak: 'Серия дней подряд',
  value: 'Значение показателя',
};

/** Действия, которые совершает сам пользователь (без вычисляемых показателей и навигации). */
export const goalActionCatalog = () =>
  ACTION_CATALOG.filter((entry) => (entry.kind === 'event' || entry.kind === 'client') && !['Навигация', 'Админ'].includes(entry.category) && !/^(app|auth|xp)\./.test(entry.key)).map(
    ({ key, label, category }) => ({ key, label, category })
  );

export const publicCatalog = () =>
  ACTION_CATALOG.map(({ key, label, category, kind, unit }) => ({ key, label, category, kind, unit: unit || null }));

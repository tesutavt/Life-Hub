// Формат курса-тренировки "lifehub-course@1".
// Полное описание с примерами — docs/COURSE_FORMAT.md. Здесь — нормализация и
// автогенерация упражнений, если в уроке заданы только слова.

export const FORMAT_ID = 'lifehub-course@1';

export const EXERCISE_TYPES = ['learn', 'theory', 'choice', 'translate', 'match', 'assemble', 'fill', 'listen'];

const LIMITS = { units: 100, lessonsPerUnit: 100, exercises: 80, words: 80, text: 2000 };

const str = (value, limit = 300) => (typeof value === 'string' ? value.trim().slice(0, limit) : typeof value === 'number' ? String(value) : '');
const list = (value) => (Array.isArray(value) ? value : []);
const strList = (value, limit = 300) => list(value).map((v) => str(v, limit)).filter(Boolean);
const shuffle = (items) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};
const uniq = (items) => [...new Set(items)];

export function normalizeWord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const term = str(raw.term ?? raw.word ?? raw.foreign);
  const translation = str(raw.translation ?? raw.meaning ?? raw.native);
  if (!term || !translation) return null;
  return {
    term,
    translation,
    reading: str(raw.reading ?? raw.transcription ?? raw.romaji) || null,
    note: str(raw.note, 500) || null,
    example: str(raw.example, 500) || null,
    example_translation: str(raw.example_translation, 500) || null,
    emoji: str(raw.emoji ?? raw.image, 16) || null,
    // Своя запись произношения (https://… или /uploads/…); без неё — автоматическая озвучка
    audio: /^(https?:\/\/|\/)/.test(str(raw.audio, 1000)) ? str(raw.audio, 1000) : null,
    alternatives: strList(raw.alternatives ?? raw.answers),
  };
}

/** Приводит упражнение к единому виду. Возвращает null, если упражнение некорректно. */
export function normalizeExercise(raw, words) {
  if (!raw || typeof raw !== 'object') return null;
  const type = str(raw.type).toLowerCase();
  const findWord = (term) => words.find((w) => w.term === term || w.translation === term) || null;

  switch (type) {
    case 'learn': {
      const word = typeof raw.word === 'string' ? findWord(raw.word) : normalizeWord(raw.word || raw);
      return word ? { type, word } : null;
    }
    case 'theory': {
      const text = str(raw.text ?? raw.content, LIMITS.text);
      return text ? { type, title: str(raw.title) || 'Подсказка', text } : null;
    }
    case 'choice': {
      const answer = str(raw.answer);
      const options = uniq([...strList(raw.options), answer].filter(Boolean));
      if (!answer || options.length < 2) return null;
      return { type, prompt: str(raw.prompt, 500) || 'Выберите правильный вариант', question: str(raw.question, 300) || null, options: shuffle(options), answer };
    }
    case 'translate': {
      const answers = uniq([...strList(raw.answers), str(raw.answer)].filter(Boolean));
      const prompt = str(raw.prompt ?? raw.text, 500);
      if (!prompt || !answers.length) return null;
      return { type, prompt, answers, hint: str(raw.hint, 300) || null, direction: raw.direction === 'to_target' ? 'to_target' : 'to_native' };
    }
    case 'match': {
      const pairs = list(raw.pairs)
        .map((pair) => (Array.isArray(pair) ? [str(pair[0]), str(pair[1])] : [str(pair?.term ?? pair?.left), str(pair?.translation ?? pair?.right)]))
        .filter(([a, b]) => a && b)
        .slice(0, 8);
      return pairs.length >= 2 ? { type, prompt: str(raw.prompt) || 'Соедините пары', pairs } : null;
    }
    case 'assemble': {
      const answer = str(raw.answer, 500);
      if (!answer) return null;
      const answerTokens = Array.isArray(raw.answer_tokens) ? strList(raw.answer_tokens) : answer.split(/\s+/).filter(Boolean);
      const extra = strList(raw.tokens ?? raw.distractors).filter((t) => !answerTokens.includes(t));
      return {
        type,
        prompt: str(raw.prompt, 500) || 'Соберите фразу',
        answer_tokens: answerTokens,
        tokens: shuffle([...answerTokens, ...extra]),
        separator: typeof raw.separator === 'string' ? raw.separator.slice(0, 3) : ' ',
      };
    }
    case 'fill': {
      const sentence = str(raw.sentence ?? raw.text, 500);
      const answer = str(raw.answer);
      if (!sentence.includes('___') || !answer) return null;
      const options = strList(raw.options);
      return {
        type,
        prompt: str(raw.prompt) || 'Заполните пропуск',
        sentence,
        answer,
        translation: str(raw.translation, 500) || null,
        options: options.length ? shuffle(uniq([...options, answer])) : null,
      };
    }
    case 'listen': {
      const text = str(raw.text, 500);
      const answers = uniq([...strList(raw.answers), str(raw.answer), text].filter(Boolean));
      return text ? { type, prompt: str(raw.prompt) || 'Напишите, что услышали', text, answers } : null;
    }
    default:
      return null;
  }
}

/** Генерирует упражнения из слов урока (если автор курса не задал их явно). */
export function generateExercises(words, pool, { speech = false } = {}) {
  const exercises = [];
  const others = (word, key) => shuffle(pool.filter((w) => w[key] !== word[key]).map((w) => w[key]));

  for (const word of words) exercises.push({ type: 'learn', word });

  for (const word of shuffle(words)) {
    const distractors = uniq(others(word, 'translation')).slice(0, 3);
    if (distractors.length >= 1) {
      exercises.push({
        type: 'choice',
        prompt: 'Как переводится?',
        question: word.term,
        options: shuffle([word.translation, ...distractors]),
        answer: word.translation,
      });
    }
  }

  if (words.length >= 2) {
    exercises.push({ type: 'match', prompt: 'Соедините пары', pairs: shuffle(words).slice(0, 5).map((w) => [w.term, w.translation]) });
  }

  for (const word of shuffle(words).slice(0, Math.ceil(words.length / 2))) {
    exercises.push({ type: 'translate', prompt: word.translation, answers: [word.term, ...(word.reading ? [word.reading] : [])], direction: 'to_target', hint: word.reading });
  }
  for (const word of shuffle(words).slice(0, Math.ceil(words.length / 2))) {
    exercises.push({ type: 'translate', prompt: word.term, answers: [word.translation, ...word.alternatives], direction: 'to_native', hint: null });
  }

  if (speech) {
    for (const word of shuffle(words).slice(0, 2)) {
      exercises.push({ type: 'listen', prompt: 'Напишите, что услышали', text: word.term, answers: [word.term, ...(word.reading ? [word.reading] : [])] });
    }
  }
  return exercises;
}

/** Валидирует и нормализует весь курс. Бросает Error с понятным текстом при ошибке. */
export function normalizeCourse(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!data || typeof data !== 'object') throw new Error('Файл курса пустой или не является JSON-объектом');
  const title = str(data.title, 160);
  if (!title) throw new Error('У курса нет поля "title"');
  const units = list(data.units).slice(0, LIMITS.units);
  if (!units.length) throw new Error('В курсе нет разделов: заполните массив "units"');

  const course = {
    format: FORMAT_ID,
    title,
    description: str(data.description, 1000) || null,
    from_language: str(data.from_language, 20) || null,
    to_language: str(data.to_language, 20) || null,
    speech_lang: str(data.speech_lang ?? data.tts_lang, 20) || null,
    icon: str(data.icon, 16) || '📘',
    color: str(data.color, 20) || null,
    units: [],
  };

  units.forEach((unitRaw, unitIndex) => {
    const unitTitle = str(unitRaw?.title, 160) || `Раздел ${unitIndex + 1}`;
    const lessons = list(unitRaw?.lessons).slice(0, LIMITS.lessonsPerUnit);
    const unit = { title: unitTitle, description: str(unitRaw?.description, 500) || null, color: str(unitRaw?.color, 20) || null, guide: str(unitRaw?.guide, 4000) || null, lessons: [] };
    lessons.forEach((lessonRaw, lessonIndex) => {
      const words = list(lessonRaw?.words).map(normalizeWord).filter(Boolean).slice(0, LIMITS.words);
      const exercises = list(lessonRaw?.exercises).map((ex) => normalizeExercise(ex, words)).filter(Boolean).slice(0, LIMITS.exercises);
      if (!words.length && !exercises.length) {
        throw new Error(`Урок ${lessonIndex + 1} в разделе «${unitTitle}» пустой: нужны "words" или "exercises"`);
      }
      unit.lessons.push({
        title: str(lessonRaw?.title, 160) || `Урок ${lessonIndex + 1}`,
        description: str(lessonRaw?.description, 500) || null,
        xp: Math.max(1, Math.min(100, Math.round(Number(lessonRaw?.xp) || 10))),
        words,
        exercises,
      });
    });
    if (unit.lessons.length) course.units.push(unit);
  });

  if (!course.units.length) throw new Error('Не найдено ни одного урока');
  return course;
}

import { FORMAT_ID } from './format.js';

export const EXAMPLE_COURSE = {
  format: FORMAT_ID,
  title: 'Японский: первые шаги',
  description: 'Приветствия, вежливые фразы и базовые слова.',
  from_language: 'ru',
  to_language: 'ja',
  speech_lang: 'ja-JP',
  icon: '🇯🇵',
  color: '#58cc02',
  units: [
    {
      title: 'Раздел 1. Знакомство',
      description: 'Здороваемся и прощаемся',
      color: '#58cc02',
      guide: 'В японском есть разные приветствия для разного времени суток: おはよう — утром, こんにちは — днём, こんばんは — вечером.',
      lessons: [
        {
          title: 'Урок 1. Приветствия',
          description: 'Здравствуйте, доброе утро, добрый вечер',
          xp: 10,
          words: [
            { term: 'こんにちは', translation: 'здравствуйте', reading: 'konnichiwa', emoji: '👋', alternatives: ['привет', 'добрый день'] },
            { term: 'おはよう', translation: 'доброе утро', reading: 'ohayou', emoji: '🌅' },
            { term: 'こんばんは', translation: 'добрый вечер', reading: 'konbanwa', emoji: '🌙' },
            { term: 'さようなら', translation: 'до свидания', reading: 'sayounara', emoji: '🚶' },
          ],
          exercises: [
            { type: 'theory', title: 'Как здороваться', text: 'こんにちは (konnichiwa) — универсальное «здравствуйте». Утром говорят おはよう, вечером — こんばんは.' },
            { type: 'learn', word: 'こんにちは' },
            { type: 'learn', word: 'おはよう' },
            { type: 'choice', prompt: 'Как переводится?', question: 'こんにちは', options: ['здравствуйте', 'спасибо', 'до свидания'], answer: 'здравствуйте' },
            { type: 'learn', word: 'こんばんは' },
            { type: 'learn', word: 'さようなら' },
            { type: 'match', pairs: [['こんにちは', 'здравствуйте'], ['おはよう', 'доброе утро'], ['こんばんは', 'добрый вечер'], ['さようなら', 'до свидания']] },
            { type: 'translate', prompt: 'доброе утро', answers: ['おはよう', 'ohayou'], direction: 'to_target', hint: 'ohayou' },
            { type: 'translate', prompt: 'さようなら', answers: ['до свидания', 'пока'], direction: 'to_native' },
            { type: 'listen', text: 'こんばんは', answers: ['こんばんは', 'konbanwa'] },
          ],
        },
        {
          title: 'Урок 2. Вежливость',
          description: 'Спасибо, пожалуйста, извините',
          words: [
            { term: 'ありがとう', translation: 'спасибо', reading: 'arigatou', emoji: '🙏' },
            { term: 'どうぞ', translation: 'пожалуйста (прошу)', reading: 'douzo', alternatives: ['пожалуйста'] },
            { term: 'すみません', translation: 'извините', reading: 'sumimasen', emoji: '🙇' },
            { term: 'はい', translation: 'да', reading: 'hai' },
            { term: 'いいえ', translation: 'нет', reading: 'iie' },
          ],
          exercises: [
            { type: 'assemble', prompt: 'Большое спасибо', answer: 'どうも ありがとう', tokens: ['すみません', 'はい'] },
            { type: 'fill', prompt: 'Заполните пропуск', sentence: '___ ございます', answer: 'ありがとう', translation: 'Спасибо (вежливо)', options: ['ありがとう', 'はい', 'いいえ'] },
          ],
        },
      ],
    },
    {
      title: 'Раздел 2. Числа',
      lessons: [
        {
          title: 'Урок 1. Один, два, три',
          words: [
            { term: 'いち', translation: 'один', reading: 'ichi', emoji: '1️⃣' },
            { term: 'に', translation: 'два', reading: 'ni', emoji: '2️⃣' },
            { term: 'さん', translation: 'три', reading: 'san', emoji: '3️⃣' },
          ],
        },
      ],
    },
  ],
};

export const AI_PROMPT = `Сгенерируй курс для изучения языка в формате JSON "${FORMAT_ID}" для приложения Life Hub (уроки в стиле Duolingo).

ПАРАМЕТРЫ КУРСА (заполни сам):
- Язык изучения: <ЯЗЫК, например японский>
- Язык объяснений: русский
- Уровень: <A0 / A1 / ...>
- Тема: <например «Путешествия»>
- Разделов: <N>, уроков в разделе: <M>, слов в уроке: 4–8

ТРЕБОВАНИЯ К ОТВЕТУ:
1. Выведи ТОЛЬКО валидный JSON без комментариев и без markdown-обёртки.
2. Корневой объект:
   { "format": "${FORMAT_ID}", "title", "description", "from_language" (ISO, напр. "ru"), "to_language" (ISO, напр. "ja"),
     "speech_lang" (BCP-47 для озвучки, напр. "ja-JP"), "icon" (эмодзи), "color" (hex), "units": [...] }
3. Раздел (unit): { "title", "description", "color", "guide" (короткое объяснение грамматики/темы), "lessons": [...] }
4. Урок (lesson): { "title" (напр. "Урок 1. Приветствия"), "description", "xp" (10–20), "words": [...], "exercises": [...] }
5. Слово (word): { "term" (на изучаемом языке), "translation" (на русском), "reading" (транскрипция/латиница, если письменность не латинская),
   "emoji", "note", "example", "example_translation", "alternatives" (другие допустимые переводы) }
6. Упражнения (exercises) — используй разные типы, 8–15 штук на урок, в порядке от простого к сложному:
   - {"type":"theory","title","text"} — короткое правило перед практикой
   - {"type":"learn","word":"<term из words>"} — карточка «запомни слово» (вводит новое слово)
   - {"type":"choice","prompt","question","options":[3–4 варианта],"answer"} — выбор перевода
   - {"type":"translate","prompt","answers":[все допустимые варианты],"direction":"to_native"|"to_target","hint"} — перевод с вводом текста
   - {"type":"match","pairs":[["term","перевод"], ...]} — соединить пары (3–5 пар)
   - {"type":"assemble","prompt":"фраза на русском","answer":"фраза на изучаемом языке, слова через пробел","tokens":[лишние слова-ловушки]} — собрать фразу из плиток
   - {"type":"fill","sentence":"фраза с ___ на месте пропуска","answer","options":[варианты],"translation"} — заполнить пропуск
   - {"type":"listen","text":"что озвучить","answers":[допустимые ответы]} — аудирование (озвучивается автоматически)
7. Каждое новое слово сначала вводится через "learn", потом закрепляется в 2+ других упражнениях.
8. Все "answer" обязаны точно совпадать с одним из "options" (для choice/fill).
9. Если упражнения не указаны, приложение сгенерирует их из "words" автоматически — но лучше указать.

Пример одного урока:
${JSON.stringify(EXAMPLE_COURSE.units[0].lessons[0], null, 2)}
`;

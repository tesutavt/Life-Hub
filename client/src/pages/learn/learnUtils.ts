import { resolveApiUrl } from '../../api';

export type Word = {
  term: string;
  translation: string;
  reading?: string | null;
  note?: string | null;
  example?: string | null;
  example_translation?: string | null;
  emoji?: string | null;
  audio?: string | null;
  alternatives?: string[];
};

export type Exercise =
  | { type: 'learn'; word: Word }
  | { type: 'theory'; title: string; text: string }
  | { type: 'choice'; prompt: string; question: string | null; options: string[]; answer: string }
  | { type: 'translate'; prompt: string; answers: string[]; hint: string | null; direction: 'to_native' | 'to_target' }
  | { type: 'match'; prompt: string; pairs: [string, string][] }
  | { type: 'assemble'; prompt: string; answer_tokens: string[]; tokens: string[]; separator: string }
  | { type: 'fill'; prompt: string; sentence: string; answer: string; translation: string | null; options: string[] | null }
  | { type: 'listen'; prompt: string; text: string; answers: string[] };

export const isGraded = (exercise: Exercise) => exercise.type !== 'learn' && exercise.type !== 'theory';

export const normalizeAnswer = (value: string) =>
  value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.,!?¿¡;:"'«»“”„()\-–—…。、！？「」]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const levenshtein = (a: string, b: string) => {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const curr = [i];
    for (let j = 1; j <= b.length; j += 1) {
      curr[j] = Math.min((prev[j] ?? 0) + 1, (curr[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = curr;
  }
  return prev[b.length] ?? 0;
};

/** 'exact' | 'typo' (засчитываем, но подсвечиваем) | 'wrong' */
export function gradeText(input: string, answers: string[]): 'exact' | 'typo' | 'wrong' {
  const value = normalizeAnswer(input);
  if (!value) return 'wrong';
  const normalized = answers.map(normalizeAnswer).filter(Boolean);
  if (normalized.includes(value)) return 'exact';
  const compact = value.replace(/\s/g, '');
  if (normalized.some((a) => a.replace(/\s/g, '') === compact)) return 'exact';
  if (normalized.some((a) => a.length >= 5 && levenshtein(a, value) <= 1)) return 'typo';
  return 'wrong';
}

// ───── Озвучка ─────
// 1) своя запись слова (audio в JSON курса); 2) mp3 с нашего сервера (/api/tts, кэшируется);
// 3) если сервер недоступен — синтезатор браузера/Windows (японского голоса там обычно нет).
let currentAudio: HTMLAudioElement | null = null;

export function speak(text: string, lang?: string | null, rate = 1, options: { reading?: string | null; audio?: string | null } = {}) {
  if (typeof window === 'undefined' || !text) return false;
  currentAudio?.pause();
  const src = options.audio
    ? resolveApiUrl(options.audio)
    : resolveApiUrl(
        `/api/tts?${new URLSearchParams({ text, lang: lang || 'en', ...(options.reading ? { reading: options.reading } : {}) })}`
      );
  const audio = new Audio(src);
  audio.playbackRate = rate;
  (audio as any).preservesPitch = true;
  currentAudio = audio;
  audio.play().catch(() => speakWithBrowser(text, lang, rate));
  return true;
}

function speakWithBrowser(text: string, lang?: string | null, rate = 1) {
  if (!('speechSynthesis' in window)) return false;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (lang) {
      utterance.lang = lang;
      const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase().slice(0, 2)));
      if (voice) utterance.voice = voice;
    }
    utterance.rate = rate;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

// ───── Звуки ответа (без файлов, через WebAudio) ─────
let audioCtx: AudioContext | null = null;
export function playTone(kind: 'correct' | 'wrong' | 'finish') {
  try {
    audioCtx = audioCtx || new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtx;
    const notes = kind === 'correct' ? [660, 880] : kind === 'finish' ? [523, 659, 784, 1047] : [220, 180];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === 'wrong' ? 'sawtooth' : 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.09;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(kind === 'wrong' ? 0.05 : 0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.25);
    });
  } catch {
    // звук недоступен — не страшно
  }
}

export const shuffle = <T,>(items: T[]) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
};

import React, { useCallback, useEffect, useMemo, useState } from 'react';

type KanaPair = [string, string];

type KanaTrainerState = {
  enabledSetIds: string[];
  enabledFontIds: string[];
  totalAnswered: number;
  totalCorrect: number;
  queue: KanaPair[];
  currentKana: string;
  currentReading: string;
  currentFontId: string;
  wrong: boolean;
  message: string;
  showOptions: boolean;
  showStroke: boolean;
  /** Сколько раз ошибались на знаке — такие знаки попадают в очередь чаще */
  mistakes: Record<string, number>;
};

type KanaSet = {
  id: string;
  label: string;
  entries: KanaPair[];
};

type KanaTrainerBlockProps = {
  value: any;
  onChange: (next: KanaTrainerState) => void;
  /** Ответ засчитан (true — с первой попытки) — для подсчёта XP в обучении */
  onAnswer?: (correct: boolean) => void;
  /** Крупный вид для страницы тренировки */
  large?: boolean;
};

const KANA_BASE_URL = 'https://djtguide.neocities.org/kana';
const DEFAULT_SET_ID = 'hsingle';
const DEFAULT_FONT_ID = 'default';
const SKIP_CHECK_ALL_FONT_ID = 'KOI-WIN';

const REPLACEMENTS: Record<string, string[]> = {
  o: ['wo'],
  chi: ['ci'],
  shi: ['si'],
  tsu: ['tu'],
  zu: ['du'],
  ji: ['di', 'zi'],
  fu: ['hu'],
  ja: ['dya'],
  jo: ['dyo'],
  ju: ['dyu']
};

const HIRAGANA_SETS: KanaSet[] = [
  { id: 'hsingle', label: 'Hiragana vowels', entries: [['あ', 'a'], ['い', 'i'], ['う', 'u'], ['え', 'e'], ['お', 'o']] },
  { id: 'hk', label: 'Hiragana K-row', entries: [['か', 'ka'], ['き', 'ki'], ['く', 'ku'], ['け', 'ke'], ['こ', 'ko']] },
  { id: 'hs', label: 'Hiragana S-row', entries: [['さ', 'sa'], ['し', 'shi'], ['す', 'su'], ['せ', 'se'], ['そ', 'so']] },
  { id: 'ht', label: 'Hiragana T-row', entries: [['た', 'ta'], ['ち', 'chi'], ['つ', 'tsu'], ['て', 'te'], ['と', 'to']] },
  { id: 'hn', label: 'Hiragana N-row', entries: [['な', 'na'], ['に', 'ni'], ['ぬ', 'nu'], ['ね', 'ne'], ['の', 'no']] },
  { id: 'hh', label: 'Hiragana H-row', entries: [['は', 'ha'], ['ひ', 'hi'], ['ふ', 'fu'], ['へ', 'he'], ['ほ', 'ho']] },
  { id: 'hm', label: 'Hiragana M-row', entries: [['ま', 'ma'], ['み', 'mi'], ['む', 'mu'], ['め', 'me'], ['も', 'mo']] },
  { id: 'hy', label: 'Hiragana Y-row', entries: [['や', 'ya'], ['ゆ', 'yu'], ['よ', 'yo']] },
  { id: 'hr', label: 'Hiragana R-row', entries: [['ら', 'ra'], ['り', 'ri'], ['る', 'ru'], ['れ', 're'], ['ろ', 'ro']] },
  { id: 'hw', label: 'Hiragana W-row', entries: [['わ', 'wa'], ['を', 'o']] },
  { id: 'hn1', label: 'Hiragana N', entries: [['ん', 'n']] },
  { id: 'hg', label: 'Hiragana G-row', entries: [['が', 'ga'], ['ぎ', 'gi'], ['ぐ', 'gu'], ['げ', 'ge'], ['ご', 'go']] },
  { id: 'hz', label: 'Hiragana Z-row', entries: [['ざ', 'za'], ['じ', 'ji'], ['ず', 'zu'], ['ぜ', 'ze'], ['ぞ', 'zo']] },
  { id: 'hd', label: 'Hiragana D-row', entries: [['だ', 'da'], ['ぢ', 'ji'], ['づ', 'zu'], ['で', 'de'], ['ど', 'do']] },
  { id: 'hb', label: 'Hiragana B-row', entries: [['ば', 'ba'], ['び', 'bi'], ['ぶ', 'bu'], ['べ', 'be'], ['ぼ', 'bo']] },
  { id: 'hp', label: 'Hiragana P-row', entries: [['ぱ', 'pa'], ['ぴ', 'pi'], ['ぷ', 'pu'], ['ぺ', 'pe'], ['ぽ', 'po']] }
];

const HIRAGANA_COMBO_SETS: KanaSet[] = [
  { id: 'hdk', label: 'Hiragana K-combo', entries: [['きゃ', 'kya'], ['きゅ', 'kyu'], ['きょ', 'kyo']] },
  { id: 'hds', label: 'Hiragana SH-combo', entries: [['しゃ', 'sha'], ['しゅ', 'shu'], ['しょ', 'sho']] },
  { id: 'hdc', label: 'Hiragana CH-combo', entries: [['ちゃ', 'cha'], ['ちゅ', 'chu'], ['ちょ', 'cho']] },
  { id: 'hdn', label: 'Hiragana N-combo', entries: [['にゃ', 'nya'], ['にゅ', 'nyu'], ['にょ', 'nyo']] },
  { id: 'hdh', label: 'Hiragana H-combo', entries: [['ひゃ', 'hya'], ['ひゅ', 'hyu'], ['ひょ', 'hyo']] },
  { id: 'hdm', label: 'Hiragana M-combo', entries: [['みゃ', 'mya'], ['みゅ', 'myu'], ['みょ', 'myo']] },
  { id: 'hdr', label: 'Hiragana R-combo', entries: [['りゃ', 'rya'], ['りゅ', 'ryu'], ['りょ', 'ryo']] },
  { id: 'hdg', label: 'Hiragana G-combo', entries: [['ぎゃ', 'gya'], ['ぎゅ', 'gyu'], ['ぎょ', 'gyo']] },
  { id: 'hdj', label: 'Hiragana J-combo', entries: [['じゃ', 'ja'], ['じゅ', 'ju'], ['じょ', 'jo']] },
  { id: 'hdj2', label: 'Hiragana J-combo 2', entries: [['ぢゃ', 'ja'], ['ぢゅ', 'ju'], ['ぢょ', 'jo']] },
  { id: 'hdb', label: 'Hiragana B-combo', entries: [['びゃ', 'bya'], ['びゅ', 'byu'], ['びょ', 'byo']] },
  { id: 'hdp', label: 'Hiragana P-combo', entries: [['ぴゃ', 'pya'], ['ぴゅ', 'pyu'], ['ぴょ', 'pyo']] }
];

const KATAKANA_SETS: KanaSet[] = [
  { id: 'ksingle', label: 'Katakana vowels', entries: [['ア', 'a'], ['イ', 'i'], ['ウ', 'u'], ['エ', 'e'], ['オ', 'o']] },
  { id: 'kk', label: 'Katakana K-row', entries: [['カ', 'ka'], ['キ', 'ki'], ['ク', 'ku'], ['ケ', 'ke'], ['コ', 'ko']] },
  { id: 'ks', label: 'Katakana S-row', entries: [['サ', 'sa'], ['シ', 'shi'], ['ス', 'su'], ['セ', 'se'], ['ソ', 'so']] },
  { id: 'kt', label: 'Katakana T-row', entries: [['タ', 'ta'], ['チ', 'chi'], ['ツ', 'tsu'], ['テ', 'te'], ['ト', 'to']] },
  { id: 'kn', label: 'Katakana N-row', entries: [['ナ', 'na'], ['ニ', 'ni'], ['ヌ', 'nu'], ['ネ', 'ne'], ['ノ', 'no']] },
  { id: 'kh', label: 'Katakana H-row', entries: [['ハ', 'ha'], ['ヒ', 'hi'], ['フ', 'fu'], ['ヘ', 'he'], ['ホ', 'ho']] },
  { id: 'km', label: 'Katakana M-row', entries: [['マ', 'ma'], ['ミ', 'mi'], ['ム', 'mu'], ['メ', 'me'], ['モ', 'mo']] },
  { id: 'ky', label: 'Katakana Y-row', entries: [['ヤ', 'ya'], ['ユ', 'yu'], ['ヨ', 'yo']] },
  { id: 'kr', label: 'Katakana R-row', entries: [['ラ', 'ra'], ['リ', 'ri'], ['ル', 'ru'], ['レ', 're'], ['ロ', 'ro']] },
  { id: 'kw', label: 'Katakana W-row', entries: [['ワ', 'wa'], ['ヲ', 'o']] },
  { id: 'kn1', label: 'Katakana N', entries: [['ン', 'n']] },
  { id: 'kg', label: 'Katakana G-row', entries: [['ガ', 'ga'], ['ギ', 'gi'], ['グ', 'gu'], ['ゲ', 'ge'], ['ゴ', 'go']] },
  { id: 'kz', label: 'Katakana Z-row', entries: [['ザ', 'za'], ['ジ', 'ji'], ['ズ', 'zu'], ['ゼ', 'ze'], ['ゾ', 'zo']] },
  { id: 'kd', label: 'Katakana D-row', entries: [['ダ', 'da'], ['ヂ', 'ji'], ['ヅ', 'zu'], ['デ', 'de'], ['ド', 'do']] },
  { id: 'kb', label: 'Katakana B-row', entries: [['バ', 'ba'], ['ビ', 'bi'], ['ブ', 'bu'], ['ベ', 'be'], ['ボ', 'bo']] },
  { id: 'kp', label: 'Katakana P-row', entries: [['パ', 'pa'], ['ピ', 'pi'], ['プ', 'pu'], ['ペ', 'pe'], ['ポ', 'po']] }
];

const KATAKANA_COMBO_SETS: KanaSet[] = [
  { id: 'kdk', label: 'Katakana K-combo', entries: [['キャ', 'kya'], ['キュ', 'kyu'], ['キョ', 'kyo']] },
  { id: 'kds', label: 'Katakana SH-combo', entries: [['シャ', 'sha'], ['シュ', 'shu'], ['ショ', 'sho']] },
  { id: 'kdc', label: 'Katakana CH-combo', entries: [['チャ', 'cha'], ['チュ', 'chu'], ['チョ', 'cho']] },
  { id: 'kdn', label: 'Katakana N-combo', entries: [['ニャ', 'nya'], ['ニュ', 'nyu'], ['ニョ', 'nyo']] },
  { id: 'kdh', label: 'Katakana H-combo', entries: [['ヒャ', 'hya'], ['ヒュ', 'hyu'], ['ヒョ', 'hyo']] },
  { id: 'kdm', label: 'Katakana M-combo', entries: [['ミャ', 'mya'], ['ミュ', 'myu'], ['ミョ', 'myo']] },
  { id: 'kdr', label: 'Katakana R-combo', entries: [['リャ', 'rya'], ['リュ', 'ryu'], ['リョ', 'ryo']] },
  { id: 'kdg', label: 'Katakana G-combo', entries: [['ギャ', 'gya'], ['ギュ', 'gyu'], ['ギョ', 'gyo']] },
  { id: 'kdj', label: 'Katakana J-combo', entries: [['ジャ', 'ja'], ['ジュ', 'ju'], ['ジョ', 'jo']] },
  { id: 'kdj2', label: 'Katakana J-combo 2', entries: [['ヂャ', 'ja'], ['ヂュ', 'ju'], ['ヂョ', 'jo']] },
  { id: 'kdb', label: 'Katakana B-combo', entries: [['ビャ', 'bya'], ['ビュ', 'byu'], ['ビョ', 'byo']] },
  { id: 'kdp', label: 'Katakana P-combo', entries: [['ピャ', 'pya'], ['ピュ', 'pyu'], ['ピョ', 'pyo']] }
];

const FONT_IDS = [
  'default',
  'A-OTF-BokutohNStd-Regular',
  'A-OTF-FolkPro-Regular',
  'A-OTF-HappyNStd-Regular',
  'A-OTF-KumoyaStd-Regular',
  'A-OTF-KyokaICAPro-Regular',
  'A-OTF-Shuuei3Std-Regular',
  'A-OTF-ZenGoNStd-Regular',
  'ArmedBanana',
  'DFCry5_0',
  'DFMrg3_0',
  'F5AJCCPE_0',
  'F5AJCMHG',
  'MT_TARE',
  'SM-WIN',
  'SNsanafon',
  'sea',
  'KOI-WIN'
];

const ALL_SETS = [...HIRAGANA_SETS, ...HIRAGANA_COMBO_SETS, ...KATAKANA_SETS, ...KATAKANA_COMBO_SETS];
const SET_IDS = ALL_SETS.map((item) => item.id);
const SET_MAP = new Map(ALL_SETS.map((item) => [item.id, item]));
const SINGLE_KANA = new Set(ALL_SETS.flatMap((set) => set.entries.map(([kana]) => kana).filter((kana) => kana.length === 1)));

const clampNumber = (value: any) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
};

const randomItem = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

const shuffle = (items: KanaPair[]) => {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

const uniqueInOrder = (values: string[], order: string[]) => {
  const set = new Set(values);
  return order.filter((item) => set.has(item));
};

const buildActive = (enabledSetIds: string[]) => {
  const active: KanaPair[] = [];
  for (const setId of enabledSetIds) {
    const set = SET_MAP.get(setId);
    if (!set) continue;
    for (const pair of set.entries) active.push(pair);
  }
  return active;
};

const prepareAllowed = (enabledSetIds: string[], enabledFontIds: string[]) => {
  const safeSetIds = uniqueInOrder(enabledSetIds, SET_IDS);
  const safeFontIds = uniqueInOrder(enabledFontIds, FONT_IDS);

  const finalSetIds = safeSetIds.length ? safeSetIds : [DEFAULT_SET_ID];
  const finalFontIds = safeFontIds.length ? safeFontIds : [DEFAULT_FONT_ID];

  const active = buildActive(finalSetIds);
  return {
    enabledSetIds: active.length ? finalSetIds : [DEFAULT_SET_ID],
    enabledFontIds: finalFontIds,
    active: active.length ? active : buildActive([DEFAULT_SET_ID])
  };
};

const toNextPrompt = (state: KanaTrainerState): KanaTrainerState => {
  const allowed = prepareAllowed(state.enabledSetIds, state.enabledFontIds);
  let queue = state.queue.filter((item): item is KanaPair => Array.isArray(item) && typeof item[0] === 'string' && typeof item[1] === 'string');

  if (queue.length === 0) {
    const mistakes = state.mistakes || {};
    const weak = allowed.active.filter(([kana]) => (mistakes[kana] || 0) > 0);
    // Знаки с ошибками встречаются в круге 2–3 раза, пока не будут угаданы
    queue = shuffle([...allowed.active, ...weak, ...weak.filter(([kana]) => (mistakes[kana] || 0) > 2)]);
  }

  if (state.currentKana && queue.length > 1 && queue[0][0] === state.currentKana) {
    queue.push(queue.shift() as KanaPair);
  }

  const nextCurrent = queue.shift() || allowed.active[0] || ['あ', 'a'];

  return {
    ...state,
    enabledSetIds: allowed.enabledSetIds,
    enabledFontIds: allowed.enabledFontIds,
    queue,
    currentKana: nextCurrent[0],
    currentReading: nextCurrent[1],
    currentFontId: randomItem(allowed.enabledFontIds),
    wrong: false,
    message: '',
    showStroke: false
  };
};

const buildDefaultState = (): KanaTrainerState =>
  toNextPrompt({
    enabledSetIds: [DEFAULT_SET_ID],
    enabledFontIds: [DEFAULT_FONT_ID],
    totalAnswered: 0,
    totalCorrect: 0,
    queue: [],
    currentKana: '',
    currentReading: '',
    currentFontId: DEFAULT_FONT_ID,
    wrong: false,
    message: '',
    showOptions: false,
    showStroke: false,
    mistakes: {}
  });

const parseState = (value: any): KanaTrainerState | null => {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.currentKana !== 'string' || typeof value.currentReading !== 'string') return null;

  return {
    enabledSetIds: Array.isArray(value.enabledSetIds) ? value.enabledSetIds.filter((item: any) => typeof item === 'string') : [DEFAULT_SET_ID],
    enabledFontIds: Array.isArray(value.enabledFontIds) ? value.enabledFontIds.filter((item: any) => typeof item === 'string') : [DEFAULT_FONT_ID],
    totalAnswered: clampNumber(value.totalAnswered),
    totalCorrect: clampNumber(value.totalCorrect),
    queue: Array.isArray(value.queue)
      ? value.queue.filter((item: any) => Array.isArray(item) && typeof item[0] === 'string' && typeof item[1] === 'string')
      : [],
    currentKana: value.currentKana,
    currentReading: value.currentReading,
    currentFontId: typeof value.currentFontId === 'string' ? value.currentFontId : DEFAULT_FONT_ID,
    wrong: !!value.wrong,
    message: typeof value.message === 'string' ? value.message : '',
    showOptions: !!value.showOptions,
    showStroke: !!value.showStroke,
    mistakes: value.mistakes && typeof value.mistakes === 'object' ? value.mistakes : {}
  };
};

const isPrefixMismatch = (value: string, possibilities: string[]) => {
  for (let i = 0; i < value.length; i += 1) {
    let ok = false;
    for (const possibility of possibilities) {
      if (value[i] === possibility.charAt(i)) {
        ok = true;
      }
      if (value === possibility) {
        return false;
      }
    }
    if (!ok) return true;
  }
  return false;
};

const updateCheckedValues = (current: string[], targetIds: string[], enabled: boolean, order: string[]) => {
  const currentSet = new Set(current);
  for (const id of targetIds) {
    if (enabled) currentSet.add(id);
    else currentSet.delete(id);
  }
  return uniqueInOrder(Array.from(currentSet), order);
};

const formatFontLabel = (fontId: string) => (fontId === 'default' ? 'Default' : fontId);

export default function KanaTrainerBlock({ value, onChange, onAnswer, large = false }: KanaTrainerBlockProps) {
  const [inputValue, setInputValue] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [fontLoadFailed, setFontLoadFailed] = useState(false);

  const trainer = useMemo(() => parseState(value), [value]);

  useEffect(() => {
    if (!trainer) onChange(buildDefaultState());
  }, [trainer, onChange]);

  useEffect(() => {
    setInputValue('');
    setShowAnswer(false);
    setFontLoadFailed(false);
  }, [trainer?.currentKana, trainer?.currentReading, trainer?.currentFontId]);

  const mutate = useCallback(
    (update: (state: KanaTrainerState) => KanaTrainerState) => {
      const base = parseState(value) || buildDefaultState();
      onChange(update(base));
    },
    [onChange, value]
  );

  const evaluateInput = useCallback(
    (rawValue: string) => {
      mutate((state) => {
        const answer = (rawValue.trim().toLowerCase() || 'x');
        const possibilities = [state.currentReading, ...(REPLACEMENTS[state.currentReading] || [])];

        if (isPrefixMismatch(answer, possibilities)) {
          if (state.wrong) return state;
          return {
            ...state,
            wrong: true,
            message: `${state.currentKana} = ${state.currentReading}`,
            mistakes: { ...state.mistakes, [state.currentKana]: (state.mistakes[state.currentKana] || 0) + 1 }
          };
        }

        if (possibilities.includes(answer)) {
          onAnswer?.(!state.wrong);
          const mistakes = { ...state.mistakes };
          // Угадали с первой попытки — знак становится «легче»
          const left = (mistakes[state.currentKana] || 0) - 1;
          if (!state.wrong && left >= 0) {
            if (left === 0) delete mistakes[state.currentKana];
            else mistakes[state.currentKana] = left;
          }
          const counted = {
            ...state,
            mistakes,
            totalAnswered: state.totalAnswered + 1,
            totalCorrect: state.totalCorrect + (state.wrong ? 0 : 1)
          };
          return toNextPrompt(counted);
        }

        return state;
      });
    },
    [mutate, onAnswer]
  );

  const forceNext = useCallback(() => {
    onAnswer?.(false);
    mutate((state) => {
      const queue = [...state.queue];
      const current: KanaPair = [state.currentKana, state.currentReading];
      if (queue.length > 3) queue.splice(3, 0, current);
      if (queue.length > 13) queue.splice(13, 0, current);
      return toNextPrompt({
        ...state,
        queue,
        totalAnswered: state.totalAnswered + 1,
        mistakes: { ...state.mistakes, [state.currentKana]: Math.max(1, state.mistakes[state.currentKana] || 0) }
      });
    });
  }, [mutate, onAnswer]);

  const toggleSet = useCallback(
    (setId: string, enabled: boolean) => {
      mutate((state) => ({
        ...state,
        enabledSetIds: updateCheckedValues(state.enabledSetIds, [setId], enabled, SET_IDS)
      }));
    },
    [mutate]
  );

  const toggleFont = useCallback(
    (fontId: string, enabled: boolean) => {
      mutate((state) => ({
        ...state,
        enabledFontIds: updateCheckedValues(state.enabledFontIds, [fontId], enabled, FONT_IDS)
      }));
    },
    [mutate]
  );

  const checkAllSets = useCallback(
    (section: KanaSet[]) => {
      const ids = section.map((item) => item.id);
      mutate((state) => ({
        ...state,
        enabledSetIds: updateCheckedValues(state.enabledSetIds, ids, true, SET_IDS)
      }));
    },
    [mutate]
  );

  const uncheckAllSets = useCallback(
    (section: KanaSet[]) => {
      const ids = section.map((item) => item.id);
      mutate((state) => ({
        ...state,
        enabledSetIds: updateCheckedValues(state.enabledSetIds, ids, false, SET_IDS)
      }));
    },
    [mutate]
  );

  const checkAllFonts = useCallback(() => {
    const ids = FONT_IDS.filter((fontId) => fontId !== SKIP_CHECK_ALL_FONT_ID);
    mutate((state) => ({
      ...state,
      enabledFontIds: updateCheckedValues(state.enabledFontIds, ids, true, FONT_IDS)
    }));
  }, [mutate]);

  const uncheckAllFonts = useCallback(() => {
    mutate((state) => ({
      ...state,
      enabledFontIds: []
    }));
  }, [mutate]);

  const playSound = useCallback(() => {
    const state = parseState(value);
    if (!state) return;
    const src = `${KANA_BASE_URL}/audio/${encodeURIComponent(state.currentReading)}.mp3`;
    const audio = new Audio(src);
    void audio.play().catch(() => undefined);
  }, [value]);

  const showStroke = useCallback(() => {
    mutate((state) => ({ ...state, showStroke: true }));
  }, [mutate]);

  if (!trainer) {
    return <div className="flex-1 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/60">Загрузка тренажера…</div>;
  }

  const activeSetIds = new Set(trainer.enabledSetIds);
  const activeFontIds = new Set(trainer.enabledFontIds);
  const canShowStroke = SINGLE_KANA.has(trainer.currentKana);
  const fontImageUrl =
    trainer.currentFontId !== DEFAULT_FONT_ID
      ? `${KANA_BASE_URL}/fonts/${encodeURIComponent(trainer.currentFontId)}/${encodeURIComponent(trainer.currentKana)}.png`
      : '';
  const strokeImageUrl = `${KANA_BASE_URL}/stroke/${encodeURIComponent(trainer.currentKana)}.gif`;

  const onInputChange = (nextValue: string) => {
    setInputValue(nextValue);
    evaluateInput(nextValue);
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (trainer.wrong) {
      setInputValue('');
      forceNext();
      return;
    }
    evaluateInput(inputValue);
  };

  return (
    <div className="flex-1 space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4" style={{ direction: 'ltr' }}>
      <div className="text-center text-xs text-white/50">{showAnswer ? trainer.currentReading : '\u00A0'}</div>

      <div
        className={`flex items-center justify-center rounded-xl border border-white/10 bg-black/20 ${large ? 'min-h-[220px] text-9xl' : 'min-h-[110px] text-6xl'}`}
        onMouseEnter={() => setShowAnswer(true)}
        onMouseLeave={() => setShowAnswer(false)}
      >
        {trainer.showStroke && canShowStroke ? (
          <img src={strokeImageUrl} alt={`Stroke order ${trainer.currentKana}`} className={large ? "h-40 w-40 object-contain" : "h-20 w-20 object-contain"} />
        ) : trainer.currentFontId !== DEFAULT_FONT_ID && !fontLoadFailed ? (
          <img
            src={fontImageUrl}
            alt={trainer.currentKana}
            className="h-20 w-20 object-contain"
            onError={() => setFontLoadFailed(true)}
          />
        ) : (
          <span>{trainer.currentKana}</span>
        )}
      </div>

      <input
        type="text"
        value={inputValue}
        onChange={(event) => onInputChange(event.target.value)}
        onKeyDown={onInputKeyDown}
        className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-center text-base text-white focus:border-white/30 focus:outline-none"
        placeholder="Введите ромадзи (a, ka, shi…)"
        autoFocus={large}
      />

      <div className="text-center text-xs">
        {trainer.message ? <span className="text-base font-semibold text-rose-300">{trainer.message}</span> : <span className="text-white/60">Наведите на знак, чтобы подсмотреть ответ. Enter — дальше.</span>}
      </div>

      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <button type="button" onClick={playSound} className="rounded-md border border-white/10 bg-white/10 px-2 py-1 hover:bg-white/20">
            🔊 Звук
          </button>
          <button
            type="button"
            onClick={showStroke}
            disabled={!canShowStroke}
            className="rounded-md border border-white/10 bg-white/10 px-2 py-1 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ✍️ Порядок черт
          </button>
        </div>
        <div className="text-white/70">{trainer.totalCorrect}/{trainer.totalAnswered}</div>
      </div>

      {Object.keys(trainer.mistakes).length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-white/50">
          Сложные — будут чаще:
          {Object.entries(trainer.mistakes)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 16)
            .map(([kana, count]) => (
              <span key={kana} className="rounded-md bg-rose-400/15 px-1.5 py-0.5 text-sm text-rose-100" title={`ошибок: ${count}`}>
                {kana}
              </span>
            ))}
        </div>
      )}

      <div className="rounded-lg border border-white/10 bg-black/20">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-white/80"
          onClick={() => mutate((state) => ({ ...state, showOptions: !state.showOptions }))}
        >
          <span>Какие знаки тренировать</span>
          <span className="text-xs text-white/50">{trainer.showOptions ? 'скрыть' : 'показать'}</span>
        </button>

        {trainer.showOptions && (
          <div className="space-y-4 border-t border-white/10 px-3 py-3 text-xs">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-white/70">
                <span>Хирагана</span>
                <span>
                  <button type="button" className="hover:text-white" onClick={() => checkAllSets(HIRAGANA_SETS)}>выбрать все</button>
                  {' | '}
                  <button type="button" className="hover:text-white" onClick={() => uncheckAllSets(HIRAGANA_SETS)}>снять все</button>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {HIRAGANA_SETS.map((set) => (
                  <label key={set.id} className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-2 py-1">
                    <input type="checkbox" checked={activeSetIds.has(set.id)} onChange={(event) => toggleSet(set.id, event.target.checked)} />
                    <span className="truncate">{set.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-white/70">
                <span>Хирагана: сочетания</span>
                <span>
                  <button type="button" className="hover:text-white" onClick={() => checkAllSets(HIRAGANA_COMBO_SETS)}>выбрать все</button>
                  {' | '}
                  <button type="button" className="hover:text-white" onClick={() => uncheckAllSets(HIRAGANA_COMBO_SETS)}>снять все</button>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {HIRAGANA_COMBO_SETS.map((set) => (
                  <label key={set.id} className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-2 py-1">
                    <input type="checkbox" checked={activeSetIds.has(set.id)} onChange={(event) => toggleSet(set.id, event.target.checked)} />
                    <span className="truncate">{set.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-white/70">
                <span>Катакана</span>
                <span>
                  <button type="button" className="hover:text-white" onClick={() => checkAllSets(KATAKANA_SETS)}>выбрать все</button>
                  {' | '}
                  <button type="button" className="hover:text-white" onClick={() => uncheckAllSets(KATAKANA_SETS)}>снять все</button>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {KATAKANA_SETS.map((set) => (
                  <label key={set.id} className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-2 py-1">
                    <input type="checkbox" checked={activeSetIds.has(set.id)} onChange={(event) => toggleSet(set.id, event.target.checked)} />
                    <span className="truncate">{set.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-white/70">
                <span>Катакана: сочетания</span>
                <span>
                  <button type="button" className="hover:text-white" onClick={() => checkAllSets(KATAKANA_COMBO_SETS)}>выбрать все</button>
                  {' | '}
                  <button type="button" className="hover:text-white" onClick={() => uncheckAllSets(KATAKANA_COMBO_SETS)}>снять все</button>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {KATAKANA_COMBO_SETS.map((set) => (
                  <label key={set.id} className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-2 py-1">
                    <input type="checkbox" checked={activeSetIds.has(set.id)} onChange={(event) => toggleSet(set.id, event.target.checked)} />
                    <span className="truncate">{set.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-white/70">
                <span>Шрифты (разные начертания)</span>
                <span>
                  <button type="button" className="hover:text-white" onClick={checkAllFonts}>выбрать все</button>
                  {' | '}
                  <button type="button" className="hover:text-white" onClick={uncheckAllFonts}>снять все</button>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {FONT_IDS.map((fontId) => (
                  <label key={fontId} className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-2 py-1">
                    <input type="checkbox" checked={activeFontIds.has(fontId)} onChange={(event) => toggleFont(fontId, event.target.checked)} />
                    <span className="truncate">{formatFontLabel(fontId)}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

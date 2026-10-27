// Общая логика финансов: категории операций (ручная категория → MCC → ключевые слова), цвета, формат сумм.

export type Transaction = {
  id: number;
  ts: number;
  amount: number;
  description?: string | null;
  category?: string | null;
  mcc?: number | null;
  account_id?: number | null;
  account_bank?: string | null;
};

const MCC_CATEGORY_PRESETS: { codes: number[]; label: string }[] = [
  { codes: [5411, 5422, 5441, 5451, 5462, 5499], label: 'Продукты' },
  { codes: [5811, 5812, 5813, 5814], label: 'Кафе и рестораны' },
  { codes: [4111, 4112, 4121, 4131, 4511, 4789, 5541, 5542, 7523], label: 'Транспорт' },
  { codes: [4812, 4814, 4816, 4899, 5815, 5816, 5817, 5818], label: 'Подписки и связь' },
  { codes: [5200, 5211, 5251, 5712, 5719, 5722, 5732, 4900], label: 'Дом' },
  { codes: [5912, 8011, 8021, 8043, 8062, 8099], label: 'Здоровье' },
  { codes: [5942, 5943, 5944, 5945, 5947, 7832, 7922, 7941, 7991, 7997, 7999], label: 'Хобби и развлечения' },
  { codes: [5611, 5621, 5631, 5641, 5651, 5655, 5661, 5691, 5699], label: 'Одежда' },
  { codes: [5999, 5311, 5331, 5399, 5964], label: 'Магазины' },
  { codes: [8220, 8241, 8244, 8249, 8299], label: 'Учёба' },
];

const KEYWORD_PRESETS: { keywords: string[]; label: string }[] = [
  { keywords: ['пятероч', 'перекрест', 'магнит', 'lenta', 'лента', 'вкусвилл', 'ашан', 'дикси', 'самокат'], label: 'Продукты' },
  { keywords: ['кофе', 'coffee', 'кафе', 'ресторан', 'бургер', 'kfc', 'вкусно и точка', 'додо'], label: 'Кафе и рестораны' },
  { keywords: ['такси', 'uber', 'яндекс го', 'yandex go', 'метро', 'транспорт', 'азс', 'лукойл'], label: 'Транспорт' },
  { keywords: ['netflix', 'spotify', 'ivi', 'кинопоиск', 'яндекс плюс', 'мтс', 'билайн', 'мегафон', 'теле2', 'steam'], label: 'Подписки и связь' },
  { keywords: ['аптека', 'клиника', 'стоматолог'], label: 'Здоровье' },
  { keywords: ['ozon', 'озон', 'wildberries', 'wb', 'яндекс маркет', 'aliexpress'], label: 'Магазины' },
  { keywords: ['спорт', 'gym', 'fitness', 'фитнес'], label: 'Хобби и развлечения' },
];

const mccMap = new Map<number, string>();
MCC_CATEGORY_PRESETS.forEach((preset) => preset.codes.forEach((code) => mccMap.set(code, preset.label)));

const COLOR_POOL = ['#8b5cf6', '#38bdf8', '#f97316', '#34d399', '#f472b6', '#facc15', '#22d3ee', '#f87171', '#a3e635', '#c084fc'];
const FIXED_COLORS: Record<string, string> = {
  Продукты: '#34d399',
  'Кафе и рестораны': '#f97316',
  Транспорт: '#38bdf8',
  'Подписки и связь': '#8b5cf6',
  Дом: '#facc15',
  Здоровье: '#f87171',
  Магазины: '#f472b6',
  Одежда: '#c084fc',
  Учёба: '#22d3ee',
  'Хобби и развлечения': '#a3e635',
  Прочее: '#94a3b8',
};
const colorMap = new Map<string, string>();

export function categoryColor(label: string) {
  if (FIXED_COLORS[label]) return FIXED_COLORS[label]!;
  if (!colorMap.has(label)) colorMap.set(label, COLOR_POOL[colorMap.size % COLOR_POOL.length]!);
  return colorMap.get(label)!;
}

/** Категория операции: ручная → по MCC → по описанию → «Прочее» (для доходов — «Доход»). */
export function categoryOf(tx: Pick<Transaction, 'category' | 'mcc' | 'description' | 'amount'>): string {
  if (tx.category) return tx.category;
  if (Number(tx.amount) > 0) return 'Доход';
  if (typeof tx.mcc === 'number' && mccMap.has(tx.mcc)) return mccMap.get(tx.mcc)!;
  const description = (tx.description || '').toLowerCase();
  for (const preset of KEYWORD_PRESETS) {
    if (preset.keywords.some((keyword) => description.includes(keyword))) return preset.label;
  }
  return 'Прочее';
}

const currency = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
export const formatMoney = (value: number) => (Number.isFinite(value) ? currency.format(Math.round(value)) : '0 ₽');

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const EXPENSE_CATEGORIES = ['🛒 Продукты', '☕ Кафе и рестораны', '🚕 Транспорт', '🏠 Дом', '💊 Здоровье', '🎮 Хобби и развлечения', '📱 Подписки и связь', '👕 Одежда', '🎁 Подарки', '📚 Учёба'];
export const INCOME_CATEGORIES = ['💼 Зарплата', '💸 Подработка', '🎁 Подарок', '↩️ Возврат'];

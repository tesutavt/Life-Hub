// Разбор банковской выписки (CSV) разных банков.
// Определяем кодировку (UTF-8 / Windows-1251), разделитель и колонки по названиям заголовков.
import { parse as parseCSV } from 'csv-parse/sync';
import iconv from 'iconv-lite';

// Варианты названий колонок в выписках (сравниваем в нижнем регистре, без лишних пробелов)
const COLUMNS = {
  date: ['дата операции', 'дата', 'дата и время операции', 'дата проводки', 'date', 'transaction date', 'operation date'],
  amount: ['сумма операции', 'сумма', 'сумма в валюте счёта', 'сумма в валюте счета', 'сумма платежа', 'amount', 'sum'],
  income: ['приход', 'поступление', 'зачисление', 'credit'],
  expense: ['расход', 'списание', 'debit'],
  description: ['описание', 'описание операции', 'назначение платежа', 'назначение', 'контрагент', 'description', 'details', 'merchant'],
  category: ['категория', 'category'],
  mcc: ['mcc', 'код mcc'],
  status: ['статус', 'status'],
};

const norm = (value) => String(value || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

function decode(buffer) {
  const utf8 = iconv.decode(buffer, 'utf8');
  // Много «�» — значит файл в Windows-1251 (так выгружают Сбер и ряд других банков)
  const broken = (utf8.match(/�/g) || []).length;
  return broken > 3 ? iconv.decode(buffer, 'win1251') : utf8.replace(/^﻿/, '');
}

function detectDelimiter(text) {
  // Сверху бывают служебные строки без разделителей — смотрим первые 10 строк
  const lines = text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 10);
  const score = (d) => lines.reduce((sum, line) => sum + line.split(d).length - 1, 0);
  const best = [';', ',', '\t'].map((d) => [d, score(d)]).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ';';
}

function parseAmount(value) {
  if (value === undefined || value === null || value === '') return null;
  const cleaned = String(value).replace(/\s| /g, '').replace(/[^\d,.\-+]/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** «16.10.2026 14:30:00», «16.10.2026», «2026-10-16T14:30», «16/10/2026» → ms */
function parseDate(value) {
  const text = String(value || '').trim();
  let m = /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(year, Number(m[2]) - 1, Number(m[1]), Number(m[4] || 12), Number(m[5] || 0), Number(m[6] || 0)).getTime();
  }
  m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 12), Number(m[5] || 0), Number(m[6] || 0)).getTime();
  return null;
}

/**
 * Возвращает { rows: [{ ts, amount, description, mcc, category }], columns, skipped }
 * amount < 0 — расход, > 0 — доход.
 */
export function parseStatement(buffer) {
  const text = decode(buffer);
  const delimiter = detectDelimiter(text);
  const records = parseCSV(text, { delimiter, columns: false, skip_empty_lines: true, relax_column_count: true, relax_quotes: true, trim: true });
  // Строка заголовков — первая, где нашлась колонка с датой (сверху бывают служебные строки)
  const headerIndex = records.findIndex((row) => row.some((cell) => COLUMNS.date.includes(norm(cell))));
  if (headerIndex === -1) throw new Error('Не нашли колонку с датой. Нужна выписка в CSV с заголовками (например, «Дата операции», «Сумма»)');
  const header = records[headerIndex].map(norm);
  const find = (names) => header.findIndex((h) => names.includes(h));
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([key, names]) => [key, find(names)]));
  if (col.amount === -1 && col.income === -1 && col.expense === -1) throw new Error('Не нашли колонку с суммой операции');

  const rows = [];
  let skipped = 0;
  for (const record of records.slice(headerIndex + 1)) {
    const ts = parseDate(record[col.date]);
    let amount = col.amount !== -1 ? parseAmount(record[col.amount]) : null;
    if (amount === null) {
      const income = col.income !== -1 ? parseAmount(record[col.income]) : null;
      const expense = col.expense !== -1 ? parseAmount(record[col.expense]) : null;
      if (income) amount = Math.abs(income);
      else if (expense) amount = -Math.abs(expense);
    }
    const status = col.status !== -1 ? norm(record[col.status]) : '';
    if (!ts || amount === null || amount === 0 || /fail|отклон|отмен/.test(status)) {
      skipped += 1;
      continue;
    }
    rows.push({
      ts,
      amount,
      description: col.description !== -1 ? String(record[col.description] || '').slice(0, 300) : '',
      mcc: col.mcc !== -1 && /^\d{3,4}$/.test(String(record[col.mcc]).trim()) ? Number(record[col.mcc]) : null,
      category: col.category !== -1 ? String(record[col.category] || '').slice(0, 60) || null : null,
    });
  }
  return { rows, skipped, columns: Object.fromEntries(Object.entries(col).map(([k, i]) => [k, i === -1 ? null : records[headerIndex][i]])) };
}

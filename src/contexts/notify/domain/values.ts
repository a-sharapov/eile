import { fail } from '../../../shared/kernel/errors.ts';

// Без пробелов, кавычек, скобок и управляющих знаков: адрес попадает в заголовок письма и в RCPT TO как есть.
const _EMAIL =
  /^[^\s@<>"',;\p{Cc}]+@[^\s@<>"',;\p{Cc}]+\.[^\s@<>"',;\p{Cc}]+$/u;

/** Строка из формы: без пробелов по краям и не длиннее предела; не строка — пусто. */
export var text = (value: unknown, max = 500): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/** Список из формы: массив как есть, строка — через запятые, точки с запятой и пробелы. */
export var list = (value: unknown): unknown[] =>
  Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\s,;]+/).filter(Boolean)
      : [];

export var isEmail = (value: string): boolean =>
  value.length <= 254 && _EMAIL.test(value);

/** Адрес почты: строчными, без мусора вокруг; не похож на адрес — отказ. */
export var parseEmail = (raw: unknown): string =>
  ((value) =>
    isEmail(value)
      ? value
      : fail('notify.invalid_email', `"${value}" is not an email address`))(
    text(raw, 254).toLowerCase()
  );

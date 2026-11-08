import { fail } from '../../../shared/kernel/errors.ts';

// Расписание плагина (ADR 0067): период строкой `'12h'`, `'15m'`, `'30s'`, `'1d'` или числом миллисекунд.

const _UNITS: Readonly<Record<string, number>> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

const _EVERY = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/;

/** Чаще раза в секунду — уже не расписание, а цикл. */
export var MIN_EVERY = 1000;

/** 24 дня: дольше `setTimeout` не ждёт (2^31 мс). */
export var MAX_EVERY = 24 * 86_400_000;

/** Первый запуск — вскоре после старта сервера, но не позже одного периода. */
export var FIRST_RUN_DELAY = 5000;

/** Запуск по расписанию дольше этого считается зависшим: сбой, следующий запуск — по расписанию. */
export var RUN_DEADLINE = 10 * 60_000;

const _ms = (raw: string | number): number =>
  typeof raw === 'number'
    ? raw
    : ((match) => (match ? Number(match[1]) * _UNITS[match[2]!]! : Number.NaN))(
        _EVERY.exec(raw.trim())
      );

/** Период в миллисекундах; вне 1 с — 24 дней или не по форме — `extensions.invalid_schedule`. */
export var parseEvery = (raw: unknown): number =>
  ((ms) =>
    Number.isFinite(ms) && ms >= MIN_EVERY && ms <= MAX_EVERY
      ? Math.round(ms)
      : fail(
          'extensions.invalid_schedule',
          `schedule.every must be like '15m', '12h' or milliseconds between 1 s and 24 days, got ${JSON.stringify(raw)}`
        ))(
    typeof raw === 'string' || typeof raw === 'number' ? _ms(raw) : Number.NaN
  );

/** Когда первый запуск после старта или замены задания: `delay`, но не позже одного периода. */
export var firstRun = (every: number, delay: number): number =>
  Math.min(every, delay);

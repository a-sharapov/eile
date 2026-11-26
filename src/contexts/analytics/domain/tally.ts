import { addDays, type Day } from './days.ts';
import type { EventOrigin } from './envelope.ts';

/**
 * Исход в счёте приёма: `accepted` … `erasure` — решение по событию, `future` и `late` — отметки среди
 * принятых, `invalid` … `disabled` — отказы 400, 401, 429 и 503.
 */
export type TallyOutcome =
  | 'accepted'
  | 'duplicate'
  | 'conflict'
  | 'erased'
  | 'erasure'
  | 'future'
  | 'late'
  | 'invalid'
  | 'unauthorized'
  | 'throttled'
  | 'disabled';

export var TALLY_OUTCOMES: readonly TallyOutcome[] = [
  'accepted',
  'duplicate',
  'conflict',
  'erased',
  'erasure',
  'future',
  'late',
  'invalid',
  'unauthorized',
  'throttled',
  'disabled',
];

/** Строка счёта приёма: сутки UTC приёма, отправитель (`''` — ключ не узнан или не проверялся), путь, исход. */
export type IntakeDay = {
  readonly day: Day;
  readonly sender: string;
  readonly origin: EventOrigin;
  readonly outcome: TallyOutcome;
  readonly count: number;
};

/** Строка счёта стёртого: сутки UTC момента события, отправитель, тип, тестовое ли — и сколько; без сумм и псевдонимов. */
export type ErasedDay = {
  readonly day: Day;
  readonly sender: string;
  readonly type: string;
  readonly test: boolean;
  readonly events: number;
};

export var TALLY_LIMITS = {
  /** Сколько суток живёт счёт приёма и сколько суток отдаёт за запрос. */
  intakeDays: 400,
  /** Сколько суток живёт счёт стёртого: проверки смотрят 30 суток, запас — на сутки досылки. */
  erasedDays: 40,
  /** Отметка `late`: событие по сети раньше приёма больше чем на сутки. */
  lateMs: 86_400_000,
} as const;

/** Сутки UTC момента ISO 8601; у момента в UTC (`…Z`) — первые десять знаков, без разбора даты. */
export var utcDay = (moment: string): Day =>
  moment.endsWith('Z')
    ? moment.slice(0, 10)
    : new Date(Date.parse(moment)).toISOString().slice(0, 10);

/** С какого момента событие ещё входит в счёт стёртого: начало суток UTC 40 суток назад. */
export var erasedSince = (now: string): string =>
  `${addDays(utcDay(now), -TALLY_LIMITS.erasedDays)}T00:00:00.000Z`;

/** Самые ранние сутки, которые остаются в счёте: раньше них срок хранения стирает. */
export var keptSince = (now: string, days: number): Day =>
  addDays(utcDay(now), -days);

/**
 * Что прибавить в счёт приёма за принятое событие: сам приём, `future` по предупреждению приёма, `late` — только у
 * события по сети: история из файла и должна быть старой.
 */
// Обычный приём — без отметок: один общий список, а не новый на каждую строку файла.
const _ACCEPTED: readonly TallyOutcome[] = ['accepted'];

export var acceptedCounts = (
  at: string,
  now: string,
  origin: EventOrigin,
  warnings: readonly string[]
): readonly TallyOutcome[] =>
  ((future, late) =>
    future || late
      ? [
          'accepted',
          ...(future ? (['future'] as const) : []),
          ...(late ? (['late'] as const) : []),
        ]
      : _ACCEPTED)(
    warnings.length > 0 && warnings.includes('future'),
    origin === 'http' && Date.parse(now) - Date.parse(at) > TALLY_LIMITS.lateMs
  );

/** Строки счёта по исходам одного события: по строке на исход. */
export var intakeRows = (
  outcomes: readonly TallyOutcome[],
  day: Day,
  sender: string,
  origin: EventOrigin
): IntakeDay[] =>
  outcomes.map((outcome) => ({ day, sender, origin, outcome, count: 1 }));

// В кодах отправителя и исхода косой черты не бывает: ключ однозначен.
const _key = (row: IntakeDay): string =>
  `${row.day}/${row.sender}/${row.origin}/${row.outcome}`;

/** Строки с одним ключом — одной строкой: пачка загрузки и отказы в памяти пишут по строке на ключ. */
export var sumIntake = (rows: readonly IntakeDay[]): IntakeDay[] =>
  Object.values(Object.groupBy(rows, _key)).map((group) => ({
    ...(group as [IntakeDay, ...IntakeDay[]])[0],
    count: (group as IntakeDay[]).reduce((sum, _) => sum + _.count, 0),
  }));

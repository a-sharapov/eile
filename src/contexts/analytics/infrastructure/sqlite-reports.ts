import type { Database } from '../../../platform/database.ts';
import type { TraitValue } from '../domain/envelope.ts';
import type {
  AccessSpan,
  Answer,
  DimValue,
  FeeEntry,
  MilestoneFact,
  MoneyEntry,
} from '../domain/person.ts';
import type { ReportStore } from '../domain/ports.ts';
import type { ReportNeeds, ReportPerson } from '../domain/report.ts';
import type { Parts } from '../domain/setup.ts';
import {
  factsOf,
  type PersonRow,
  type ReturnRow,
  returnOf,
  touchOf,
} from './sqlite-people.ts';

type ReportRow = Pick<
  PersonRow,
  | 'subject'
  | 'last_at'
  | 'senders'
  | 'arrived_at'
  | 'first_touch_label'
  | 'first_touch_at'
  | 'first_touch_sender'
  | 'first_touch_conflict'
  | 'first_parts'
  | 'returns'
  | 'answers'
  | 'trial_at'
  | 'payments'
  | 'first_paid_at'
  | 'paid_until'
  | 'first_term_end'
  | 'lapsed_at'
  | 'returned_at'
  | 'money'
  | 'fee_money'
  | 'access'
  | 'milestones'
  | 'firsts'
  | 'dims'
  | 'traits'
>;

// Столбцы отчётов — постоянным текстом: без JSON карточки и текстов ответов. Факты, которые нужны не каждому
// отчёту, — по параметру: не нужны — SQLite отдаёт пустой JSON, и его не разбирают. Коды настройки в запрос не
// подставляются, кэш подготовленных запросов не растёт с настройкой.
const _COLUMNS = `subject, last_at, senders, arrived_at, first_touch_label, first_touch_at, first_touch_sender,
  first_touch_conflict, first_parts, CASE WHEN $returns = 1 THEN returns ELSE '[]' END AS returns,
  CASE WHEN $answers = 1 THEN answers ELSE '{}' END AS answers, trial_at, payments, first_paid_at, paid_until,
  first_term_end, lapsed_at, returned_at, money,
  CASE WHEN $fees = 1 THEN fee_money ELSE '[]' END AS fee_money,
  CASE WHEN $access = 1 THEN access ELSE '[]' END AS access, milestones,
  CASE WHEN $firsts = 1 THEN firsts ELSE '{}' END AS firsts,
  CASE WHEN $dims = 1 THEN dims ELSE '{}' END AS dims,
  CASE WHEN $traits = 1 THEN traits ELSE '{}' END AS traits`;

const _TEST = '($test = 1 OR test = 0)';

// Пустые наборы — частые: у большинства людей нет возвращений, вех без окна и разрезов; их не разбирать.
const _parse = <T>(text: string, empty: T): T =>
  text === '{}' || text === '[]' ? empty : (JSON.parse(text) as T);

const _NONE: Readonly<Record<string, never>> = Object.freeze({});
const _NOTHING: never[] = [];

const _person = (_: ReportRow): ReportPerson => ({
  subject: _.subject,
  lastAt: _.last_at,
  senders: JSON.parse(_.senders) as string[],
  arrivedAt: _.arrived_at,
  firstTouch: touchOf(
    _.first_touch_label,
    _.first_touch_at,
    _.first_touch_sender
  ),
  firstTouchConflict: _.first_touch_conflict === 1,
  firstParts: _parse<Parts>(_.first_parts, _NONE),
  returns: _parse<ReturnRow[]>(_.returns, _NOTHING).map(returnOf),
  answers: _parse<Record<string, Answer>>(_.answers, _NONE),
  trialAt: _.trial_at,
  payments: _.payments,
  firstPaidAt: _.first_paid_at,
  paidUntil: _.paid_until,
  firstTermEnd: _.first_term_end,
  lapsedAt: _.lapsed_at,
  returnedAt: _.returned_at,
  money: _parse<MoneyEntry[]>(_.money, _NOTHING),
  feeMoney: _parse<FeeEntry[]>(_.fee_money, _NOTHING),
  access: _parse<AccessSpan[]>(_.access, _NOTHING),
  milestones: _parse<Record<string, MilestoneFact>>(_.milestones, _NONE),
  firsts: _parse<Record<string, string>>(_.firsts, _NONE),
  dims: _parse<Record<string, DimValue>>(_.dims, _NONE),
  traits: _parse<Record<string, TraitValue>>(_.traits, _NONE),
});

/**
 * Люди для отчётов по таблице людей. Длинный период читает таблицу подряд (`NOT INDEXED`): почти все строки
 * всё равно нужны, а поиск по индексу с переходом к строке втрое дольше (замер ADR 0072). Клиенты — по
 * частичному индексу `first_paid_at`: условие `first_paid_at IS NOT NULL` стоит в запросе явно, иначе SQLite этот
 * индекс не выберет.
 */
export var defineReportStore = (db: Database): ReportStore => {
  type _Needs = {
    readonly returns: number;
    readonly answers: number;
    readonly firsts: number;
    readonly dims: number;
    readonly traits: number;
    readonly fees: number;
    readonly access: number;
  };
  type _All = _Needs & { readonly test: number };
  type _Since = _All & { readonly from: string };
  type _Range = _Since & { readonly to: string };
  const active = db.query<ReportRow, _Since>(`
    SELECT ${_COLUMNS} FROM analytics_people
    WHERE ${_TEST} AND (last_at >= $from OR arrived_at >= $from)`);
  const activeScan = db.query<ReportRow, _Since>(`
    SELECT ${_COLUMNS} FROM analytics_people NOT INDEXED
    WHERE ${_TEST} AND (last_at >= $from OR arrived_at >= $from)`);
  const arrived = db.query<ReportRow, _Range>(`
    SELECT ${_COLUMNS} FROM analytics_people
    WHERE arrived_at >= $from AND arrived_at < $to AND ${_TEST}`);
  const arrivedScan = db.query<ReportRow, _Range>(`
    SELECT ${_COLUMNS} FROM analytics_people NOT INDEXED
    WHERE arrived_at >= $from AND arrived_at < $to AND ${_TEST}`);
  const paid = db.query<ReportRow, _Range>(`
    SELECT ${_COLUMNS} FROM analytics_people
    WHERE first_paid_at IS NOT NULL AND first_paid_at >= $from AND first_paid_at < $to AND ${_TEST}`);
  const paidBefore = db.query<ReportRow, _All & { readonly to: string }>(`
    SELECT ${_COLUMNS} FROM analytics_people
    WHERE first_paid_at IS NOT NULL AND first_paid_at < $to AND ${_TEST}`);
  const all = db.query<ReportRow, _All>(`
    SELECT ${_COLUMNS} FROM analytics_people WHERE ${_TEST}`);
  const first = db.query<{ at: string | null }, { readonly test: number }>(`
    SELECT min(arrived_at) AS at FROM analytics_people WHERE ${_TEST}`);
  const facts = db.query<PersonRow, [string]>(`
    SELECT * FROM analytics_people WHERE subject IN (SELECT value FROM json_each(?))`);
  const flags = (needs: ReportNeeds, test: boolean): _All => ({
    returns: Number(needs.returns),
    answers: Number(needs.answers),
    firsts: Number(needs.firsts),
    dims: Number(needs.dims),
    traits: Number(needs.traits),
    fees: Number(needs.fees),
    access: Number(needs.access),
    test: Number(test),
  });
  return {
    active: (from, test, scan, needs) =>
      (scan ? activeScan : active)
        .all({ ...flags(needs, test), from })
        .map(_person),
    arrived: (from, to, test, scan, needs) =>
      (scan ? arrivedScan : arrived)
        .all({ ...flags(needs, test), from, to })
        .map(_person),
    paid: (from, to, test, needs) =>
      (from === null
        ? paidBefore.all({ ...flags(needs, test), to })
        : paid.all({ ...flags(needs, test), from, to })
      ).map(_person),
    all: (test, needs) => all.all(flags(needs, test)).map(_person),
    firstArrival: (test) => first.get({ test: Number(test) })?.at ?? null,
    facts: (subjects) =>
      ((found) =>
        subjects.flatMap((_) =>
          ((row) => (row === undefined ? [] : [row]))(found.get(_))
        ))(
        new Map(
          facts
            .all(JSON.stringify(subjects))
            .map((_) => [_.subject, factsOf(_)] as const)
        )
      ),
  };
};

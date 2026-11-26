import type { Database } from '../../../platform/database.ts';
import type { TraitValue } from '../domain/envelope.ts';
import type {
  AccessSpan,
  Amounts,
  Answer,
  DimValue,
  FeeEntry,
  MilestoneFact,
  MoneyEntry,
  PersonFacts,
  PersonTouch,
  ReturnFact,
} from '../domain/person.ts';
import type { PeopleStore } from '../domain/ports.ts';
import type { Parts } from '../domain/setup.ts';
import { ANALYTICS_DERIVED_TABLES } from './migrations.ts';

/** После восстановления копии люди посчитаны по прежней базе: стереть, чтобы построились заново. */
export var clearAnalyticsPeople = (db: Database): void =>
  void db.transaction(() =>
    ANALYTICS_DERIVED_TABLES.forEach((_) => void db.run(`DELETE FROM ${_}`))
  )();

/** Строка таблицы людей, как её отдаёт SQLite. */
export type PersonRow = {
  readonly subject: string;
  readonly test: number;
  readonly senders: string;
  readonly first_at: string;
  readonly last_at: string;
  readonly events: number;
  readonly invalid: number;
  readonly arrived_at: string;
  readonly first_touch_label: string | null;
  readonly first_touch_at: string | null;
  readonly first_touch_sender: string | null;
  readonly first_touch_conflict: number;
  readonly first_parts: string;
  readonly last_touch_label: string | null;
  readonly last_touch_at: string | null;
  readonly last_touch_sender: string | null;
  readonly last_parts: string;
  readonly returns: string;
  readonly answers: string;
  readonly trial_at: string | null;
  readonly trial_ends_at: string | null;
  readonly payments: number;
  readonly first_paid_at: string | null;
  readonly last_paid_at: string | null;
  readonly paid_until: string | null;
  readonly first_term_end: string | null;
  readonly lapsed_at: string | null;
  readonly returned_at: string | null;
  readonly revenue: string;
  readonly fees: string;
  readonly money: string;
  readonly fee_money: string;
  readonly access: string;
  readonly milestones: string;
  readonly firsts: string;
  readonly dims: string;
  readonly traits: string;
};

/** Возвращение в строке — кортежем: момент оплаты, метка, момент касания, отправитель касания, части. */
export type ReturnRow = readonly [
  at: string,
  label: string | null,
  touchAt: string | null,
  sender: string | null,
  parts: Parts,
];

/** Касание из столбцов строки; нет метки, момента или отправителя — касания нет. */
export var touchOf = (
  label: string | null,
  at: string | null,
  sender: string | null
): PersonTouch | null =>
  label === null || at === null || sender === null
    ? null
    : { label, at, sender };

export var returnOf = (_: ReturnRow): ReturnFact => ({
  at: _[0],
  touch: touchOf(_[1], _[2], _[3]),
  parts: _[4],
});

const _returnRow = (_: ReturnFact): ReturnRow => [
  _.at,
  _.touch?.label ?? null,
  _.touch?.at ?? null,
  _.touch?.sender ?? null,
  _.parts,
];

/** Факты человека из строки таблицы людей. */
export var factsOf = (_: PersonRow): PersonFacts => ({
  subject: _.subject,
  test: _.test === 1,
  senders: JSON.parse(_.senders) as string[],
  firstAt: _.first_at,
  lastAt: _.last_at,
  events: _.events,
  invalid: _.invalid,
  arrivedAt: _.arrived_at,
  firstTouch: touchOf(
    _.first_touch_label,
    _.first_touch_at,
    _.first_touch_sender
  ),
  firstTouchConflict: _.first_touch_conflict === 1,
  lastTouch: touchOf(_.last_touch_label, _.last_touch_at, _.last_touch_sender),
  firstParts: JSON.parse(_.first_parts) as Parts,
  lastParts: JSON.parse(_.last_parts) as Parts,
  answers: JSON.parse(_.answers) as Record<string, Answer>,
  trialAt: _.trial_at,
  trialEndsAt: _.trial_ends_at,
  payments: _.payments,
  firstPaidAt: _.first_paid_at,
  lastPaidAt: _.last_paid_at,
  paidUntil: _.paid_until,
  firstTermEnd: _.first_term_end,
  lapsedAt: _.lapsed_at,
  returnedAt: _.returned_at,
  returns: (JSON.parse(_.returns) as ReturnRow[]).map(returnOf),
  revenue: JSON.parse(_.revenue) as Amounts,
  fees: JSON.parse(_.fees) as Amounts,
  money: JSON.parse(_.money) as MoneyEntry[],
  feeMoney: JSON.parse(_.fee_money) as FeeEntry[],
  access: JSON.parse(_.access) as AccessSpan[],
  milestones: JSON.parse(_.milestones) as Record<string, MilestoneFact>,
  firsts: JSON.parse(_.firsts) as Record<string, string>,
  dims: JSON.parse(_.dims) as Record<string, DimValue>,
  traits: JSON.parse(_.traits) as Record<string, TraitValue>,
});

type Filter = {
  readonly state: string | null;
  readonly sender: string | null;
  readonly prefix: string | null;
  readonly upper: string | null;
  readonly conflict: number;
  readonly test: number;
  readonly now: string;
};

// То же, что stateOf в domain/person.ts: состояние зависит от «сейчас» и считается при чтении.
const _STATE = `CASE
  WHEN payments = 0 THEN CASE WHEN trial_at IS NULL THEN 'new' ELSE 'trial' END
  WHEN lapsed_at IS NOT NULL OR (paid_until IS NOT NULL AND paid_until < $now) THEN 'lapsed'
  WHEN returned_at IS NULL THEN 'customer'
  ELSE 'returned'
END`;

// Отправитель — строка JSON в массиве: код из `a-z 0-9 _ -` в кавычках не бывает частью другого кода.
// Начало псевдонима — диапазон по ключу: знаки псевдонима — ASCII, все они меньше \x7f.
const _WHERE = `($test = 1 OR test = 0)
  AND ($sender IS NULL OR instr(senders, $sender) > 0)
  AND ($prefix IS NULL OR (subject >= $prefix AND subject < $upper))
  AND ($conflict = 0 OR first_touch_conflict = 1)
  AND ($state IS NULL OR ${_STATE} = $state)`;

export var definePeopleStore = (db: Database): PeopleStore => {
  const put = db.query(`
    INSERT OR REPLACE INTO analytics_people (subject, test, senders, first_at, last_at, events, invalid,
      arrived_at, first_touch_label, first_touch_at, first_touch_sender, first_touch_conflict, first_parts,
      last_touch_label, last_touch_at, last_touch_sender, last_parts, returns, answers, trial_at, trial_ends_at,
      payments, first_paid_at, last_paid_at, paid_until, first_term_end, lapsed_at, returned_at, revenue, fees,
      money, fee_money, access, milestones, firsts, dims, traits, revision)
    VALUES ($subject, $test, $senders, $firstAt, $lastAt, $events, $invalid, $arrivedAt, $firstTouchLabel,
      $firstTouchAt, $firstTouchSender, $firstTouchConflict, $firstParts, $lastTouchLabel, $lastTouchAt,
      $lastTouchSender, $lastParts, $returns, $answers, $trialAt, $trialEndsAt, $payments, $firstPaidAt,
      $lastPaidAt, $paidUntil, $firstTermEnd, $lapsedAt, $returnedAt, $revenue, $fees, $money, $feeMoney,
      $access, $milestones, $firsts, $dims, $traits, $revision)`);
  const remove = db.query<unknown, [string]>(
    'DELETE FROM analytics_people WHERE subject = ?'
  );
  const page = db.query<
    PersonRow,
    Filter & { readonly limit: number; readonly offset: number }
  >(`
    SELECT * FROM analytics_people WHERE ${_WHERE}
    ORDER BY last_at DESC, subject DESC LIMIT $limit OFFSET $offset`);
  const total = db.query<{ n: number }, Filter>(
    `SELECT count(*) AS n FROM analytics_people WHERE ${_WHERE}`
  );
  const build = db.query<{ revision: number; cursor: string | null }, []>(
    'SELECT revision, cursor FROM analytics_people_build WHERE id = 1'
  );
  const mark = db.query<unknown, [number, string | null]>(`
    INSERT INTO analytics_people_build (id, revision, cursor) VALUES (1, ?, ?)
    ON CONFLICT (id) DO UPDATE SET revision = excluded.revision, cursor = excluded.cursor`);
  // Псевдонимы — из событий, а не из таблицы людей: после восстановления копии она пуста.
  const batch = db.query<
    { subject: string; revision: number | null },
    [string, number]
  >(`
    SELECT s.subject AS subject, p.revision AS revision
    FROM (SELECT DISTINCT subject FROM analytics_events
      WHERE subject IS NOT NULL AND subject > ? ORDER BY subject LIMIT ?) s
    LEFT JOIN analytics_people p ON p.subject = s.subject
    ORDER BY s.subject`);
  const fresh = db.query<{ n: number }, [number]>(
    'SELECT count(*) AS n FROM analytics_people WHERE revision = ?'
  );
  const traits = db.query<
    { trait: string; value: unknown; count: number },
    [string]
  >(`
    SELECT j.key AS trait, j.value AS value, count(*) AS count
    FROM analytics_people p, json_each(p.traits) j
    WHERE j.key IN (SELECT value FROM json_each(?)) GROUP BY j.key, j.value`);
  // Значения частей первого и последнего касаний; касание, которое у человека и первое, и последнее, — раз.
  // Сначала — одинаковые наборы частей вместе: их сотни, а людей тысячи, и json_each зовётся по разу на набор
  // (впятеро быстрее, замер ADR).
  const parts = db.query<
    { sender: string; part: string; value: unknown; count: number },
    []
  >(`
    SELECT g.sender AS sender, j.key AS part, j.value AS value, sum(g.n) AS count FROM (
      SELECT first_touch_sender AS sender, first_parts AS parts, count(*) AS n FROM analytics_people
      WHERE first_touch_sender IS NOT NULL GROUP BY first_touch_sender, first_parts
      UNION ALL
      SELECT last_touch_sender, last_parts, count(*) FROM analytics_people
      WHERE last_touch_sender IS NOT NULL AND NOT (last_touch_label IS first_touch_label
        AND last_touch_at IS first_touch_at AND last_touch_sender IS first_touch_sender)
      GROUP BY last_touch_sender, last_parts) g, json_each(g.parts) j
    GROUP BY g.sender, j.key, j.value`);
  return {
    put: (person, revision) =>
      void put.run({
        subject: person.subject,
        test: Number(person.test),
        senders: JSON.stringify(person.senders),
        firstAt: person.firstAt,
        lastAt: person.lastAt,
        events: person.events,
        invalid: person.invalid,
        arrivedAt: person.arrivedAt,
        firstTouchLabel: person.firstTouch?.label ?? null,
        firstTouchAt: person.firstTouch?.at ?? null,
        firstTouchSender: person.firstTouch?.sender ?? null,
        firstTouchConflict: Number(person.firstTouchConflict),
        firstParts: JSON.stringify(person.firstParts),
        lastTouchLabel: person.lastTouch?.label ?? null,
        lastTouchAt: person.lastTouch?.at ?? null,
        lastTouchSender: person.lastTouch?.sender ?? null,
        lastParts: JSON.stringify(person.lastParts),
        returns: JSON.stringify(person.returns.map(_returnRow)),
        answers: JSON.stringify(person.answers),
        trialAt: person.trialAt,
        trialEndsAt: person.trialEndsAt,
        payments: person.payments,
        firstPaidAt: person.firstPaidAt,
        lastPaidAt: person.lastPaidAt,
        paidUntil: person.paidUntil,
        firstTermEnd: person.firstTermEnd,
        lapsedAt: person.lapsedAt,
        returnedAt: person.returnedAt,
        revenue: JSON.stringify(person.revenue),
        fees: JSON.stringify(person.fees),
        money: JSON.stringify(person.money),
        feeMoney: JSON.stringify(person.feeMoney),
        access: JSON.stringify(person.access),
        milestones: JSON.stringify(person.milestones),
        firsts: JSON.stringify(person.firsts),
        dims: JSON.stringify(person.dims),
        traits: JSON.stringify(person.traits),
        revision,
      }),
    remove: (subject) => void remove.run(subject),
    page: (filter) =>
      ((where) => ({
        people: page
          .all({ ...where, limit: filter.limit, offset: filter.offset })
          .map(factsOf),
        total: total.get(where)?.n ?? 0,
      }))({
        state: filter.state,
        sender: filter.sender === null ? null : JSON.stringify(filter.sender),
        prefix: filter.prefix,
        upper: filter.prefix === null ? null : `${filter.prefix}\u007f`,
        conflict: Number(filter.conflict),
        test: Number(filter.test),
        now: filter.now,
      }),
    build: () => build.get(),
    mark: (_) => void mark.run(_.revision, _.cursor),
    batch: (after, limit) => batch.all(after, limit),
    fresh: (revision) => fresh.get(revision)?.n ?? 0,
    traits: (codes) => traits.all(JSON.stringify(codes)),
    parts: () => parts.all(),
  };
};

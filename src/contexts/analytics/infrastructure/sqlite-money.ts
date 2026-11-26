import type { Database } from '../../../platform/database.ts';
import {
  currencyMomentsOf,
  type ExchangeRate,
  type PersonMoney,
} from '../domain/money.ts';
import type { FeeEntry, MoneyEntry } from '../domain/person.ts';
import type { MoneyStore } from '../domain/ports.ts';
import type { Parts } from '../domain/setup.ts';
import { type SpendRow, sortedParts } from '../domain/spend.ts';
import type { Statement, StatementFees } from '../domain/statements.ts';

type RateRow = {
  readonly base: string;
  readonly currency: string;
  readonly day: string;
  readonly rate: string;
  readonly user_name: string | null;
  readonly agent: number;
  readonly updated_at: string;
};

type SpendTableRow = {
  readonly id: number;
  readonly month: string;
  readonly parts: string;
  readonly currency: string;
  readonly amount: number;
  readonly note: string;
  readonly user_name: string | null;
  readonly agent: number;
  readonly created_at: string;
  readonly updated_at: string;
};

type StatementRow = {
  readonly month: string;
  readonly currency: string;
  readonly amount: number;
  readonly fees: string;
  readonly note: string;
  readonly user_name: string | null;
  readonly agent: number;
  readonly updated_at: string;
};

const _author = (name: string | null, agent: number): ExchangeRate['author'] =>
  name === null ? null : { name, agent: agent === 1 };

const _rate = (_: RateRow): ExchangeRate => ({
  base: _.base,
  currency: _.currency,
  day: _.day,
  rate: _.rate,
  author: _author(_.user_name, _.agent),
  updatedAt: _.updated_at,
});

const _spend = (_: SpendTableRow): SpendRow => ({
  id: _.id,
  month: _.month,
  parts: JSON.parse(_.parts) as Parts,
  currency: _.currency,
  amount: _.amount,
  note: _.note,
  author: _author(_.user_name, _.agent),
  createdAt: _.created_at,
  updatedAt: _.updated_at,
});

const _statement = (_: StatementRow): Statement => ({
  month: _.month,
  currency: _.currency,
  amount: _.amount,
  fees: _.fees as StatementFees,
  note: _.note,
  author: _author(_.user_name, _.agent),
  updatedAt: _.updated_at,
});

// Части — строкой с ключами по алфавиту: по ней работает уникальность ключа строки расхода.
const _partsText = (parts: Parts): string => JSON.stringify(sortedParts(parts));

/** Курсы, строки расхода и выписки в базе; деньги людей — для экрана курсов, выписок и проверок. */
export var defineMoneyStore = (db: Database): MoneyStore => {
  const rates = db.query<RateRow, []>(
    'SELECT * FROM analytics_rates ORDER BY base, currency, day'
  );
  const rate = db.query<RateRow, [string, string, string]>(
    'SELECT * FROM analytics_rates WHERE base = ? AND currency = ? AND day = ?'
  );
  const putRate = db.query<
    unknown,
    [string, string, string, string, string | null, number, string]
  >(`
    INSERT INTO analytics_rates (base, currency, day, rate, user_name, agent, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (base, currency, day) DO UPDATE SET
      rate = excluded.rate, user_name = excluded.user_name, agent = excluded.agent,
      updated_at = excluded.updated_at`);
  const removeRate = db.query<unknown, [string, string, string]>(
    'DELETE FROM analytics_rates WHERE base = ? AND currency = ? AND day = ?'
  );
  const rateCount = db.query<{ n: number }, []>(
    'SELECT count(*) AS n FROM analytics_rates'
  );
  const spend = db.query<
    SpendTableRow,
    { readonly from: string | null; readonly to: string | null }
  >(`
    SELECT * FROM analytics_spend
    WHERE ($from IS NULL OR month >= $from) AND ($to IS NULL OR month <= $to)
    ORDER BY month, parts, currency`);
  const spendRow = db.query<SpendTableRow, [number]>(
    'SELECT * FROM analytics_spend WHERE id = ?'
  );
  const byKey = db.query<SpendTableRow, [string, string, string]>(
    'SELECT * FROM analytics_spend WHERE month = ? AND parts = ? AND currency = ?'
  );
  const addSpend = db.query<
    { id: number },
    [
      string,
      string,
      string,
      number,
      string,
      string | null,
      number,
      string,
      string,
    ]
  >(`
    INSERT INTO analytics_spend (month, parts, currency, amount, note, user_name, agent, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`);
  const putSpend = db.query<
    unknown,
    [
      string,
      string,
      string,
      number,
      string,
      string | null,
      number,
      string,
      number,
    ]
  >(`
    UPDATE analytics_spend SET month = ?, parts = ?, currency = ?, amount = ?, note = ?, user_name = ?,
      agent = ?, updated_at = ?
    WHERE id = ?`);
  const removeSpend = db.query<unknown, [number]>(
    'DELETE FROM analytics_spend WHERE id = ?'
  );
  const spendCount = db.query<{ n: number }, { readonly month: string | null }>(
    'SELECT count(*) AS n FROM analytics_spend WHERE $month IS NULL OR month = $month'
  );
  const firstMonth = db.query<{ month: string | null }, []>(
    'SELECT min(month) AS month FROM analytics_spend'
  );
  // Только люди с деньгами — частичным индексом с тем же условием: на 33 000 людей 4 231 строка за 4–5 мс, а не вся
  // таблица и json_each за 33 мс (замер ADR). `+test` закрывает индекс списка, иначе планировщик идёт по нему;
  // индекса нет (таблицу людей пересоздали) — тот же ответ чтением подряд. Разбор и моменты курса — в JS.
  const ledger = db.query<{ money: string; fee_money: string }, []>(`
    SELECT money, fee_money FROM analytics_people
    WHERE (money <> '[]' OR fee_money <> '[]') AND +test = 0`);
  const statements = db.query<
    StatementRow,
    { readonly from: string | null; readonly to: string | null }
  >(`
    SELECT * FROM analytics_statements
    WHERE ($from IS NULL OR month >= $from) AND ($to IS NULL OR month <= $to)
    ORDER BY month, currency`);
  const statement = db.query<StatementRow, [string, string]>(
    'SELECT * FROM analytics_statements WHERE month = ? AND currency = ?'
  );
  const putStatement = db.query<
    unknown,
    [string, string, number, string, string, string | null, number, string]
  >(`
    INSERT INTO analytics_statements (month, currency, amount, fees, note, user_name, agent, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (month, currency) DO UPDATE SET
      amount = excluded.amount, fees = excluded.fees, note = excluded.note, user_name = excluded.user_name,
      agent = excluded.agent, updated_at = excluded.updated_at`);
  const removeStatement = db.query<unknown, [string, string]>(
    'DELETE FROM analytics_statements WHERE month = ? AND currency = ?'
  );
  const people = (): PersonMoney[] =>
    ledger.all().map((_) => ({
      money: JSON.parse(_.money) as MoneyEntry[],
      fees: JSON.parse(_.fee_money) as FeeEntry[],
    }));
  return {
    rates: () => rates.all().map(_rate),
    rate: (base, currency, day) =>
      ((row) => (row === null ? null : _rate(row)))(
        rate.get(base, currency, day)
      ),
    putRate: (_) =>
      void putRate.run(
        _.base,
        _.currency,
        _.day,
        _.rate,
        _.author?.name ?? null,
        Number(_.author?.agent === true),
        _.updatedAt
      ),
    removeRate: (base, currency, day) =>
      void removeRate.run(base, currency, day),
    rateCount: () => rateCount.get()?.n ?? 0,
    spend: (from, to) => spend.all({ from, to }).map(_spend),
    spendRow: (id) =>
      ((row) => (row === null ? null : _spend(row)))(spendRow.get(id)),
    spendByKey: (_) =>
      ((row) => (row === null ? null : _spend(row)))(
        byKey.get(_.month, _partsText(_.parts), _.currency)
      ),
    addSpend: (_) =>
      ((row) => ({ ..._, id: row?.id as number }))(
        addSpend.get(
          _.month,
          _partsText(_.parts),
          _.currency,
          _.amount,
          _.note,
          _.author?.name ?? null,
          Number(_.author?.agent === true),
          _.createdAt,
          _.updatedAt
        )
      ),
    putSpend: (_) =>
      void putSpend.run(
        _.month,
        _partsText(_.parts),
        _.currency,
        _.amount,
        _.note,
        _.author?.name ?? null,
        Number(_.author?.agent === true),
        _.updatedAt,
        _.id
      ),
    removeSpend: (id) => void removeSpend.run(id),
    spendCount: (month) => spendCount.get({ month })?.n ?? 0,
    firstSpendMonth: () => firstMonth.get()?.month ?? null,
    currencyMoments: () => currencyMomentsOf(people()),
    ledger: people,
    statements: (from, to) => statements.all({ from, to }).map(_statement),
    statement: (month, currency) =>
      ((row) => (row === null ? null : _statement(row)))(
        statement.get(month, currency)
      ),
    putStatement: (_) =>
      void putStatement.run(
        _.month,
        _.currency,
        _.amount,
        _.fees,
        _.note,
        _.author?.name ?? null,
        Number(_.author?.agent === true),
        _.updatedAt
      ),
    removeStatement: (month, currency) =>
      void removeStatement.run(month, currency),
  };
};

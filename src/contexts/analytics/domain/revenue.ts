import { lifeMonth, shiftMonths } from './days.ts';
import {
  type BaseSum,
  baseSum,
  divideRound,
  type Priced,
  type RateStep,
  type RateSteps,
  rateAt,
  toBase,
} from './money.ts';
import type { FeeEntry, MoneyEntry } from './person.ts';

/** Срок жизни LTV в месяцах; 0 — всё время: от начала окна до «сейчас». */
export type Lifetime = 0 | 3 | 6 | 12;
export var LIFETIMES: readonly Lifetime[] = [0, 3, 6, 12];

/** Выручка до комиссии (`gross`, по умолчанию: окончательна сразу) или после (`net`). */
export type FeesMode = 'gross' | 'net';
export var FEES_MODES: readonly FeesMode[] = ['gross', 'net'];

/** Окупаемость ищется до 24 месяцев жизни. */
export var PAYBACK_MONTHS = 24;

/** LTV: выручка проживших срок на одного; не прожившие — «ещё живут срок», в знаменатель не входят. */
export type Ltv = {
  /** Минимальные единицы базовой валюты на прожившего, половина — от нуля; null — не прожил никто. */
  readonly value: number | null;
  readonly revenue: BaseSum;
  /** Прожили срок: в знаменателе. */
  readonly base: number;
  /** Ещё живут срок: в знаменатель не вошли. */
  readonly open: number;
  readonly low: boolean;
};

/** Окупаемость: за сколько месяцев жизни; null — ещё не; lived — месяцев у самого старого клиента строки. */
export type Payback = {
  readonly months: number | null;
  readonly lived: number;
};

/** Перевод записи в базовую валюту моментом курса; шаги курса готовы раз на отчёт. */
export type Pricing = {
  readonly base: string;
  readonly price: (currency: string, amount: number, moment: string) => Priced;
};

const _remember = <K>(
  cache: Map<K, bigint>,
  key: K,
  make: () => bigint
): bigint =>
  cache.get(key) ?? ((value) => (cache.set(key, value), value))(make());

/**
 * Перевод с памятью `(шаг курса, сумма)`: у подписки суммы повторяются, и `BigInt` зовётся по разу на различную
 * сумму. Правила — как у `priceAt`: база к себе — сама сумма, нет шага — без курса.
 */
export var definePricing = (steps: RateSteps): Pricing => {
  const converted = new Map<RateStep, Map<number, bigint>>();
  const own = new Map<number, bigint>();
  const byStep = (step: RateStep): Map<number, bigint> =>
    converted.get(step) ??
    ((made) => (converted.set(step, made), made))(new Map<number, bigint>());
  return {
    base: steps.base,
    price: (currency, amount, moment) =>
      currency === steps.base
        ? {
            currency,
            amount,
            value: _remember(own, amount, () => BigInt(amount)),
            stale: false,
          }
        : ((step) =>
            step === null
              ? { currency, amount, value: null, stale: false }
              : {
                  currency,
                  amount,
                  value: _remember(byStep(step), amount, () =>
                    toBase(amount, currency, steps.base, step.value)
                  ),
                  stale: moment >= step.staleFrom,
                })(rateAt(steps, currency, moment)),
  };
};

/**
 * Деньги человека по времени для сложения: оплаты и возвраты, а при `net` — и комиссии с минусом, моментом своей
 * оплаты и в своей валюте. Комиссия у записи — без момента курса: её курс — момента оплаты.
 */
export var flowsOf = (
  person: {
    readonly money: readonly MoneyEntry[];
    readonly feeMoney: readonly FeeEntry[];
  },
  fees: FeesMode
): readonly MoneyEntry[] =>
  fees === 'net' && person.feeMoney.length > 0
    ? [
        ...person.money,
        ...person.feeMoney.map((_): MoneyEntry => [_[0], _[1], -_[2]]),
      ]
    : person.money;

/** Запись денег в базовой валюте: `at` — своя дата (по ней окно), перевод — моментом курса. */
export type Worth = { readonly at: string; readonly priced: Priced };

export var worthOf = (
  flows: readonly MoneyEntry[],
  pricing: Pricing
): Worth[] =>
  flows.map((_) => ({
    at: _[0],
    priced: pricing.price(_[1], _[2], _[3] ?? _[0]),
  }));

/** Записи окна `[from, to)` своей датой: возврат после окна LTV не меняет. */
export var within = (
  worth: readonly Worth[],
  from: string,
  to: string
): Priced[] =>
  worth.flatMap((_) => (_.at >= from && _.at < to ? [_.priced] : []));

/** Сумма на одного до минимальной единицы, половина — от нуля; никого — null. */
export var perHead = (value: number, count: number): number | null =>
  count === 0 ? null : Number(divideRound(BigInt(value), BigInt(count)));

/** LTV / CAC до сотых, половина — от нуля; нет одного из них или CAC ноль («бесплатно») — null. */
export var ltvCacOf = (
  ltv: number | null,
  cac: number | null
): number | null =>
  ltv === null || cac === null || cac === 0
    ? null
    : Number(divideRound(BigInt(ltv) * 100n, BigInt(cac))) / 100;

/** Участник LTV и окупаемости: начало окна (первая оплата или приход) и деньги в базовой валюте. */
export type LifeMember = {
  readonly start: string;
  readonly worth: readonly Worth[];
};

/** Срок жизни отчёта: граница «прожил срок» одна на отчёт, а не конец окна каждого против «сейчас». */
export type LifeSpec = {
  readonly life: Lifetime;
  readonly now: string;
  /** Прожил срок — начало не позже `shiftMonths(сейчас, −N)`; при «всё время» — «сейчас». */
  readonly lived: string;
};

export var lifeSpec = (life: Lifetime, now: string): LifeSpec => ({
  life,
  now,
  lived: life === 0 ? now : shiftMonths(now, -life),
});

/**
 * LTV: выручка каждого прожившего в окне `[начало, начало + N)` (при «всё время» — до «сейчас») на число
 * проживших; конец окна считается только у людей с деньгами. `low` — проживших меньше порога.
 */
export var ltvOf = <T = LifeMember>(
  members: readonly T[],
  spec: LifeSpec,
  low: number,
  // Начало окна и деньги участника: без них — `LifeMember`; люди отчёта передают свои поля без копии на человека.
  start: (member: T) => string = (member) => (member as LifeMember).start,
  worth: (member: T) => readonly Worth[] = (member) =>
    (member as LifeMember).worth
): Ltv =>
  ((alive) =>
    ((revenue) => ({
      value: perHead(revenue.value, alive.length),
      revenue,
      base: alive.length,
      open: members.length - alive.length,
      low: alive.length < low,
    }))(
      // Сначала — только люди с деньгами: пустой список на каждого без денег был бы мусором на десятки тысяч.
      baseSum(
        alive
          .filter((member) => worth(member).length > 0)
          .flatMap((member) =>
            ((from) =>
              within(
                worth(member),
                from,
                spec.life === 0 ? spec.now : shiftMonths(from, spec.life)
              ))(start(member))
          )
      )
    ))(members.filter((_) => start(_) <= spec.lived));

/** Границы прожитых месяцев: `shiftMonths(сейчас, −m)` для m от 0 до `months` — раз на отчёт. */
export var livedBounds = (now: string, months: number): string[] =>
  Array.from({ length: months + 1 }, (_, m) => shiftMonths(now, -m));

/** Сколько месяцев прожил: наибольшее m, при котором начало не позже `bounds[m]`; границы убывают. */
export var livedMonths = (start: string, bounds: readonly string[]): number =>
  ((first) => Math.max(0, (first < 0 ? bounds.length : first) - 1))(
    bounds.findIndex((_) => start > _)
  );

// Месяц жизни каждой записи клиента — раз; накопленное к месяцу m — сумма записей месяцев раньше m, только для
// тех m, до которых дошёл поиск.
const _marks = (member: LifeMember): readonly (readonly [number, bigint])[] =>
  member.worth.flatMap((_) =>
    _.priced.value === null
      ? []
      : [[lifeMonth(member.start, _.at), _.priced.value] as const]
  );

const _upTo = (
  marks: readonly (readonly [number, bigint])[],
  month: number
): bigint =>
  marks.reduce(
    (sum, { 0: own, 1: value }) =>
      own >= 0 && own < month ? sum + value : sum,
    0n
  );

/**
 * Окупаемость: наименьшее m от 1 до 24, при котором у проживших m месяцев выручка в окне `[первая оплата, + m)` на
 * одного не меньше CAC (сравнение точное: сумма ≥ CAC × прожившие). CAC = 0 — сразу; CAC нет — окупаемости нет.
 * `bounds` — `livedBounds(сейчас, 24)`.
 */
export var paybackOf = (
  customers: readonly LifeMember[],
  cac: number | null,
  bounds: readonly string[]
): Payback | null =>
  cac === null
    ? null
    : ((lives) => ({
        months:
          cac === 0
            ? 0
            : (Array.from({ length: PAYBACK_MONTHS }, (_, n) => n + 1).find(
                (month) =>
                  ((lived) =>
                    lived.length > 0 &&
                    lived.reduce((sum, _) => sum + _upTo(_.marks, month), 0n) >=
                      BigInt(cac) * BigInt(lived.length))(
                    lives.filter((_) => _.months >= month)
                  )
              ) ?? null),
        lived: lives.reduce((most, _) => Math.max(most, _.months), 0),
      }))(
        customers.map((member) =>
          ((months) => ({
            months,
            marks: months === 0 ? [] : _marks(member),
          }))(Math.min(livedMonths(member.start, bounds), PAYBACK_MONTHS))
        )
      );

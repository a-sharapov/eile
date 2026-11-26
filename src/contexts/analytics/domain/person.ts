import { pipe } from '../../../shared/kernel/pipe.ts';
import {
  fitsKind,
  fitsRole,
  momentOf,
  type Touch,
  type TraitValue,
} from './envelope.ts';
import { labelParts } from './labels.ts';
import { isCurrency, moneyOf } from './money.ts';
import type { EventRole } from './roles.ts';
import type {
  LabelSchema,
  Milestone,
  Parts,
  Property,
  PropertyKind,
  Setup,
} from './setup.ts';

/** Событие истории для свёртки: строка журнала и тело, разобранное без проверки — его проверил приём. */
export type HistoryEvent = {
  readonly seq: number;
  readonly sender: string;
  readonly type: string;
  /** UTC с миллисекундами, как в журнале событий. */
  readonly at: string;
  readonly test: boolean;
  readonly body: Readonly<Record<string, unknown>>;
};

/** Последний ответ на вопрос опроса; `text` — чужой текст как пришёл. */
export type Answer = {
  readonly answer: string;
  readonly text: string | null;
  readonly at: string;
};

/** Деньги по валютам в минимальных единицах, без пересчёта курса: `{ EUR: 10900 }`. */
export type Amounts = Readonly<Record<string, number>>;

/** Касание с отправителем события, которое его принесло: метка разбирается по схеме этого отправителя. */
export type PersonTouch = Touch & { readonly sender: string };

/** Возвращение: оплата после конца доступа, самое позднее касание не позже неё и его части. */
export type ReturnFact = {
  readonly at: string;
  readonly touch: PersonTouch | null;
  readonly parts: Parts;
};

/**
 * Оплата — сумма больше нуля, возврат — меньше; минимальные единицы валюты события. `pricedAt` — момент курса
 * возврата: самая ранняя оплата с тем же номером платежа; оплаты нет или момент тот же — его нет.
 */
export type MoneyEntry = readonly [
  at: string,
  currency: string,
  amount: number,
  pricedAt?: string,
];

/** Комиссия оплаты: момент оплаты (у уточнения без оплаты — свой), валюта комиссии, минимальные единицы. */
export type FeeEntry = readonly [at: string, currency: string, fee: number];

/** Отрезок доступа: от оплаты до конца срока или «конца доступа»; null — срок не известен, доступ не кончался. */
export type AccessSpan = readonly [from: string, to: string | null];

/** Веха у человека: когда достиг, когда кончается окно, когда оно началось; null — нет. */
export type MilestoneFact = readonly [
  reachedAt: string | null,
  until: string | null,
  from: string | null,
];

/**
 * Веха на момент чтения: достиг; ещё в окне — не достиг, а окно не кончилось; не достиг — окна нет, оно
 * кончилось или веха без срока.
 */
export type MilestoneState = 'reached' | 'open' | 'missed';

/** Значение разреза у человека: код выбора, число или да/нет. */
export type DimValue = string | number | boolean;

/** Источник привлечения кодами: части первого касания, иначе ответ на первый вопрос опроса, иначе неизвестно. */
export type Acquisition =
  | { readonly kind: 'parts'; readonly parts: Parts }
  | {
      readonly kind: 'answer';
      readonly question: string;
      readonly answer: string;
    }
  | { readonly kind: 'unknown' };

/** Факты человека, которые хранит таблица людей. */
export type PersonFacts = {
  readonly subject: string;
  /** Только из тестовых событий: настоящих у псевдонима ещё нет. */
  readonly test: boolean;
  readonly senders: readonly string[];
  readonly firstAt: string;
  readonly lastAt: string;
  readonly events: number;
  /** Событий, нарушающих свою роль: роль таких событий в свёртку не идёт. */
  readonly invalid: number;
  /** Приход: момент первого касания, без касаний — первого события. */
  readonly arrivedAt: string;
  readonly firstTouch: PersonTouch | null;
  /** В событиях разные `first_touch`: взят самый ранний по времени события. */
  readonly firstTouchConflict: boolean;
  readonly lastTouch: PersonTouch | null;
  /** Части меток первого и последнего касаний по схемам их отправителей: как в метке, строчными. */
  readonly firstParts: Parts;
  readonly lastParts: Parts;
  /** Последний ответ на каждый вопрос: код справочника вопроса → ответ. */
  readonly answers: Readonly<Record<string, Answer>>;
  readonly trialAt: string | null;
  readonly trialEndsAt: string | null;
  readonly payments: number;
  readonly firstPaidAt: string | null;
  readonly lastPaidAt: string | null;
  /** `paid_until` последней оплаты. */
  readonly paidUntil: string | null;
  /** Раньшее из `paid_until` первой оплаты и первого «конца доступа» после неё. */
  readonly firstTermEnd: string | null;
  /** «Конец доступа» после последней оплаты. */
  readonly lapsedAt: string | null;
  /** Последняя оплата после конца доступа: события или `paid_until` предыдущей оплаты. */
  readonly returnedAt: string | null;
  /** Каждая оплата после конца доступа по времени — с касанием возврата. */
  readonly returns: readonly ReturnFact[];
  /** Оплаты минус возвраты. */
  readonly revenue: Amounts;
  /** Комиссия: `fee` оплаты, а если оплату уточняли, — последнее уточнение. */
  readonly fees: Amounts;
  /** Оплаты и возвраты по времени, в валюте события; комиссии здесь нет. */
  readonly money: readonly MoneyEntry[];
  /** Комиссии по времени: моментом своей оплаты, уточнение без оплаты — своим. По валютам — то же, что `fees`. */
  readonly feeMoney: readonly FeeEntry[];
  /** Отрезки доступа по времени: первая оплата и каждое возвращение открывают отрезок. */
  readonly access: readonly AccessSpan[];
  /** По каждой вехе настройки, и в архиве. */
  readonly milestones: Readonly<Record<string, MilestoneFact>>;
  /** Первое событие каждого типа настройки: `отправитель/тип` → момент. */
  readonly firsts: Readonly<Record<string, string>>;
  /** Свойство-разрез → годное значение из самого раннего события, тип которого его объявляет. */
  readonly dims: Readonly<Record<string, DimValue>>;
  /** Объявленные признаки: значение самого позднего по времени события. */
  readonly traits: Readonly<Record<string, TraitValue>>;
};

/** Человек — всё, что известно об одном псевдониме. */
export type Person = PersonFacts & {
  /** Возвратов и уточнений без своей оплаты: учтены по валюте события. */
  readonly unmatched: number;
};

export type PersonState = 'new' | 'trial' | 'customer' | 'returned' | 'lapsed';

/** Состояния в порядке пути человека: от прихода к уходу. */
export var PERSON_STATES: readonly PersonState[] = [
  'new',
  'trial',
  'customer',
  'returned',
  'lapsed',
];

/** Что нужно состоянию: остальное в нём от времени не зависит. */
export type StateFacts = Pick<
  PersonFacts,
  'payments' | 'trialAt' | 'paidUntil' | 'lapsedAt' | 'returnedAt'
>;

type Input = Readonly<Record<string, unknown>>;

type _Payment = {
  readonly id: string | null;
  readonly at: string;
  readonly currency: string;
  /** Своя комиссия оплаты; null — её не прислали. */
  readonly fee: number | null;
};

type _Amendment = {
  readonly fee: unknown;
  readonly currency: string | null;
  readonly at: string;
};

type _Refund = {
  readonly id: string;
  readonly currency: string;
  readonly amount: number;
  /** Место возврата в деньгах по времени: момент курса ставится ему после свёртки. */
  readonly index: number;
};

// Свёртка по одному событию за раз: в аккумуляторе — то, что нельзя посчитать до конца истории.
type _Fold = {
  readonly invalid: number;
  /** `first_touch` самого раннего события, которое его несло. */
  readonly declared: PersonTouch | null;
  readonly conflict: boolean;
  /** Самое раннее событие с ролью «касание». */
  readonly touched: PersonTouch | null;
  readonly lastTouch: PersonTouch | null;
  readonly answers: Readonly<Record<string, Answer>>;
  readonly trialAt: string | null;
  readonly trialEndsAt: string | null;
  readonly payments: readonly _Payment[];
  readonly firstPaidAt: string | null;
  readonly lastPaidAt: string | null;
  readonly paidUntil: string | null;
  /** `paid_until` первой оплаты. */
  readonly firstUntil: string | null;
  /** Первый «конец доступа» после первой оплаты. */
  readonly firstLapse: string | null;
  readonly lapsedAt: string | null;
  readonly returnedAt: string | null;
  /** Моменты оплат после конца доступа: касание возврата ищется после свёртки. */
  readonly returns: readonly string[];
  readonly paid: Amounts;
  readonly money: readonly MoneyEntry[];
  readonly access: readonly AccessSpan[];
  /** Последнее уточнение по номеру платежа. */
  readonly amendments: Readonly<Record<string, _Amendment>>;
  readonly refunds: readonly _Refund[];
  readonly traits: Readonly<Record<string, TraitValue>>;
  /** Первое событие каждого типа настройки: события идут по времени, поэтому первое — первым и свёрнуто. */
  readonly firsts: Readonly<Record<string, string>>;
};

const _START: _Fold = {
  invalid: 0,
  declared: null,
  conflict: false,
  touched: null,
  lastTouch: null,
  answers: {},
  trialAt: null,
  trialEndsAt: null,
  payments: [],
  firstPaidAt: null,
  lastPaidAt: null,
  paidUntil: null,
  firstUntil: null,
  firstLapse: null,
  lapsedAt: null,
  returnedAt: null,
  returns: [],
  paid: {},
  money: [],
  access: [],
  amendments: {},
  refunds: [],
  traits: {},
  firsts: {},
};

/** Веха, готовая к подсчёту: ключи типов `отправитель/тип` и условие, проверенное по нынешней настройке. */
type _MilestoneSpec = {
  readonly code: string;
  readonly sender: string;
  readonly type: string;
  /** Тип, от первого события которого идёт окно, как `отправитель/код`; null — от прихода. */
  readonly anchor: string | null;
  readonly count: number;
  readonly days: number | null;
  readonly counts: (data: Input) => boolean;
};

/** Свойство-разрез и типы, которые его объявляют: отправитель → коды типов. */
type _DimSpec = {
  readonly property: Property;
  readonly types: ReadonlyMap<string, ReadonlySet<string>>;
};

type _Lookups = {
  readonly setup: Setup;
  /** Роль типа по `отправитель/код`. */
  readonly roles: ReadonlyMap<string, EventRole>;
  /** Объявленные признаки по коду. */
  readonly traits: ReadonlyMap<string, Property>;
  /** Схема метки по коду отправителя. */
  readonly schemas: ReadonlyMap<string, LabelSchema>;
  readonly milestones: readonly _MilestoneSpec[];
  readonly dims: readonly _DimSpec[];
};

const _DAY_MS = 86_400_000;

const _NO_WINDOW: MilestoneFact = [null, null, null];

const _isRecord = (raw: unknown): raw is Input =>
  raw !== null && typeof raw === 'object' && !Array.isArray(raw);

const _absent = (raw: unknown): boolean => raw === undefined || raw === null;

const _add = (amounts: Amounts, currency: string, value: number): Amounts => ({
  ...amounts,
  [currency]: (amounts[currency] ?? 0) + value,
});

const _keyOf = (sender: string, type: string): string => `${sender}/${type}`;

const _dataOf = (event: HistoryEvent): Input =>
  _isRecord(event.body.data) ? event.body.data : {};

// По времени события, затем по порядку приёма.
const _byTime = (a: HistoryEvent, b: HistoryEvent): number =>
  a.at < b.at ? -1 : a.at > b.at ? 1 : a.seq - b.seq;

const _touchOf = (raw: unknown, sender: string): PersonTouch | null =>
  _isRecord(raw) && typeof raw.label === 'string'
    ? ((at) =>
        at === null ? null : { label: raw.label as string, at, sender })(
        momentOf(raw.at)
      )
    : null;

const _roleTouch = (event: HistoryEvent, data: Input): PersonTouch => ({
  label: typeof data.label === 'string' ? data.label : '',
  at: event.at,
  sender: event.sender,
});

// При равном времени побеждает касание, свёрнутое позже: так и у остальных «последних» фактов.
const _later = (current: PersonTouch | null, next: PersonTouch): PersonTouch =>
  current === null || next.at >= current.at ? next : current;

const _declare = (fold: _Fold, touch: PersonTouch | null): _Fold =>
  touch === null
    ? fold
    : fold.declared === null
      ? { ...fold, declared: touch }
      : fold.conflict ||
          (touch.label === fold.declared.label && touch.at === fold.declared.at)
        ? fold
        : { ...fold, conflict: true };

// Признак без значения (null) ничего не сообщает; негодное по виду значение в человека не идёт.
const _traits = (
  fold: _Fold,
  raw: unknown,
  data: Input,
  lookups: _Lookups
): _Fold =>
  _isRecord(raw)
    ? ((found) =>
        found.length === 0
          ? fold
          : {
              ...fold,
              traits: { ...fold.traits, ...Object.fromEntries(found) },
            })(
        Object.entries(raw).filter((entry): entry is [string, TraitValue] =>
          ((property) =>
            property !== undefined &&
            !_absent(entry[1]) &&
            fitsKind(property, entry[1], lookups.setup, data))(
            lookups.traits.get(entry[0])
          )
        )
      )
    : fold;

const _envelope = (
  fold: _Fold,
  event: HistoryEvent,
  data: Input,
  lookups: _Lookups
): _Fold =>
  // Большинство событий — действия без касаний и признаков: им свёртка конверта ничего не даёт.
  _absent(event.body.first_touch) &&
  _absent(event.body.last_touch) &&
  _absent(event.body.traits)
    ? fold
    : pipe(
        (_: _Fold) =>
          _declare(_, _touchOf(event.body.first_touch, event.sender)),
        (_) =>
          ((touch) =>
            touch === null
              ? _
              : { ..._, lastTouch: _later(_.lastTouch, touch) })(
            _touchOf(event.body.last_touch, event.sender)
          ),
        (_) => _traits(_, event.body.traits, data, lookups)
      )(fold);

// Последний отрезок доступа с новым концом.
const _ended = (
  access: readonly AccessSpan[],
  to: string | null
): AccessSpan[] => [
  ...access.slice(0, -1),
  [(access.at(-1) as AccessSpan)[0], to],
];

// Первая оплата и возвращение открывают отрезок доступа, остальные продлевают последний до своего paid_until.
const _pay = (fold: _Fold, event: HistoryEvent, data: Input): _Fold =>
  ((currency, amount, until, returned) => ({
    ...fold,
    payments: [
      ...fold.payments,
      {
        id: typeof data.payment_id === 'string' ? data.payment_id : null,
        at: event.at,
        currency,
        fee: _absent(data.fee) ? null : moneyOf(data.fee, currency),
      },
    ],
    access:
      fold.payments.length === 0 || returned
        ? [...fold.access, [event.at, until] as const]
        : _ended(fold.access, until),
    firstPaidAt: fold.firstPaidAt ?? event.at,
    lastPaidAt: event.at,
    paidUntil: until,
    firstUntil: fold.payments.length === 0 ? until : fold.firstUntil,
    lapsedAt: null,
    returnedAt: returned ? event.at : fold.returnedAt,
    returns: returned ? [...fold.returns, event.at] : fold.returns,
    paid: _add(fold.paid, currency, amount),
    money: [...fold.money, [event.at, currency, amount] as const],
  }))(
    data.currency as string,
    moneyOf(data.amount, data.currency as string) ?? 0,
    momentOf(data.paid_until),
    // Доступ кончился до этой оплаты: пришёл «конец доступа» или прошёл paid_until предыдущей.
    fold.payments.length > 0 &&
      (fold.lapsedAt !== null ||
        (fold.paidUntil !== null && fold.paidUntil < event.at))
  );

// Поля роли проверены: значения здесь уже годные.
const _ROLES: Readonly<
  Record<EventRole, (fold: _Fold, event: HistoryEvent, data: Input) => _Fold>
> = {
  touch: (fold, event, data) =>
    ((touch) => ({
      ...fold,
      touched: fold.touched ?? touch,
      lastTouch: _later(fold.lastTouch, touch),
    }))(_roleTouch(event, data)),
  survey: (fold, event, data) => ({
    ...fold,
    answers: {
      ...fold.answers,
      [data.question as string]: {
        answer: data.answer as string,
        text: typeof data.text === 'string' ? data.text : null,
        at: event.at,
      },
    },
  }),
  trial: (fold, event, data) => ({
    ...fold,
    trialAt: fold.trialAt ?? event.at,
    trialEndsAt: momentOf(data.ends_at) ?? fold.trialEndsAt,
  }),
  payment: _pay,
  refund: (fold, event, data) =>
    ((currency, amount) => ({
      ...fold,
      refunds: [
        ...fold.refunds,
        {
          id: data.payment_id as string,
          currency,
          amount,
          index: fold.money.length,
        },
      ],
      money: [...fold.money, [event.at, currency, -amount] as const],
    }))(
      data.currency as string,
      moneyOf(data.amount, data.currency as string) ?? 0
    ),
  amendment: (fold, event, data) => ({
    ...fold,
    amendments: {
      ...fold.amendments,
      [data.payment_id as string]: {
        fee: data.fee,
        currency: isCurrency(data.currency) ? data.currency : null,
        at: event.at,
      },
    },
  }),
  // Уходит только тот, кто платил: «конец доступа» пробного периода — не уход. Первый «конец доступа» после
  // последней оплаты закрывает отрезок, если пришёл раньше его конца; позже — отрезок уже кончился по paid_until.
  lapse: (fold, event) =>
    fold.payments.length === 0
      ? fold
      : {
          ...fold,
          lapsedAt: fold.lapsedAt ?? event.at,
          firstLapse: fold.firstLapse ?? event.at,
          access:
            fold.lapsedAt === null &&
            ((to) => to === null || event.at < to)(
              (fold.access.at(-1) as AccessSpan)[1]
            )
              ? _ended(fold.access, event.at)
              : fold.access,
        },
  action: (fold) => fold,
  summary: (fold) => fold,
  // Удаление, которое ждёт исполнения пересборкой, человеку ничего не добавляет.
  erasure: (fold) => fold,
};

// Первое событие типа, вехи и разрезы считаются по типу: роль им не нужна, событие, нарушающее её, тоже в счёт.
const _first = (fold: _Fold, key: string, at: string): _Fold =>
  Object.hasOwn(fold.firsts, key)
    ? fold
    : { ...fold, firsts: { ...fold.firsts, [key]: at } };

const _step =
  (lookups: _Lookups) =>
  (fold: _Fold, event: HistoryEvent): _Fold =>
    ((data, key) =>
      ((role, next) =>
        role === undefined
          ? next
          : ((typed) =>
              fitsRole(role, data, lookups.setup)
                ? _ROLES[role](typed, event, data)
                : { ...typed, invalid: typed.invalid + 1 })(
              _first(next, key, event.at)
            ))(lookups.roles.get(key), _envelope(fold, event, data, lookups)))(
      _dataOf(event),
      _keyOf(event.sender, event.type)
    );

/**
 * Комиссия одной оплаты или уточнения и её момент — момент оплаты, у уточнения без оплаты — свой; null —
 * уточнение не перевести в минимальные единицы.
 */
type _Fee = {
  readonly at: string;
  readonly currency: string;
  readonly fee: number;
  readonly unmatched: boolean;
} | null;

const _own = (payments: readonly _Payment[]): _Fee[] =>
  payments.flatMap((_) =>
    _.fee === null
      ? []
      : [{ at: _.at, currency: _.currency, fee: _.fee, unmatched: false }]
  );

const _amended = (amendment: _Amendment, currency: string, at: string): _Fee =>
  ((fee) => (fee === null ? null : { at, currency, fee, unmatched: false }))(
    moneyOf(amendment.fee, currency)
  );

// Оплаты с одним номером платежа уточняются вместе — одной комиссией моментом самой ранней из них; уточнение,
// которое не перевести, оставляет им свои комиссии.
const _group = (fold: _Fold, id: string): _Fee[] =>
  ((payments) =>
    Object.hasOwn(fold.amendments, id)
      ? ((amendment, first) =>
          ((fee) => (fee === null ? [null, ..._own(payments)] : [fee]))(
            _amended(amendment, amendment.currency ?? first.currency, first.at)
          ))(fold.amendments[id] as _Amendment, payments[0] as _Payment)
      : _own(payments))(fold.payments.filter((_) => _.id === id));

// Уточнение без своей оплаты считается по своей валюте и своим моментом; валюты нет — его некуда отнести.
const _orphan = (amendment: _Amendment): _Fee =>
  amendment.currency === null
    ? null
    : ((fee) => (fee === null ? null : { ...fee, unmatched: true }))(
        _amended(amendment, amendment.currency, amendment.at)
      );

const _fees = (fold: _Fold, ids: ReadonlySet<string>): readonly _Fee[] => [
  ..._own(fold.payments.filter((_) => _.id === null)),
  ...[...ids].flatMap((_) => _group(fold, _)),
  ...Object.entries(fold.amendments)
    .filter(({ 0: id }) => !ids.has(id))
    .map(({ 1: amendment }) => _orphan(amendment)),
];

// Момент курса возврата — самая ранняя оплата с тем же номером платежа: по времени она может быть и позже возврата.
const _priced = (fold: _Fold): readonly MoneyEntry[] =>
  fold.refunds.length === 0
    ? fold.money
    : ((paidAt, refunds) =>
        fold.money.map(
          (entry, index): MoneyEntry =>
            ((id) =>
              ((at) =>
                at === undefined || at === entry[0]
                  ? entry
                  : [entry[0], entry[1], entry[2], at])(
                id === undefined ? undefined : paidAt.get(id)
              ))(refunds.get(index))
        ))(
        // Оплаты идут по времени: из оплат с одним номером в словаре остаётся самая ранняя.
        new Map(
          fold.payments
            .flatMap((_) => (_.id === null ? [] : [[_.id, _.at] as const]))
            .toReversed()
        ),
        new Map(fold.refunds.map((_) => [_.index, _.id] as const))
      );

const _feeMoney = (fees: readonly _Fee[]): FeeEntry[] =>
  fees
    .flatMap((_) => (_ === null ? [] : [[_.at, _.currency, _.fee] as const]))
    .toSorted((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

const _same = (a: PersonTouch | null, b: PersonTouch | null): boolean =>
  a !== null && b !== null && a.label === b.label && a.sender === b.sender;

const _partsOf = (touch: PersonTouch | null, lookups: _Lookups): Parts =>
  touch === null
    ? {}
    : labelParts(lookups.schemas.get(touch.sender) ?? null, touch.label);

// Все касания истории: событие-касание, годное своей роли, и `first_touch` и `last_touch` любого события.
const _touches = (
  events: readonly HistoryEvent[],
  lookups: _Lookups
): PersonTouch[] =>
  events.flatMap((event) =>
    ((data) => [
      ...(lookups.roles.get(_keyOf(event.sender, event.type)) === 'touch' &&
      fitsRole('touch', data, lookups.setup)
        ? [_roleTouch(event, data)]
        : []),
      ...[
        _touchOf(event.body.first_touch, event.sender),
        _touchOf(event.body.last_touch, event.sender),
      ].filter((_) => _ !== null),
    ])(_dataOf(event))
  );

// Касание возврата — самое позднее не позже оплаты; при равном времени — свёрнутое позже. `last_touch` с
// ранним моментом может прийти в событии позже оплаты, поэтому ищется по всем касаниям после свёртки.
const _returns = (
  moments: readonly string[],
  events: readonly HistoryEvent[],
  lookups: _Lookups
): ReturnFact[] =>
  moments.length === 0
    ? []
    : ((touches) =>
        moments.map((at) =>
          ((touch) => ({ at, touch, parts: _partsOf(touch, lookups) }))(
            touches.reduce<PersonTouch | null>(
              (best, _) =>
                _.at <= at && (best === null || _.at >= best.at) ? _ : best,
              null
            )
          )
        ))(_touches(events, lookups));

const _shift = (at: string, days: number): string =>
  new Date(Date.parse(at) + days * _DAY_MS).toISOString();

// Окно — от начала включительно до конца не включая; достиг — в момент count-го засчитанного события.
const _milestone = (
  spec: _MilestoneSpec,
  events: readonly HistoryEvent[],
  start: string | null
): MilestoneFact =>
  start === null
    ? _NO_WINDOW
    : ((until): MilestoneFact => [
        events.filter(
          (_) =>
            _.type === spec.type &&
            _.sender === spec.sender &&
            _.at >= start &&
            (until === null || _.at < until) &&
            spec.counts(_dataOf(_))
        )[spec.count - 1]?.at ?? null,
        until,
        start,
      ])(spec.days === null ? null : _shift(start, spec.days));

// Самое раннее годное значение среди событий типов, которые объявляют свойство; негодное по виду пропускается.
const _dim = (
  spec: _DimSpec,
  events: readonly HistoryEvent[],
  setup: Setup
): DimValue | null =>
  ((found) =>
    found === undefined
      ? null
      : (_dataOf(found)[spec.property.code] as DimValue))(
    events.find(
      (event) =>
        spec.types.get(event.sender)?.has(event.type) === true &&
        ((data) =>
          !_absent(data[spec.property.code]) &&
          fitsKind(spec.property, data[spec.property.code], setup, data))(
          _dataOf(event)
        )
    )
  );

const _counted = (
  events: readonly HistoryEvent[],
  arrivedAt: string,
  firsts: Readonly<Record<string, string>>,
  lookups: _Lookups
): Pick<PersonFacts, 'milestones' | 'dims'> => ({
  milestones: Object.fromEntries(
    lookups.milestones.map((_) => [
      _.code,
      _milestone(
        _,
        events,
        _.anchor === null ? arrivedAt : (firsts[_.anchor] ?? null)
      ),
    ])
  ),
  dims: Object.fromEntries(
    lookups.dims.flatMap((spec) =>
      ((value) => (value === null ? [] : [[spec.property.code, value]]))(
        _dim(spec, events, lookups.setup)
      )
    )
  ),
});

const _finish = (
  subject: string,
  events: readonly HistoryEvent[],
  test: boolean,
  fold: _Fold,
  lookups: _Lookups
): Person =>
  ((ids, firstTouch) =>
    ((fees, arrivedAt) => ({
      subject,
      test,
      senders: [...new Set(events.map((_) => _.sender))].toSorted(),
      firstAt: (events[0] as HistoryEvent).at,
      lastAt: (events.at(-1) as HistoryEvent).at,
      events: events.length,
      invalid: fold.invalid + fees.filter((_) => _ === null).length,
      arrivedAt,
      firstTouch,
      firstTouchConflict: fold.conflict,
      lastTouch: fold.lastTouch,
      ...((first) => ({
        firstParts: first,
        lastParts: _same(firstTouch, fold.lastTouch)
          ? first
          : _partsOf(fold.lastTouch, lookups),
      }))(_partsOf(firstTouch, lookups)),
      answers: fold.answers,
      trialAt: fold.trialAt,
      trialEndsAt: fold.trialEndsAt,
      payments: fold.payments.length,
      firstPaidAt: fold.firstPaidAt,
      lastPaidAt: fold.lastPaidAt,
      paidUntil: fold.paidUntil,
      firstTermEnd:
        [fold.firstUntil, fold.firstLapse]
          .filter((_) => _ !== null)
          .toSorted()[0] ?? null,
      lapsedAt: fold.lapsedAt,
      returnedAt: fold.returnedAt,
      returns: _returns(fold.returns, events, lookups),
      revenue: fold.refunds.reduce(
        (amounts, _) => _add(amounts, _.currency, -_.amount),
        fold.paid
      ),
      fees: fees.reduce(
        (amounts, _) =>
          _ === null ? amounts : _add(amounts, _.currency, _.fee),
        {}
      ),
      money: _priced(fold),
      feeMoney: _feeMoney(fees),
      access: fold.access,
      firsts: fold.firsts,
      ..._counted(events, arrivedAt, fold.firsts, lookups),
      traits: fold.traits,
      unmatched:
        fold.refunds.filter((_) => !ids.has(_.id)).length +
        fees.filter((_) => _?.unmatched === true).length,
    }))(_fees(fold, ids), firstTouch?.at ?? (events[0] as HistoryEvent).at))(
    new Set(fold.payments.flatMap((_) => (_.id === null ? [] : [_.id]))),
    fold.declared ?? fold.touched
  );

// Равенство — по виду свойства: выбор — код, «да или нет» — true или false, число — число.
const _EQ_TYPES: Readonly<Partial<Record<PropertyKind, string>>> = {
  choice: 'string',
  boolean: 'boolean',
  number: 'number',
};

const _never = (): boolean => false;
const _always = (): boolean => true;

// Свойство, которое тип вехи объявляет сейчас; не объявляет — условие не засчитывает ни одного события.
const _declared = (
  setup: Setup,
  milestone: Milestone,
  code: string
): Property | undefined =>
  setup.types.some(
    (_) =>
      _.sender === milestone.sender &&
      _.code === milestone.type &&
      _.properties.some((property) => property.code === code)
  )
    ? setup.properties.find((_) => _.scope === 'event' && _.code === code)
    : undefined;

// Условие вехи по нынешней настройке: свойство сменило вид или тип его больше не объявляет — отказа нет,
// событие просто не засчитывается.
const _conditionOf = (
  setup: Setup,
  milestone: Milestone
): ((data: Input) => boolean) =>
  ((condition) =>
    condition === null
      ? _always
      : ((property) =>
          property === undefined
            ? _never
            : 'gte' in condition
              ? property.kind === 'number'
                ? (data: Input) =>
                    ((value) =>
                      typeof value === 'number' && value >= condition.gte)(
                      data[property.code]
                    )
                : _never
              : _EQ_TYPES[property.kind] === typeof condition.eq
                ? (data: Input) => data[property.code] === condition.eq
                : _never)(_declared(setup, milestone, condition.property)))(
    milestone.condition
  );

const _lookupsOf = (setup: Setup): _Lookups => ({
  setup,
  roles: new Map(setup.types.map((_) => [_keyOf(_.sender, _.code), _.role])),
  traits: new Map(
    setup.properties.filter((_) => _.scope === 'person').map((_) => [_.code, _])
  ),
  schemas: new Map(setup.schemas.map((_) => [_.sender, _])),
  milestones: setup.milestones.map((_) => ({
    code: _.code,
    sender: _.sender,
    type: _.type,
    anchor: _.anchor === null ? null : _keyOf(_.sender, _.anchor),
    count: _.count,
    days: _.days,
    counts: _conditionOf(setup, _),
  })),
  dims: setup.properties
    .filter((_) => _.scope === 'event' && _.dimension)
    .map((property) => ({
      property,
      types: new Map(
        Array.from(
          Map.groupBy(
            setup.types.filter((_) =>
              _.properties.some((own) => own.code === property.code)
            ),
            (_) => _.sender
          ),
          ({ 0: sender, 1: types }) =>
            [sender, new Set(types.map((_) => _.code))] as const
        )
      ),
    })),
});

/**
 * Свёртка человека из всех событий его псевдонима: по времени события, затем по порядку приёма, поэтому
 * порядок прихода не важен. Тестовые события в человека не идут, если есть хоть одно настоящее; из одних
 * тестовых — человек с отметкой `test`. Роль события — из справочника: событие, которое ей не годится, даёт
 * только отправителя, время, касания и признаки конверта, а вехам, первым событиям и разрезам — свой тип.
 * Событий нет — null.
 */
export var foldPerson = (setup: Setup) =>
  (
    (lookups) =>
    (subject: string, history: readonly HistoryEvent[]): Person | null =>
      ((real) =>
        ((events) =>
          events.length === 0
            ? null
            : _finish(
                subject,
                events,
                real.length === 0,
                events.reduce(_step(lookups), _START),
                lookups
              ))((real.length > 0 ? real : history).toSorted(_byTime)))(
        history.filter((_) => !_.test)
      )
  )(_lookupsOf(setup));

/**
 * Состояние человека в момент `now` (ISO 8601): ушёл — после последней оплаты пришёл «конец доступа» или
 * прошёл её `paid_until`; вернулся — не ушёл, а среди оплат есть оплата после конца доступа; клиент — есть
 * оплата; пробный период — оплат нет, а он начат; иначе новый.
 */
export var stateOf = (facts: StateFacts, now: string): PersonState =>
  facts.payments === 0
    ? facts.trialAt === null
      ? 'new'
      : 'trial'
    : facts.lapsedAt !== null ||
        (facts.paidUntil !== null && facts.paidUntil < now)
      ? 'lapsed'
      : facts.returnedAt === null
        ? 'customer'
        : 'returned';

/**
 * Доступ в момент `at`: есть отрезок, начатый раньше него и без конца или с концом не раньше него, — как у
 * `stateOf`: `paid_until` ровно в «сейчас» ещё не прошёл.
 */
export var accessAt = (access: readonly AccessSpan[], at: string): boolean =>
  access.some((_) => _[0] < at && (_[1] === null || _[1] >= at));

/**
 * Доступ в промежутке `[from, to)` (месяц когорты): есть отрезок, начатый раньше конца промежутка и без конца
 * или с концом позже его начала. Продление ровно в конце срока — тот же отрезок, перерыва нет.
 */
export var accessIn = (
  access: readonly AccessSpan[],
  from: string,
  to: string
): boolean => access.some((_) => _[0] < to && (_[1] === null || _[1] > from));

/**
 * Веха в момент `now`: достиг; не достиг, а окно ещё идёт, — «ещё в окне», в долю не входит; иначе — не
 * достиг: окна нет, оно кончилось (конец не позже «сейчас») или веха без срока.
 */
export var milestoneStateOf = (
  fact: MilestoneFact,
  now: string
): MilestoneState =>
  fact[0] !== null
    ? 'reached'
    : fact[1] !== null && fact[1] > now
      ? 'open'
      : 'missed';

/**
 * Первый вопрос опроса сайта — справочник ответов, первый по коду; вопросы в архиве — только если других
 * нет. null — опроса нет.
 */
export var firstQuestion = (setup: Setup): string | null =>
  setup.dictionaries
    .filter((_) => _.purpose === 'answers')
    .toSorted(
      (a, b) =>
        Number(a.archivedAt !== null) - Number(b.archivedAt !== null) ||
        (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)
    )[0]?.code ?? null;

/**
 * Источник привлечения: части первого касания со значением; их нет — ответ на первый вопрос опроса; нет и
 * ответа — неизвестно. Названия значений подставляет экран.
 */
export var acquisitionOf = (
  setup: Setup,
  facts: Pick<PersonFacts, 'firstParts' | 'answers'>
): Acquisition =>
  Object.keys(facts.firstParts).length > 0
    ? { kind: 'parts', parts: facts.firstParts }
    : ((question) =>
        question === null || !Object.hasOwn(facts.answers, question)
          ? { kind: 'unknown' }
          : {
              kind: 'answer',
              question,
              answer: (facts.answers[question] as Answer).answer,
            })(firstQuestion(setup));

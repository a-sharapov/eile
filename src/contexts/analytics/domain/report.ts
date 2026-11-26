import { addDays, type Day, type DayPeriod, dayIndex } from './days.ts';
import { partsOfVisit } from './labels.ts';
import { type BaseSum, baseSum } from './money.ts';
import {
  type Amounts,
  accessAt,
  type MilestoneFact,
  type MoneyEntry,
  milestoneStateOf,
  type PersonFacts,
  type PersonTouch,
  type ReturnFact,
} from './person.ts';
import type { VisitSums } from './ports.ts';
import { type LowDataThresholds, lowDataOf } from './quality.ts';
import {
  type FeesMode,
  flowsOf,
  type LifeMember,
  type LifeSpec,
  type Lifetime,
  type Ltv,
  lifeSpec,
  livedBounds,
  ltvCacOf,
  ltvOf,
  PAYBACK_MONTHS,
  type Payback,
  type Pricing,
  paybackOf,
  perHead,
  type Worth,
  within,
  worthOf,
} from './revenue.ts';
import type {
  FunnelStep,
  Milestone,
  Parts,
  Property,
  PropertyKind,
  Setup,
} from './setup.ts';
import type { ReportSpend } from './spend.ts';

/** Пороги «мало данных» ядра — без поправки `low_data` в настройке: 30 новых людей и 10 новых клиентов. */
export var LOW_DATA: LowDataThresholds = lowDataOf([]);

export var REPORT_LIMITS = {
  /** Строк группы; сверх них — «остальные». */
  rows: 50,
  filters: 10,
  /** Период в днях: `days` и `from`–`to`. */
  days: 3660,
} as const;

/** Значение строки «не указано»: метки нет, в ней нет этой части, у человека нет признака или ответа. */
export var NONE = '~none';
/** «Не из справочника», у группы `label` — «не из реестра»: незнакомые значения кодом в отчёт не выходят. */
export var UNKNOWN = '~unknown';
/** «Остальные» сверх предела строк. */
export var REST = '~rest';

/** Источник привлечения — части первого касания; источник возврата — части касания возвращения. */
export type Attribution = 'first' | 'return';

export type GroupKind =
  | 'part'
  | 'trait'
  | 'prop'
  | 'answer'
  | 'label'
  | 'sender';

/** Чем делятся строки: `code` — код части, признака, свойства или вопроса; у `label` и `sender` пусто. */
export type ReportGroup = { readonly kind: GroupKind; readonly code: string };

export type FilterKind = 'part' | 'trait' | 'prop' | 'answer' | 'sender';

/** Фильтр отчёта: значение — код, `~none` или `~unknown`; у `sender` — код отправителя, `code` пуст. */
export type ReportFilter = {
  readonly kind: FilterKind;
  readonly code: string;
  readonly value: string;
};

/** Окно оплаты в днях от прихода; 0 — без срока. */
export type PaymentWindow = 0 | 7 | 30;

/** Моменты UTC периода: от начала первого дня включительно до начала дня после последнего. */
export type Moments = { readonly from: string; readonly to: string };

/** Проверенные параметры отчёта. */
export type ReportParams = {
  readonly period: DayPeriod;
  readonly moments: Moments;
  readonly attribution: Attribution;
  readonly group: ReportGroup;
  readonly filters: readonly ReportFilter[];
  readonly window: PaymentWindow;
  readonly test: boolean;
  readonly limit: number;
};

/** Человек для отчёта: факты из таблицы людей, которые нужны отчётам и списку с их фильтрами. */
export type ReportPerson = Pick<
  PersonFacts,
  | 'subject'
  | 'lastAt'
  | 'senders'
  | 'arrivedAt'
  | 'firstTouch'
  | 'firstTouchConflict'
  | 'firstParts'
  | 'returns'
  | 'answers'
  | 'trialAt'
  | 'payments'
  | 'firstPaidAt'
  | 'paidUntil'
  | 'firstTermEnd'
  | 'lapsedAt'
  | 'returnedAt'
  | 'money'
  | 'feeMoney'
  | 'access'
  | 'milestones'
  | 'firsts'
  | 'dims'
  | 'traits'
>;

/**
 * Какие факты отчёту нужны сверх постоянных (приход, касание, части, оплаты, деньги, вехи): у остальных людей
 * они пустые — таблица отдаёт их пустыми, и их не разбирают. `fees` — комиссии по времени (после комиссии и
 * «Обзор»), `access` — отрезки доступа («Обзор» и когорты с `active`).
 */
export type ReportNeeds = {
  readonly returns: boolean;
  readonly answers: boolean;
  readonly firsts: boolean;
  readonly dims: boolean;
  readonly traits: boolean;
  readonly fees: boolean;
  readonly access: boolean;
};

/** Факты, которые нужны группе, фильтрам и атрибуции отчёта. */
export var needsOf = (
  params: Pick<ReportParams, 'attribution' | 'filters'> & {
    readonly group: ReportGroup | null;
  },
  extra: Partial<ReportNeeds> = {}
): ReportNeeds =>
  ((kinds) => ({
    returns: params.attribution === 'return',
    answers: kinds.has('answer'),
    firsts: false,
    dims: kinds.has('prop'),
    traits: kinds.has('trait'),
    fees: false,
    access: false,
    ...extra,
  }))(
    new Set<string>([
      ...params.filters.map((_) => _.kind),
      ...(params.group === null ? [] : [params.group.kind]),
    ])
  );

/** Доля: засчитанные из знаменателя; `open` — «ещё в окне», в знаменатель не входят. */
export type Share = {
  readonly count: number;
  readonly base: number;
  readonly open: number;
};

export type LowData = {
  /** Новых людей меньше 30 (у `return` — вернувшихся меньше 10): доли от людей приглушены. */
  readonly people: boolean;
  /** Новых клиентов меньше 10 (у `return` — вернувшихся): оплат на клиента и продление приглушены. */
  readonly customers: boolean;
};

/** Оплат на клиента: все оплаты новых клиентов и сами клиенты. */
export type PerCustomer = {
  readonly payments: number;
  readonly customers: number;
};

/**
 * Столбец «Источников», который есть у сайта; веха — со своим кодом и названием. Деньги этапа 3 — после
 * «Продления»; `payment7` и `payment30` — столбцы когорт по приходу.
 */
export type SourcesColumn =
  | {
      readonly kind:
        | 'people'
        | 'trial'
        | 'payment'
        | 'customers'
        | 'revenue'
        | 'perCustomer'
        | 'renewal'
        | 'ltvCustomer'
        | 'ltvPerson'
        | 'spend'
        | 'cac'
        | 'costPerPerson'
        | 'ltvCac'
        | 'payback'
        | 'returned'
        | 'payments'
        | 'payment7'
        | 'payment30';
    }
  | {
      readonly kind: 'milestone';
      readonly code: string;
      readonly name: string;
    };

/** Строка «Источников» при `attribution=first`; столбца нет у сайта — null. */
export type SourcesRow = {
  readonly value: string;
  readonly name: string | null;
  readonly people: number;
  readonly milestones: Readonly<Record<string, Share>>;
  readonly trial: Share | null;
  readonly payment: Share | null;
  readonly customers: number | null;
  /** По валютам; при `fees=net` — после комиссии, комиссия — из своей валюты. */
  readonly revenue: Amounts | null;
  readonly perCustomer: PerCustomer | null;
  readonly renewal: Share | null;
  /** Выручка одной цифрой в базовой валюте; null — нет базовой валюты или роли «оплата». */
  readonly revenueBase: BaseSum | null;
  readonly ltvCustomer: Ltv | null;
  readonly ltvPerson: Ltv | null;
  /** Расход строки долей дней периода; null — строк расхода у строки нет или расход не разложить. */
  readonly spend: BaseSum | null;
  /** Значение «ждёт расхода», а расхода в периоде нет: «расход не введён», а не «—». */
  readonly spendMissing: boolean;
  /** Расход / новые клиенты; расход есть, а клиентов нет — null («нет клиентов»). */
  readonly cac: number | null;
  readonly costPerPerson: number | null;
  readonly ltvCac: number | null;
  readonly payback: Payback | null;
  readonly lowData: LowData;
};

/** Строка «Источников» при `attribution=return`: оплаты и выручка — от возвращения до конца периода. */
export type ReturnRow = {
  readonly value: string;
  readonly name: string | null;
  readonly returned: number;
  readonly payments: number;
  readonly revenue: Amounts;
  /** Выручка с возвращения в базовой валюте; null — нет базовой валюты. */
  readonly revenueBase: BaseSum | null;
  readonly lowData: LowData;
};

/** Оплаты периода у людей итога и сколько из них с известной комиссией: только при `fees=net`. */
export type FeeCoverage = {
  readonly payments: number;
  readonly withFee: number;
};

export type SourcesDay = {
  readonly day: Day;
  readonly people: number;
  readonly customers: number;
};

export type ReturnDay = { readonly day: Day; readonly returned: number };

/** Таблица «Источников» без шапки отчёта: столбцы, итог по всем людям, строки и ряд по дням. */
export type SourcesBody =
  | {
      readonly attribution: 'first';
      readonly columns: readonly SourcesColumn[];
      readonly total: SourcesRow;
      readonly rows: readonly SourcesRow[];
      readonly daily: readonly SourcesDay[];
      readonly feeCoverage: FeeCoverage | null;
    }
  | {
      readonly attribution: 'return';
      readonly columns: readonly SourcesColumn[];
      readonly total: ReturnRow;
      readonly rows: readonly ReturnRow[];
      readonly daily: readonly ReturnDay[];
      readonly feeCoverage: FeeCoverage | null;
    };

/**
 * Деньги шага «оплата номер N»: суммы N-х оплат по валютам и они же на человека; в базовой валюте — одной суммой
 * и на заплатившего N-ю оплату (null — нет базовой валюты). Всегда до комиссии.
 */
export type StepMoney = {
  readonly amounts: Amounts;
  readonly perPerson: Amounts;
  readonly base: BaseSum | null;
  readonly perPersonBase: number | null;
};

/** Шаг воронки в отчёте; у шага-посещения при выключенном счёте посещений `count` — null. */
export type FunnelStepReport = {
  readonly step: FunnelStep;
  readonly side: 'visits' | 'people';
  readonly count: number | null;
  /** Вехи: не достигли, а окно ещё открыто — в счёт не входят. */
  readonly open: number;
  /** Свободный порядок: засчитаны на шаге, но не на каком-то шаге-человеке выше. */
  readonly skipped: number;
  readonly money: StepMoney | null;
  /** Шаг-посещение не получил части фильтров: признак, свойство, ответ, отправитель или страница входа. */
  readonly unfiltered: boolean;
  readonly lowData: boolean;
};

/** Шаг-человек: кто засчитан, сколько ещё в окне, сколько пропустили шаг выше. */
export type PeopleStep = {
  readonly counted: readonly ReportPerson[];
  readonly open: number;
  readonly skipped: number;
};

export type AnswersColumn = {
  readonly value: string;
  readonly name: string | null;
  readonly people: number;
};

export type AnswersRow = AnswersColumn & {
  readonly cells: Readonly<Record<string, number>>;
};

/** «Метка и ответ»: новые люди по значениям группы (строки) и по ответам на вопрос (столбцы). */
export type AnswersBody = {
  readonly columns: readonly AnswersColumn[];
  readonly total: AnswersRow;
  readonly rows: readonly AnswersRow[];
};

/** Что отчёт знает о настройке: названия значений, свойства, отправители, реестр меток и пороги «мало данных». */
export type ReportLookups = {
  readonly setup: Setup;
  /** Пороги «мало данных» из настройки: правка действует со следующего отчёта. */
  readonly lowData: LowDataThresholds;
  /** Справочник → код значения → название; архив тоже. */
  readonly values: ReadonlyMap<string, ReadonlyMap<string, string>>;
  /** `область/код` → свойство. */
  readonly properties: ReadonlyMap<string, Property>;
  readonly senders: ReadonlyMap<string, string>;
  /** `отправитель/метка` → название из реестра. */
  readonly labels: ReadonlyMap<string, string>;
};

/** Чьи части и какое касание у человека в отчёте: первого касания или возвращения. */
type _Seen = {
  readonly parts: Parts;
  readonly touch: PersonTouch | null;
};

const _DAY_MS = 86_400_000;
const _NO_WINDOW: MilestoneFact = [null, null, null];

const _own = <T>(
  record: Readonly<Record<string, T>>,
  key: string
): T | undefined => (Object.hasOwn(record, key) ? record[key] : undefined);

const _isSpecial = (value: string): boolean => value.startsWith('~');

const _keyOf = (sender: string, label: string): string => `${sender}/${label}`;

/** Метка, как её знает реестр: без пробелов по краям и строчными, как её разбирает схема. */
export var labelKey = (label: string): string => label.trim().toLowerCase();

/** Названия значений, свойства, отправители и реестр меток для отчёта. */
export var reportLookups = (
  setup: Setup,
  registry: readonly {
    readonly sender: string;
    readonly label: string;
    readonly name: string;
  }[] = []
): ReportLookups => ({
  setup,
  lowData: lowDataOf(setup.checks),
  values: new Map(
    Array.from(
      Map.groupBy(setup.values, (_) => _.dictionary),
      (entry) => [entry[0], new Map(entry[1].map((_) => [_.code, _.name]))]
    )
  ),
  properties: new Map(setup.properties.map((_) => [`${_.scope}/${_.code}`, _])),
  senders: new Map(setup.senders.map((_) => [_.code, _.name])),
  labels: new Map(registry.map((_) => [_keyOf(_.sender, _.label), _.name])),
});

// Значение выбора: код из справочника (и в архиве), иначе «не из справочника»; нет значения — «не указано».
const _choice = (
  lookups: ReportLookups,
  dictionary: string | null,
  raw: unknown
): string =>
  raw === undefined || raw === null
    ? NONE
    : typeof raw === 'string' &&
        dictionary !== null &&
        lookups.values.get(dictionary)?.has(raw) === true
      ? raw
      : UNKNOWN;

// Разрез — строкой: число и «да или нет» как есть, выбор — кодом из справочника; не того вида — незнакомое.
const _DIM: Readonly<
  Partial<
    Record<
      PropertyKind,
      (raw: unknown, property: Property, lookups: ReportLookups) => string
    >
  >
> = {
  choice: (raw, property, lookups) =>
    _choice(lookups, property.dictionary, raw),
  number: (raw) =>
    typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : UNKNOWN,
  boolean: (raw) => (typeof raw === 'boolean' ? String(raw) : UNKNOWN),
};

const _dim = (
  property: Property | undefined,
  raw: unknown,
  lookups: ReportLookups
): string =>
  raw === undefined || raw === null
    ? NONE
    : property === undefined
      ? UNKNOWN
      : (_DIM[property.kind]?.(raw, property, lookups) ?? UNKNOWN);

const _VALUE: Readonly<
  Record<
    GroupKind,
    (
      code: string,
      person: ReportPerson,
      seen: _Seen,
      lookups: ReportLookups
    ) => string
  >
> = {
  part: (code, _person, seen, lookups) =>
    _choice(lookups, code, _own(seen.parts, code)),
  trait: (code, person, _seen, lookups) =>
    _dim(
      lookups.properties.get(`person/${code}`),
      _own(person.traits, code),
      lookups
    ),
  prop: (code, person, _seen, lookups) =>
    _dim(
      lookups.properties.get(`event/${code}`),
      _own(person.dims, code),
      lookups
    ),
  answer: (code, person, _seen, lookups) =>
    _choice(lookups, code, _own(person.answers, code)?.answer),
  label: (_code, _person, seen, lookups) =>
    seen.touch === null || labelKey(seen.touch.label) === ''
      ? NONE
      : ((label) =>
          lookups.labels.has(_keyOf(seen.touch?.sender ?? '', label))
            ? label
            : UNKNOWN)(labelKey(seen.touch.label)),
  sender: (_code, _person, seen, lookups) =>
    seen.touch === null
      ? NONE
      : lookups.senders.has(seen.touch.sender)
        ? seen.touch.sender
        : UNKNOWN,
};

const _first = (person: ReportPerson): _Seen => ({
  parts: person.firstParts,
  touch: person.firstTouch,
});

const _seenOf = (back: ReturnFact): _Seen => ({
  parts: back.parts,
  touch: back.touch,
});

const _matches = (
  person: ReportPerson,
  seen: _Seen,
  filters: readonly ReportFilter[],
  lookups: ReportLookups
): boolean =>
  filters.every((_) =>
    _.kind === 'sender'
      ? person.senders.includes(_.value)
      : _VALUE[_.kind](_.code, person, seen, lookups) === _.value
  );

/** Значение группы у человека: код, `~none` или `~unknown` — никогда не текст из события. */
export var groupValue = (
  group: ReportGroup,
  person: ReportPerson,
  lookups: ReportLookups
): string => _VALUE[group.kind](group.code, person, _first(person), lookups);

const _choiceName = (
  lookups: ReportLookups,
  dictionary: string | null,
  value: string
): string | null =>
  dictionary === null
    ? null
    : (lookups.values.get(dictionary)?.get(value) ?? null);

const _NAME: Readonly<
  Record<
    GroupKind,
    (code: string, value: string, lookups: ReportLookups) => string | null
  >
> = {
  part: (code, value, lookups) => _choiceName(lookups, code, value),
  answer: (code, value, lookups) => _choiceName(lookups, code, value),
  trait: (code, value, lookups) =>
    ((property) =>
      property?.kind === 'choice'
        ? _choiceName(lookups, property.dictionary, value)
        : null)(lookups.properties.get(`person/${code}`)),
  prop: (code, value, lookups) =>
    ((property) =>
      property?.kind === 'choice'
        ? _choiceName(lookups, property.dictionary, value)
        : null)(lookups.properties.get(`event/${code}`)),
  label: (_code, value, lookups) =>
    lookups.setup.senders
      .map((_) => lookups.labels.get(_keyOf(_.code, value)))
      .find((_) => _ !== undefined) ?? null,
  sender: (_code, value, lookups) => lookups.senders.get(value) ?? null,
};

/** Название значения группы из настройки или реестра; у `~none`, `~unknown`, `~rest` — null. */
export var valueName = (
  group: ReportGroup,
  value: string,
  lookups: ReportLookups
): string | null =>
  _isSpecial(value) ? null : _NAME[group.kind](group.code, value, lookups);

const _inside = (moment: string | null, moments: Moments): boolean =>
  moment !== null && moment >= moments.from && moment < moments.to;

const _arrived = (person: ReportPerson, moments: Moments): boolean =>
  _inside(person.arrivedAt, moments);

const _customer = (person: ReportPerson, moments: Moments): boolean =>
  _inside(person.firstPaidAt, moments);

/** Сумма записей денег по валютам; валюта с записями остаётся и с нулём — «0.00 EUR», а не «—». */
const _amounts = (entries: readonly MoneyEntry[]): Amounts =>
  Object.fromEntries(
    Array.from(
      Map.groupBy(entries, (_) => _[1]),
      (entry) => [entry[0], entry[1].reduce((sum, _) => sum + _[2], 0)]
    )
  );

const _sum = <T>(items: readonly T[], value: (item: T) => number): number =>
  items.reduce((sum, _) => sum + value(_), 0);

type _Ranked<T> = readonly [
  value: string,
  members: readonly T[],
  /** У «остальных» — свёрнутые значения: их расход складывается в строку. */
  folded: readonly string[],
];

// Строки: обычные — по размеру, затем по коду, до предела; сверх него — «остальные»; незнакомые и не
// указанные — в конце. Размер группы считается раз, а не в каждом сравнении.
const _ranked = <T>(
  groups: ReadonlyMap<string, readonly T[]>,
  size: (members: readonly T[]) => number,
  limit: number
): _Ranked<T>[] =>
  ((regular) => [
    ...regular.slice(0, limit).map((_): _Ranked<T> => [_[0], _[1], []]),
    ...[UNKNOWN, NONE].flatMap((value) =>
      ((members): _Ranked<T>[] =>
        members === undefined ? [] : [[value, members, []]])(groups.get(value))
    ),
    ...(regular.length > limit
      ? [
          [
            REST,
            regular.slice(limit).flatMap((_) => _[1]),
            regular.slice(limit).map((_) => _[0]),
          ] as _Ranked<T>,
        ]
      : []),
  ])(
    Array.from(groups)
      .filter((_) => !_isSpecial(_[0]))
      .map((_) => [_[0], _[1], size(_[1])] as const)
      .toSorted(
        (a, b) => b[2] - a[2] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
      )
  );

/** Столбцы вех: с отметкой «столбцом», не в архиве, по порядку. */
export var columnMilestones = (setup: Setup): readonly Milestone[] =>
  setup.milestones
    .filter((_) => _.column && _.archivedAt === null)
    .toSorted((a, b) => a.position - b.position || (a.code < b.code ? -1 : 1));

/** Есть ли у сайта тип с этой ролью. */
export var hasRole = (setup: Setup, role: string): boolean =>
  setup.types.some((_) => _.role === role);

/** Доля достигших вехи: «ещё в окне» — отдельно, в знаменатель не входят. */
export var milestoneShare = (
  cohort: readonly ReportPerson[],
  code: string,
  now: string
): Share =>
  ((states) =>
    ((open) => ({
      count: states.filter((_) => _ === 'reached').length,
      base: cohort.length - open,
      open,
    }))(states.filter((_) => _ === 'open').length))(
    cohort.map((_) =>
      milestoneStateOf(_own(_.milestones, code) ?? _NO_WINDOW, now)
    )
  );

// Оплата за окно: первая оплата не позже прихода + W дней; не заплатил, а окно ещё идёт, — «ещё в окне».
type _Paid = 'within' | 'open' | 'missed';

// Один разбор моментов на человека: заплатил в окне, ещё в окне или нет.
const _paidIn = (person: ReportPerson, limit: number, at: number): _Paid =>
  ((arrived) =>
    person.firstPaidAt !== null &&
    Date.parse(person.firstPaidAt) - arrived <= limit
      ? 'within'
      : arrived + limit > at
        ? 'open'
        : 'missed')(Date.parse(person.arrivedAt));

/** «Оплата за окно»: первая оплата не позже прихода + W дней; не заплатил, а окно идёт, — «ещё в окне». */
export var paymentShare = (
  cohort: readonly ReportPerson[],
  window: PaymentWindow,
  now: string
): Share =>
  window === 0
    ? {
        count: cohort.filter((_) => _.firstPaidAt !== null).length,
        base: cohort.length,
        open: 0,
      }
    : ((states) =>
        ((open) => ({
          count: states.filter((_) => _ === 'within').length,
          base: cohort.length - open,
          open,
        }))(states.filter((_) => _ === 'open').length))(
        cohort.map((_) => _paidIn(_, window * _DAY_MS, Date.parse(now)))
      );

// Продление: вторая оплата среди тех, у кого она есть или кончился первый срок; остальные — ещё в сроке.
const _renewalShare = (
  customers: readonly ReportPerson[],
  now: string
): Share =>
  ((base) => ({
    count: customers.filter((_) => _.payments >= 2).length,
    base,
    open: customers.length - base,
  }))(
    customers.filter(
      (_) =>
        _.payments >= 2 || (_.firstTermEnd !== null && _.firstTermEnd <= now)
    ).length
  );

/** Деньги «Источников»: перевод, комиссия, срок жизни, расход отчёта и значения, ждущие расхода. */
export type SourcesMoney = {
  /** null — у сайта нет базовой валюты: выручка — по валютам, LTV, расхода и CAC нет. */
  readonly pricing: Pricing | null;
  readonly fees: FeesMode;
  readonly life: Lifetime;
  /** Расход отчёта; null — у сайта нет строк расхода или базовой валюты. */
  readonly spend: ReportSpend | null;
  /** Значения части группы с отметкой «ждёт расхода», не в архиве. */
  readonly awaiting: ReadonlySet<string>;
};

/** Без денег этапа 3: выручка по валютам до комиссии, как на этапе 2. */
export var NO_MONEY: SourcesMoney = {
  pricing: null,
  fees: 'gross',
  life: 0,
  spend: null,
  awaiting: new Set(),
};

// Разбор денег человека — по разу на отчёт: человек считается и в строке, и в итоге.
const _memo = <K extends object, V>(make: (key: K) => V): ((key: K) => V) => {
  const cache = new WeakMap<K, V>();
  return (key) =>
    cache.get(key) ?? ((value) => (cache.set(key, value), value))(make(key));
};

/** Деньги людей в отчёте: по валютам с комиссией по переключателю, в базовой валюте, срок жизни. */
type _MoneySpec = {
  readonly money: SourcesMoney;
  readonly flows: (person: ReportPerson) => readonly MoneyEntry[];
  /** В базовой валюте; без неё — пусто. */
  readonly worth: (person: ReportPerson) => readonly Worth[];
  readonly life: LifeSpec;
  /** Границы окупаемости: `shiftMonths(сейчас, −m)`, m = 0…24. */
  readonly back: readonly string[];
  readonly low: LowDataThresholds;
};

const _EMPTY_WORTH: readonly Worth[] = [];

const _NO_WORTH = (): readonly Worth[] => _EMPTY_WORTH;

// Память — только у людей с деньгами: у большинства новых людей денег нет, и словарь на каждого стоил бы больше
// самого разбора (замер «Источников» на 40 000 человек).
const _moneySpec = (
  money: SourcesMoney,
  now: string,
  low: LowDataThresholds
): _MoneySpec =>
  ((flows) => ({
    money,
    flows,
    low,
    worth: ((pricing) =>
      pricing === null
        ? _NO_WORTH
        : (
            (priced) => (person: ReportPerson) =>
              flows(person).length === 0 ? _EMPTY_WORTH : priced(person)
          )(_memo((person: ReportPerson) => worthOf(flows(person), pricing))))(
      money.pricing
    ),
    life: lifeSpec(money.life, now),
    back: livedBounds(now, PAYBACK_MONTHS),
  }))(
    money.fees === 'net'
      ? (
          (netted) => (person: ReportPerson) =>
            person.feeMoney.length === 0 ? person.money : netted(person)
        )(_memo((person: ReportPerson) => flowsOf(person, 'net')))
      : (person: ReportPerson) => person.money
  );

type _FirstSpec = _MoneySpec & {
  readonly moments: Moments;
  readonly window: PaymentWindow;
  readonly now: string;
  readonly milestones: readonly Milestone[];
  readonly trial: boolean;
  readonly payment: boolean;
  readonly renewal: boolean;
};

type _RowMoney = Pick<
  SourcesRow,
  | 'revenueBase'
  | 'ltvCustomer'
  | 'ltvPerson'
  | 'spend'
  | 'spendMissing'
  | 'cac'
  | 'costPerPerson'
  | 'ltvCac'
  | 'payback'
>;

// Деньги строки: выручка в базовой валюте, LTV на клиента и на человека, расход и всё, что из него следует.
// `moneyed` — люди строки, у которых есть деньги.
const _rowMoney = (
  moneyed: readonly ReportPerson[],
  cohort: readonly ReportPerson[],
  customers: readonly ReportPerson[],
  spend: BaseSum | null,
  awaiting: boolean,
  spec: _FirstSpec
): _RowMoney =>
  ((paying) =>
    ((buyers, cac) =>
      ((ltvCustomer) => ({
        revenueBase: paying
          ? baseSum(
              moneyed.flatMap((_) =>
                within(spec.worth(_), spec.moments.from, spec.moments.to)
              )
            )
          : null,
        ltvCustomer,
        ltvPerson: paying
          ? ltvOf(
              cohort,
              spec.life,
              spec.low.people,
              (_) => _.arrivedAt,
              spec.worth
            )
          : null,
        spend,
        spendMissing:
          awaiting && spend === null && spec.money.spend?.scope === 'rows',
        cac,
        costPerPerson:
          spend === null ? null : perHead(spend.value, cohort.length),
        ltvCac: ltvCacOf(ltvCustomer?.value ?? null, cac),
        payback:
          paying && spend !== null ? paybackOf(buyers, cac, spec.back) : null,
      }))(paying ? ltvOf(buyers, spec.life, spec.low.customers) : null))(
      paying
        ? customers.map(
            (_): LifeMember => ({
              start: _.firstPaidAt as string,
              worth: spec.worth(_),
            })
          )
        : [],
      spend === null || !spec.payment
        ? null
        : perHead(spend.value, customers.length)
    ))(spec.payment && spec.money.pricing !== null);

const _firstRow = (
  value: string,
  name: string | null,
  people: readonly ReportPerson[],
  spec: _FirstSpec,
  spend: BaseSum | null,
  awaiting: boolean
): SourcesRow =>
  ((cohort, customers, moneyed) => ({
    value,
    name,
    people: cohort.length,
    milestones: Object.fromEntries(
      spec.milestones.map((_) => [
        _.code,
        milestoneShare(cohort, _.code, spec.now),
      ])
    ),
    trial: spec.trial ? trialShare(cohort) : null,
    payment: spec.payment ? paymentShare(cohort, spec.window, spec.now) : null,
    customers: spec.payment ? customers.length : null,
    revenue: spec.payment
      ? _amounts(
          moneyed.flatMap((person) =>
            spec.flows(person).filter((_) => _inside(_[0], spec.moments))
          )
        )
      : null,
    perCustomer: spec.payment
      ? {
          payments: _sum(customers, (_) => _.payments),
          customers: customers.length,
        }
      : null,
    renewal: spec.renewal ? _renewalShare(customers, spec.now) : null,
    ..._rowMoney(moneyed, cohort, customers, spend, awaiting, spec),
    lowData: {
      people: cohort.length < spec.low.people,
      customers: spec.payment && customers.length < spec.low.customers,
    },
  }))(
    people.filter((_) => _arrived(_, spec.moments)),
    people.filter((_) => _customer(_, spec.moments)),
    people.filter((_) => spec.flows(_).length > 0)
  );

/** Доля начавших пробный период среди новых людей: окна нет — «ещё в окне» не бывает. */
export var trialShare = (cohort: readonly ReportPerson[]): Share => ({
  count: cohort.filter((_) => _.trialAt !== null).length,
  base: cohort.length,
  open: 0,
});

const _days = (period: DayPeriod, bounds: readonly string[]): Day[] =>
  Array.from({ length: bounds.length - 1 }, (_, n) => addDays(period.from, n));

const _byDay = <T>(
  items: readonly T[],
  bounds: readonly string[],
  moment: (item: T) => string | null
): ReadonlyMap<number, readonly T[]> =>
  Map.groupBy(items, (_) =>
    ((at) => (at === null ? -1 : dayIndex(bounds, at)))(moment(_))
  );

// Человек в «Источниках» при first: пришёл в периоде, впервые заплатил в нём или у него есть в нём деньги
// (после комиссии — и комиссия: уточнение без оплаты стоит своим моментом).
const _relevant = (
  person: ReportPerson,
  moments: Moments,
  fees: FeesMode
): boolean =>
  _arrived(person, moments) ||
  _customer(person, moments) ||
  person.money.some((_) => _inside(_[0], moments)) ||
  (fees === 'net' && person.feeMoney.some((_) => _inside(_[0], moments)));

const _relevantOf = (
  people: readonly ReportPerson[],
  params: ReportParams,
  lookups: ReportLookups,
  fees: FeesMode
): ReportPerson[] =>
  people.filter(
    (_) =>
      _relevant(_, params.moments, fees) &&
      _matches(_, _first(_), params.filters, lookups)
  );

const _firstSpec = (
  relevant: readonly ReportPerson[],
  params: ReportParams,
  lookups: ReportLookups,
  now: string,
  money: SourcesMoney
): _FirstSpec => ({
  ..._moneySpec(money, now, lookups.lowData),
  moments: params.moments,
  window: params.window,
  now,
  milestones: columnMilestones(lookups.setup),
  trial: hasRole(lookups.setup, 'trial'),
  payment: hasRole(lookups.setup, 'payment'),
  // Продление — у клиентов: роль «конец доступа» или первый срок у кого-то из новых клиентов отчёта.
  renewal:
    hasRole(lookups.setup, 'payment') &&
    (hasRole(lookups.setup, 'lapse') ||
      relevant.some(
        (_) => _customer(_, params.moments) && _.firstTermEnd !== null
      )),
});

type _Span = {
  readonly person: ReportPerson;
  readonly from: string;
  readonly to: string;
};

// Комиссия известна у оплаты, у момента которой есть запись комиссии: запись комиссии стоит моментом своей
// оплаты, но на оплату не ссылается.
const _coverage = (spans: readonly _Span[]): FeeCoverage =>
  spans.reduce<FeeCoverage>(
    (all, span) =>
      ((paid) =>
        paid.length === 0
          ? all
          : ((fees) => ({
              payments: all.payments + paid.length,
              withFee: all.withFee + paid.filter((_) => fees.has(_[0])).length,
            }))(new Set(span.person.feeMoney.map((_) => _[0]))))(
        span.person.money.filter(
          (_) => _[2] > 0 && _[0] >= span.from && _[0] < span.to
        )
      ),
    { payments: 0, withFee: 0 }
  );

// Расход строки отчёта: значение части группы; у «остальных» — сумма свёрнутых значений.
const _rowSpend = (
  value: string,
  folded: readonly string[],
  spend: ReportSpend | null
): BaseSum | null =>
  spend === null || spend.scope !== 'rows'
    ? null
    : value === REST
      ? ((entries) => (entries.length === 0 ? null : baseSum(entries)))(
          folded.flatMap((_) => spend.entries.get(_) ?? [])
        )
      : (spend.rows.get(value) ?? null);

// Значения части, на которые в периоде есть расход, — строки и без людей: потратили и никого не привели.
const _withSpend = <T>(
  groups: ReadonlyMap<string, readonly T[]>,
  spend: ReportSpend | null
): ReadonlyMap<string, readonly T[]> =>
  spend === null || spend.scope !== 'rows'
    ? groups
    : new Map([
        ...groups,
        ...[...spend.rows.keys()]
          .filter((_) => !groups.has(_))
          .map((_) => [_, []] as const),
      ]);

const _COLUMNS_PAID = [
  'payment',
  'customers',
  'revenue',
  'perCustomer',
] as const;

const _sourcesFirst = (
  people: readonly ReportPerson[],
  params: ReportParams,
  lookups: ReportLookups,
  now: string,
  bounds: readonly string[],
  money: SourcesMoney
): SourcesBody =>
  ((relevant) =>
    ((spec) =>
      ((groups) => ({
        attribution: 'first' as const,
        columns: [
          { kind: 'people' as const },
          ...spec.milestones.map((_) => ({
            kind: 'milestone' as const,
            code: _.code,
            name: _.name,
          })),
          ...(spec.trial ? [{ kind: 'trial' as const }] : []),
          ...(spec.payment ? _COLUMNS_PAID.map((kind) => ({ kind })) : []),
          ...(spec.renewal ? [{ kind: 'renewal' as const }] : []),
          ...(spec.payment && money.pricing !== null
            ? (['ltvCustomer', 'ltvPerson'] as const).map((kind) => ({ kind }))
            : []),
          ...(money.spend === null
            ? []
            : [
                { kind: 'spend' as const },
                ...(spec.payment ? [{ kind: 'cac' as const }] : []),
                { kind: 'costPerPerson' as const },
                ...(spec.payment
                  ? (['ltvCac', 'payback'] as const).map((kind) => ({ kind }))
                  : []),
              ]),
        ],
        total: _firstRow(
          '',
          null,
          relevant,
          spec,
          money.spend?.total ?? null,
          false
        ),
        rows: _ranked(
          groups,
          (_) => _.filter((person) => _arrived(person, params.moments)).length,
          params.limit
        ).map((_) =>
          _firstRow(
            _[0],
            valueName(params.group, _[0], lookups),
            _[1],
            spec,
            _rowSpend(_[0], _[2], money.spend),
            money.awaiting.has(_[0])
          )
        ),
        daily: ((arrivals, customers) =>
          _days(params.period, bounds).map((day, n) => ({
            day,
            people: arrivals.get(n)?.length ?? 0,
            customers: customers.get(n)?.length ?? 0,
          })))(
          _byDay(
            relevant.filter((_) => _arrived(_, params.moments)),
            bounds,
            (_) => _.arrivedAt
          ),
          _byDay(
            relevant.filter((_) => _customer(_, params.moments)),
            bounds,
            (_) => _.firstPaidAt
          )
        ),
        feeCoverage:
          money.fees === 'net' && spec.payment
            ? _coverage(
                relevant.map((person) => ({
                  person,
                  from: params.moments.from,
                  to: params.moments.to,
                }))
              )
            : null,
      }))(
        _withSpend(
          Map.groupBy(relevant, (_) => groupValue(params.group, _, lookups)),
          money.spend
        )
      ))(_firstSpec(relevant, params, lookups, now, money)))(
    _relevantOf(people, params, lookups, money.fees)
  );

/** Возвращение человека в «Источниках» при return: последнее в периоде; null — в периоде его нет. */
export var returnIn = (
  person: ReportPerson,
  moments: Moments
): ReturnFact | null =>
  person.returns.findLast((_) => _inside(_.at, moments)) ?? null;

type _Back = { readonly person: ReportPerson; readonly back: ReturnFact };

const _since = (
  back: _Back,
  moments: Moments,
  spec: _MoneySpec
): readonly MoneyEntry[] =>
  spec
    .flows(back.person)
    .filter((_) => _[0] >= back.back.at && _[0] < moments.to);

const _returnRow = (
  value: string,
  name: string | null,
  backs: readonly _Back[],
  moments: Moments,
  spec: _MoneySpec
): ReturnRow =>
  ((entries) => ({
    value,
    name,
    returned: backs.length,
    payments: entries.filter((_) => _[2] > 0).length,
    revenue: _amounts(entries),
    revenueBase:
      spec.money.pricing === null
        ? null
        : baseSum(
            backs.flatMap((_) =>
              within(spec.worth(_.person), _.back.at, moments.to)
            )
          ),
    lowData: {
      people: backs.length < spec.low.customers,
      customers: backs.length < spec.low.customers,
    },
  }))(backs.flatMap((_) => _since(_, moments, spec)));

const _backsOf = (
  people: readonly ReportPerson[],
  params: ReportParams,
  lookups: ReportLookups
): _Back[] =>
  people.flatMap((person): _Back[] =>
    ((back) =>
      back !== null && _matches(person, _seenOf(back), params.filters, lookups)
        ? [{ person, back }]
        : [])(returnIn(person, params.moments))
  );

const _sourcesReturn = (
  people: readonly ReportPerson[],
  params: ReportParams,
  lookups: ReportLookups,
  now: string,
  bounds: readonly string[],
  money: SourcesMoney
): SourcesBody =>
  ((backs, spec) =>
    ((groups) => ({
      attribution: 'return' as const,
      columns: [
        { kind: 'returned' as const },
        { kind: 'payments' as const },
        { kind: 'revenue' as const },
      ],
      total: _returnRow('', null, backs, params.moments, spec),
      rows: _ranked(groups, (_) => _.length, params.limit).map((_) =>
        _returnRow(
          _[0],
          valueName(params.group, _[0], lookups),
          _[1],
          params.moments,
          spec
        )
      ),
      daily: ((byDay) =>
        _days(params.period, bounds).map((day, n) => ({
          day,
          returned: byDay.get(n)?.length ?? 0,
        })))(_byDay(backs, bounds, (_) => _.back.at)),
      feeCoverage:
        money.fees === 'net'
          ? _coverage(
              backs.map((_) => ({
                person: _.person,
                from: _.back.at,
                to: params.moments.to,
              }))
            )
          : null,
    }))(
      Map.groupBy(backs, (_) =>
        _VALUE[params.group.kind](
          params.group.code,
          _.person,
          _seenOf(_.back),
          lookups
        )
      )
    ))(
    _backsOf(people, params, lookups),
    _moneySpec(money, now, lookups.lowData)
  );

/**
 * «Источники»: строки по группе, итог по всем людям (а не сумма долей строк), ряд по дням пояса. `people` —
 * люди, у которых есть что-то не раньше начала периода; `bounds` — границы дней периода (`dayBounds`); `money` —
 * деньги этапа 3: базовая валюта, комиссия, срок жизни и расход.
 */
export var sourcesOf = (
  people: readonly ReportPerson[],
  params: ReportParams,
  lookups: ReportLookups,
  now: string,
  bounds: readonly string[],
  money: SourcesMoney = NO_MONEY
): SourcesBody =>
  params.attribution === 'first'
    ? _sourcesFirst(people, params, lookups, now, bounds, money)
    : _sourcesReturn(people, params, lookups, now, bounds, money);

/**
 * Итог «Источников» другого периода — для сравнения: те же фильтры, срок жизни и комиссия, свой расход, «сейчас»
 * то же; строки не считаются.
 */
export var sourcesTotalOf = (
  people: readonly ReportPerson[],
  params: ReportParams,
  lookups: ReportLookups,
  now: string,
  money: SourcesMoney = NO_MONEY
): SourcesRow | ReturnRow =>
  params.attribution === 'first'
    ? ((relevant) =>
        _firstRow(
          '',
          null,
          relevant,
          _firstSpec(relevant, params, lookups, now, money),
          money.spend?.total ?? null,
          false
        ))(_relevantOf(people, params, lookups, money.fees))
    : _returnRow(
        '',
        null,
        _backsOf(people, params, lookups),
        params.moments,
        _moneySpec(money, now, lookups.lowData)
      );

/** Новые люди периода под фильтрами — когорта воронки и «Метки и ответа»; атрибуция — первое касание. */
export var cohortOf = (
  people: readonly ReportPerson[],
  params: Pick<ReportParams, 'moments' | 'filters'>,
  lookups: ReportLookups
): ReportPerson[] =>
  people.filter(
    (_) =>
      _arrived(_, params.moments) &&
      _matches(_, _first(_), params.filters, lookups)
  );

/** Люди под фильтрами отчёта при атрибуции: части касания возвращения — у последнего возвращения в периоде. */
export var filteredBy = (
  person: ReportPerson,
  params: Pick<ReportParams, 'attribution' | 'filters'> & {
    readonly moments: Moments | null;
  },
  lookups: ReportLookups
): boolean =>
  params.attribution === 'first'
    ? (params.moments === null || _arrived(person, params.moments)) &&
      _matches(person, _first(person), params.filters, lookups)
    : ((back) =>
        back !== null &&
        _matches(person, _seenOf(back), params.filters, lookups))(
        params.moments === null
          ? (person.returns.at(-1) ?? null)
          : returnIn(person, params.moments)
      );

type _PeopleKind = Exclude<FunnelStep['kind'], 'visits' | 'goal'>;

const _payments = (person: ReportPerson): readonly MoneyEntry[] =>
  person.money.filter((_) => _[2] > 0);

// Момент шага у человека: приход, пробный период, N-я оплата, веха, первое событие типа; null — не было.
const _MOMENT: Readonly<
  Record<_PeopleKind, (step: FunnelStep, person: ReportPerson) => string | null>
> = {
  arrival: (_step, person) => person.arrivedAt,
  trial: (_step, person) => person.trialAt,
  payment: (step, person) =>
    _payments(person)[(step as { readonly number: number }).number - 1]?.[0] ??
    null,
  milestone: (step, person) =>
    _own(
      person.milestones,
      (step as { readonly milestone: string }).milestone
    )?.[0] ?? null,
  type: (step, person) =>
    ((typed) => _own(person.firsts, `${typed.sender}/${typed.type}`) ?? null)(
      step as { readonly sender: string; readonly type: string }
    ),
};

/** Момент шага-человека; у шага-посещения — null. */
export var stepMoment = (
  step: FunnelStep,
  person: ReportPerson
): string | null =>
  step.kind === 'visits' || step.kind === 'goal'
    ? null
    : _MOMENT[step.kind](step, person);

const _isOpen = (
  step: FunnelStep,
  person: ReportPerson,
  now: string
): boolean =>
  step.kind === 'milestone' &&
  milestoneStateOf(
    _own(person.milestones, step.milestone) ?? _NO_WINDOW,
    now
  ) === 'open';

type _Alive = { readonly person: ReportPerson; readonly at: string };

// Строгий порядок: засчитан на шаге, если засчитан на предыдущем и момент шага не раньше его момента.
const _strict = (
  cohort: readonly ReportPerson[],
  steps: readonly FunnelStep[],
  now: string
): PeopleStep[] =>
  steps.reduce<{
    readonly alive: readonly _Alive[];
    readonly done: readonly PeopleStep[];
  }>(
    (acc, step) =>
      ((next) => ({
        alive: next,
        done: [
          ...acc.done,
          {
            counted: next.map((_) => _.person),
            open: acc.alive.filter((_) => _isOpen(step, _.person, now)).length,
            skipped: 0,
          },
        ],
      }))(
        acc.alive.flatMap(({ person, at }) =>
          ((moment) =>
            moment !== null && moment >= at ? [{ person, at: moment }] : [])(
            stepMoment(step, person)
          )
        )
      ),
    { alive: cohort.map((person) => ({ person, at: '' })), done: [] }
  ).done as PeopleStep[];

// Свободный порядок: засчитан, если момент шага есть; пропустил — не засчитан на каком-то шаге выше.
const _free = (
  cohort: readonly ReportPerson[],
  steps: readonly FunnelStep[],
  now: string
): PeopleStep[] =>
  steps.map((step, index) =>
    ((counted) => ({
      counted,
      open: cohort.filter((_) => _isOpen(step, _, now)).length,
      skipped: counted.filter((person) =>
        steps.slice(0, index).some((_) => stepMoment(_, person) === null)
      ).length,
    }))(cohort.filter((_) => stepMoment(step, _) !== null))
  );

/** Шаги-люди воронки по когорте: строгий или свободный порядок. */
export var peopleSteps = (
  cohort: readonly ReportPerson[],
  steps: readonly FunnelStep[],
  strict: boolean,
  now: string
): PeopleStep[] =>
  strict ? _strict(cohort, steps, now) : _free(cohort, steps, now);

/**
 * Деньги шага «оплата номер N»: N-е оплаты засчитанных по валютам и на человека, заплатившего в этой валюте; в
 * базовой валюте — одной суммой и на заплатившего N-ю оплату.
 */
export var stepMoney = (
  counted: readonly ReportPerson[],
  number: number,
  pricing: Pricing | null = null
): StepMoney =>
  ((entries) =>
    ((base) => ({
      amounts: _amounts(entries),
      perPerson: Object.fromEntries(
        Array.from(
          Map.groupBy(entries, (_) => _[1]),
          (entry) => [
            entry[0],
            Math.round(_sum(entry[1], (_) => _[2]) / entry[1].length),
          ]
        )
      ),
      base,
      perPersonBase: base === null ? null : perHead(base.value, entries.length),
    }))(
      pricing === null
        ? null
        : baseSum(entries.map((_) => pricing.price(_[1], _[2], _[0])))
    ))(
    counted.flatMap((person) =>
      ((entry) => (entry === undefined ? [] : [entry]))(
        _payments(person)[number - 1]
      )
    )
  );

/** Шаг-человек в отчёте воронки; деньги шагов оплаты — до комиссии; «мало данных» — по порогу людей. */
export var peopleStepReport = (
  step: FunnelStep,
  result: PeopleStep,
  pricing: Pricing | null = null,
  low: LowDataThresholds = LOW_DATA
): FunnelStepReport => ({
  step,
  side: 'people',
  count: result.counted.length,
  open: result.open,
  skipped: result.skipped,
  money:
    step.kind === 'payment'
      ? stepMoney(result.counted, step.number, pricing)
      : null,
  unfiltered: false,
  lowData: result.counted.length < low.people,
});

/**
 * Шаг-посещение: посетители дня или достигшие цели из сводок статистики. Фильтры частей — через `origin`:
 * строки сводки разбираются `partsOfVisit`; остальные фильтры и шаг со страницей входа их не получают.
 * Счёт посещений выключен — `count` null.
 */
export var visitStepReport = (
  step: FunnelStep,
  sums: VisitSums | null,
  filters: readonly ReportFilter[],
  lookups: ReportLookups
): FunnelStepReport =>
  ((parts, paged) => ({
    step,
    side: 'visits',
    count:
      sums === null
        ? null
        : parts.length === 0 || paged
          ? sums.total
          : _sum(
              sums.origins.filter((row) =>
                ((visit) =>
                  parts.every(
                    (_) =>
                      _choice(lookups, _.code, _own(visit, _.code)) === _.value
                  ))(partsOfVisit(row.source, lookups.setup))
              ),
              (_) => _.visitors
            ),
    open: 0,
    skipped: 0,
    money: null,
    unfiltered: paged
      ? filters.length > 0
      : filters.some((_) => _.kind !== 'part'),
    lowData: false,
  }))(
    filters.filter((_) => _.kind === 'part'),
    step.kind === 'visits' && step.page !== null
  );

const _answerOf = (
  question: string,
  person: ReportPerson,
  lookups: ReportLookups
): string => _VALUE.answer(question, person, _first(person), lookups);

const _cells = (
  members: readonly ReportPerson[],
  columns: ReadonlyMap<string, string>,
  question: string,
  lookups: ReportLookups
): Readonly<Record<string, number>> =>
  Object.fromEntries(
    Array.from(
      Map.groupBy(
        members,
        (_) => columns.get(_answerOf(question, _, lookups)) ?? REST
      ),
      (entry) => [entry[0], entry[1].length]
    )
  );

/**
 * «Метка и ответ»: новые люди периода (когорта) по значениям группы и ответам на вопрос; `~none` и
 * `~unknown` на обеих осях, до предела строк и столбцов, сверх него — `~rest`.
 */
export var answersOf = (
  cohort: readonly ReportPerson[],
  group: ReportGroup,
  question: string,
  lookups: ReportLookups,
  limit: number
): AnswersBody =>
  ((columns) =>
    ((shown) => ({
      columns: columns.map((_) => ({
        value: _[0],
        name: valueName({ kind: 'answer', code: question }, _[0], lookups),
        people: _[1].length,
      })),
      total: {
        value: '',
        name: null,
        people: cohort.length,
        cells: _cells(cohort, shown, question, lookups),
      },
      rows: _ranked(
        Map.groupBy(cohort, (_) => groupValue(group, _, lookups)),
        (_) => _.length,
        limit
      ).map((_) => ({
        value: _[0],
        name: valueName(group, _[0], lookups),
        people: _[1].length,
        cells: _cells(_[1], shown, question, lookups),
      })),
    }))(
      // Ответ → столбец: показанные — сами собой, остальные сверх предела — в «остальные».
      new Map(
        columns.flatMap((column) =>
          column[0] === REST
            ? column[1].map(
                (_) => [_answerOf(question, _, lookups), REST] as const
              )
            : [[column[0], column[0]] as const]
        )
      )
    ))(
    _ranked(
      Map.groupBy(cohort, (_) => _answerOf(question, _, lookups)),
      (_) => _.length,
      limit
    )
  );

/** Итоги «Обзора» за период: новые люди и клиенты, выручка, действующий доступ, расход и CAC. */
export type OverviewTotals = {
  readonly people: number;
  /** null — у сайта нет роли «оплата». */
  readonly customers: number | null;
  /** До комиссии, по валютам. */
  readonly revenue: Amounts | null;
  /** До комиссии, в базовой валюте; null — нет базовой валюты или роли «оплата». */
  readonly revenueBase: BaseSum | null;
  /** После комиссии; null — нет базовой валюты или ни у одной оплаты сайта нет комиссии. */
  readonly revenueNet: BaseSum | null;
  /** Клиенты с доступом в конце периода (не позже «сейчас»); null — у сайта нет данных о доступе. */
  readonly active: number | null;
  /** Все строки расхода долей дней; null — нет базовой валюты, строк расхода у сайта или в периоде. */
  readonly spend: BaseSum | null;
  readonly cac: number | null;
};

/** Что «Обзор» знает о деньгах сайта: перевод, расход периода, есть ли комиссии и данные о доступе. */
export type OverviewMoney = {
  readonly pricing: Pricing | null;
  readonly spend: BaseSum | null;
  /** Хоть у одной оплаты сайта есть комиссия. */
  readonly fees: boolean;
  /** Роль «конец доступа» или `paid_until` у кого-то из клиентов. */
  readonly access: boolean;
};

/**
 * Итоги «Обзора» за период без фильтров. `people` — люди с чем-то не раньше начала периода (приход, первая оплата,
 * деньги), `customers` — все клиенты с первой оплатой до конца периода: доступ бывает и у давних.
 */
export var overviewTotals = (
  people: readonly ReportPerson[],
  customers: readonly ReportPerson[],
  moments: Moments,
  now: string,
  money: OverviewMoney,
  setup: Setup
): OverviewTotals =>
  ((payment) =>
    ((buyers, entries, fees) =>
      ((pricing) => ({
        people: people.filter((_) => _arrived(_, moments)).length,
        customers: payment ? buyers : null,
        revenue: payment ? _amounts(entries) : null,
        revenueBase:
          payment && pricing !== null
            ? baseSum(
                entries.map((_) => pricing.price(_[1], _[2], _[3] ?? _[0]))
              )
            : null,
        revenueNet:
          payment && pricing !== null && money.fees
            ? baseSum(
                [...entries, ...fees].map((_) =>
                  pricing.price(_[1], _[2], _[3] ?? _[0])
                )
              )
            : null,
        active: money.access
          ? ((at) => customers.filter((_) => accessAt(_.access, at)).length)(
              moments.to < now ? moments.to : now
            )
          : null,
        spend: money.spend,
        cac:
          money.spend === null || !payment
            ? null
            : perHead(money.spend.value, buyers),
      }))(money.pricing))(
      people.filter((_) => _customer(_, moments)).length,
      people.flatMap((person) =>
        person.money.filter((_) => _inside(_[0], moments))
      ),
      people.flatMap((person) =>
        person.feeMoney.flatMap((_): MoneyEntry[] =>
          _inside(_[0], moments) ? [[_[0], _[1], -_[2]]] : []
        )
      )
    ))(hasRole(setup, 'payment'));

/** Веха в «Сравнении вех»: достигли, не достигли и ещё в окне, и какая доля оплатила в каждой группе. */
export type MilestoneRow = {
  readonly code: string;
  readonly name: string;
  readonly reached: number;
  readonly missed: number;
  readonly open: number;
  /** «Оплата за окно» среди достигших; null — у сайта нет роли «оплата». */
  readonly paidReached: Share | null;
  readonly paidMissed: Share | null;
  /** Достигших или не достигших меньше порога людей «мало данных» (по умолчанию 30). */
  readonly lowData: boolean;
};

/**
 * «Сравнение вех»: у новых людей периода по каждой вехе не в архиве (по порядку, со столбцом и без) — достигли,
 * не достигли, ещё в окне и доля «Оплаты за окно» среди достигших и не достигших; «ещё в окне» вехи в сравнение
 * не входят. Оплатил — первая оплата в окне от прихода, а не после вехи: так группы сравнимы при любом порядке.
 */
export var milestoneComparisonOf = (
  cohort: readonly ReportPerson[],
  window: PaymentWindow,
  now: string,
  setup: Setup
): MilestoneRow[] =>
  ((payment, low) =>
    setup.milestones
      .filter((_) => _.archivedAt === null)
      .toSorted((a, b) => a.position - b.position || (a.code < b.code ? -1 : 1))
      .map((milestone) =>
        ((byState) =>
          ((reached, missed) => ({
            code: milestone.code,
            name: milestone.name,
            reached: reached.length,
            missed: missed.length,
            open: byState.get('open')?.length ?? 0,
            paidReached: payment ? paymentShare(reached, window, now) : null,
            paidMissed: payment ? paymentShare(missed, window, now) : null,
            lowData: reached.length < low.people || missed.length < low.people,
          }))(byState.get('reached') ?? [], byState.get('missed') ?? []))(
          Map.groupBy(cohort, (_) =>
            milestoneStateOf(
              _own(_.milestones, milestone.code) ?? _NO_WINDOW,
              now
            )
          )
        )
      ))(hasRole(setup, 'payment'), lowDataOf(setup.checks));

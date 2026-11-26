import { type Changed, changed } from '../../../shared/kernel/changed.ts';
import {
  attempt,
  domainError,
  fail,
  isDomainError,
  rethrow,
} from '../../../shared/kernel/errors.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import { CODE_LIMITS, isCode, parseCode, shownValue } from './codes.ts';
import { canonicalJson } from './envelope.ts';
import type { AnalyticsEvent } from './events.ts';
import {
  HOST_TOKEN,
  isPartValue,
  LABEL_LIMITS,
  LABEL_SEPARATORS,
  LABEL_TOKEN,
  parseHostPattern,
  parseTarget,
  UTM_PARAMETERS,
} from './labels.ts';
import { isCurrency, moneyOf } from './money.ts';
import {
  BUILTIN_CHECKS,
  builtinCheck,
  CHECK_CODE_LIMIT,
  CHECK_METRICS,
  CHECK_NOTIFY,
  type CheckMetric,
  checkCorrection,
  METRIC_PARAMS,
  QUALITY_LIMITS,
  type QualityCheck,
  RECONCILE_KINDS,
  RECONCILE_MARKS,
  type ReconcileMark,
  RULE_DAYS,
  RULE_ROLES_EXCLUDED,
  type RuleParam,
  ruleOf,
  type ThresholdRule,
} from './quality.ts';
import { EVENT_ROLES, type EventRole } from './roles.ts';
import { cleanText } from './text.ts';

type Item = {
  readonly name: string;
  readonly note: string;
  /** В архиве: не предлагается в формах и списках агента, но действует в событиях и отчётах. */
  readonly archivedAt: string | null;
};

export type Sender = Item & {
  readonly code: string;
  readonly enabled: boolean;
  /** Час сводки `ЧЧ:ММ` по UTC: к нему ждут сводку за прошедшие сутки; null — сводок не ждать. */
  readonly summaryAt: string | null;
};

/** Свойство в типе: общее на сайт свойство и его обязательность именно в этом типе. */
export type TypeProperty = {
  readonly code: string;
  readonly required: boolean;
};

export type EventType = Item & {
  readonly sender: string;
  readonly code: string;
  readonly role: EventRole;
  readonly properties: readonly TypeProperty[];
};

export type PropertyKind =
  | 'string'
  | 'number'
  | 'money'
  | 'date'
  | 'boolean'
  | 'choice';

/** `event` — поле событий в `data`, `person` — признак человека в `traits`. */
export type PropertyScope = 'event' | 'person';

export type Property = Item & {
  readonly scope: PropertyScope;
  readonly code: string;
  readonly kind: PropertyKind;
  readonly dictionary: string | null;
  readonly dimension: boolean;
  readonly untrusted: boolean;
  /** Отметка сверки: значение свойства отправитель шлёт для сверки с тем, что ядро считает само; null — нет. */
  readonly reconcile: ReconcileMark | null;
};

/**
 * `values` — варианты свойства-выбора, `answers` — вопрос опроса, его значения — ответы, `parts` — часть метки,
 * её значения — значения части.
 */
export type DictionaryPurpose = 'values' | 'answers' | 'parts';

/** Параметр посещения, который заполняет часть метки. */
export type UtmParameter =
  | 'utm_source'
  | 'utm_medium'
  | 'utm_campaign'
  | 'utm_content'
  | 'utm_term';

export type Dictionary = Item & {
  readonly code: string;
  readonly purpose: DictionaryPurpose;
  /** Часть метки: параметр UTM посещения; null — часть задают только переход и соответствия рефереров. */
  readonly utm: UtmParameter | null;
  /** Часть метки: предел длины значения; у других назначений null. */
  readonly length: number | null;
};

export type DictionaryValue = Item & {
  readonly dictionary: string;
  readonly code: string;
  readonly position: number;
  /**
   * «Ждёт расхода» — только у значения части метки (у других назначений null): на этот источник деньги тратятся
   * всегда, и без строки расхода за месяц с новыми людьми экран «Расходов» подсказывает её ввести.
   */
  readonly awaitsSpend: boolean | null;
};

/** Части метки: код части → значение, как в метке; части без значения нет. */
export type Parts = Readonly<Record<string, string>>;

export type LabelSeparator = '__' | '--' | '.' | '~';

/** Схема метки отправителя: части по порядку, разделитель и предел длины; ключ — код отправителя. */
export type LabelSchema = Item & {
  readonly sender: string;
  readonly separator: LabelSeparator;
  readonly length: number;
  readonly parts: readonly string[];
};

/** `host` — шаблон хоста, `any` — любой другой чужой сайт, `none` — прямой заход без реферера. */
export type ReferrerKind = 'host' | 'any' | 'none';

export type ReferrerRule = Item & {
  readonly code: string;
  readonly kind: ReferrerKind;
  /** `instagram.com` — он и поддомены, `google.*` — имя в любой зоне; у `any` и `none` — null. */
  readonly host: string | null;
  /** Значения частей; у `any` значение бывает `{host}` — хост реферера. */
  readonly parts: Parts;
};

/** Переход `/_cms/go/<код>`: к адресу назначения отправителя с меткой. */
export type GoLink = Item & {
  readonly code: string;
  readonly sender: string;
  /** `https://…` с ровно одним `{label}` после хоста. */
  readonly target: string;
  /** Заданные заранее части: важнее посещения. */
  readonly parts: Parts;
};

/** Условие вехи на свойство типа: число не меньше или значение, равное заданному. */
export type MilestoneCondition =
  | { readonly property: string; readonly gte: number }
  | {
      readonly property: string;
      readonly eq: string | number | boolean;
    };

export type Milestone = Item & {
  readonly code: string;
  readonly sender: string;
  readonly type: string;
  /** Сколько засчитанных событий нужно. */
  readonly count: number;
  readonly condition: MilestoneCondition | null;
  /** Окно в днях по 24 часа; null — без срока. */
  readonly days: number | null;
  /** Тип того же отправителя, от первого события которого идёт окно; null — от прихода. */
  readonly anchor: string | null;
  /** Столбцом в «Источниках». */
  readonly column: boolean;
  readonly position: number;
};

export type FunnelStepKind =
  | 'visits'
  | 'goal'
  | 'arrival'
  | 'trial'
  | 'payment'
  | 'milestone'
  | 'type';

/** Шаг воронки: посещения и цели сайта — сторона посещений, остальное — люди из событий. */
export type FunnelStep =
  | { readonly kind: 'visits'; readonly page: string | null }
  | { readonly kind: 'goal'; readonly goal: string }
  | { readonly kind: 'arrival' }
  | { readonly kind: 'trial' }
  | { readonly kind: 'payment'; readonly number: number }
  | { readonly kind: 'milestone'; readonly milestone: string }
  | {
      readonly kind: 'type';
      readonly sender: string;
      readonly type: string;
    };

export type Funnel = Item & {
  readonly code: string;
  /** Строгий порядок: шаг засчитан, если пройден не раньше предыдущего. */
  readonly strict: boolean;
  /** Основная — одна на сайт; не отмечена ни одна — основная первая по порядку. */
  readonly main: boolean;
  readonly steps: readonly FunnelStep[];
  readonly position: number;
};

export type SetupGroup =
  | 'sender'
  | 'type'
  | 'property'
  | 'dictionary'
  | 'value'
  | 'schema'
  | 'referrer'
  | 'link'
  | 'milestone'
  | 'funnel'
  | 'check';

export type SetupItem =
  | Sender
  | EventType
  | Property
  | Dictionary
  | DictionaryValue
  | LabelSchema
  | ReferrerRule
  | GoLink
  | Milestone
  | Funnel
  | QualityCheck;

/** Настройка аналитики: все элементы и ревизия, по которой пересчитываются люди. */
export type Setup = {
  readonly revision: number;
  readonly senders: readonly Sender[];
  readonly types: readonly EventType[];
  readonly properties: readonly Property[];
  readonly dictionaries: readonly Dictionary[];
  readonly values: readonly DictionaryValue[];
  readonly schemas: readonly LabelSchema[];
  readonly referrers: readonly ReferrerRule[];
  readonly links: readonly GoLink[];
  readonly milestones: readonly Milestone[];
  readonly funnels: readonly Funnel[];
  /** Поправки встроенных проверок данных. */
  readonly checks: readonly QualityCheck[];
};

/** Элемент по ключу группы: `owner` — отправитель типа, область свойства или справочник значения. */
export type ItemRef = {
  readonly group: SetupGroup;
  readonly owner: string | null;
  /** Код элемента, у схемы метки — код её отправителя. */
  readonly code: string;
  /** `код`, а у типа, свойства и значения — `владелец/код`. */
  readonly key: string;
};

/** Изменение элемента: `before` null — создан, `after` null — удалён. */
export type ItemChange = {
  readonly group: SetupGroup;
  readonly key: string;
  readonly before: SetupItem | null;
  readonly after: SetupItem | null;
};

/**
 * Ссылки данных сайта на настройку, которые проверяет сервис до перехода: строки расхода — на части метки.
 * Пока на часть ссылается расход, её назначение не сменить.
 */
export type SetupHolds = {
  /** Есть ли строки расхода с этой частью метки. */
  readonly spend: (dictionary: string) => boolean;
};

/** Ссылок данных нет: набор при установке, тесты. */
export var NO_HOLDS: SetupHolds = { spend: () => false };

/** Кто правил настройку; null — не пользователь: команда, тест, набор при установке. */
export type SetupAuthor = {
  readonly id: number;
  readonly name: string;
  readonly agent: boolean;
};

export type SetupAction =
  | 'created'
  | 'changed'
  | 'archived'
  | 'restored'
  | 'removed'
  | 'applied';

/**
 * Что записано строкой журнала: элемент группы, набор, настройки (выключатель, срок хранения, базовая валюта),
 * ключ отправителя, метка реестра, курс, строка расхода, снятие проверки вручную или выписка.
 */
export type SetupLogItem =
  | SetupGroup
  | 'set'
  | 'settings'
  | 'key'
  | 'label'
  | 'rate'
  | 'spend'
  | 'resolution'
  | 'statement';

/** Строка журнала настройки до записи: что было и что стало — JSON элемента. */
export type SetupLogDraft = {
  readonly at: string;
  readonly author: SetupAuthor | null;
  readonly item: SetupLogItem;
  readonly key: string;
  readonly action: SetupAction;
  readonly before: unknown;
  readonly after: unknown;
};

type ItemInput = { readonly name?: string; readonly note?: string };

export type SenderInput = ItemInput & {
  readonly code: string;
  readonly enabled?: boolean;
  readonly summaryAt?: string | null;
};

export type EventTypeInput = ItemInput & {
  readonly sender: string;
  readonly code: string;
  readonly role?: EventRole;
  readonly properties?: readonly {
    readonly code: string;
    readonly required?: boolean;
  }[];
};

export type PropertyInput = ItemInput & {
  readonly scope: PropertyScope;
  readonly code: string;
  readonly kind?: PropertyKind;
  readonly dictionary?: string | null;
  readonly dimension?: boolean;
  readonly untrusted?: boolean;
  readonly reconcile?: ReconcileMark | null;
};

export type DictionaryInput = ItemInput & {
  readonly code: string;
  readonly purpose?: DictionaryPurpose;
  readonly utm?: UtmParameter | null;
  readonly length?: number | null;
};

export type DictionaryValueInput = ItemInput & {
  readonly dictionary: string;
  readonly code: string;
  readonly position?: number;
  /** Только у значения части метки; у других назначений — null или нет поля. */
  readonly awaitsSpend?: boolean | null;
};

export type LabelSchemaInput = ItemInput & {
  readonly sender: string;
  readonly separator?: LabelSeparator;
  readonly length?: number;
  readonly parts?: readonly string[];
};

export type ReferrerRuleInput = ItemInput & {
  readonly code: string;
  readonly kind?: ReferrerKind;
  readonly host?: string | null;
  readonly parts?: Parts;
};

export type GoLinkInput = ItemInput & {
  readonly code: string;
  readonly sender?: string;
  readonly target?: string;
  readonly parts?: Parts;
};

export type MilestoneInput = ItemInput & {
  readonly code: string;
  readonly sender?: string;
  readonly type?: string;
  readonly count?: number;
  readonly condition?: MilestoneCondition | null;
  readonly days?: number | null;
  readonly anchor?: string | null;
  readonly column?: boolean;
  readonly position?: number;
};

export type FunnelInput = ItemInput & {
  readonly code: string;
  readonly strict?: boolean;
  readonly main?: boolean;
  readonly steps?: readonly FunnelStep[];
  readonly position?: number;
};

/** Элемент группы `check`: поправка встроенной проверки или своя пороговая. */
export type CheckInput = ItemInput & {
  readonly code: string;
  readonly enabled?: boolean;
  readonly notify?: string;
  readonly params?: Readonly<Record<string, unknown>> | null;
};

/** Элемент набора: `archived` — есть только у элемента в архиве; новый создаётся сразу в архиве. */
export type SetEntry<T> = T & { readonly archived?: boolean };

/** Вся настройка одним JSON, без ключей отправителей; значения справочника — внутри него. */
export type AnalyticsSet = {
  readonly format: 'eile-analytics-set';
  readonly version: 1;
  readonly name: string;
  /** Версия Eile, которая выгрузила набор. */
  readonly eile?: string;
  readonly exportedAt?: string;
  readonly senders?: readonly SetEntry<SenderInput>[];
  readonly properties?: readonly SetEntry<PropertyInput>[];
  readonly dictionaries?: readonly SetEntry<
    DictionaryInput & {
      readonly values?: readonly SetEntry<
        Omit<DictionaryValueInput, 'dictionary'>
      >[];
    }
  >[];
  readonly types?: readonly SetEntry<EventTypeInput>[];
  readonly schemas?: readonly SetEntry<LabelSchemaInput>[];
  readonly referrers?: readonly SetEntry<ReferrerRuleInput>[];
  readonly links?: readonly SetEntry<GoLinkInput>[];
  readonly milestones?: readonly SetEntry<MilestoneInput>[];
  readonly funnels?: readonly SetEntry<FunnelInput>[];
  readonly checks?: readonly SetEntry<CheckInput>[];
};

/** Отказ набора по элементам: путь в наборе (`types[3]`) → причина. */
export type SetErrors = Readonly<Record<string, string>>;

/** Элемент набора с путём в нём: ключ разобран заранее — для повторов, архива и отчёта пробы. */
export type SetStep = {
  readonly path: string;
  readonly group: SetupGroup;
  /** null — ключ не разобрать: отказ скажет применение. */
  readonly ref: ItemRef | null;
  /** Поля элемента без `archived`. */
  readonly input: unknown;
  readonly archived: boolean;
  /** Отказ до применения: значение со своим справочником, `archived` не да или нет. */
  readonly refused: string | null;
};

/** Прочитанный набор: имя, обёртка, шаги в порядке зависимостей и ошибки обёртки по путям. */
export type SetPlan = {
  readonly name: string;
  readonly eile: string | null;
  readonly exportedAt: string | null;
  readonly steps: readonly SetStep[];
  readonly errors: SetErrors;
};

type Input = Readonly<Record<string, unknown>>;

export var EMPTY_SETUP: Setup = {
  revision: 0,
  senders: [],
  types: [],
  properties: [],
  dictionaries: [],
  values: [],
  schemas: [],
  referrers: [],
  links: [],
  milestones: [],
  funnels: [],
  checks: [],
};

export var SETUP_GROUPS: readonly SetupGroup[] = [
  'sender',
  'type',
  'property',
  'dictionary',
  'value',
  'schema',
  'referrer',
  'link',
  'milestone',
  'funnel',
  'check',
];

export var PROPERTY_KINDS: readonly PropertyKind[] = [
  'string',
  'number',
  'money',
  'date',
  'boolean',
  'choice',
];

/** По чему отчёты группируют и фильтруют: у строки и денег значений слишком много. */
export var DIMENSION_KINDS: readonly PropertyKind[] = [
  'choice',
  'boolean',
  'number',
];

export var DICTIONARY_PURPOSES: readonly DictionaryPurpose[] = [
  'values',
  'answers',
  'parts',
];

export var REFERRER_KINDS: readonly ReferrerKind[] = ['host', 'any', 'none'];

export var FUNNEL_STEP_KINDS: readonly FunnelStepKind[] = [
  'visits',
  'goal',
  'arrival',
  'trial',
  'payment',
  'milestone',
  'type',
];

/** Цели сайта в шагах воронки: `go:` — любой переход, `go:<код>` — переход, `form:<имя>` — форма. */
export var GO_GOAL = 'go:';
export var FORM_GOAL = 'form:';

export var SETUP_LIMITS = {
  senders: 20,
  typesPerSender: 50,
  propertiesPerType: 20,
  eventProperties: 200,
  traits: 50,
  dictionaries: 100,
  valuesPerDictionary: 1000,
  name: 100,
  note: 500,
  position: 1_000_000,
  referrers: 100,
  links: 100,
  milestones: 20,
  milestoneCount: 1000,
  milestoneDays: 365,
  funnels: 20,
  funnelSteps: { min: 2, max: 8 },
  paymentNumber: 12,
  page: 500,
} as const;

/** Час сводки нового отправителя и отправителей до этапа 4 — порог ТЗ: 06:00 UTC. */
export var DEFAULT_SUMMARY_AT = '06:00';

export var SET_FORMAT = 'eile-analytics-set';
export var SET_VERSION = 1;

const _SCOPES: readonly PropertyScope[] = ['event', 'person'];

const _LIST = {
  sender: 'senders',
  type: 'types',
  property: 'properties',
  dictionary: 'dictionaries',
  value: 'values',
  schema: 'schemas',
  referrer: 'referrers',
  link: 'links',
  milestone: 'milestones',
  funnel: 'funnels',
  check: 'checks',
} as const satisfies Record<SetupGroup, keyof Setup>;

const _WHAT: Readonly<Record<SetupGroup, string>> = {
  sender: 'Sender',
  type: 'Event type',
  property: 'Property',
  dictionary: 'Dictionary',
  value: 'Value',
  schema: 'Label schema',
  referrer: 'Referrer rule',
  link: 'Link',
  milestone: 'Milestone',
  funnel: 'Funnel',
  check: 'Check',
};

// Код проверки — не из CODE_LIMITS: тот общий с менеджером, а групп проверок в его формах ещё нет.
const _CODE_LIMITS: Readonly<Record<SetupGroup, number>> = {
  ...CODE_LIMITS,
  check: CHECK_CODE_LIMIT,
};

type _Owner = {
  readonly field: string;
  readonly parse: (raw: unknown) => string;
};

// Ключ элемента: поле кода и поле владельца. У схемы метки кода нет — её ключ — код отправителя.
const _KEYS: Readonly<
  Record<
    SetupGroup,
    {
      readonly field: string;
      readonly what: string;
      readonly owner: _Owner | null;
    }
  >
> = {
  sender: { field: 'code', what: 'Sender', owner: null },
  type: {
    field: 'code',
    what: 'Event type',
    owner: {
      field: 'sender',
      parse: (raw) => parseCode(raw, CODE_LIMITS.sender, 'Sender'),
    },
  },
  property: {
    field: 'code',
    what: 'Property',
    owner: {
      field: 'scope',
      parse: (raw) =>
        _SCOPES.includes(raw as PropertyScope)
          ? (raw as string)
          : fail(
              'analytics.invalid_item',
              `Scope "${shownValue(raw)}" is event or person`
            ),
    },
  },
  dictionary: { field: 'code', what: 'Dictionary', owner: null },
  value: {
    field: 'code',
    what: 'Value',
    owner: {
      field: 'dictionary',
      parse: (raw) => parseCode(raw, CODE_LIMITS.dictionary, 'Dictionary'),
    },
  },
  schema: { field: 'sender', what: 'Sender', owner: null },
  referrer: { field: 'code', what: 'Referrer rule', owner: null },
  link: { field: 'code', what: 'Link', owner: null },
  milestone: { field: 'code', what: 'Milestone', owner: null },
  funnel: { field: 'code', what: 'Funnel', owner: null },
  check: { field: 'code', what: 'Check', owner: null },
};

// Поля только для чтения: элемент из списка можно прислать обратно как есть, архив меняет своя операция.
const _READ_ONLY = ['archivedAt'];

// Имя формы — как его проверяет контекст форм: цель формы проверяется только по виду, формы живут отдельно.
const _FORM_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const _PAGE = /^\/[^\s?#]*$/;
const _SUMMARY_AT = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const _isRecord = (raw: unknown): raw is Input =>
  raw !== null && typeof raw === 'object' && !Array.isArray(raw);

// Длина в знаках, а не в половинках UTF-16; короткую строку не раскладываем на знаки — набор в сто тысяч
// названий не платит массивом за каждое.
const _within = (text: string, min: number, max: number): boolean =>
  text.length >= min && (text.length <= max || [...text].length <= max);

const _text = (raw: unknown, min: number, max: number): string | null =>
  typeof raw === 'string'
    ? ((text) => (_within(text, min, max) ? text : null))(raw.trim())
    : null;

const _own = (parts: Parts | undefined, key: string): string | undefined =>
  parts !== undefined && Object.hasOwn(parts, key) ? parts[key] : undefined;

const _labelOf = (ref: ItemRef): string => `${_WHAT[ref.group]} ${ref.key}`;

const _invalid = (label: string, message: string): never =>
  fail('analytics.invalid_item', `${label}: ${message}`);

const _reference = (label: string, message: string): never =>
  fail('analytics.invalid_reference', `${label}: ${message}`);

const _room = (full: boolean, label: string, message: string): void =>
  void (full && fail('analytics.too_many', `${label}: ${message}`));

// Управляющие знаки и переключатели направления письма: название уходит в терминал, уведомление и ответ агенту.
// У названия переводы строк и табуляции — пробел, у заметки перевод строки остаётся: она пишется в несколько строк.
const _CONTROL = /[\p{Cc}\p{Zl}\p{Zp}\p{Bidi_Control}]+/gu;
const _NOTE_CONTROL = /[^\P{Cc}\n\t]|[\p{Zl}\p{Zp}\p{Bidi_Control}]/gu;

const _spaced = (run: string): string => (/\s/u.test(run) ? ' ' : '');

/** Название из входа без управляющих знаков: одна строка. */
export var cleanName = (raw: string): string => raw.replace(_CONTROL, _spaced);

/** Заметка из входа: переводы строк Windows — `\n`, прочие управляющие знаки — пробел или ничего. */
export var cleanNote = (raw: string): string =>
  raw.replace(/\r\n?/g, '\n').replace(_NOTE_CONTROL, _spaced);

const _name = (raw: unknown, previous: string | undefined, label: string) =>
  raw === undefined
    ? (previous ?? _invalid(label, 'a name is required'))
    : (_text(
        typeof raw === 'string' ? cleanName(raw) : raw,
        1,
        SETUP_LIMITS.name
      ) ?? _invalid(label, `the name is 1 to ${SETUP_LIMITS.name} characters`));

const _note = (raw: unknown, previous: string | undefined, label: string) =>
  raw === undefined
    ? (previous ?? '')
    : (_text(
        typeof raw === 'string' ? cleanNote(raw) : raw,
        0,
        SETUP_LIMITS.note
      ) ??
      _invalid(label, `the note is up to ${SETUP_LIMITS.note} characters`));

const _flag = (
  raw: unknown,
  previous: boolean,
  label: string,
  field: string
): boolean =>
  raw === undefined
    ? previous
    : typeof raw === 'boolean'
      ? raw
      : _invalid(label, `${field} is true or false`);

const _choice = <T extends string>(
  raw: unknown,
  options: readonly T[],
  previous: T | undefined,
  label: string,
  field: string
): T =>
  raw === undefined
    ? (previous ?? _invalid(label, `${field} is required`))
    : options.includes(raw as T)
      ? (raw as T)
      : _invalid(label, `${field} is one of ${options.join(', ')}`);

const _whole = (raw: unknown, min: number, max: number): number | null =>
  Number.isSafeInteger(raw) && (raw as number) >= min && (raw as number) <= max
    ? (raw as number)
    : null;

const _count = (
  raw: unknown,
  previous: number | undefined,
  fallback: number,
  range: readonly [min: number, max: number],
  label: string,
  field: string
): number =>
  raw === undefined
    ? (previous ?? fallback)
    : (_whole(raw, range[0], range[1]) ??
      _invalid(label, `${field} is a whole number ${range[0]} to ${range[1]}`));

const _optionalCount = (
  raw: unknown,
  previous: number | null | undefined,
  range: readonly [min: number, max: number],
  label: string,
  field: string
): number | null =>
  raw === undefined
    ? (previous ?? null)
    : raw === null
      ? null
      : (_whole(raw, range[0], range[1]) ??
        _invalid(
          label,
          `${field} is null or a whole number ${range[0]} to ${range[1]}`
        ));

// Ссылка на элемент кодом: у нового обязательна, у прежнего без поля во входе — прежняя.
const _codeField = (
  raw: unknown,
  previous: string | undefined,
  limit: number,
  label: string,
  field: string
): string =>
  raw === undefined
    ? (previous ?? _invalid(label, `${field} is required`))
    : parseCode(raw, limit, `${label}: ${field}`);

const _known = (
  input: Input,
  fields: readonly string[],
  label: string
): Input =>
  ((extra) =>
    extra === undefined ? input : _invalid(label, `unknown field "${extra}"`))(
    Object.keys(input).find(
      (_) => !fields.includes(_) && !_READ_ONLY.includes(_)
    )
  );

const _items = (setup: Setup, group: SetupGroup): readonly SetupItem[] =>
  setup[_LIST[group]];

/** Ключ элемента в группе: `код` или `владелец/код`; у схемы метки — код отправителя. */
export var keyOf = (group: SetupGroup, item: SetupItem): string =>
  ((spec, record) =>
    ((code) =>
      spec.owner === null ? code : `${record[spec.owner.field]}/${code}`)(
      String(record[spec.field])
    ))(_KEYS[group], item as unknown as Input);

const _named = (group: SetupGroup, item: SetupItem): string =>
  `${_WHAT[group].toLowerCase()} ${keyOf(group, item)}`;

export var parseGroup = (raw: unknown): SetupGroup =>
  SETUP_GROUPS.includes(raw as SetupGroup)
    ? (raw as SetupGroup)
    : fail(
        'analytics.invalid_group',
        `Unknown group "${shownValue(raw)}": one of ${SETUP_GROUPS.join(', ')}`
      );

// Имена свойств объекта по умолчанию: код с таким именем, ставший ключом словаря, нашёлся бы и там, где его нет.
const _RESERVED: readonly string[] = ['__proto__', 'constructor', 'prototype'];

const _itemCode = (raw: unknown, group: SetupGroup, what: string): string =>
  ((code) =>
    _RESERVED.includes(code)
      ? fail(
          'analytics.invalid_code',
          `${what} "${code}" is a reserved word: choose another code`
        )
      : code)(parseCode(raw, _CODE_LIMITS[group], what));

/**
 * Ключ элемента из входа: `{ code }`, у типа ещё `sender`, у свойства `scope`, у значения `dictionary`; у схемы
 * метки — `{ sender }`.
 */
export var parseRef = (group: unknown, raw: unknown): ItemRef =>
  pipe(parseGroup, (_: SetupGroup) =>
    ((input, key) =>
      ((owned, code) => ({
        group: _,
        owner: owned,
        code,
        key: owned === null ? code : `${owned}/${code}`,
      }))(
        key.owner === null ? null : key.owner.parse(input[key.owner.field]),
        _itemCode(input[key.field], _, key.what)
      ))(
      _isRecord(raw)
        ? raw
        : fail('analytics.invalid_item', `${_WHAT[_]} is a JSON object`),
      _KEYS[_]
    )
  )(group);

/** Элемент по ключу; null — такого нет. */
export var findItem = (setup: Setup, ref: ItemRef): SetupItem | null =>
  _items(setup, ref.group).find((_) => keyOf(ref.group, _) === ref.key) ?? null;

const _replace = (
  setup: Setup,
  group: SetupGroup,
  previous: SetupItem | null,
  item: SetupItem | null
): Setup => ({
  ...setup,
  [_LIST[group]]:
    previous === null
      ? [..._items(setup, group), item]
      : _items(setup, group).flatMap((_) =>
          _ === previous ? (item === null ? [] : [item]) : [_]
        ),
});

// Час сводки — `ЧЧ:ММ` с ведущим нулём, 00:00–23:59 UTC; null — сводок не ждать.
const _summaryAt = (
  raw: unknown,
  previous: Sender | null,
  label: string
): string | null =>
  raw === undefined
    ? previous === null
      ? DEFAULT_SUMMARY_AT
      : previous.summaryAt
    : raw === null
      ? null
      : typeof raw === 'string' && _SUMMARY_AT.test(raw)
        ? raw
        : _invalid(
            label,
            'summaryAt is a time HH:MM in UTC from 00:00 to 23:59, or null — no summaries are expected'
          );

const _sender = (
  input: Input,
  previous: Sender | null,
  setup: Setup,
  ref: ItemRef
): Sender => {
  const label = _labelOf(ref);
  _room(
    previous === null && setup.senders.length >= SETUP_LIMITS.senders,
    label,
    `a site has at most ${SETUP_LIMITS.senders} senders`
  );
  return {
    code: ref.code,
    name: _name(input.name, previous?.name, label),
    note: _note(input.note, previous?.note, label),
    enabled: _flag(input.enabled, previous?.enabled ?? true, label, 'enabled'),
    summaryAt: _summaryAt(input.summaryAt, previous, label),
    archivedAt: previous?.archivedAt ?? null,
  };
};

// Отправитель для новой ссылки: есть и не в архиве; в архиве — только если элемент уже ссылался на него.
const _checkSender = (
  setup: Setup,
  code: string,
  used: boolean,
  label: string
): void =>
  ((sender) =>
    void (sender === undefined
      ? _reference(label, `there is no sender ${code}`)
      : sender.archivedAt !== null &&
        !used &&
        _reference(label, `sender ${code} is archived`)))(
    setup.senders.find((_) => _.code === code)
  );

// Список длиннее предела не разбирается: чужой файл с миллионом свойств у типа не стоит миллиона объектов.
const _typeProperties = (raw: unknown, label: string): TypeProperty[] =>
  Array.isArray(raw) && raw.length > SETUP_LIMITS.propertiesPerType
    ? fail(
        'analytics.too_many',
        `${label}: a type has at most ${SETUP_LIMITS.propertiesPerType} properties`
      )
    : Array.isArray(raw)
      ? raw.map((entry) =>
          ((input) => ({
            code: parseCode(
              input.code,
              CODE_LIMITS.property,
              `${label}: property`
            ),
            required: _flag(input.required, false, label, 'required'),
          }))(
            _known(
              _isRecord(entry)
                ? entry
                : _invalid(label, 'a property is { code, required }'),
              ['code', 'required'],
              label
            )
          )
        )
      : _invalid(label, 'properties is a list of { code, required }');

// Свойство типа — существующее свойство событий; в архиве — только если тип уже ссылался на него.
const _checkTypeProperty =
  (setup: Setup, previous: EventType | null, label: string) =>
  (entry: TypeProperty, index: number, all: readonly TypeProperty[]): void =>
    ((property) =>
      void (property === undefined
        ? _reference(label, `there is no event property ${entry.code}`)
        : property.archivedAt !== null &&
            !previous?.properties.some((_) => _.code === entry.code)
          ? _reference(label, `property ${entry.code} is archived`)
          : all.findIndex((_) => _.code === entry.code) !== index &&
            _invalid(label, `property ${entry.code} is listed twice`)))(
      setup.properties.find((_) => _.scope === 'event' && _.code === entry.code)
    );

const _type = (
  input: Input,
  previous: EventType | null,
  setup: Setup,
  ref: ItemRef
): EventType => {
  const label = _labelOf(ref);
  _checkSender(setup, ref.owner!, previous !== null, label);
  _room(
    previous === null &&
      setup.types.filter((_) => _.sender === ref.owner).length >=
        SETUP_LIMITS.typesPerSender,
    label,
    `a sender has at most ${SETUP_LIMITS.typesPerSender} event types`
  );
  const properties =
    input.properties === undefined
      ? (previous?.properties ?? [])
      : _typeProperties(input.properties, label);
  _room(
    properties.length > SETUP_LIMITS.propertiesPerType,
    label,
    `a type has at most ${SETUP_LIMITS.propertiesPerType} properties`
  );
  properties.forEach(_checkTypeProperty(setup, previous, label));
  return {
    sender: ref.owner!,
    code: ref.code,
    name: _name(input.name, previous?.name, label),
    note: _note(input.note, previous?.note, label),
    role: _choice(input.role, EVENT_ROLES, previous?.role, label, 'role'),
    properties,
    archivedAt: previous?.archivedAt ?? null,
  };
};

// Выбор — из справочника значений; в архиве — только если свойство уже ссылалось на него.
const _checkDictionary = (
  setup: Setup,
  previous: Property | null,
  kind: PropertyKind,
  dictionary: string | null,
  label: string
): void =>
  void (kind !== 'choice'
    ? dictionary !== null && _invalid(label, 'only a choice has a dictionary')
    : dictionary === null
      ? _invalid(label, 'a choice needs a dictionary of values')
      : ((found) =>
          found === undefined
            ? _reference(label, `there is no dictionary ${dictionary}`)
            : found.purpose !== 'values'
              ? _reference(
                  label,
                  `dictionary ${dictionary} holds ${found.purpose === 'answers' ? 'survey answers' : 'label part values'}, not values`
                )
              : found.archivedAt !== null &&
                previous?.dictionary !== dictionary &&
                _reference(label, `dictionary ${dictionary} is archived`))(
          setup.dictionaries.find((_) => _.code === dictionary)
        ));

const _property = (
  input: Input,
  previous: Property | null,
  setup: Setup,
  ref: ItemRef
): Property => {
  const label = _labelOf(ref);
  const scope = ref.owner as PropertyScope;
  const limit =
    scope === 'event' ? SETUP_LIMITS.eventProperties : SETUP_LIMITS.traits;
  _room(
    previous === null &&
      setup.properties.filter((_) => _.scope === scope).length >= limit,
    label,
    `a site has at most ${limit} ${scope === 'event' ? 'event properties' : 'person traits'}`
  );
  const kind = _choice(
    input.kind,
    PROPERTY_KINDS,
    previous?.kind,
    label,
    'kind'
  );
  const dictionary =
    input.dictionary === undefined
      ? (previous?.dictionary ?? null)
      : input.dictionary === null
        ? null
        : parseCode(
            input.dictionary,
            CODE_LIMITS.dictionary,
            `${label}: dictionary`
          );
  _checkDictionary(setup, previous, kind, dictionary, label);
  const dimension = _flag(
    input.dimension,
    previous?.dimension ?? false,
    label,
    'dimension'
  );
  const untrusted = _flag(
    input.untrusted,
    previous?.untrusted ?? false,
    label,
    'untrusted'
  );
  void (
    dimension &&
    !DIMENSION_KINDS.includes(kind) &&
    _invalid(label, 'only a choice, a number or a yes/no is a dimension')
  );
  void (
    untrusted &&
    kind !== 'string' &&
    _invalid(label, 'only a string is untrusted text')
  );
  return {
    scope,
    code: ref.code,
    name: _name(input.name, previous?.name, label),
    note: _note(input.note, previous?.note, label),
    kind,
    dictionary,
    dimension,
    untrusted,
    reconcile: _reconcile(input.reconcile, previous, setup, ref, kind, label),
    archivedAt: previous?.archivedAt ?? null,
  };
};

// Отметка сверки — у свойства событий нужного вида и одна на сайт: иначе сверка не знала бы, чьё значение брать.
const _reconcile = (
  raw: unknown,
  previous: Property | null,
  setup: Setup,
  ref: ItemRef,
  kind: PropertyKind,
  label: string
): ReconcileMark | null =>
  ((mark) =>
    mark === null
      ? null
      : ref.owner !== 'event'
        ? _invalid(label, 'only an event property is reconciled')
        : kind !== RECONCILE_KINDS[mark]
          ? _invalid(
              label,
              `reconcile ${mark} needs a property of kind ${RECONCILE_KINDS[mark]}`
            )
          : ((other) =>
              other === undefined
                ? mark
                : _invalid(
                    label,
                    `property ${other.code} already reconciles ${mark}: one property per mark`
                  ))(
              setup.properties.find(
                (_) =>
                  _.reconcile === mark &&
                  !(_.scope === ref.owner && _.code === ref.code)
              )
            ))(
    raw === undefined
      ? (previous?.reconcile ?? null)
      : raw === null
        ? null
        : RECONCILE_MARKS.includes(raw as ReconcileMark)
          ? (raw as ReconcileMark)
          : _invalid(
              label,
              `reconcile is null or one of ${RECONCILE_MARKS.join(', ')}`
            )
  );

// Кто держит назначение справочника: свойство-выбор, схема метки, соответствие и переход.
const _purposeUsers = (setup: Setup, code: string): string[] => [
  ...setup.properties
    .filter((_) => _.dictionary === code)
    .map((_) => _named('property', _)),
  ...setup.schemas
    .filter((_) => _.parts.includes(code))
    .map((_) => _named('schema', _)),
  ...setup.referrers
    .filter((_) => _own(_.parts, code) !== undefined)
    .map((_) => _named('referrer', _)),
  ...setup.links
    .filter((_) => _own(_.parts, code) !== undefined)
    .map((_) => _named('link', _)),
];

// Длина частей схемы с разделителями; `length` — новая длина правленой части.
const _schemaLength = (
  setup: Setup,
  schema: Pick<LabelSchema, 'separator' | 'parts'>,
  edited: { readonly code: string; readonly length: number } | null
): number =>
  schema.parts.reduce(
    (total, part) =>
      total +
      (part === edited?.code
        ? edited.length
        : (setup.dictionaries.find((_) => _.code === part)?.length ?? 0)),
    schema.separator.length * Math.max(schema.parts.length - 1, 0)
  );

const _checkFits = (
  total: number,
  schema: Pick<LabelSchema, 'length'>,
  label: string
): void =>
  void (
    total > schema.length &&
    _invalid(
      label,
      `parts with separators take up to ${total} characters, the label up to ${schema.length}`
    )
  );

const _absent = (raw: unknown, label: string, field: string): null =>
  raw === undefined || raw === null
    ? null
    : _invalid(label, `only a label part has ${field}`);

const _utm = (
  raw: unknown,
  previous: UtmParameter | null,
  label: string
): UtmParameter | null =>
  raw === undefined
    ? previous
    : raw === null
      ? null
      : UTM_PARAMETERS.includes(raw as UtmParameter)
        ? (raw as UtmParameter)
        : _invalid(label, `utm is null or one of ${UTM_PARAMETERS.join(', ')}`);

// Часть метки: один параметр UTM — у одной части; прежние значения помещаются в предел; схемы — в свои пределы.
const _checkPart = (
  setup: Setup,
  code: string,
  utm: UtmParameter | null,
  length: number,
  label: string
): void => {
  void (
    utm !== null &&
    ((other) =>
      other !== undefined &&
      _invalid(label, `${utm} already fills label part ${other.code}`))(
      setup.dictionaries.find(
        (_) => _.code !== code && _.purpose === 'parts' && _.utm === utm
      )
    )
  );
  void ((value) =>
    value !== undefined &&
    _invalid(
      label,
      value.code.length > length
        ? `value ${value.code} is longer than ${length} characters`
        : `value ${value.code} is not a label part value: a-z 0-9 with single _ or - inside`
    ))(
    setup.values.find(
      (_) => _.dictionary === code && !isPartValue(_.code, length)
    )
  );
  setup.schemas
    .filter((_) => _.parts.includes(code))
    .forEach(
      (schema) =>
        void _checkFits(
          _schemaLength(setup, schema, { code, length }),
          schema,
          `${label}: in label schema ${schema.sender}`
        )
    );
};

const _dictionary = (
  input: Input,
  previous: Dictionary | null,
  setup: Setup,
  ref: ItemRef,
  holds: SetupHolds = NO_HOLDS
): Dictionary => {
  const label = _labelOf(ref);
  _room(
    previous === null && setup.dictionaries.length >= SETUP_LIMITS.dictionaries,
    label,
    `a site has at most ${SETUP_LIMITS.dictionaries} dictionaries`
  );
  const purpose = _choice(
    input.purpose,
    DICTIONARY_PURPOSES,
    previous?.purpose,
    label,
    'purpose'
  );
  void (
    previous !== null &&
    previous.purpose !== purpose &&
    ((users) =>
      users.length > 0 &&
      fail(
        'analytics.in_use',
        `${label}: ${users.join(', ')} uses it, its purpose stays`
      ))(_purposeUsers(setup, ref.code))
  );
  // Строки расхода — не часть настройки: на справочник части ссылаются данные сайта, назначение остаётся.
  void (
    previous?.purpose === 'parts' &&
    purpose !== 'parts' &&
    holds.spend(ref.code) &&
    fail(
      'analytics.in_use',
      `${label}: spend rows use this label part, its purpose stays`
    )
  );
  const part = purpose === 'parts';
  const was = previous?.purpose === 'parts' ? previous : null;
  const utm = part
    ? _utm(input.utm, was?.utm ?? null, label)
    : _absent(input.utm, label, 'utm');
  const length = part
    ? _count(
        input.length,
        was?.length ?? undefined,
        LABEL_LIMITS.partDefault,
        [1, LABEL_LIMITS.part],
        label,
        'length'
      )
    : _absent(input.length, label, 'length');
  void (part && _checkPart(setup, ref.code, utm, length!, label));
  return {
    code: ref.code,
    name: _name(input.name, previous?.name, label),
    note: _note(input.note, previous?.note, label),
    purpose,
    utm,
    length,
    archivedAt: previous?.archivedAt ?? null,
  };
};

const _position = (
  raw: unknown,
  previous: number | undefined,
  next: number,
  label: string
): number =>
  raw === undefined
    ? (previous ?? next)
    : (_whole(raw, 0, SETUP_LIMITS.position) ??
      _invalid(
        label,
        `the position is a whole number 0 to ${SETUP_LIMITS.position}`
      ));

const _value = (
  input: Input,
  previous: DictionaryValue | null,
  setup: Setup,
  ref: ItemRef
): DictionaryValue =>
  _valueIn(
    input,
    previous,
    setup.dictionaries.find((_) => _.code === ref.owner),
    setup.values.filter((_) => _.dictionary === ref.owner).length,
    ref
  );

// Значение по справочнику и числу его значений: набор считает их сам, не перебирая всю настройку на каждом.
const _valueIn = (
  input: Input,
  previous: DictionaryValue | null,
  dictionary: Dictionary | undefined,
  count: number,
  ref: ItemRef
): DictionaryValue => {
  const label = _labelOf(ref);
  void (dictionary === undefined
    ? _reference(label, `there is no dictionary ${ref.owner}`)
    : previous === null &&
      dictionary.archivedAt !== null &&
      _reference(label, `dictionary ${ref.owner} is archived`));
  // Значение части строже кода: в нём не бывает разделителей метки.
  void (
    dictionary?.purpose === 'parts' &&
    !isPartValue(ref.code, dictionary.length ?? LABEL_LIMITS.part) &&
    fail(
      'analytics.invalid_code',
      `${label}: a value of a label part is a-z 0-9 with single _ or - inside, up to ${dictionary.length} characters`
    )
  );
  _room(
    previous === null && count >= SETUP_LIMITS.valuesPerDictionary,
    label,
    `a dictionary has at most ${SETUP_LIMITS.valuesPerDictionary} values`
  );
  return {
    dictionary: ref.owner!,
    code: ref.code,
    name: _name(input.name, previous?.name, label),
    note: _note(input.note, previous?.note, label),
    position: _position(input.position, previous?.position, count, label),
    awaitsSpend: _awaits(
      input.awaitsSpend,
      dictionary?.purpose === 'parts',
      previous?.awaitsSpend ?? null,
      label
    ),
    archivedAt: previous?.archivedAt ?? null,
  };
};

// «Ждёт расхода» — у значения части: false по умолчанию; у других назначений — null, true — отказ.
const _awaits = (
  raw: unknown,
  part: boolean,
  previous: boolean | null,
  label: string
): boolean | null =>
  part
    ? _flag(raw, previous ?? false, label, 'awaitsSpend')
    : raw === true
      ? _invalid(label, 'only a value of a label part awaits spend')
      : raw === undefined || raw === null || raw === false
        ? null
        : _invalid(label, 'awaitsSpend is true or false');

// Часть метки для новой ссылки: справочник с назначением `parts`; в архиве — только если уже стояла.
const _checkPartRef = (
  setup: Setup,
  code: string,
  used: boolean,
  label: string
): void =>
  ((found) =>
    void (found === undefined
      ? _reference(label, `there is no label part ${code}`)
      : found.purpose !== 'parts'
        ? _reference(label, `dictionary ${code} is not a label part`)
        : found.archivedAt !== null &&
          !used &&
          _reference(label, `label part ${code} is archived`)))(
    setup.dictionaries.find((_) => _.code === code)
  );

// Значение справочника для новой ссылки: есть; в архиве — только если уже стояло.
const _checkValue = (
  setup: Setup,
  dictionary: string,
  code: string,
  used: boolean,
  label: string
): void =>
  ((found) =>
    void (found === undefined
      ? _reference(label, `${dictionary} has no value ${code}`)
      : found.archivedAt !== null &&
        !used &&
        _reference(label, `value ${dictionary}/${code} is archived`)))(
    setup.values.find((_) => _.dictionary === dictionary && _.code === code)
  );

// Частей у метки не больше, чем справочников на сайте: длинный объект — отказ до разбора.
const _partsInput = (raw: unknown, label: string): Parts =>
  _isRecord(raw) && Object.keys(raw).length > SETUP_LIMITS.dictionaries
    ? _invalid(label, `parts has at most ${SETUP_LIMITS.dictionaries} parts`)
    : _isRecord(raw)
      ? Object.fromEntries(
          Object.entries(raw).map(({ 0: part, 1: value }) => [
            parseCode(part, CODE_LIMITS.dictionary, `${label}: part`),
            typeof value === 'string'
              ? value
              : _invalid(label, `the value of part ${part} is a value code`),
          ])
        )
      : _invalid(label, 'parts is { part: value }');

const _schemaParts = (raw: unknown, label: string): string[] =>
  Array.isArray(raw) && raw.length >= 1 && raw.length <= LABEL_LIMITS.parts
    ? raw.map((entry, index) =>
        ((code) =>
          raw.indexOf(entry) === index
            ? code
            : _invalid(label, `part ${code} is listed twice`))(
          parseCode(entry, CODE_LIMITS.dictionary, `${label}: part`)
        )
      )
    : _invalid(
        label,
        `parts is a list of 1 to ${LABEL_LIMITS.parts} label part codes`
      );

const _schema = (
  input: Input,
  previous: LabelSchema | null,
  setup: Setup,
  ref: ItemRef
): LabelSchema => {
  const label = _labelOf(ref);
  _checkSender(setup, ref.code, previous !== null, label);
  const separator =
    input.separator === undefined
      ? (previous?.separator ?? '__')
      : _choice(
          input.separator,
          LABEL_SEPARATORS,
          undefined,
          label,
          'separator'
        );
  const length = _count(
    input.length,
    previous?.length,
    LABEL_LIMITS.labelDefault,
    [1, LABEL_LIMITS.label],
    label,
    'length'
  );
  const parts =
    input.parts === undefined
      ? (previous?.parts ?? _invalid(label, 'parts are required'))
      : _schemaParts(input.parts, label);
  parts.forEach(
    (part) =>
      void _checkPartRef(
        setup,
        part,
        previous?.parts.includes(part) ?? false,
        label
      )
  );
  _checkFits(
    _schemaLength(setup, { separator, parts }, null),
    { length },
    label
  );
  return {
    sender: ref.code,
    name: _name(input.name, previous?.name, label),
    note: _note(input.note, previous?.note, label),
    separator,
    length,
    parts,
    archivedAt: previous?.archivedAt ?? null,
  };
};

const _host = (
  input: Input,
  previous: ReferrerRule | null,
  kind: ReferrerKind,
  label: string
): string | null =>
  kind !== 'host'
    ? input.host === undefined || input.host === null
      ? null
      : _invalid(label, 'only a host rule has a host')
    : input.host === undefined
      ? ((previous?.kind === 'host' ? previous.host : null) ??
        _invalid(label, 'a host rule needs a host'))
      : (parseHostPattern(input.host) ??
        _invalid(
          label,
          `the host is a name like example.com or example.*: a-z 0-9 . - up to ${LABEL_LIMITS.host} characters`
        ));

// Соответствие: шаблон хоста — у одного; «любой сайт» и «прямой заход» — по одному на сайт.
const _checkUnique = (
  setup: Setup,
  code: string,
  kind: ReferrerKind,
  host: string | null,
  label: string
): void =>
  ((other) =>
    void (
      other !== undefined &&
      _invalid(
        label,
        kind === 'host'
          ? `referrer rule ${other.code} has the same host`
          : `a site has one rule for ${kind === 'any' ? 'any other site' : 'direct visits'}: ${other.code}`
      )
    ))(
    setup.referrers.find(
      (_) =>
        _.code !== code &&
        _.kind === kind &&
        (kind !== 'host' || _.host === host)
    )
  );

const _referrer = (
  input: Input,
  previous: ReferrerRule | null,
  setup: Setup,
  ref: ItemRef
): ReferrerRule => {
  const label = _labelOf(ref);
  _room(
    previous === null && setup.referrers.length >= SETUP_LIMITS.referrers,
    label,
    `a site has at most ${SETUP_LIMITS.referrers} referrer rules`
  );
  const kind = _choice(
    input.kind,
    REFERRER_KINDS,
    previous?.kind,
    label,
    'kind'
  );
  const host = _host(input, previous, kind, label);
  _checkUnique(setup, ref.code, kind, host, label);
  const parts =
    input.parts === undefined
      ? (previous?.parts ?? {})
      : _partsInput(input.parts, label);
  Object.entries(parts).forEach(({ 0: part, 1: value }) => {
    _checkPartRef(
      setup,
      part,
      _own(previous?.parts, part) !== undefined,
      label
    );
    void (value === HOST_TOKEN
      ? kind !== 'any' &&
        _invalid(label, `${HOST_TOKEN} is only for the rule for any other site`)
      : _checkValue(
          setup,
          part,
          value,
          _own(previous?.parts, part) === value,
          label
        ));
  });
  return {
    code: ref.code,
    name: _name(input.name, previous?.name, label),
    note: _note(input.note, previous?.note, label),
    kind,
    host,
    parts,
    archivedAt: previous?.archivedAt ?? null,
  };
};

const _link = (
  input: Input,
  previous: GoLink | null,
  setup: Setup,
  ref: ItemRef
): GoLink => {
  const label = _labelOf(ref);
  _room(
    previous === null && setup.links.length >= SETUP_LIMITS.links,
    label,
    `a site has at most ${SETUP_LIMITS.links} links`
  );
  const sender = _codeField(
    input.sender,
    previous?.sender,
    CODE_LIMITS.sender,
    label,
    'sender'
  );
  const same = previous?.sender === sender;
  _checkSender(setup, sender, same, label);
  const schema =
    setup.schemas.find((_) => _.sender === sender) ??
    _reference(label, `sender ${sender} has no label schema`);
  void (
    schema.archivedAt !== null &&
    !same &&
    _reference(label, `the label schema of sender ${sender} is archived`)
  );
  const target =
    input.target === undefined
      ? (previous?.target ?? _invalid(label, 'a target is required'))
      : (parseTarget(input.target) ??
        _invalid(
          label,
          `the target is an https:// address up to ${LABEL_LIMITS.target} characters with exactly one ${LABEL_TOKEN} after the host`
        ));
  const parts =
    input.parts === undefined
      ? (previous?.parts ?? {})
      : _partsInput(input.parts, label);
  Object.entries(parts).forEach(({ 0: part, 1: value }) => {
    void (
      schema.parts.includes(part) ||
      _reference(
        label,
        `part ${part} is not in the label schema of sender ${sender}`
      )
    );
    _checkPartRef(
      setup,
      part,
      _own(previous?.parts, part) !== undefined,
      label
    );
    _checkValue(
      setup,
      part,
      value,
      _own(previous?.parts, part) === value,
      label
    );
  });
  return {
    code: ref.code,
    name: _name(input.name, previous?.name, label),
    note: _note(input.note, previous?.note, label),
    sender,
    target,
    parts,
    archivedAt: previous?.archivedAt ?? null,
  };
};

// Тип для новой ссылки: есть; в архиве — только если элемент уже ссылался на него.
const _checkType = (
  setup: Setup,
  sender: string,
  code: string,
  used: boolean,
  label: string
): EventType =>
  ((found) =>
    found === undefined
      ? _reference(label, `there is no event type ${sender}/${code}`)
      : found.archivedAt !== null && !used
        ? _reference(label, `event type ${sender}/${code} is archived`)
        : found)(
    setup.types.find((_) => _.sender === sender && _.code === code)
  );

const _CONDITION = 'a condition is { property, gte } or { property, eq }';

const _eqValue = (raw: unknown, label: string): string | number | boolean =>
  typeof raw === 'string' ||
  typeof raw === 'boolean' ||
  (typeof raw === 'number' && Number.isFinite(raw))
    ? raw
    : _invalid(label, 'eq is a value code, a number, true or false');

const _conditionInput = (raw: unknown, label: string): MilestoneCondition =>
  ((input) =>
    ((property) =>
      (input.gte === undefined) === (input.eq === undefined)
        ? _invalid(label, _CONDITION)
        : input.gte !== undefined
          ? {
              property,
              gte:
                typeof input.gte === 'number' && Number.isFinite(input.gte)
                  ? input.gte
                  : _invalid(label, 'gte is a number'),
            }
          : { property, eq: _eqValue(input.eq, label) })(
      parseCode(input.property, CODE_LIMITS.property, `${label}: property`)
    ))(
    _known(
      _isRecord(raw) ? raw : _invalid(label, _CONDITION),
      ['property', 'gte', 'eq'],
      label
    )
  );

// Равенство — только у выбора (значение из справочника), «да или нет» и числа; строки и деньги не годятся.
const _EQ: Readonly<
  Partial<
    Record<
      PropertyKind,
      (
        eq: string | number | boolean,
        property: Property,
        setup: Setup,
        used: boolean,
        label: string
      ) => void
    >
  >
> = {
  choice: (eq, property, setup, used, label) =>
    typeof eq === 'string'
      ? _checkValue(setup, property.dictionary ?? '', eq, used, label)
      : _invalid(label, `eq of choice ${property.code} is a value code`),
  boolean: (eq, property, _setup, _used, label) =>
    void (
      typeof eq !== 'boolean' &&
      _invalid(label, `eq of yes/no ${property.code} is true or false`)
    ),
  number: (eq, property, _setup, _used, label) =>
    void (
      typeof eq !== 'number' &&
      _invalid(label, `eq of number ${property.code} is a number`)
    ),
};

// Условие — на свойство, объявленное в типе: `gte` — у числа, `eq` — по таблице выше.
const _checkCondition = (
  setup: Setup,
  type: EventType,
  condition: MilestoneCondition,
  previous: MilestoneCondition | null,
  label: string
): void => {
  void (
    type.properties.some((_) => _.code === condition.property) ||
    _reference(
      label,
      `property ${condition.property} is not declared in event type ${type.sender}/${type.code}`
    )
  );
  const property =
    setup.properties.find(
      (_) => _.scope === 'event' && _.code === condition.property
    ) ?? _reference(label, `there is no event property ${condition.property}`);
  void ('gte' in condition
    ? property.kind !== 'number' &&
      _reference(
        label,
        `gte needs a number property, ${property.code} is ${property.kind}`
      )
    : (
        _EQ[property.kind] ??
        (() =>
          _reference(
            label,
            `eq needs a choice, a yes/no or a number property, ${property.code} is ${property.kind}`
          ))
      )(
        condition.eq,
        property,
        setup,
        previous !== null &&
          'eq' in previous &&
          previous.property === condition.property &&
          previous.eq === condition.eq,
        label
      ));
};

const _milestone = (
  input: Input,
  previous: Milestone | null,
  setup: Setup,
  ref: ItemRef
): Milestone => {
  const label = _labelOf(ref);
  _room(
    previous === null && setup.milestones.length >= SETUP_LIMITS.milestones,
    label,
    `a site has at most ${SETUP_LIMITS.milestones} milestones`
  );
  const sender = _codeField(
    input.sender,
    previous?.sender,
    CODE_LIMITS.sender,
    label,
    'sender'
  );
  const code = _codeField(
    input.type,
    previous?.type,
    CODE_LIMITS.type,
    label,
    'type'
  );
  const type = _checkType(
    setup,
    sender,
    code,
    previous?.sender === sender && previous.type === code,
    label
  );
  const condition =
    input.condition === undefined
      ? (previous?.condition ?? null)
      : input.condition === null
        ? null
        : _conditionInput(input.condition, label);
  void (
    condition !== null &&
    _checkCondition(setup, type, condition, previous?.condition ?? null, label)
  );
  const anchor =
    input.anchor === undefined
      ? (previous?.anchor ?? null)
      : input.anchor === null
        ? null
        : parseCode(input.anchor, CODE_LIMITS.type, `${label}: anchor`);
  void (
    anchor !== null &&
    _checkType(
      setup,
      sender,
      anchor,
      previous?.sender === sender && previous.anchor === anchor,
      label
    )
  );
  return {
    code: ref.code,
    name: _name(input.name, previous?.name, label),
    note: _note(input.note, previous?.note, label),
    sender,
    type: type.code,
    count: _count(
      input.count,
      previous?.count,
      1,
      [1, SETUP_LIMITS.milestoneCount],
      label,
      'count'
    ),
    condition,
    days: _optionalCount(
      input.days,
      previous?.days,
      [1, SETUP_LIMITS.milestoneDays],
      label,
      'days'
    ),
    anchor,
    column: _flag(input.column, previous?.column ?? true, label, 'column'),
    position: _position(
      input.position,
      previous?.position,
      setup.milestones.length,
      label
    ),
    archivedAt: previous?.archivedAt ?? null,
  };
};

const _STEP_FIELDS: Readonly<Record<FunnelStepKind, readonly string[]>> = {
  visits: ['kind', 'page'],
  goal: ['kind', 'goal'],
  arrival: ['kind'],
  trial: ['kind'],
  payment: ['kind', 'number'],
  milestone: ['kind', 'milestone'],
  type: ['kind', 'sender', 'type'],
};

/** Сторона воронки: посещения и цели — из сводок статистики, остальное — люди из событий. */
export var STEP_SIDES: Readonly<Record<FunnelStepKind, 'visits' | 'people'>> = {
  visits: 'visits',
  goal: 'visits',
  arrival: 'people',
  trial: 'people',
  payment: 'people',
  milestone: 'people',
  type: 'people',
};

const _page = (raw: unknown): string | null =>
  typeof raw === 'string' && raw.length <= SETUP_LIMITS.page && _PAGE.test(raw)
    ? raw
    : null;

/** Переход в цели шага: `go:<код>` — код; `go:` и цель формы — null. */
export var goalLink = (goal: string): string | null =>
  goal.startsWith(GO_GOAL) && goal !== GO_GOAL
    ? goal.slice(GO_GOAL.length)
    : null;

const _goal = (raw: unknown): string | null =>
  typeof raw !== 'string'
    ? null
    : raw === GO_GOAL ||
        (raw.startsWith(GO_GOAL) &&
          raw.length - GO_GOAL.length <= CODE_LIMITS.link &&
          /^[a-z0-9_-]+$/.test(raw.slice(GO_GOAL.length))) ||
        (raw.startsWith(FORM_GOAL) &&
          _FORM_NAME.test(raw.slice(FORM_GOAL.length)))
      ? raw
      : null;

const _STEP_PARSE: Readonly<
  Record<FunnelStepKind, (input: Input, label: string) => FunnelStep>
> = {
  visits: (input, label) => ({
    kind: 'visits',
    page:
      input.page === undefined || input.page === null
        ? null
        : (_page(input.page) ??
          _invalid(
            label,
            `page is null or a path of the site /… up to ${SETUP_LIMITS.page} characters`
          )),
  }),
  goal: (input, label) => ({
    kind: 'goal',
    goal:
      _goal(input.goal) ??
      _invalid(
        label,
        `goal is ${GO_GOAL} (any link), ${GO_GOAL}<link> or ${FORM_GOAL}<form>`
      ),
  }),
  arrival: () => ({ kind: 'arrival' }),
  trial: () => ({ kind: 'trial' }),
  payment: (input, label) => ({
    kind: 'payment',
    number:
      _whole(input.number, 1, SETUP_LIMITS.paymentNumber) ??
      _invalid(
        label,
        `number is a whole number 1 to ${SETUP_LIMITS.paymentNumber}`
      ),
  }),
  milestone: (input, label) => ({
    kind: 'milestone',
    milestone: parseCode(
      input.milestone,
      CODE_LIMITS.milestone,
      `${label}: milestone`
    ),
  }),
  type: (input, label) => ({
    kind: 'type',
    sender: parseCode(input.sender, CODE_LIMITS.sender, `${label}: sender`),
    type: parseCode(input.type, CODE_LIMITS.type, `${label}: type`),
  }),
};

// Ссылки шагов: переход, веха и тип есть; в архиве — только если воронка уже ссылалась на них.
const _STEP_REFERENCES: Readonly<
  Partial<
    Record<
      FunnelStepKind,
      (step: FunnelStep, setup: Setup, used: boolean, label: string) => void
    >
  >
> = {
  goal: (step, setup, used, label) =>
    ((link) =>
      void (
        link !== null &&
        ((found) =>
          found === undefined
            ? _reference(label, `there is no link ${link}`)
            : found.archivedAt !== null &&
              !used &&
              _reference(label, `link ${link} is archived`))(
          setup.links.find((_) => _.code === link)
        )
      ))(goalLink((step as { readonly goal: string }).goal)),
  milestone: (step, setup, used, label) =>
    ((code) =>
      ((found) =>
        void (found === undefined
          ? _reference(label, `there is no milestone ${code}`)
          : found.archivedAt !== null &&
            !used &&
            _reference(label, `milestone ${code} is archived`)))(
        setup.milestones.find((_) => _.code === code)
      ))((step as { readonly milestone: string }).milestone),
  type: (step, setup, used, label) =>
    ((typed) => void _checkType(setup, typed.sender, typed.type, used, label))(
      step as { readonly sender: string; readonly type: string }
    ),
};

const _same = (a: unknown, b: unknown): boolean =>
  canonicalJson(a) === canonicalJson(b);

const _steps = (raw: unknown, label: string): FunnelStep[] =>
  Array.isArray(raw) &&
  raw.length >= SETUP_LIMITS.funnelSteps.min &&
  raw.length <= SETUP_LIMITS.funnelSteps.max
    ? raw.map((entry, index) =>
        ((where) =>
          ((input) =>
            ((kind) =>
              _STEP_PARSE[kind](
                _known(input, _STEP_FIELDS[kind], where),
                where
              ))(
              _choice(input.kind, FUNNEL_STEP_KINDS, undefined, where, 'kind')
            ))(
            _isRecord(entry) ? entry : _invalid(where, 'a step is { kind, … }')
          ))(`${label}: step ${index + 1}`)
      )
    : _invalid(
        label,
        `steps is a list of ${SETUP_LIMITS.funnelSteps.min} to ${SETUP_LIMITS.funnelSteps.max} steps`
      );

const _funnel = (
  input: Input,
  previous: Funnel | null,
  setup: Setup,
  ref: ItemRef
): Funnel => {
  const label = _labelOf(ref);
  _room(
    previous === null && setup.funnels.length >= SETUP_LIMITS.funnels,
    label,
    `a site has at most ${SETUP_LIMITS.funnels} funnels`
  );
  const steps =
    input.steps === undefined
      ? (previous?.steps ?? _invalid(label, 'steps are required'))
      : _steps(input.steps, label);
  steps.forEach(
    (step, index) =>
      void _STEP_REFERENCES[step.kind]?.(
        step,
        setup,
        previous?.steps.some((_) => _same(_, step)) ?? false,
        `${label}: step ${index + 1}`
      )
  );
  void (
    steps.some(
      (step, index) =>
        STEP_SIDES[step.kind] === 'visits' &&
        steps.slice(0, index).some((_) => STEP_SIDES[_.kind] === 'people')
    ) && _invalid(label, 'steps of site visits come before steps of people')
  );
  return {
    code: ref.code,
    name: _name(input.name, previous?.name, label),
    note: _note(input.note, previous?.note, label),
    strict: _flag(input.strict, previous?.strict ?? false, label, 'strict'),
    main: _flag(input.main, previous?.main ?? false, label, 'main'),
    steps,
    position: _position(
      input.position,
      previous?.position,
      setup.funnels.length,
      label
    ),
    archivedAt: previous?.archivedAt ?? null,
  };
};

// Методы, а не стрелки: параметры метода сравниваются бивариантно, и таблица принимает сборщики групп.
type Spec = {
  readonly fields: readonly string[];
  build(
    input: Input,
    previous: SetupItem | null,
    setup: Setup,
    ref: ItemRef,
    holds: SetupHolds
  ): SetupItem;
  /** Кто ссылается на элемент: пока ссылаются, удалить его нельзя. */
  users(setup: Setup, item: SetupItem): readonly string[];
  /** Правка других элементов той же правкой: основная воронка на сайте одна. */
  settle?(setup: Setup, item: SetupItem): Setup;
  /** Можно ли в архив; отказ — исключением: у встроенной проверки архива нет. */
  archivable?(item: SetupItem, label: string): void;
};

const _invalidRule = (label: string, message: string): never =>
  fail('analytics.invalid_check', `${label}: ${message}`);

const _RULE_FIELDS = [
  'metric',
  'sender',
  'type',
  'role',
  'goal',
  'currency',
  'compare',
  'threshold',
  'days',
  'severity',
];

// Поле, которое задаёт показатель: обязательное — есть, чужое показателю — null или нет поля.
const _ruleParam = <T>(
  input: Input,
  field: RuleParam,
  metric: CheckMetric,
  parse: (raw: unknown) => T | null,
  rule: string,
  label: string
): T | null =>
  ((raw, spec) =>
    raw === undefined || raw === null
      ? spec.required.includes(field)
        ? _invalidRule(label, `${field} is required for metric ${metric}`)
        : null
      : !spec.required.includes(field) && !spec.optional.includes(field)
        ? _invalidRule(label, `metric ${metric} has no ${field}: leave it null`)
        : (parse(raw) ?? _invalidRule(label, `${field} is ${rule}`)))(
    input[field],
    METRIC_PARAMS[metric]
  );

const _RULE_ROLES = EVENT_ROLES.filter((_) => !RULE_ROLES_EXCLUDED.includes(_));

// Порог: счёт — целое; у выручки — деньги валюты правила строкой (`"500.00"`) или целым минимальных единиц.
const _threshold = (
  raw: unknown,
  metric: CheckMetric,
  currency: string | null,
  label: string
): number =>
  metric === 'revenue'
    ? ((typeof raw === 'string'
        ? moneyOf(raw, currency as string)
        : _whole(raw, 0, Number.MAX_SAFE_INTEGER)) ??
      _invalidRule(
        label,
        `threshold of revenue is money of ${currency}: a decimal string ("500.00") or a whole number of minor units`
      ))
    : (_whole(raw, 0, QUALITY_LIMITS.threshold) ??
      _invalidRule(
        label,
        `threshold is a whole number 0 to ${QUALITY_LIMITS.threshold}`
      ));

/** Правило своей пороговой из входа: показатель и только его поля, сравнение, порог, период, важность. */
const _rule = (raw: unknown, label: string): ThresholdRule =>
  ((input) =>
    ((metric) =>
      ((currency) => ({
        metric,
        sender: _ruleParam(
          input,
          'sender',
          metric,
          (_) => (isCode(_, CODE_LIMITS.sender) ? _ : null),
          'a sender code',
          label
        ),
        type: _ruleParam(
          input,
          'type',
          metric,
          (_) => (isCode(_, CODE_LIMITS.type) ? _ : null),
          'an event type code',
          label
        ),
        role: _ruleParam(
          input,
          'role',
          metric,
          (_) =>
            _RULE_ROLES.includes(_ as EventRole) ? (_ as EventRole) : null,
          `one of ${_RULE_ROLES.join(', ')}`,
          label
        ),
        goal: _ruleParam(
          input,
          'goal',
          metric,
          _goal,
          `${GO_GOAL} (any link), ${GO_GOAL}<link> or ${FORM_GOAL}<form>`,
          label
        ),
        currency,
        compare:
          input.compare === 'lt' || input.compare === 'gt'
            ? input.compare
            : _invalidRule(
                label,
                'compare is lt (fires below the threshold) or gt (above it)'
              ),
        threshold: _threshold(input.threshold, metric, currency, label),
        days: RULE_DAYS.includes(input.days as ThresholdRule['days'])
          ? (input.days as ThresholdRule['days'])
          : _invalidRule(label, `days is ${RULE_DAYS.join(', ')}`),
        severity:
          input.severity === 'warning' || input.severity === 'failure'
            ? input.severity
            : _invalidRule(label, 'severity is warning or failure'),
      }))(
        _ruleParam(
          input,
          'currency',
          metric,
          (_) => (isCurrency(_) ? _ : null),
          'an ISO 4217 code of three capital letters',
          label
        )
      ))(
      CHECK_METRICS.includes(input.metric as CheckMetric)
        ? (input.metric as CheckMetric)
        : _invalidRule(label, `metric is one of ${CHECK_METRICS.join(', ')}`)
    ))(
    _isRecord(raw)
      ? ((extra) =>
          extra === undefined
            ? raw
            : _invalidRule(label, `the rule has no field "${extra}"`))(
          Object.keys(raw).find((_) => !_RULE_FIELDS.includes(_))
        )
      : _invalidRule(
          label,
          'params is the rule: { metric, compare, threshold, days, severity } and the fields of the metric'
        )
  );

// Ссылки правила: отправитель, тип и переход цели есть; в архиве — только если правило уже на них ссылалось.
const _checkRule = (
  setup: Setup,
  rule: ThresholdRule,
  previous: ThresholdRule | null,
  label: string
): void => (
  void (
    rule.sender !== null &&
    _checkSender(setup, rule.sender, previous?.sender === rule.sender, label)
  ),
  void (
    rule.type !== null &&
    _checkType(
      setup,
      rule.sender as string,
      rule.type,
      previous?.sender === rule.sender && previous?.type === rule.type,
      label
    )
  ),
  ((link) =>
    void (
      link !== null &&
      ((found) =>
        found === undefined
          ? _reference(label, `there is no link ${link}`)
          : found.archivedAt !== null &&
            previous?.goal !== rule.goal &&
            _reference(label, `link ${link} is archived`))(
        setup.links.find((_) => _.code === link)
      )
    ))(rule.goal === null ? null : goalLink(rule.goal))
);

// Своя пороговая: код не из встроенных, название обязательно, правило по показателю; до 20 на сайт, с архивом.
const _custom = (
  input: Input,
  previous: QualityCheck | null,
  setup: Setup,
  ref: ItemRef,
  label: string
): QualityCheck =>
  ((rule) => (
    _room(
      previous === null &&
        setup.checks.filter((_) => ruleOf(_) !== null).length >=
          QUALITY_LIMITS.custom,
      label,
      `a site has at most ${QUALITY_LIMITS.custom} checks of its own, archived ones too`
    ),
    _checkRule(setup, rule, previous === null ? null : ruleOf(previous), label),
    {
      code: ref.code,
      name: _name(input.name, previous?.name, label),
      note: _note(input.note, previous?.note, label),
      enabled: _flag(
        input.enabled,
        previous?.enabled ?? true,
        label,
        'enabled'
      ),
      notify: _choice(
        input.notify,
        CHECK_NOTIFY,
        previous?.notify ?? 'failure',
        label,
        'notify'
      ),
      params: rule,
      archivedAt: previous?.archivedAt ?? null,
    }
  ))(
    input.params === undefined || input.params === null
      ? ((previous === null ? null : ruleOf(previous)) ??
          _invalidRule(
            label,
            'params is the rule of a check of its own: { metric, compare, threshold, days, severity } and the fields of the metric'
          ))
      : _rule(input.params, label)
  );

// Встроенный код — поправка (заметка, «включена», «уведомлять», только её пороги), свой — своя пороговая.
const _check = (
  input: Input,
  previous: SetupItem | null,
  setup: Setup,
  ref: ItemRef
): QualityCheck =>
  ((label) =>
    builtinCheck(ref.code) === null
      ? _custom(input, previous as QualityCheck | null, setup, ref, label)
      : {
          ...checkCorrection(
            input,
            previous as QualityCheck | null,
            ref.code,
            label
          ),
          note: _note(
            input.note,
            (previous as QualityCheck | null)?.note,
            label
          ),
        })(_labelOf(ref));

// Кто из своих проверок ссылается на элемент: по правилу.
const _checkUsers = (
  setup: Setup,
  uses: (rule: ThresholdRule) => boolean
): string[] =>
  setup.checks
    .filter((_) => ((rule) => rule !== null && uses(rule))(ruleOf(_)))
    .map((_) => _named('check', _));

const _ITEM_FIELDS = ['name', 'note'];

const _SPECS: Readonly<Record<SetupGroup, Spec>> = {
  sender: {
    fields: ['code', ..._ITEM_FIELDS, 'enabled', 'summaryAt'],
    build: _sender,
    users: (setup, item) =>
      ((code) => [
        ...setup.types
          .filter((_) => _.sender === code)
          .map((_) => _named('type', _)),
        ...setup.schemas
          .filter((_) => _.sender === code)
          .map((_) => _named('schema', _)),
        ...setup.links
          .filter((_) => _.sender === code)
          .map((_) => _named('link', _)),
        ...setup.milestones
          .filter((_) => _.sender === code)
          .map((_) => _named('milestone', _)),
        ..._checkUsers(setup, (_) => _.sender === code),
      ])((item as Sender).code),
  },
  type: {
    fields: ['sender', 'code', ..._ITEM_FIELDS, 'role', 'properties'],
    build: _type,
    users: (setup, item) =>
      ((type) => [
        ...setup.milestones
          .filter(
            (_) =>
              _.sender === type.sender &&
              (_.type === type.code || _.anchor === type.code)
          )
          .map((_) => _named('milestone', _)),
        ...setup.funnels
          .filter((_) =>
            _.steps.some(
              (step) =>
                step.kind === 'type' &&
                step.sender === type.sender &&
                step.type === type.code
            )
          )
          .map((_) => _named('funnel', _)),
        ..._checkUsers(
          setup,
          (_) => _.sender === type.sender && _.type === type.code
        ),
      ])(item as EventType),
  },
  property: {
    fields: [
      'scope',
      'code',
      ..._ITEM_FIELDS,
      'kind',
      'dictionary',
      'dimension',
      'untrusted',
      'reconcile',
    ],
    build: _property,
    users: (setup, item) =>
      ((property) =>
        property.scope === 'event'
          ? [
              ...setup.types
                .filter((_) =>
                  _.properties.some((p) => p.code === property.code)
                )
                .map((_) => _named('type', _)),
              ...setup.milestones
                .filter((_) => _.condition?.property === property.code)
                .map((_) => _named('milestone', _)),
            ]
          : [])(item as Property),
  },
  dictionary: {
    fields: ['code', ..._ITEM_FIELDS, 'purpose', 'utm', 'length'],
    build: _dictionary,
    users: (setup, item) =>
      ((code) => [
        ..._purposeUsers(setup, code),
        ...setup.values
          .filter((_) => _.dictionary === code)
          .map((_) => _named('value', _)),
      ])((item as Dictionary).code),
    // Справочник ушёл из частей — отметки «ждёт расхода» его значений становятся null, пришёл — false.
    // Значения правят, только если отметка меняется хоть у одного: набор не копирует все значения сайта на каждом.
    settle: (setup, item) =>
      ((dictionary) =>
        ((awaits) =>
          setup.values.some(
            (_) =>
              _.dictionary === dictionary.code && awaits(_) !== _.awaitsSpend
          )
            ? {
                ...setup,
                values: setup.values.map((_) =>
                  _.dictionary === dictionary.code &&
                  awaits(_) !== _.awaitsSpend
                    ? { ..._, awaitsSpend: awaits(_) }
                    : _
                ),
              }
            : setup)((value: DictionaryValue) =>
          dictionary.purpose === 'parts' ? (value.awaitsSpend ?? false) : null
        ))(item as Dictionary),
  },
  value: {
    fields: ['dictionary', 'code', ..._ITEM_FIELDS, 'position', 'awaitsSpend'],
    build: _value,
    users: (setup, item) =>
      ((value) => [
        ...setup.referrers
          .filter((_) => _own(_.parts, value.dictionary) === value.code)
          .map((_) => _named('referrer', _)),
        ...setup.links
          .filter((_) => _own(_.parts, value.dictionary) === value.code)
          .map((_) => _named('link', _)),
        ...setup.milestones
          .filter(
            (_) =>
              _.condition !== null &&
              'eq' in _.condition &&
              _.condition.eq === value.code &&
              setup.properties.some(
                (property) =>
                  property.scope === 'event' &&
                  property.code === _.condition?.property &&
                  property.dictionary === value.dictionary
              )
          )
          .map((_) => _named('milestone', _)),
      ])(item as DictionaryValue),
  },
  schema: {
    fields: ['sender', ..._ITEM_FIELDS, 'separator', 'length', 'parts'],
    build: _schema,
    users: (setup, item) =>
      setup.links
        .filter((_) => _.sender === (item as LabelSchema).sender)
        .map((_) => _named('link', _)),
  },
  referrer: {
    fields: ['code', ..._ITEM_FIELDS, 'kind', 'host', 'parts'],
    build: _referrer,
    users: () => [],
  },
  link: {
    fields: ['code', ..._ITEM_FIELDS, 'sender', 'target', 'parts'],
    build: _link,
    users: (setup, item) => [
      ...setup.funnels
        .filter((_) =>
          _.steps.some(
            (step) =>
              step.kind === 'goal' &&
              goalLink(step.goal) === (item as GoLink).code
          )
        )
        .map((_) => _named('funnel', _)),
      ..._checkUsers(
        setup,
        (_) => _.goal !== null && goalLink(_.goal) === (item as GoLink).code
      ),
    ],
  },
  milestone: {
    fields: [
      'code',
      ..._ITEM_FIELDS,
      'sender',
      'type',
      'count',
      'condition',
      'days',
      'anchor',
      'column',
      'position',
    ],
    build: _milestone,
    users: (setup, item) =>
      setup.funnels
        .filter((_) =>
          _.steps.some(
            (step) =>
              step.kind === 'milestone' &&
              step.milestone === (item as Milestone).code
          )
        )
        .map((_) => _named('funnel', _)),
  },
  funnel: {
    fields: ['code', ..._ITEM_FIELDS, 'strict', 'main', 'steps', 'position'],
    build: _funnel,
    users: () => [],
    // Новая основная воронка снимает отметку с прежней той же правкой: журнал пишет обе.
    settle: (setup, item) =>
      (item as Funnel).main
        ? {
            ...setup,
            funnels: setup.funnels.map((_) =>
              _.main && _.code !== (item as Funnel).code
                ? { ..._, main: false }
                : _
            ),
          }
        : setup,
  },
  check: {
    fields: ['code', ..._ITEM_FIELDS, 'enabled', 'notify', 'params'],
    build: _check,
    users: () => [],
    archivable: (item, label) =>
      void (
        builtinCheck((item as QualityCheck).code) !== null &&
        _invalid(
          label,
          'a built-in check has no archive: turn it off instead (enabled false)'
        )
      ),
  },
};

// Создать или изменить элемент по ключу, без ревизии: поля, которых нет во входе, остаются прежними.
const _put = (
  setup: Setup,
  group: SetupGroup,
  raw: unknown,
  holds: SetupHolds
): Setup =>
  ((ref) =>
    ((previous) =>
      ((item) =>
        ((next) => _SPECS[group].settle?.(next, item) ?? next)(
          _replace(setup, group, previous, item)
        ))(
        _SPECS[group].build(
          _known(raw as Input, _SPECS[group].fields, _labelOf(ref)),
          previous,
          setup,
          ref,
          holds
        )
      ))(findItem(setup, ref)))(parseRef(group, raw));

/** Что изменилось между двумя снимками: по группам и ключам, неизменённые элементы не входят. */
export var changesOf = (before: Setup, after: Setup): ItemChange[] =>
  SETUP_GROUPS.flatMap((group) =>
    ((was, now) =>
      [...new Set([...was.keys(), ...now.keys()])]
        .map(
          (key): ItemChange => ({
            group,
            key,
            before: was.get(key) ?? null,
            after: now.get(key) ?? null,
          })
        )
        // Новый и удалённый — изменение и без сравнения: набор в сто тысяч элементов не пишет их JSON.
        .filter(
          (_) =>
            _.before === null || _.after === null || !_same(_.before, _.after)
        ))(
      new Map(_items(before, group).map((_) => [keyOf(group, _), _])),
      new Map(_items(after, group).map((_) => [keyOf(group, _), _]))
    )
  );

// Правка меняет ревизию на одну; ничего не изменилось — ни ревизии, ни события.
const _revise = (before: Setup, after: Setup): Changed<Setup, AnalyticsEvent> =>
  _revised(before, after, changesOf(before, after));

const _found = (setup: Setup, ref: ItemRef): SetupItem =>
  findItem(setup, ref) ??
  fail('analytics.item_not_found', `${_labelOf(ref)} does not exist`);

/** Создать или изменить элемент группы: коды, ссылки и пределы проверены; `holds` — ссылки данных сайта. */
export var saveItem =
  (group: unknown, raw: unknown, holds: SetupHolds = NO_HOLDS) =>
  (setup: Setup): Changed<Setup, AnalyticsEvent> =>
    _revise(setup, _put(setup, parseGroup(group), raw, holds));

/** В архив или из архива; элемент уже там, где нужно, — ничего не меняется. */
export var archiveItem =
  (ref: ItemRef, archived: boolean, at: string) =>
  (setup: Setup): Changed<Setup, AnalyticsEvent> =>
    ((item) => (
      _SPECS[ref.group].archivable?.(item, _labelOf(ref)),
      _revise(
        setup,
        _replace(setup, ref.group, item, {
          ...item,
          archivedAt: archived ? (item.archivedAt ?? at) : null,
        })
      )
    ))(_found(setup, ref));

const _MAX_USERS = 5;

/**
 * Удалить элемент, на который никто не ссылается; `events` — есть ли у типа или отправителя события, у своей
 * проверки — строки дней; `spend` — есть ли у части или её значения строки расхода. Данные сайта — не часть
 * настройки: их проверяет сервис.
 */
export var removeItem =
  (ref: ItemRef, events: boolean, spend = false) =>
  (setup: Setup): Changed<Setup, AnalyticsEvent> =>
    ((item) =>
      ((users) =>
        users.length > 0
          ? fail(
              'analytics.in_use',
              `${_labelOf(ref)} is used by ${users.slice(0, _MAX_USERS).join(', ')}${users.length > _MAX_USERS ? ` and ${users.length - _MAX_USERS} more` : ''}: archive it instead`
            )
          : events
            ? fail(
                'analytics.in_use',
                `${_labelOf(ref)} has ${ref.group === 'check' ? 'results of days' : 'events'}: archive it instead`
              )
            : spend
              ? fail(
                  'analytics.in_use',
                  `${_labelOf(ref)} is used by spend rows: archive it instead`
                )
              : _revise(setup, _replace(setup, ref.group, item, null)))(
        _SPECS[ref.group].users(setup, item)
      ))(_found(setup, ref));

// Поля обёртки — ключами объекта, а не строками: tsc сверяет их с AnalyticsSet, а коды свойств сайта,
// совпавшие с именем поля, не попадают в код строкой (tests/analytics-neutral.test.ts).
const _SET_FIELDS = Object.keys({
  format: true,
  version: true,
  name: true,
  eile: true,
  exportedAt: true,
  senders: true,
  properties: true,
  dictionaries: true,
  types: true,
  schemas: true,
  referrers: true,
  links: true,
  milestones: true,
  funnels: true,
  checks: true,
} satisfies Record<keyof AnalyticsSet, true>);

// Сколько элементов группы помещается на сайт: список длиннее — ошибка группы без шагов, и чужой файл в
// миллион элементов не стоит миллиона проверок.
const _ROOM = {
  senders: SETUP_LIMITS.senders,
  dictionaries: SETUP_LIMITS.dictionaries,
  values: SETUP_LIMITS.valuesPerDictionary,
  properties: SETUP_LIMITS.eventProperties + SETUP_LIMITS.traits,
  types: SETUP_LIMITS.senders * SETUP_LIMITS.typesPerSender,
  schemas: SETUP_LIMITS.senders,
  referrers: SETUP_LIMITS.referrers,
  links: SETUP_LIMITS.links,
  milestones: SETUP_LIMITS.milestones,
  funnels: SETUP_LIMITS.funnels,
  checks: BUILTIN_CHECKS.length + QUALITY_LIMITS.custom,
} as const;

/** Чего набор не несёт и не меняет: решения владельца этого сайта, его секреты и данные. */
export var SET_UNTOUCHED = [
  'intake',
  'retention',
  'base_currency',
  'keys',
  'labels',
  'rates',
  'spend',
  'statements',
  'events',
  'people',
  'results',
] as const;

export type SetUntouched = (typeof SET_UNTOUCHED)[number];

/** Элемент в отчёте пробы: группа, ключ и название из файла или с сайта. */
export type SetItemNote = {
  readonly group: SetupGroup;
  readonly key: string;
  readonly name: string;
};

export type SetWarningCode =
  | 'role_changed'
  | 'sender_created'
  | 'sender_disabled'
  | 'archive_kept'
  | 'summary_hour'
  | 'newer_file';

/** Не мешает применить, но меняет данные сайта или расходится с файлом; у `newer_file` элемента нет. */
export type SetWarning = {
  readonly path: string;
  readonly code: SetWarningCode;
  readonly message: string;
  readonly group: SetupGroup | null;
  readonly key: string | null;
};

/** Что известно о данных сайта: ссылки расходов, события типов, версия этой Eile, момент загрузки. */
export type SetFacts = {
  readonly holds: SetupHolds;
  /** Есть ли у типа события: смена роли пересчитает людей. */
  readonly events: (sender: string, type: string) => boolean;
  readonly version: string;
  /** Новый элемент из архива файла уходит в архив этим моментом. */
  readonly at: string;
};

/** Проба набора в памяти: что создастся, изменится, останется, предупреждения и ошибки по путям. */
export type SetDraft = {
  readonly name: string;
  /** Настройка после набора; при ошибках — то, что успело примениться, и только для отчёта. */
  readonly result: Changed<Setup, AnalyticsEvent>;
  readonly changes: readonly ItemChange[];
  readonly created: readonly (SetItemNote & { readonly archived: boolean })[];
  /** Поля, которые станут другими: «было → стало» на экране. */
  readonly changed: readonly (SetItemNote & {
    readonly fields: readonly string[];
  })[];
  readonly unchanged: number;
  /** На сайте и не в файле, по группам: набор их не трогает. */
  readonly kept: Readonly<Partial<Record<SetupGroup, number>>>;
  readonly warnings: readonly SetWarning[];
  /** Путь в наборе → причина: есть хоть одна — ничего не применено. */
  readonly errors: SetErrors;
};

type _Entry = readonly [path: string, message: string];

type _Read = {
  readonly steps: readonly SetStep[];
  readonly errors: readonly _Entry[];
};

const _invalidSet = (message: string): never =>
  fail('analytics.invalid_set', message);

const _without = (raw: Input, field: string): Input =>
  Object.fromEntries(Object.entries(raw).filter(({ 0: key }) => key !== field));

const _refOf = (group: SetupGroup, raw: unknown): ItemRef | null =>
  attempt(
    () => parseRef(group, raw),
    (error) => (isDomainError(error) ? null : rethrow(error))
  );

// `archived` — отметка набора, а не поле элемента: элемент его не знает, применение ставит архив само.
// Полей у элемента любой группы — меньше двадцати: объект в миллион ключей отклоняется до копии без `archived`.
const _FIELDS_MAX = 32;

const _crowded = (raw: unknown): boolean =>
  _isRecord(raw) && Object.keys(raw).length > _FIELDS_MAX;

const _step = (
  path: string,
  group: SetupGroup,
  raw: unknown,
  refused: string | null = null
): SetStep =>
  ((archived) =>
    ((refusal) => ({
      path,
      group,
      ref: refusal === null ? _refOf(group, raw) : null,
      input:
        _isRecord(raw) && refusal === null ? _without(raw, 'archived') : raw,
      archived: archived === true,
      refused: refusal,
    }))(
      refused ??
        (_crowded(raw)
          ? `an item has at most ${_FIELDS_MAX} fields`
          : archived === undefined || typeof archived === 'boolean'
            ? null
            : 'archived is true or false')
    ))(_isRecord(raw) ? raw.archived : undefined);

const _NO_READ: _Read = { steps: [], errors: [] };

// Группа — список не длиннее предела сайта; нет поля — пусто.
const _listed = (
  raw: unknown,
  path: string,
  room: number,
  read: (entries: readonly unknown[]) => _Read
): _Read =>
  raw === undefined
    ? _NO_READ
    : !Array.isArray(raw)
      ? { steps: [], errors: [[path, `${path} is a list`]] }
      : raw.length > room
        ? {
            steps: [],
            errors: [
              [
                path,
                `a site holds at most ${room} of them, the set lists ${raw.length}`,
              ],
            ],
          }
        : read(raw);

const _joined = (reads: readonly _Read[]): _Read => ({
  steps: reads.flatMap((_) => _.steps),
  errors: reads.flatMap((_) => _.errors),
});

const _plain =
  (field: string, group: SetupGroup) =>
  (entries: readonly unknown[]): _Read => ({
    steps: entries.map((raw, index) => _step(`${field}[${index}]`, group, raw)),
    errors: [],
  });

// Значения справочника — внутри него: справочник у них свой, чужого в наборе не бывает.
const _valueStep =
  (dictionary: unknown, path: string) =>
  (raw: unknown, index: number): SetStep =>
    _isRecord(raw) && raw.dictionary === undefined
      ? _step(`${path}.values[${index}]`, 'value', { ...raw, dictionary })
      : _step(
          `${path}.values[${index}]`,
          'value',
          raw,
          'A value inside a dictionary is a JSON object without "dictionary"'
        );

const _dictionaryRead = (raw: unknown, path: string): _Read =>
  _isRecord(raw) && !_crowded(raw)
    ? (({ values, ...dictionary }) =>
        _joined([
          { steps: [_step(path, 'dictionary', dictionary)], errors: [] },
          _listed(values, `${path}.values`, _ROOM.values, (entries) => ({
            steps: entries.map(_valueStep(raw.code, path)),
            errors: [],
          })),
        ]))(raw)
    : { steps: [_step(path, 'dictionary', raw)], errors: [] };

const _marks = (step: SetStep): boolean =>
  _isRecord(step.input) &&
  step.input.reconcile !== undefined &&
  step.input.reconcile !== null;

// Отметку сверки ставят после тех, кто её снимает: набор переносит её с одного свойства на другое.
const _marksLast = (read: _Read): _Read => ({
  ...read,
  steps: [
    ...read.steps.filter((_) => !_marks(_)),
    ...read.steps.filter(_marks),
  ],
});

// Группы набора после справочников — в порядке зависимостей; поле набора — ключом объекта, как обёртка.
const _LATER: readonly (readonly [
  field: keyof typeof _ROOM & keyof AnalyticsSet,
  SetupGroup,
])[] = Object.entries({
  properties: 'property',
  types: 'type',
  schemas: 'schema',
  referrers: 'referrer',
  links: 'link',
  milestones: 'milestone',
  funnels: 'funnel',
  checks: 'check',
} satisfies Partial<Record<keyof AnalyticsSet, SetupGroup>>) as [
  keyof typeof _ROOM & keyof AnalyticsSet,
  SetupGroup,
][];

const _VERSION_TEXT =
  /^\d{1,6}\.\d{1,6}\.\d{1,6}(?:[-+][0-9A-Za-z.+-]{1,40})?$/;
const _MOMENT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

// Необязательное поле обёртки: нет — null, годное — оно само, негодное — undefined.
const _optional = (
  raw: unknown,
  valid: (text: string) => boolean
): string | null | undefined =>
  raw === undefined
    ? null
    : typeof raw === 'string' && valid(raw)
      ? raw
      : undefined;

const _setName = (raw: unknown): string | null =>
  _text(typeof raw === 'string' ? cleanName(raw) : raw, 1, SETUP_LIMITS.name);

// Незнакомое поле — набор новой Eile; путь — само поле после чистки: его печатает CLI.
const _unknownFields = (set: Input): _Entry[] =>
  Object.keys(set)
    .filter((_) => !_SET_FIELDS.includes(_))
    .map((field) =>
      ((shown) => [
        shown,
        `Unknown group "${shown}": the set is for a newer Eile`,
      ])(cleanText(field, 60))
    );

const _wrapperErrors = (
  set: Input,
  name: string | null,
  eile: string | null | undefined,
  exportedAt: string | null | undefined
): _Entry[] => [
  ..._unknownFields(set),
  ...(name === null
    ? [
        [
          'name',
          `The set name is 1 to ${SETUP_LIMITS.name} characters`,
        ] as const,
      ]
    : []),
  ...(eile === undefined
    ? [
        [
          'eile',
          'eile is the version of Eile that exported the set, like 0.2.0',
        ] as const,
      ]
    : []),
  ...(exportedAt === undefined
    ? [
        [
          'exportedAt',
          'exportedAt is a moment like 2026-11-26T10:00:00.000Z',
        ] as const,
      ]
    : []),
];

const _groupReads = (set: Input): _Read[] => [
  _listed(set.senders, 'senders', _ROOM.senders, _plain('senders', 'sender')),
  _listed(set.dictionaries, 'dictionaries', _ROOM.dictionaries, (entries) =>
    _joined(
      entries.map((raw, index) =>
        _dictionaryRead(raw, `dictionaries[${index}]`)
      )
    )
  ),
  ..._LATER.map(({ 0: field, 1: group }) =>
    ((read) => (group === 'property' ? _marksLast(read) : read))(
      _listed(set[field], field, _ROOM[field], _plain(field, group))
    )
  ),
];

/**
 * Набор из чужого файла: не объект, другой формат или версия — это не набор (`analytics.invalid_set`); всё
 * остальное — ошибками по путям, чтобы проба назвала их сразу. Шаги — в порядке зависимостей: отправители,
 * справочники со значениями, свойства, типы, схемы, соответствия, переходы, вехи, воронки, проверки.
 */
export var readSetFile = (raw: unknown): SetPlan =>
  pipe(
    (_: unknown) => (_isRecord(_) ? _ : _invalidSet('A set is a JSON object')),
    (_) =>
      _.format === SET_FORMAT
        ? _
        : _invalidSet(`Not an analytics set: format is not "${SET_FORMAT}"`),
    (_) =>
      _.version === SET_VERSION
        ? _
        : _invalidSet(
            `Set version ${shownValue(_.version)} is unknown: this Eile reads version ${SET_VERSION}`
          ),
    (set) =>
      ((name, eile, exportedAt, read) => ({
        name: name ?? '',
        eile: eile ?? null,
        exportedAt: exportedAt ?? null,
        steps: read.steps,
        errors: Object.fromEntries([
          ..._wrapperErrors(set, name, eile, exportedAt),
          ...read.errors,
        ]),
      }))(
        _setName(set.name),
        _optional(set.eile, (_) => _VERSION_TEXT.test(_)),
        _optional(
          set.exportedAt,
          (_) =>
            _.length <= 40 && _MOMENT.test(_) && !Number.isNaN(Date.parse(_))
        ),
        _joined(_groupReads(set))
      )
  )(raw);

const _MAX_LISTED = 10;

const _refuseSet = (name: string, errors: SetErrors): never =>
  ((entries) =>
    rethrow(
      Object.assign(
        domainError(
          'analytics.invalid_set',
          `The set "${name}" is not applied, nothing changed. ${entries.length} error(s): ${entries
            .slice(0, _MAX_LISTED)
            .map(({ 0: path, 1: message }) => `${path} — ${message}`)
            .join(
              '; '
            )}${entries.length > _MAX_LISTED ? `; and ${entries.length - _MAX_LISTED} more` : ''}`
        ),
        { errors }
      )
    ))(Object.entries(errors));

/**
 * Набор целиком: ошибка обёртки — отказ `analytics.invalid_set` с путями. Так читают набор тесты, приёмка и
 * старый путь `setup.apply`; проба и загрузка — `readSetFile`, чтобы назвать ошибки все сразу.
 */
export var readSet = (raw: unknown): SetPlan =>
  ((plan) =>
    Object.keys(plan.errors).length > 0
      ? _refuseSet(plan.name, plan.errors)
      : plan)(readSetFile(raw));

/** Имя набора: 1–100 знаков после чистки, как у названия элемента; иначе — `analytics.invalid_set`. */
export var parseSetName = (raw: unknown): string =>
  _setName(raw) ??
  _invalidSet(`The set name is 1 to ${SETUP_LIMITS.name} characters`);

/** Ошибки по элементам из отказа `analytics.invalid_set`; у другого отказа — пусто. */
export var setErrorsOf = (error: unknown): SetErrors =>
  isDomainError(error) && 'errors' in error && _isRecord(error.errors)
    ? (error.errors as SetErrors)
    : {};

// Словарь ошибок — один на применение и пополняется на месте: копия на каждую из ста тысяч строк набора
// стоила бы квадрат, а наружу он уходит только готовым.
type _Putting = {
  readonly setup: Setup;
  readonly errors: Map<string, string>;
};

type _Refusal = (step: SetStep) => string | null;

const _failed = (state: _Putting, path: string, message: string): _Putting => (
  state.errors.set(path, message), state
);

const _caught =
  (state: _Putting, path: string) =>
  (error: unknown): _Putting =>
    isDomainError(error) ? _failed(state, path, error.message) : rethrow(error);

// Повтор ключа в наборе — ошибка каждого повтора: первый элемент применяется, остальные называют его.
const _repeats = (steps: readonly SetStep[]): ReadonlyMap<string, string> =>
  ((keyed) =>
    ((first) =>
      new Map(
        keyed
          .filter((_) => first.get(_.key) !== _.path)
          .map((_): _Entry => [_.path, `the same item as ${first.get(_.key)}`])
      ))(
      // Первый путь ключа: словарь из обратного списка оставляет у ключа самое раннее вхождение.
      new Map(keyed.toReversed().map((_) => [_.key, _.path]))
    ))(
    steps
      .filter((_) => _.ref !== null)
      .map((_) => ({ key: _stepKey(_), path: _.path }))
  );

const _single =
  (holds: SetupHolds, refusal: _Refusal) =>
  (state: _Putting, step: SetStep): _Putting =>
    ((refused) =>
      refused !== null
        ? _failed(state, step.path, refused)
        : attempt(
            (): _Putting => ({
              ...state,
              setup: _put(state.setup, step.group, step.input, holds),
            }),
            _caught(state, step.path)
          ))(refusal(step));

// Значения одного справочника — одним проходом по словарю его значений: перебор всех значений сайта на каждом
// стоил бы минуты на наборе предельного размера.
const _valueBatch =
  (refusal: _Refusal) =>
  (state: _Putting, steps: readonly SetStep[]): _Putting =>
    ((owner) =>
      ((dictionary, mine) =>
        ((existing) =>
          ((filled) => ({
            ...filled,
            setup: {
              ...filled.setup,
              values: [
                ...filled.setup.values.map((_) =>
                  _.dictionary === owner
                    ? (mine.get(_.code) as DictionaryValue)
                    : _
                ),
                ...[...mine.values()].slice(existing),
              ],
            },
          }))(
            steps.reduce<_Putting>(
              (acc, step) =>
                ((refused, ref) =>
                  refused !== null
                    ? _failed(acc, step.path, refused)
                    : attempt(
                        (): _Putting => (
                          mine.set(
                            ref.code,
                            _valueIn(
                              _known(
                                step.input as Input,
                                _SPECS.value.fields,
                                _labelOf(ref)
                              ),
                              mine.get(ref.code) ?? null,
                              dictionary,
                              mine.size,
                              ref
                            )
                          ),
                          acc
                        ),
                        _caught(acc, step.path)
                      ))(refusal(step), step.ref as ItemRef),
              state
            )
          ))(mine.size))(
        state.setup.dictionaries.find((_) => _.code === owner),
        new Map(
          state.setup.values
            .filter((_) => _.dictionary === owner)
            .map((_) => [_.code, _])
        )
      ))(steps[0]!.ref!.owner);

const _sameBatch = (a: SetStep, b: SetStep): boolean =>
  a.group === 'value' &&
  b.group === 'value' &&
  a.ref !== null &&
  b.ref !== null &&
  a.ref.owner === b.ref.owner;

// Подряд идущие значения одного справочника — одна пачка, остальные шаги — по одному; пачки собираются на месте.
const _batches = (steps: readonly SetStep[]): SetStep[][] =>
  steps.reduce<SetStep[][]>(
    (all, step) =>
      ((last) =>
        last !== undefined && _sameBatch(last[0]!, step)
          ? (last.push(step), all)
          : (all.push([step]), all))(all.at(-1)),
    []
  );

const _run =
  (holds: SetupHolds, refusal: _Refusal) =>
  (state: _Putting, batch: readonly SetStep[]): _Putting =>
    batch[0]!.group === 'value' && batch[0]!.ref !== null
      ? _valueBatch(refusal)(state, batch)
      : _single(holds, refusal)(state, batch[0]!);

const _stepKey = (step: SetStep): string =>
  `${step.group}:${(step.ref as ItemRef).key}`;

const _indexOf = (setup: Setup): ReadonlyMap<string, SetupItem> =>
  new Map(
    SETUP_GROUPS.flatMap((group) =>
      _items(setup, group).map((_): [string, SetupItem] => [
        `${group}:${keyOf(group, _)}`,
        _,
      ])
    )
  );

// Архив отказывает и новому элементу: встроенная проверка в архив не уходит.
const _archiveRefused = (state: _Putting, step: SetStep): string | null =>
  attempt(
    () => (
      _SPECS[step.group].archivable?.(
        findItem(state.setup, step.ref as ItemRef) as SetupItem,
        _labelOf(step.ref as ItemRef)
      ),
      null
    ),
    (error) => (isDomainError(error) ? error.message : rethrow(error))
  );

/**
 * Новый элемент из архива файла уходит в архив после всех элементов набора: воронки и проверки успели
 * сослаться на него, как на прежнем сайте. Прежний элемент сайта остаётся, как был: набор архив не меняет.
 */
const _archiveNew = (
  state: _Putting,
  steps: readonly SetStep[],
  was: ReadonlyMap<string, SetupItem>,
  at: string
): _Putting =>
  ((wanted) =>
    ({
      ...state,
      setup: SETUP_GROUPS.reduce<Setup>(
        (setup, group) =>
          ((keys) =>
            keys.size === 0
              ? setup
              : {
                  ...setup,
                  [_LIST[group]]: _items(setup, group).map((_) =>
                    keys.has(keyOf(group, _)) ? { ..._, archivedAt: at } : _
                  ),
                })(
            new Set(
              wanted
                .filter((_) => _.group === group)
                .map((_) => (_.ref as ItemRef).key)
            )
          ),
        state.setup
      ),
    }) satisfies _Putting)(
    steps
      .filter(
        (_) =>
          _.archived &&
          _.ref !== null &&
          !state.errors.has(_.path) &&
          !was.has(_stepKey(_))
      )
      .filter((_) =>
        ((refused) =>
          refused === null || (_failed(state, _.path, refused), false))(
          _archiveRefused(state, _)
        )
      )
  );

const _semver = (text: string): readonly number[] | null =>
  ((found) =>
    found === null
      ? null
      : [Number(found[1]), Number(found[2]), Number(found[3])])(
    /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})/.exec(text)
  );

/** Версия `a` новее `b` по числам X.Y.Z; пометки после них не в счёт, негодная версия — не новее. */
export var newerVersion = (a: string, b: string): boolean =>
  ((x, y) =>
    x !== null &&
    y !== null &&
    ((index) => index >= 0 && x[index]! > y[index]!)(
      x.findIndex((_, index) => _ !== y[index])
    ))(_semver(a), _semver(b));

const _nameOf = (item: SetupItem | null): string =>
  ((item as { readonly name?: unknown } | null)?.name as string | undefined) ??
  '';

const _warning = (
  path: string,
  code: SetWarningCode,
  message: string,
  group: SetupGroup | null = null,
  key: string | null = null
): SetWarning => ({ path, code, message, group, key });

// Предупреждения правки элемента: новый отправитель без ключа, выключенный, другой час сводки, роль типа с
// событиями — люди пересчитаются.
const _CHANGE_WARNINGS: Readonly<
  Partial<
    Record<
      SetupGroup,
      (change: ItemChange, path: string, facts: SetFacts) => SetWarning[]
    >
  >
> = {
  sender: (change, path) =>
    ((before, after) =>
      before === null
        ? [
            _warning(
              path,
              'sender_created',
              `New sender ${change.key} has no key: issue one in Statistics → Setup → Senders and pass it to the developer`,
              'sender',
              change.key
            ),
          ]
        : [
            ...(before.enabled && after !== null && !after.enabled
              ? [
                  _warning(
                    path,
                    'sender_disabled',
                    `Sender ${change.key} is turned off: its events get 401 until it is turned on`,
                    'sender',
                    change.key
                  ),
                ]
              : []),
            ...(after !== null && before.summaryAt !== after.summaryAt
              ? [
                  _warning(
                    path,
                    'summary_hour',
                    `Sender ${change.key}: the summary hour changes from ${before.summaryAt ?? 'none'} to ${after.summaryAt ?? 'none'}, its summary checks are run again`,
                    'sender',
                    change.key
                  ),
                ]
              : []),
          ])(change.before as Sender | null, change.after as Sender | null),
  type: (change, path, facts) =>
    ((before, after) =>
      before !== null &&
      after !== null &&
      before.role !== after.role &&
      facts.events(before.sender, before.code)
        ? [
            _warning(
              path,
              'role_changed',
              `Event type ${change.key} has events: its role changes from ${before.role} to ${after.role}, people are recounted and reports change`,
              'type',
              change.key
            ),
          ]
        : [])(
      change.before as EventType | null,
      change.after as EventType | null
    ),
};

// Архив в файле и на сайте разошёлся: остаётся как на сайте.
const _archiveWarnings = (
  steps: readonly SetStep[],
  errors: ReadonlyMap<string, string>,
  was: ReadonlyMap<string, SetupItem>
): SetWarning[] =>
  steps.flatMap((step) =>
    ((item) =>
      item === undefined ||
      errors.has(step.path) ||
      (item.archivedAt !== null) === step.archived
        ? []
        : [
            _warning(
              step.path,
              'archive_kept',
              `${_WHAT[step.group]} ${(step.ref as ItemRef).key} is ${step.archived ? 'archived in the file but active on the site' : 'active in the file but archived on the site'}: the site keeps it as it is`,
              step.group,
              (step.ref as ItemRef).key
            ),
          ])(step.ref === null ? undefined : was.get(_stepKey(step)))
  );

const _fieldsChanged = (change: ItemChange): string[] =>
  ((before, after) =>
    Object.keys(after).filter(
      (_) => !_READ_ONLY.includes(_) && !_same(before[_], after[_])
    ))(change.before as unknown as Input, change.after as unknown as Input);

const _revised = (
  before: Setup,
  after: Setup,
  changes: readonly ItemChange[]
): Changed<Setup, AnalyticsEvent> =>
  changes.length === 0
    ? changed<Setup, AnalyticsEvent>(before)
    : ((revision) =>
        changed<Setup, AnalyticsEvent>(
          { ...after, revision },
          { type: 'analytics.setup_changed', revision }
        ))(before.revision + 1);

const _drafted = (
  plan: SetPlan,
  facts: SetFacts,
  before: Setup,
  was: ReadonlyMap<string, SetupItem>,
  done: _Putting,
  changes: readonly ItemChange[]
): SetDraft =>
  ((listed, touched, paths) => ({
    name: plan.name,
    result: _revised(before, done.setup, changes),
    changes,
    created: changes
      .filter((_) => _.before === null && _.after !== null)
      .map((_) => ({
        group: _.group,
        key: _.key,
        name: _nameOf(_.after),
        archived: _.after?.archivedAt !== null,
      })),
    changed: changes
      .filter((_) => _.before !== null && _.after !== null)
      .map((_) => ({
        group: _.group,
        key: _.key,
        name: _nameOf(_.after),
        fields: _fieldsChanged(_),
      })),
    unchanged: [...paths.keys()].filter((_) => was.has(_) && !touched.has(_))
      .length,
    kept: Object.fromEntries(
      SETUP_GROUPS.map(
        (group) =>
          [
            group,
            _items(before, group).filter((_) =>
              ((key) => !listed.has(key) && !touched.has(key))(
                `${group}:${keyOf(group, _)}`
              )
            ).length,
          ] as const
      ).filter(({ 1: count }) => count > 0)
    ),
    warnings: [
      ...changes.flatMap(
        (_) =>
          _CHANGE_WARNINGS[_.group]?.(
            _,
            paths.get(`${_.group}:${_.key}`) ?? '',
            facts
          ) ?? []
      ),
      ..._archiveWarnings(plan.steps, done.errors, was),
      ...(plan.eile !== null && newerVersion(plan.eile, facts.version)
        ? [
            _warning(
              'eile',
              'newer_file',
              `The set was exported by Eile ${plan.eile}, this is Eile ${facts.version}: nothing in it is unknown here`
            ),
          ]
        : []),
    ],
    errors: Object.fromEntries(
      [...done.errors].map(({ 0: path, 1: message }) => [
        path,
        cleanText(message, 300),
      ])
    ),
  }))(
    new Set(plan.steps.filter((_) => _.ref !== null).map(_stepKey)),
    new Set(changes.map((_) => `${_.group}:${_.key}`)),
    new Map(
      plan.steps
        .filter((_) => _.ref !== null && !done.errors.has(_.path))
        .map((_) => [_stepKey(_), _.path] as const)
    )
  );

/**
 * Проба набора: элементы создаются или меняются по ключу, поля, которых в файле нет, остаются; элементы сайта
 * не из файла и архив прежних не трогаются; новые из архива файла — в архив. Ошибки собираются по всем
 * элементам сразу; применить можно только набор без ошибок — целиком, одной ревизией.
 */
export var draftSet =
  (plan: SetPlan, facts: SetFacts) =>
  (setup: Setup): SetDraft =>
    ((was, repeats) =>
      ((put) =>
        ((done) =>
          _drafted(
            plan,
            facts,
            setup,
            was,
            done,
            changesOf(setup, done.setup)
          ))(_archiveNew(put, plan.steps, was, facts.at)))(
        _batches(plan.steps).reduce<_Putting>(
          _run(facts.holds, (_) => repeats.get(_.path) ?? _.refused),
          { setup, errors: new Map(Object.entries(plan.errors)) }
        )
      ))(_indexOf(setup), _repeats(plan.steps));

// Момент архива новых элементов, когда его не назвали: набор тестов без архива.
const _SET_EPOCH = '1970-01-01T00:00:00.000Z';

/**
 * Набор целиком или никак: элементы создаются или меняются по ключу, остальные и архив прежних не трогаются,
 * всё — одной ревизией. Ошибки — отказ `analytics.invalid_set` со всеми путями.
 */
export var applySet =
  (plan: SetPlan, holds: SetupHolds = NO_HOLDS, at = _SET_EPOCH) =>
  (setup: Setup): Changed<Setup, AnalyticsEvent> =>
    ((draft) =>
      Object.keys(draft.errors).length > 0
        ? _refuseSet(plan.name, draft.errors)
        : draft.result)(
      draftSet(plan, { holds, events: () => false, version: '', at })(setup)
    );

// Поля выгрузки — поля элемента в порядке его группы; у поправки встроенной проверки нет названия, у «мало
// данных» — и «включена» с «уведомлять»: загрузка отклонила бы их.
const _exportFields = (group: SetupGroup, item: SetupItem): readonly string[] =>
  ((spec) =>
    group === 'value'
      ? _SPECS.value.fields.filter((_) => _ !== 'dictionary')
      : spec === null
        ? _SPECS[group].fields
        : _SPECS.check.fields.filter(
            (_) =>
              _ !== 'name' &&
              (spec.clock !== null || (_ !== 'enabled' && _ !== 'notify'))
          ))(
    group === 'check' ? builtinCheck((item as QualityCheck).code) : null
  );

const _exported = (
  group: SetupGroup,
  item: SetupItem,
  inner: Input = {}
): Input =>
  ((record) => ({
    ...Object.fromEntries(
      _exportFields(group, item).map((_) => [_, record[_]])
    ),
    ...inner,
    ...(item.archivedAt === null ? {} : { archived: true }),
  }))(item as unknown as Input);

const _sorted = (
  items: readonly SetupItem[],
  group: SetupGroup
): readonly SetupItem[] =>
  items
    .map((_) => ({ key: keyOf(group, _), item: _ }))
    .toSorted((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((_) => _.item);

const _exportedGroup = (setup: Setup, group: SetupGroup): Input[] =>
  _sorted(_items(setup, group), group).map((_) => _exported(group, _));

/**
 * Выгрузка: вся настройка без ключей. Группы — в порядке применения, элементы — по ключу, поля — все и в
 * постоянном порядке: две выгрузки одной настройки совпадают, кроме имени и момента. `archived` — только у
 * элемента в архиве.
 */
export var exportSet = (
  setup: Setup,
  meta: {
    readonly name: string;
    readonly eile: string;
    readonly exportedAt: string;
  }
): AnalyticsSet =>
  ((values) =>
    ({
      format: SET_FORMAT,
      version: SET_VERSION,
      name: meta.name,
      eile: meta.eile,
      exportedAt: meta.exportedAt,
      senders: _exportedGroup(setup, 'sender'),
      dictionaries: _sorted(setup.dictionaries, 'dictionary').map((_) =>
        _exported('dictionary', _, {
          values: _sorted(
            values.get((_ as Dictionary).code) ?? [],
            'value'
          ).map((value) => _exported('value', value)),
        })
      ),
      ...Object.fromEntries(
        _LATER.map(({ 0: field, 1: group }) => [
          field,
          _exportedGroup(setup, group),
        ])
      ),
    }) as unknown as AnalyticsSet)(
    Map.groupBy(setup.values, (_) => _.dictionary)
  );

const _actionOf = (change: ItemChange): SetupAction =>
  change.before === null
    ? 'created'
    : change.after === null
      ? 'removed'
      : change.before.archivedAt === null && change.after.archivedAt !== null
        ? 'archived'
        : change.before.archivedAt !== null && change.after.archivedAt === null
          ? 'restored'
          : 'changed';

/** Строки журнала правки элементов: по строке на элемент. */
export var itemLog = (
  changes: readonly ItemChange[],
  author: SetupAuthor | null,
  at: string
): SetupLogDraft[] =>
  changes.map((_) => ({
    at,
    author,
    item: _.group,
    key: _.key,
    action: _actionOf(_),
    before: _.before,
    after: _.after,
  }));

// По группам одним проходом: копия словаря на каждый из ста тысяч элементов набора стоила бы квадрат.
const _byGroup = (
  changes: readonly ItemChange[],
  side: 'before' | 'after'
): Readonly<Record<string, Readonly<Record<string, SetupItem>>>> =>
  Object.fromEntries(
    [
      ...Map.groupBy(
        changes.filter((_) => _[side] !== null),
        (_) => _.group
      ),
    ].map(({ 0: group, 1: inGroup }) => [
      group,
      Object.fromEntries(inGroup.map((_) => [_.key, _[side] as SetupItem])),
    ])
  );

/** Строка журнала набора: одна на применение; было и стало — элементы, которые он изменил, по группам. */
export var setLog = (
  name: string,
  changes: readonly ItemChange[],
  author: SetupAuthor | null,
  at: string
): SetupLogDraft[] =>
  changes.length === 0
    ? []
    : [
        {
          at,
          author,
          item: 'set',
          key: name,
          action: 'applied',
          before: _byGroup(changes, 'before'),
          after: _byGroup(changes, 'after'),
        },
      ];

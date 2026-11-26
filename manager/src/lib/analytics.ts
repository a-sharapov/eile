import type { MessageKey } from './i18n.ts';
import type {
  DictionaryPurpose,
  EventRole,
  FunnelStep,
  LabelSchema,
  PersonState,
  PropertyKind,
  ReconcileMark,
  ReferrerRule,
  SetupGroup,
  SetupView,
  UtmParameter,
} from './types.ts';

// Аналитика клиентского пути на экранах менеджера (ADR 0072): подписи ролей, состояний и видов, пределы
// настройки для проверки до отправки. Пределы — те же, что у сервера (`analytics/domain/setup.ts`, `codes.ts`).

/** Код элемента: строчная латиница, цифры, `_` и `-`. */
export var CODE_PATTERN = '[a-z0-9_\\-]+';

const _CODE = /^[a-z0-9_-]+$/;

export var CODE_LIMITS: Readonly<Record<SetupGroup, number>> = {
  sender: 20,
  type: 40,
  property: 40,
  dictionary: 40,
  value: 60,
  schema: 20,
  referrer: 40,
  link: 40,
  milestone: 40,
  funnel: 40,
};

export var ITEM_LIMITS = {
  name: 100,
  note: 500,
  position: 1_000_000,
  propertiesPerType: 20,
  keysPerSender: 3,
  keyLabel: 100,
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

/** Пределы метки — как `LABEL_LIMITS` сервера (`analytics/domain/labels.ts`). */
export var LABEL_LIMITS = {
  parts: 8,
  part: 60,
  partDefault: 20,
  label: 256,
  labelDefault: 64,
  host: 100,
  target: 500,
} as const;

export var LABEL_SEPARATORS: readonly LabelSchema['separator'][] = [
  '__',
  '--',
  '.',
  '~',
];

export var UTM_PARAMETERS: readonly UtmParameter[] = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
];

export var REFERRER_KINDS: readonly ReferrerRule['kind'][] = [
  'host',
  'any',
  'none',
];

/** Место метки в адресе назначения перехода. */
export var LABEL_TOKEN = '{label}';

/** Значение части у соответствия «любой другой сайт»: хост реферера. */
export var HOST_TOKEN = '{host}';

/** Адрес перехода на сайте: `/_cms/go/<код>`. */
export var GO_PREFIX = '/_cms/go/';

/** Цели сайта в шагах воронки: `go:` — любой переход, `go:<код>` — переход, `form:<имя>` — форма. */
export var GO_GOAL = 'go:';
export var FORM_GOAL = 'form:';

/** Сторона шага воронки — как `STEP_SIDES` сервера: посещения идут до людей. */
export var STEP_SIDES: Readonly<
  Record<FunnelStep['kind'], 'visits' | 'people'>
> = {
  visits: 'visits',
  goal: 'visits',
  arrival: 'people',
  trial: 'people',
  payment: 'people',
  milestone: 'people',
  type: 'people',
};

// Значение части строже кода: без `_` и `-` по краям и подряд — в нём не бывает разделителей `__` и `--`.
const _PART_VALUE = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const _HOST_PATTERN = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*(?:\.\*)?$/;
const _PAGE = /^\/[^\s?#]*$/;
const _FORM_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Значение части метки: вид строже кода и не длиннее предела части — как `isPartValue` сервера. */
export var isPartValue = (raw: string, limit: number): boolean =>
  raw.length <= limit && _PART_VALUE.test(raw);

/** Шаблон хоста соответствия, как его сохранит сервер: строчными, без `www.`; null — не шаблон. */
export var hostPattern = (raw: string): string | null =>
  ((text) =>
    text.length <= LABEL_LIMITS.host && _HOST_PATTERN.test(text) ? text : null)(
    raw
      .trim()
      .toLowerCase()
      .replace(/^www\./, '')
  );

/** Путь страницы сайта в шаге воронки: `/…` без пробелов, `?` и `#`. */
export var isSitePage = (raw: string): boolean =>
  raw.length <= ITEM_LIMITS.page && _PAGE.test(raw);

/** Имя формы в цели шага — как его проверяет контекст форм. */
export var isFormName = (raw: string): boolean => _FORM_NAME.test(raw);

/** Чем не годится адрес назначения перехода; null — годится. */
export type TargetProblem =
  | 'https'
  | 'space'
  | 'long'
  | 'token'
  | 'place'
  | 'invalid';

const _HIDDEN = /[\s\p{C}]/u;
const _AUTHORITY = /^https:\/\/[^/?#\\]+[/?#]/;

const _httpsHost = (text: string): string | null =>
  ((url) => (url !== null && url.protocol === 'https:' ? url.host : null))(
    URL.parse(text)
  );

/**
 * Адрес назначения перехода — правила `parseTarget` сервера: `https://` до 500 знаков, без пробелов и невидимых
 * знаков, ровно один `{label}` — после хоста; после подстановки любой метки хост тот же.
 */
export var targetProblem = (raw: string): TargetProblem | null =>
  ((text) =>
    !text.startsWith('https://')
      ? 'https'
      : _HIDDEN.test(text)
        ? 'space'
        : text.length > LABEL_LIMITS.target
          ? 'long'
          : text.split(LABEL_TOKEN).length !== 2
            ? 'token'
            : !_AUTHORITY.test(text.slice(0, text.indexOf(LABEL_TOKEN)))
              ? 'place'
              : ((host) =>
                  host !== null &&
                  host !== '' &&
                  host ===
                    _httpsHost(text.replace(LABEL_TOKEN, () => 'b.c-d_e~f'))
                    ? null
                    : 'invalid')(
                  _httpsHost(text.replace(LABEL_TOKEN, () => 'a'))
                ))(raw.trim());

/** Сколько знаков займут части схемы с разделителями — сумма пределов частей, как считает сервер. */
export var schemaLength = (
  setup: SetupView,
  separator: string,
  parts: readonly string[],
  edited: { readonly code: string; readonly length: number } | null = null
): number =>
  parts.reduce(
    (total, part) =>
      total +
      (part === edited?.code
        ? edited.length
        : (setup.dictionaries.find((_) => _.code === part)?.length ?? 0)),
    separator.length * Math.max(parts.length - 1, 0)
  );

/** Файл событий из менеджера — до 16 МиБ; больше — `cms events import`. */
export var IMPORT_LIMIT = 16 * 1024 * 1024;

export var isCode = (raw: string, group: SetupGroup): boolean =>
  raw.length <= CODE_LIMITS[group] && _CODE.test(raw);

/** Знаков в строке: эмодзи и буквы с диакритикой — по одному, как считает сервер. */
export var length = (text: string): number => [...text.trim()].length;

export var ROLES: readonly EventRole[] = [
  'touch',
  'survey',
  'trial',
  'payment',
  'refund',
  'amendment',
  'lapse',
  'action',
  'summary',
  'erasure',
];

export var ROLE_LABELS: Readonly<Record<EventRole, MessageKey>> = {
  touch: 'analytics.roleTouch',
  survey: 'analytics.roleSurvey',
  trial: 'analytics.roleTrial',
  payment: 'analytics.rolePayment',
  refund: 'analytics.roleRefund',
  amendment: 'analytics.roleAmendment',
  lapse: 'analytics.roleLapse',
  action: 'analytics.roleAction',
  summary: 'analytics.roleSummary',
  erasure: 'analytics.roleErasure',
};

export var STATES: readonly PersonState[] = [
  'new',
  'trial',
  'customer',
  'returned',
  'lapsed',
];

export var STATE_LABELS: Readonly<Record<PersonState, MessageKey>> = {
  new: 'analytics.stateNew',
  trial: 'analytics.stateTrial',
  customer: 'analytics.stateCustomer',
  returned: 'analytics.stateReturned',
  lapsed: 'analytics.stateLapsed',
};

// Состояние возможно, только если у сайта есть роль, из которой оно выводится: пробный период — из роли
// «пробный период», клиент — из оплаты; ушёл и вернулся — из оплаты (её `paid_until`) и «конца доступа».
const _STATE_ROLES: Readonly<Record<PersonState, readonly EventRole[]>> = {
  new: [],
  trial: ['trial'],
  customer: ['payment'],
  returned: ['payment'],
  lapsed: ['payment'],
};

/** Состояния, которые у сайта бывают: типы в архиве тоже дают роль своим событиям. */
export var statesOf = (setup: SetupView): PersonState[] =>
  ((roles) =>
    STATES.filter((_) => _STATE_ROLES[_].every((role) => roles.has(role))))(
    new Set(setup.types.map((_) => _.role))
  );

export var KINDS: readonly PropertyKind[] = [
  'string',
  'number',
  'money',
  'date',
  'boolean',
  'choice',
];

export var KIND_LABELS: Readonly<Record<PropertyKind, MessageKey>> = {
  string: 'analytics.kindString',
  number: 'analytics.kindNumber',
  money: 'analytics.kindMoney',
  date: 'analytics.kindDate',
  boolean: 'analytics.kindBoolean',
  choice: 'analytics.kindChoice',
};

/** «Разрез» — только у выбора, числа и «да или нет»; «чужой текст» — только у строки. */
export var DIMENSION_KINDS: readonly PropertyKind[] = [
  'choice',
  'boolean',
  'number',
];

export var PURPOSE_LABELS: Readonly<Record<DictionaryPurpose, MessageKey>> = {
  values: 'analytics.purposeValues',
  answers: 'analytics.purposeAnswers',
  parts: 'analytics.purposeParts',
};

/** Группа набора и журнала: группы настройки и проверки данных (`check`, этап 4). */
export type SetGroup = SetupGroup | 'check';

/** Группы набора по порядку применения — как `SETUP_GROUPS` сервера. */
export var SET_GROUPS: readonly SetGroup[] = [
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

export var GROUP_LABELS: Readonly<Record<SetGroup, MessageKey>> = {
  sender: 'analytics.groupSender',
  type: 'analytics.groupType',
  property: 'analytics.groupProperty',
  dictionary: 'analytics.groupDictionary',
  value: 'analytics.groupValue',
  schema: 'analytics.groupSchema',
  referrer: 'analytics.groupReferrer',
  link: 'analytics.groupLink',
  milestone: 'analytics.groupMilestone',
  funnel: 'analytics.groupFunnel',
  check: 'analytics.groupCheck',
};

/** Код проверки данных — как `CHECK_CODE_LIMIT` сервера: того же вида, что коды настройки. */
export var CHECK_CODE_LIMIT = 40;

export var isCheckCode = (raw: string): boolean =>
  raw.length <= CHECK_CODE_LIMIT && _CODE.test(raw);

/** Час сводки по умолчанию — как `DEFAULT_SUMMARY_AT` сервера. */
export var DEFAULT_SUMMARY_AT = '06:00';

const _SUMMARY_AT = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/** Час сводки `ЧЧ:ММ` по UTC с ведущим нулём, 00:00–23:59 — как у сервера. */
export var isSummaryAt = (raw: string): boolean => _SUMMARY_AT.test(raw);

/** Отметки сверки свойства и вид свойства под каждую — как `RECONCILE_KINDS` сервера. */
export var RECONCILE_KINDS: Readonly<Record<ReconcileMark, PropertyKind>> = {
  payment_number: 'number',
  customer_since: 'date',
  after_trial: 'boolean',
  returning: 'boolean',
};

export var RECONCILE_MARKS = Object.keys(RECONCILE_KINDS) as ReconcileMark[];

export var RECONCILE_LABELS: Readonly<Record<ReconcileMark, MessageKey>> = {
  payment_number: 'reconcile.paymentNumber',
  customer_since: 'reconcile.customerSince',
  after_trial: 'reconcile.afterTrial',
  returning: 'reconcile.returning',
};

/** Отметки сверки, которые годятся свойству этого вида; у других видов отметки нет. */
export var reconcileFor = (kind: PropertyKind | ''): ReconcileMark[] =>
  RECONCILE_MARKS.filter((_) => RECONCILE_KINDS[_] === kind);

export var REFERRER_KIND_LABELS: Readonly<
  Record<ReferrerRule['kind'], MessageKey>
> = {
  host: 'analytics.referrerHost',
  any: 'analytics.referrerAny',
  none: 'analytics.referrerNone',
};

/**
 * Проверка ключа одной командой: тестовое событие с нейтральным типом — в людей и отчёты оно не идёт, а в
 * журнале событий его видно с отметкой «тест».
 */
export var curlExample = (url: string, key: string, at: Date): string =>
  [
    `curl -X POST ${url} \\`,
    `  -H "Authorization: Bearer ${key}" \\`,
    `  -H "Content-Type: application/json" \\`,
    // Тело — по строке на поле: строка в одинарных кавычках может переноситься, команда остаётся одной.
    `  -d '${JSON.stringify(
      {
        id: `check_${at.getTime().toString(36)}`,
        type: 'hello',
        at: `${at.toISOString().slice(0, 19)}Z`,
        subject: 'u_check_01',
        test: true,
      },
      null,
      2
    ).replaceAll('\n', '\n  ')}'`,
  ].join('\n');

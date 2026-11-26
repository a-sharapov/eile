import {
  CODE_LIMITS,
  DEFAULT_SUMMARY_AT,
  DIMENSION_KINDS,
  FORM_GOAL,
  GO_GOAL,
  HOST_TOKEN,
  hostPattern,
  ITEM_LIMITS,
  isCode,
  isFormName,
  isPartValue,
  isSitePage,
  isSummaryAt,
  LABEL_LIMITS,
  length,
  RECONCILE_KINDS,
  reconcileFor,
  STEP_SIDES,
  schemaLength,
  type TargetProblem,
  targetProblem,
} from '#lib/analytics.ts';
import { type MessageKey, quoted, t } from '#lib/i18n.ts';
import type {
  DictionaryPurpose,
  EventRole,
  FunnelStep,
  LabelSchema,
  MilestoneCondition,
  Parts,
  PropertyKind,
  ReconcileMark,
  ReferrerRule,
  SetupGroup,
  SetupView,
  UtmParameter,
} from '#lib/types.ts';
import { partOf, propertyOf } from '../names.ts';
import { purposeUsersOf, type SetupRow } from './setup.ts';

// Черновик формы элемента настройки — один на все группы: поля группы, проверка до отправки по правилам
// сервера, тело запроса, поле отказа сервера и то, что изменит сохранение. Числа в черновике — строками полей.

/** Числовое поле формы: строка у нового черновика, число или null — после ввода в input[type=number]. */
export type NumberText = string | number | null;

/** Часть и её значение в паре «часть — значение»: соответствие реферера и заданные части перехода. */
export type PartPair = { key: number; part: string; value: string };

/** Вид шага в форме: страница входа, переход и форма — свои виды, на сервере это `visits` и `goal`. */
export type StepKind =
  | 'visits'
  | 'page'
  | 'link'
  | 'form'
  | 'arrival'
  | 'trial'
  | 'payment'
  | 'milestone'
  | 'type';

export type StepDraft = {
  key: number;
  kind: StepKind | '';
  page: string;
  /** Код перехода; пусто — любой переход. */
  link: string;
  form: string;
  number: NumberText;
  milestone: string;
  /** `отправитель/тип`. */
  type: string;
};

export type Draft = {
  owner: string;
  code: string;
  name: string;
  note: string;
  enabled: boolean;
  role: EventRole | '';
  properties: { code: string; required: boolean }[];
  kind: PropertyKind | '';
  dictionary: string;
  dimension: boolean;
  untrusted: boolean;
  purpose: DictionaryPurpose;
  position: NumberText;
  /** Часть метки: параметр UTM; пусто — нет. */
  utm: UtmParameter | '';
  /** Предел длины: значения части или метки схемы. */
  length: NumberText;
  separator: LabelSchema['separator'];
  /** Части схемы по порядку. */
  parts: string[];
  rule: ReferrerRule['kind'] | '';
  host: string;
  pairs: PartPair[];
  sender: string;
  target: string;
  type: string;
  count: NumberText;
  condition: 'none' | 'gte' | 'eq';
  property: string;
  /** Число у `gte`, значение у `eq`: код, `true`/`false` или число. */
  value: NumberText;
  days: NumberText;
  /** Веха без срока. */
  forever: boolean;
  anchor: string;
  column: boolean;
  strict: boolean;
  main: boolean;
  steps: StepDraft[];
  /** Значение части метки: «ждёт расхода». */
  awaitsSpend: boolean;
  /** Час сводки отправителя `ЧЧ:ММ` UTC. */
  summaryAt: string;
  /** Отправитель не шлёт сводок: `summaryAt: null`. */
  noSummary: boolean;
  /** Отметка сверки свойства событий; пусто — не сверять. */
  reconcile: ReconcileMark | '';
};

let _keys = 0;
/** Ключ строки списка в форме: строки переставляют, а фокус остаётся на своей кнопке. */
export var nextKey = (): number => ++_keys;

export var EMPTY_STEP: Omit<StepDraft, 'key'> = {
  kind: '',
  page: '',
  link: '',
  form: '',
  number: '1',
  milestone: '',
  type: '',
};

const _EMPTY: Draft = {
  owner: '',
  code: '',
  name: '',
  note: '',
  enabled: true,
  role: '',
  properties: [],
  kind: '',
  dictionary: '',
  dimension: false,
  untrusted: false,
  purpose: 'values',
  position: '',
  utm: '',
  length: '',
  separator: '__',
  parts: [],
  rule: '',
  host: '',
  pairs: [],
  sender: '',
  target: '',
  type: '',
  count: '1',
  condition: 'none',
  property: '',
  value: '',
  days: '',
  forever: true,
  anchor: '',
  column: true,
  strict: false,
  main: false,
  steps: [],
  awaitsSpend: false,
  summaryAt: DEFAULT_SUMMARY_AT,
  noSummary: false,
  reconcile: '',
};

/** Владелец ключа элемента: отправитель у типа и схемы, область у свойства, справочник у значения. */
export var OWNER_FIELDS: Readonly<Partial<Record<SetupGroup, string>>> = {
  type: 'sender',
  property: 'scope',
  value: 'dictionary',
  schema: 'sender',
};

/** Вид шага в форме по шагу воронки. */
export var stepKindOf = (step: FunnelStep): StepKind =>
  step.kind === 'visits'
    ? step.page === null
      ? 'visits'
      : 'page'
    : step.kind === 'goal'
      ? step.goal.startsWith(FORM_GOAL)
        ? 'form'
        : 'link'
      : step.kind;

/** Сторона вида шага — сторона его шага на сервере: страница входа — посещения, переход и форма — цели. */
export var STEP_KIND_SIDES: Readonly<Record<StepKind, 'visits' | 'people'>> = {
  visits: STEP_SIDES.visits,
  page: STEP_SIDES.visits,
  link: STEP_SIDES.goal,
  form: STEP_SIDES.goal,
  arrival: STEP_SIDES.arrival,
  trial: STEP_SIDES.trial,
  payment: STEP_SIDES.payment,
  milestone: STEP_SIDES.milestone,
  type: STEP_SIDES.type,
};

export var sideOf = (step: StepDraft): 'visits' | 'people' | null =>
  step.kind === '' ? null : STEP_KIND_SIDES[step.kind];

export var stepDraft = (step: FunnelStep): StepDraft => ({
  ...EMPTY_STEP,
  key: nextKey(),
  kind: stepKindOf(step),
  page: step.kind === 'visits' ? (step.page ?? '') : '',
  link:
    step.kind === 'goal' && step.goal.startsWith(GO_GOAL)
      ? step.goal.slice(GO_GOAL.length)
      : '',
  form:
    step.kind === 'goal' && step.goal.startsWith(FORM_GOAL)
      ? step.goal.slice(FORM_GOAL.length)
      : '',
  number: step.kind === 'payment' ? String(step.number) : '1',
  milestone: step.kind === 'milestone' ? step.milestone : '',
  type: step.kind === 'type' ? `${step.sender}/${step.type}` : '',
});

const _pairs = (raw: unknown): PartPair[] =>
  raw !== null && typeof raw === 'object'
    ? Object.entries(raw as Parts).map(({ 0: part, 1: value }) => ({
        key: nextKey(),
        part,
        value,
      }))
    : [];

const _text = (raw: unknown, fallback = ''): string =>
  raw === undefined || raw === null ? fallback : String(raw);

const _condition = (
  raw: unknown
): Pick<Draft, 'condition' | 'property' | 'value'> =>
  raw !== null && typeof raw === 'object'
    ? ((condition) => ({
        condition: 'gte' in condition ? 'gte' : 'eq',
        property: condition.property,
        value: String('gte' in condition ? condition.gte : condition.eq),
      }))(raw as MilestoneCondition)
    : { condition: 'none', property: '', value: '' };

// Поля из прежнего элемента (и подставленных из «Незнакомых»): по группе, у новых — значения по умолчанию.
const _GROUP_DRAFTS: Readonly<
  Record<
    SetupGroup,
    (source: Readonly<Record<string, unknown>>) => Partial<Draft>
  >
> = {
  sender: (_) => ({
    enabled: _.enabled !== false,
    summaryAt:
      typeof _.summaryAt === 'string' ? _.summaryAt : DEFAULT_SUMMARY_AT,
    noSummary: _.summaryAt === null,
  }),
  type: (_) => ({
    role: _text(_.role) as EventRole | '',
    properties: Array.isArray(_.properties)
      ? (_.properties as Draft['properties']).map((p) => ({ ...p }))
      : [],
  }),
  property: (_) => ({
    kind: _text(_.kind) as PropertyKind | '',
    dictionary: _text(_.dictionary),
    dimension: _.dimension === true,
    untrusted: _.untrusted === true,
    reconcile: _text(_.reconcile) as ReconcileMark | '',
  }),
  dictionary: (_) => ({
    purpose: (_text(_.purpose) || 'values') as DictionaryPurpose,
    utm: _text(_.utm) as UtmParameter | '',
    length: _text(_.length, String(LABEL_LIMITS.partDefault)),
  }),
  value: (_) => ({
    position: _text(_.position),
    awaitsSpend: _.awaitsSpend === true,
  }),
  schema: (_) => ({
    separator: (_text(_.separator) || '__') as LabelSchema['separator'],
    length: _text(_.length, String(LABEL_LIMITS.labelDefault)),
    parts: Array.isArray(_.parts) ? [...(_.parts as string[])] : [],
  }),
  referrer: (_) => ({
    rule: (_text(_.kind) || 'host') as ReferrerRule['kind'],
    host: _text(_.host),
    pairs: _pairs(_.parts),
  }),
  link: (_) => ({
    sender: _text(_.sender),
    target: _text(_.target),
    pairs: _pairs(_.parts),
  }),
  milestone: (_) => ({
    sender: _text(_.sender),
    type: _text(_.type),
    count: _text(_.count, '1'),
    ..._condition(_.condition),
    days: _text(_.days),
    forever: _.days === undefined || _.days === null,
    anchor: _text(_.anchor),
    column: _.column !== false,
  }),
  funnel: (_) => ({
    strict: _.strict === true,
    main: _.main === true,
    steps: Array.isArray(_.steps)
      ? (_.steps as FunnelStep[]).map(stepDraft)
      : [
          { ...EMPTY_STEP, key: nextKey(), kind: 'visits' },
          { ...EMPTY_STEP, key: nextKey(), kind: 'arrival' },
        ],
  }),
};

/** Черновик из элемента списка или подставленных полей; нового — со значениями по умолчанию. */
export var draftOf = (
  group: SetupGroup,
  source: Readonly<Record<string, unknown>>
): Draft => ({
  ..._EMPTY,
  owner: _text(source[OWNER_FIELDS[group] ?? '']),
  code: _text(source.code),
  name: _text(source.name),
  note: _text(source.note),
  ..._GROUP_DRAFTS[group](source),
});

/** Что проверка знает о правке: настройка и прежний элемент (null — новый). */
export type DraftContext = {
  readonly setup: SetupView;
  readonly existing: SetupRow | null;
};

// Числовое поле: `bind:value` у input[type=number] даёт число или null, у нового черновика — строку.
const _str = (raw: unknown): string =>
  raw === null || raw === undefined ? '' : String(raw).trim();

const _whole = (raw: unknown, min: number, max: number): boolean =>
  ((text) => /^\d+$/.test(text) && Number(text) >= min && Number(text) <= max)(
    _str(raw)
  );

const _taken = (group: SetupGroup, next: Draft, setup: SetupView): boolean =>
  (
    ({
      sender: () => setup.senders.some((_) => _.code === next.code),
      type: () =>
        setup.types.some(
          (_) => _.sender === next.owner && _.code === next.code
        ),
      property: () =>
        setup.properties.some(
          (_) => _.scope === next.owner && _.code === next.code
        ),
      dictionary: () => setup.dictionaries.some((_) => _.code === next.code),
      value: () =>
        setup.dictionaries.some(
          (d) =>
            d.code === next.owner && d.values.some((_) => _.code === next.code)
        ),
      schema: () => setup.schemas.some((_) => _.sender === next.owner),
      referrer: () => setup.referrers.some((_) => _.code === next.code),
      link: () => setup.links.some((_) => _.code === next.code),
      milestone: () => setup.milestones.some((_) => _.code === next.code),
      funnel: () => setup.funnels.some((_) => _.code === next.code),
    }) satisfies Record<SetupGroup, () => boolean>
  )[group]();

/** Предел значения новой части: справочник значения — часть метки. */
export var partLimitOf = (
  setup: SetupView,
  dictionary: string
): number | null => partOf(setup, dictionary)?.length ?? null;

type Problem = readonly [field: string, problem: string | false | null];

const _codeProblem = (
  group: SetupGroup,
  next: Draft,
  { setup, existing }: DraftContext
): string | null =>
  existing !== null || group === 'schema'
    ? null
    : ((limit) =>
        limit !== null && !isPartValue(next.code, limit)
          ? t('setupForm.partValueHint', { n: limit })
          : !isCode(next.code, group)
            ? t('setupForm.codeHint', { n: CODE_LIMITS[group] })
            : _taken(group, next, setup)
              ? t('setupForm.codeTaken')
              : null)(
        group === 'value' ? partLimitOf(setup, next.owner) : null
      );

// Часть метки: параметр UTM — у одной части, прежние значения и схемы помещаются в предел.
const _partProblems = (
  next: Draft,
  { setup, existing }: DraftContext
): Problem[] =>
  ((values, limit) => [
    [
      'utm',
      next.utm !== '' &&
        ((other) =>
          other !== undefined &&
          t('dictionaries.utmTaken', {
            utm: next.utm,
            name: quoted(other.name),
          }))(
          setup.dictionaries.find(
            (_) =>
              _.code !== next.code &&
              _.purpose === 'parts' &&
              _.utm === next.utm
          )
        ),
    ],
    [
      'length',
      !_whole(next.length, 1, LABEL_LIMITS.part)
        ? t('dictionaries.lengthHint', { n: LABEL_LIMITS.part })
        : ((long) =>
            long !== undefined
              ? t('dictionaries.valueTooLong', {
                  value: long.code,
                  n: limit,
                })
              : ((schema) =>
                  schema !== undefined &&
                  t('dictionaries.schemaOverflow', {
                    name: quoted(schema.name),
                    total: schemaLength(setup, schema.separator, schema.parts, {
                      code: next.code,
                      length: limit,
                    }),
                    n: schema.length,
                  }))(
                  setup.schemas.find(
                    (_) =>
                      _.parts.includes(next.code) &&
                      schemaLength(setup, _.separator, _.parts, {
                        code: next.code,
                        length: limit,
                      }) > _.length
                  )
                ))(values.find((_) => _.code.length > limit)),
    ],
    [
      'purpose',
      ((bad) =>
        bad !== undefined &&
        t('dictionaries.valueNotPart', { value: bad.code }))(
        values.find((_) => !isPartValue(_.code, LABEL_LIMITS.part))
      ),
    ],
  ])(
    existing === null
      ? []
      : (setup.dictionaries.find((_) => _.code === existing.code)?.values ??
          []),
    Number(next.length)
  );

const _dictionaryProblems = (next: Draft, context: DraftContext): Problem[] => [
  [
    'purpose',
    context.existing !== null &&
      context.existing.purpose !== next.purpose &&
      ((users) =>
        users.length > 0 &&
        t('dictionaries.purposeLocked', { users: users.join(', ') }))(
        purposeUsersOf(context.setup, context.existing.code)
      ),
  ],
  ...(next.purpose === 'parts' ? _partProblems(next, context) : []),
];

const _schemaProblems = (next: Draft, { setup }: DraftContext): Problem[] => [
  [
    'length',
    !_whole(next.length, 1, LABEL_LIMITS.label) &&
      t('schemas.lengthHint', { n: LABEL_LIMITS.label }),
  ],
  [
    'parts',
    next.parts.length < 1 || next.parts.length > LABEL_LIMITS.parts
      ? t('schemas.partsHint', { n: LABEL_LIMITS.parts })
      : _whole(next.length, 1, LABEL_LIMITS.label) &&
        ((total) =>
          total > Number(next.length) &&
          t('schemas.overflow', { total, n: Number(next.length) }))(
          schemaLength(setup, next.separator, next.parts)
        ),
  ],
];

const _pairsProblem = (
  next: Draft,
  allowed: (part: string) => boolean,
  host: boolean
): string | null =>
  next.pairs.some((_) => _.part === '' || _.value === '')
    ? t('pairs.incomplete')
    : new Set(next.pairs.map((_) => _.part)).size < next.pairs.length
      ? t('pairs.duplicate')
      : next.pairs.some((_) => !allowed(_.part))
        ? t('pairs.notInSchema')
        : !host && next.pairs.some((_) => _.value === HOST_TOKEN)
          ? t('pairs.hostOnlyAny')
          : null;

const _referrerProblems = (next: Draft, { setup }: DraftContext): Problem[] => [
  [
    'rule',
    next.rule === ''
      ? t('referrers.kindRequired')
      : next.rule !== 'host' &&
        ((other) =>
          other !== undefined &&
          t(
            next.rule === 'any' ? 'referrers.anyTaken' : 'referrers.noneTaken',
            {
              name: quoted(other.name),
            }
          ))(
          setup.referrers.find(
            (_) => _.code !== next.code && _.kind === next.rule
          )
        ),
  ],
  [
    'host',
    next.rule === 'host' &&
      ((pattern) =>
        pattern === null
          ? t('referrers.hostHint', { n: LABEL_LIMITS.host })
          : ((other) =>
              other !== undefined &&
              t('referrers.hostTaken', { name: quoted(other.name) }))(
              setup.referrers.find(
                (_) =>
                  _.code !== next.code &&
                  _.kind === 'host' &&
                  _.host === pattern
              )
            ))(hostPattern(next.host)),
  ],
  ['pairs', _pairsProblem(next, () => true, next.rule === 'any')],
];

const _TARGET: Readonly<Record<TargetProblem, MessageKey>> = {
  https: 'links.targetHttps',
  space: 'links.targetSpace',
  long: 'links.targetLong',
  token: 'links.targetToken',
  place: 'links.targetPlace',
  invalid: 'links.targetInvalid',
};

const _linkProblems = (next: Draft, { setup }: DraftContext): Problem[] =>
  ((schema) => [
    ['sender', next.sender === '' && t('links.senderRequired')],
    [
      'target',
      ((problem) =>
        problem !== null && t(_TARGET[problem], { n: LABEL_LIMITS.target }))(
        targetProblem(next.target)
      ),
    ],
    [
      'pairs',
      _pairsProblem(
        next,
        (part) => schema?.parts.includes(part) ?? false,
        false
      ),
    ],
  ])(setup.schemas.find((_) => _.sender === next.sender));

const _milestoneProblems = (next: Draft, { setup }: DraftContext): Problem[] =>
  ((property) => [
    ['sender', next.sender === '' && t('milestones.senderRequired')],
    ['type', next.type === '' && t('milestones.typeRequired')],
    [
      'count',
      !_whole(next.count, 1, ITEM_LIMITS.milestoneCount) &&
        t('milestones.countHint', { n: ITEM_LIMITS.milestoneCount }),
    ],
    [
      'condition',
      next.condition !== 'none' &&
        (next.property === ''
          ? t('milestones.propertyRequired')
          : _str(next.value) === '' ||
              ((next.condition === 'gte' || property?.kind === 'number') &&
                !Number.isFinite(Number(next.value)))
            ? t(
                next.condition === 'gte' || property?.kind === 'number'
                  ? 'milestones.numberRequired'
                  : 'milestones.valueRequired'
              )
            : null),
    ],
    [
      'days',
      !next.forever &&
        !_whole(next.days, 1, ITEM_LIMITS.milestoneDays) &&
        t('milestones.daysHint', { n: ITEM_LIMITS.milestoneDays }),
    ],
  ])(propertyOf(setup, 'event', next.property));

const _STEP_CHECKS: Readonly<
  Record<StepKind, (step: StepDraft) => MessageKey | null>
> = {
  visits: () => null,
  page: (_) => (isSitePage(_.page.trim()) ? null : 'funnels.pageHint'),
  link: () => null,
  form: (_) => (isFormName(_.form.trim()) ? null : 'funnels.formHint'),
  arrival: () => null,
  trial: () => null,
  payment: (_) =>
    _whole(_.number, 1, ITEM_LIMITS.paymentNumber)
      ? null
      : 'funnels.numberHint',
  milestone: (_) => (_.milestone === '' ? 'funnels.milestoneRequired' : null),
  type: (_) => (_.type === '' ? 'funnels.typeRequired' : null),
};

/** Шаги-посещения идут до шагов-людей: граница одна. */
export var orderBroken = (steps: readonly StepDraft[]): boolean =>
  steps.some(
    (step, index) =>
      sideOf(step) === 'visits' &&
      steps.slice(0, index).some((_) => sideOf(_) === 'people')
  );

const _funnelProblems = (next: Draft): Problem[] => [
  [
    'steps',
    next.steps.length < ITEM_LIMITS.funnelSteps.min ||
    next.steps.length > ITEM_LIMITS.funnelSteps.max
      ? t('funnels.stepsHint', {
          min: ITEM_LIMITS.funnelSteps.min,
          max: ITEM_LIMITS.funnelSteps.max,
        })
      : ((index) =>
          index >= 0
            ? ((step) =>
                t('funnels.stepProblem', {
                  n: index + 1,
                  problem: t(
                    step.kind === ''
                      ? 'funnels.kindRequired'
                      : (_STEP_CHECKS[step.kind](step) ??
                          'funnels.kindRequired'),
                    { n: ITEM_LIMITS.paymentNumber }
                  ),
                }))(next.steps[index]!)
            : orderBroken(next.steps) && t('funnels.orderRule'))(
          next.steps.findIndex(
            (_) => _.kind === '' || _STEP_CHECKS[_.kind](_) !== null
          )
        ),
  ],
];

// Отметка сверки — у одного свойства сайта; у свойства не того вида или области её нет (тело её не шлёт).
const _reconcileProblem = (
  next: Draft,
  { setup }: DraftContext
): string | false =>
  next.reconcile !== '' &&
  next.owner === 'event' &&
  RECONCILE_KINDS[next.reconcile] === next.kind &&
  ((other) =>
    other !== undefined && t('reconcile.taken', { name: quoted(other.name) }))(
    setup.properties.find(
      (_) =>
        _.reconcile === next.reconcile &&
        !(_.scope === next.owner && _.code === next.code)
    )
  );

const _GROUP_PROBLEMS: Readonly<
  Record<SetupGroup, (next: Draft, context: DraftContext) => Problem[]>
> = {
  sender: (next) => [
    [
      'summaryAt',
      !next.noSummary &&
        !isSummaryAt(next.summaryAt) &&
        t('senders.summaryAtHint'),
    ],
  ],
  type: (next) => [
    ['role', next.role === '' && t('setupForm.roleRequired')],
    [
      'properties',
      next.properties.length > ITEM_LIMITS.propertiesPerType &&
        t('setupForm.propertiesLimit', { n: ITEM_LIMITS.propertiesPerType }),
    ],
  ],
  property: (next, context) => [
    ['kind', next.kind === '' && t('setupForm.kindRequired')],
    [
      'dictionary',
      next.kind === 'choice' &&
        next.dictionary === '' &&
        t('setupForm.dictionaryRequired'),
    ],
    ['reconcile', _reconcileProblem(next, context)],
  ],
  dictionary: _dictionaryProblems,
  value: (next) => [
    [
      'position',
      _str(next.position) !== '' &&
        !_whole(next.position, 0, ITEM_LIMITS.position) &&
        t('setupForm.positionHint', { n: ITEM_LIMITS.position }),
    ],
  ],
  schema: _schemaProblems,
  referrer: _referrerProblems,
  link: _linkProblems,
  milestone: _milestoneProblems,
  funnel: _funnelProblems,
};

/** Проверка до отправки — те же правила, что у сервера, с подсказкой, что ожидается. */
export var check = (
  group: SetupGroup,
  next: Draft,
  context: DraftContext
): Record<string, string> =>
  Object.fromEntries(
    (
      [
        ['code', _codeProblem(group, next, context)],
        [
          'owner',
          context.existing === null &&
            group in OWNER_FIELDS &&
            (next.owner === ''
              ? t(
                  group === 'schema'
                    ? 'schemas.senderRequired'
                    : 'setupForm.ownerRequired'
                )
              : group === 'schema' &&
                _taken(group, next, context.setup) &&
                t('schemas.taken')),
        ],
        [
          'name',
          (length(next.name) < 1 || length(next.name) > ITEM_LIMITS.name) &&
            t('setupForm.nameHint', { n: ITEM_LIMITS.name }),
        ],
        [
          'note',
          length(next.note) > ITEM_LIMITS.note &&
            t('setupForm.noteHint', { n: ITEM_LIMITS.note }),
        ],
        ..._GROUP_PROBLEMS[group](next, context),
      ] as readonly Problem[]
    ).flatMap(({ 0: field, 1: problem }) =>
      typeof problem === 'string' ? [[field, problem]] : []
    )
  );

const _partsOf = (pairs: readonly PartPair[]): Parts =>
  Object.fromEntries(pairs.map((_) => [_.part, _.value]));

const _goal = (step: StepDraft): string =>
  step.kind === 'form'
    ? `${FORM_GOAL}${step.form.trim()}`
    : `${GO_GOAL}${step.link}`;

const _STEP_BODIES: Readonly<
  Record<StepKind, (step: StepDraft) => FunnelStep>
> = {
  visits: () => ({ kind: 'visits', page: null }),
  page: (_) => ({ kind: 'visits', page: _.page.trim() }),
  link: (_) => ({ kind: 'goal', goal: _goal(_) }),
  form: (_) => ({ kind: 'goal', goal: _goal(_) }),
  arrival: () => ({ kind: 'arrival' }),
  trial: () => ({ kind: 'trial' }),
  payment: (_) => ({ kind: 'payment', number: Number(_.number) }),
  milestone: (_) => ({ kind: 'milestone', milestone: _.milestone }),
  type: (_) =>
    ((at) => ({
      kind: 'type',
      sender: _.type.slice(0, at),
      type: _.type.slice(at + 1),
    }))(_.type.indexOf('/')),
};

// Значение `eq` — того вида, что у свойства: код у выбора, да или нет, число.
const _eq = (setup: SetupView, next: Draft): string | number | boolean =>
  ((kind) =>
    kind === 'boolean'
      ? _str(next.value) === 'true'
      : kind === 'number'
        ? Number(next.value)
        : _str(next.value))(propertyOf(setup, 'event', next.property)?.kind);

const _conditionBody = (
  setup: SetupView,
  next: Draft
): MilestoneCondition | null =>
  next.condition === 'none'
    ? null
    : next.condition === 'gte'
      ? { property: next.property, gte: Number(next.value) }
      : { property: next.property, eq: _eq(setup, next) };

/** Тело запроса по группе: только поля группы; ключ — код и владелец. */
export var bodyOf = (
  group: SetupGroup,
  next: Draft,
  setup: SetupView
): Record<string, unknown> =>
  ((base) =>
    (
      ({
        sender: () => ({
          name: base.name,
          note: base.note,
          enabled: next.enabled,
          summaryAt: next.noSummary ? null : next.summaryAt,
        }),
        type: () => ({
          ...base,
          sender: next.owner,
          code: next.code,
          role: next.role,
          properties: next.properties,
        }),
        property: () => ({
          ...base,
          scope: next.owner,
          code: next.code,
          kind: next.kind,
          dictionary: next.kind === 'choice' ? next.dictionary : null,
          dimension:
            DIMENSION_KINDS.includes(next.kind as PropertyKind) &&
            next.dimension,
          untrusted: next.kind === 'string' && next.untrusted,
          reconcile:
            next.owner === 'event' &&
            next.reconcile !== '' &&
            reconcileFor(next.kind).includes(next.reconcile)
              ? next.reconcile
              : null,
        }),
        dictionary: () => ({
          ...base,
          code: next.code,
          purpose: next.purpose,
          utm: next.purpose === 'parts' && next.utm !== '' ? next.utm : null,
          length: next.purpose === 'parts' ? Number(next.length) : null,
        }),
        value: () => ({
          ...base,
          dictionary: next.owner,
          code: next.code,
          ...(_str(next.position) === ''
            ? {}
            : { position: Number(next.position) }),
          // «Ждёт расхода» — только у значения части метки: у других назначений сервер его не примет.
          ...(partOf(setup, next.owner) === undefined
            ? {}
            : { awaitsSpend: next.awaitsSpend }),
        }),
        schema: () => ({
          ...base,
          sender: next.owner,
          separator: next.separator,
          length: Number(next.length),
          parts: next.parts,
        }),
        referrer: () => ({
          ...base,
          code: next.code,
          kind: next.rule,
          host: next.rule === 'host' ? next.host.trim() : null,
          parts: _partsOf(next.pairs),
        }),
        link: () => ({
          ...base,
          code: next.code,
          sender: next.sender,
          target: next.target.trim(),
          parts: _partsOf(next.pairs),
        }),
        milestone: () => ({
          ...base,
          code: next.code,
          sender: next.sender,
          type: next.type,
          count: Number(next.count),
          condition: _conditionBody(setup, next),
          days: next.forever ? null : Number(next.days),
          anchor: next.anchor === '' ? null : next.anchor,
          column: next.column,
        }),
        funnel: () => ({
          ...base,
          code: next.code,
          strict: next.strict,
          main: next.main,
          steps: next.steps.map((_) => _STEP_BODIES[_.kind as StepKind](_)),
        }),
      }) satisfies Record<SetupGroup, () => Record<string, unknown>>
    )[group]())({ name: next.name.trim(), note: next.note.trim() });

// Отказ сервера — у поля, о котором он: по словам подробности (после «Элемент x: »). Только поля, которые форма
// группы показывает: иначе отказ — под формой.
const _NAMED: readonly (readonly [RegExp, string])[] = [
  [/\bname\b/, 'name'],
  [/\bnote\b/, 'note'],
];

const _FIELDS: Readonly<
  Record<SetupGroup, readonly (readonly [RegExp, string])[]>
> = {
  sender: [..._NAMED, [/summaryAt|summary/, 'summaryAt']],
  type: [
    ..._NAMED,
    [/\brole\b/, 'role'],
    [/propert/, 'properties'],
    [/\bsender\b/, 'owner'],
  ],
  property: [
    ..._NAMED,
    [/reconcile/, 'reconcile'],
    [/\bkind\b|dimension|untrusted text/, 'kind'],
    [/dictionar/, 'dictionary'],
    [/\bscope\b/, 'owner'],
  ],
  dictionary: [
    [/purpose|not a label part value|only a label part/, 'purpose'],
    [/\butm\b|fills label part/, 'utm'],
    [/longer than|in label schema|\blength\b/, 'length'],
    ..._NAMED,
  ],
  value: [
    ..._NAMED,
    [/\bposition\b/, 'position'],
    [/awaits spend|awaitsSpend/, 'awaitsSpend'],
    [/dictionar/, 'owner'],
  ],
  schema: [
    [/parts with separators|\bparts?\b|label part/, 'parts'],
    [/separator/, 'separator'],
    [/\blength\b/, 'length'],
    [/\bsender\b/, 'owner'],
    ..._NAMED,
  ],
  referrer: [
    [/\{host\}|\bparts?\b|has no value|value .* archived|label part/, 'pairs'],
    [/\bhost\b/, 'host'],
    [/one rule for|\bkind\b/, 'rule'],
    ..._NAMED,
  ],
  link: [
    [/target/, 'target'],
    [/\bparts?\b|has no value|value .* archived|label part/, 'pairs'],
    [/sender|schema/, 'sender'],
    ..._NAMED,
  ],
  milestone: [
    [
      /condition|\bgte\b|\beq\b|propert|has no value|value .* archived/,
      'condition',
    ],
    [/\bcount\b/, 'count'],
    [/\bdays\b/, 'days'],
    [/anchor/, 'anchor'],
    [/event type|\btype\b/, 'type'],
    [/sender/, 'sender'],
    [/column/, 'column'],
    ..._NAMED,
  ],
  funnel: [
    [/\bsteps?\b/, 'steps'],
    [/strict/, 'strict'],
    [/\bmain\b/, 'main'],
    ..._NAMED,
  ],
};

/** Поле отказа сервера; null — отказ под формой. Код не того вида без поля в подробности — поле кода. */
export var fieldOf = (
  group: SetupGroup,
  code: string,
  message: string
): string | null =>
  code === 'analytics.too_many'
    ? null
    : ((detail) =>
        _FIELDS[group].find((_) => _[0].test(detail))?.[1] ??
        (code === 'analytics.invalid_code' && group !== 'schema'
          ? 'code'
          : null))(message.slice(message.indexOf(': ') + 2));

/** Подсказка и ошибка поля для `aria-describedby`: ошибка — первой. */
export var describedBy = (
  id: string,
  errors: Readonly<Record<string, string>>,
  field: string,
  hint = true
): string | undefined =>
  [
    errors[field] ? `${id}-${field}-error` : '',
    hint ? `${id}-${field}-hint` : '',
  ]
    .filter(Boolean)
    .join(' ') || undefined;

/** Что изменит сохранение — словами, до отправки; null — сказать нечего. */
export var effectOf = (
  group: SetupGroup,
  next: Draft,
  { setup, existing }: DraftContext
): MessageKey | null =>
  (
    ({
      sender: () => null,
      type: () =>
        next.role !== '' && (existing === null || existing.role !== next.role)
          ? existing === null
            ? 'setupForm.recountNew'
            : 'setupForm.recountChange'
          : null,
      property: () =>
        (DIMENSION_KINDS.includes(next.kind as PropertyKind) &&
          next.dimension) !==
        (existing?.dimension === true)
          ? 'setupForm.effectDimension'
          : null,
      dictionary: () =>
        next.purpose === 'parts' || existing?.purpose === 'parts'
          ? 'setupForm.effectParts'
          : null,
      value: () =>
        partOf(setup, next.owner) === undefined
          ? null
          : next.awaitsSpend !== (existing?.awaitsSpend === true)
            ? next.awaitsSpend
              ? 'setupForm.effectAwaitsOn'
              : 'setupForm.effectAwaitsOff'
            : 'setupForm.effectParts',
      schema: () => 'setupForm.effectParts',
      referrer: () => 'setupForm.effectReferrer',
      link: () => 'setupForm.effectLink',
      milestone: () => 'setupForm.effectMilestone',
      funnel: () => 'setupForm.effectFunnel',
    }) satisfies Record<SetupGroup, () => MessageKey | null>
  )[group]();

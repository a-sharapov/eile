import { GROUP_LABELS, SET_GROUPS, type SetGroup } from '#lib/analytics.ts';
import { type MessageKey, quoted, t } from '#lib/i18n.ts';
import type { SetPlanReport, SetupView, SetWarning } from '#lib/types.ts';

// «Настройка → Перенос» (ADR 0072, «Перенос набора»): файл набора читается в браузере, проверяется до отправки
// (размер, JSON, обёртка), проба сервера даёт отчёт — экран раскладывает его по группам словами. Названия и
// значения из файла — текст другого сайта: только текстом, без разметки и ссылок.

/** Тело запроса менеджера — до 2 МиБ (общий предел JSON сервера); больше — `cms analytics import`. */
export var SET_FILE_LIMIT = 2 * 1024 * 1024;

export var SET_FORMAT = 'eile-analytics-set';

/** Что вышло из файла: набор, слишком большой, не JSON или не набор Eile. */
export type SetFile =
  | { readonly kind: 'set'; readonly set: Readonly<Record<string, unknown>> }
  | { readonly kind: 'large' }
  | { readonly kind: 'json' }
  | { readonly kind: 'foreign' };

const _isRecord = (raw: unknown): raw is Readonly<Record<string, unknown>> =>
  raw !== null && typeof raw === 'object' && !Array.isArray(raw);

const _BOM = '\uFEFF';

/** Файл набора по его тексту и размеру в байтах: метка порядка байтов в начале не мешает, как у CLI. */
export var classifySet = (text: string, size: number): Promise<SetFile> =>
  size > SET_FILE_LIMIT
    ? Promise.resolve({ kind: 'large' })
    : Promise.resolve(text.startsWith(_BOM) ? text.slice(1) : text)
        .then((_) => JSON.parse(_) as unknown)
        .then(
          (parsed): SetFile =>
            _isRecord(parsed) && parsed.format === SET_FORMAT
              ? { kind: 'set', set: parsed }
              : { kind: 'foreign' },
          (): SetFile => ({ kind: 'json' })
        );

/** Прочитать выбранный файл: больше предела — не читается вовсе. */
export var readSetFile = (file: File): Promise<SetFile> =>
  file.size > SET_FILE_LIMIT
    ? Promise.resolve({ kind: 'large' })
    : file.text().then((text) => classifySet(text, file.size));

/** Отчёт по группам в порядке применения: что создастся и что изменится. */
export type PlanGroup = {
  readonly group: SetGroup;
  readonly created: SetPlanReport['created'];
  readonly changed: SetPlanReport['changed'];
};

export var planGroups = (report: SetPlanReport): PlanGroup[] =>
  SET_GROUPS.map((group) => ({
    group,
    created: report.created.filter((_) => _.group === group),
    changed: report.changed.filter((_) => _.group === group),
  })).filter((_) => _.created.length > 0 || _.changed.length > 0);

/** Есть ли что применить: без ошибок и хоть что-то создастся или изменится. */
export var canApply = (report: SetPlanReport): boolean =>
  Object.keys(report.errors).length === 0 &&
  (report.created.length > 0 || report.changed.length > 0);

/** Чего набор не меняет — словами: коды `SET_UNTOUCHED` сервера. */
export var UNTOUCHED_LABELS: Readonly<
  Record<SetPlanReport['untouched'][number], MessageKey>
> = {
  intake: 'transfer.untouchedIntake',
  retention: 'transfer.untouchedRetention',
  base_currency: 'transfer.untouchedBase',
  keys: 'transfer.untouchedKeys',
  labels: 'transfer.untouchedLabels',
  rates: 'transfer.untouchedRates',
  spend: 'transfer.untouchedSpend',
  statements: 'transfer.untouchedStatements',
  events: 'transfer.untouchedEvents',
  people: 'transfer.untouchedPeople',
  results: 'transfer.untouchedResults',
};

export var untouchedText = (code: string): string =>
  Object.hasOwn(UNTOUCHED_LABELS, code)
    ? t(UNTOUCHED_LABELS[code as keyof typeof UNTOUCHED_LABELS])
    : code;

/** Предупреждения пробы — словами по коду: английский текст сервера экрану не нужен. */
export var WARNING_LABELS: Readonly<Record<SetWarning['code'], MessageKey>> = {
  role_changed: 'transfer.warnRole',
  sender_created: 'transfer.warnSender',
  sender_disabled: 'transfer.warnDisabled',
  archive_kept: 'transfer.warnArchive',
  summary_hour: 'transfer.warnHour',
  newer_file: 'transfer.warnNewer',
};

/** Название элемента предупреждения: из отчёта пробы (файл или сайт), иначе ключ. */
export var warningText = (
  warning: SetWarning,
  report: Pick<SetPlanReport, 'created' | 'changed'>
): string =>
  ((name) =>
    Object.hasOwn(WARNING_LABELS, warning.code)
      ? t(WARNING_LABELS[warning.code], { name: quoted(name) })
      : warning.message)(
    [...report.created, ...report.changed].find(
      (_) => _.group === warning.group && _.key === warning.key
    )?.name ||
      warning.key ||
      ''
  );

export var groupText = (group: string): string =>
  Object.hasOwn(GROUP_LABELS, group)
    ? t(GROUP_LABELS[group as SetGroup])
    : group;

// Списки групп в файле набора и в настройке сайта: у значений — внутри справочника.
const _FILE_LISTS: Readonly<Record<SetGroup, string>> = {
  sender: 'senders',
  type: 'types',
  property: 'properties',
  dictionary: 'dictionaries',
  value: 'dictionaries',
  schema: 'schemas',
  referrer: 'referrers',
  link: 'links',
  milestone: 'milestones',
  funnel: 'funnels',
  check: 'checks',
};

const _OWNERS: Readonly<Partial<Record<SetGroup, string>>> = {
  type: 'sender',
  property: 'scope',
  value: 'dictionary',
};

type _Item = Readonly<Record<string, unknown>>;

const _keyOf = (group: SetGroup, item: _Item): string =>
  group === 'schema'
    ? String(item.sender)
    : ((owner) =>
        owner === undefined
          ? String(item.code)
          : `${String(item[owner])}/${String(item.code)}`)(_OWNERS[group]);

const _list = (raw: unknown): _Item[] =>
  Array.isArray(raw) ? raw.filter(_isRecord) : [];

// Значения справочников — внутри справочника: у сайта и у файла одинаково, ключ `справочник/значение`.
const _itemsOf = (
  source: Readonly<Record<string, unknown>>,
  group: SetGroup
): _Item[] =>
  group === 'value'
    ? _list(source.dictionaries).flatMap((dictionary) =>
        _list(dictionary.values).map((_) => ({
          ..._,
          dictionary: _.dictionary ?? dictionary.code,
        }))
      )
    : _list(source[_FILE_LISTS[group]]);

const _find = (
  source: Readonly<Record<string, unknown>> | null,
  group: SetGroup,
  key: string
): _Item | null =>
  source === null
    ? null
    : (_itemsOf(source, group).find((_) => _keyOf(group, _) === key) ?? null);

const _TEXT_LIMIT = 120;

/** Значение поля текстом: строка как есть (укорочена), да/нет, пусто — тире, остальное — JSON. */
export var shownValue = (value: unknown): string =>
  ((text) =>
    [...text].length > _TEXT_LIMIT
      ? `${[...text].slice(0, _TEXT_LIMIT).join('')}…`
      : text)(
    value === undefined || value === null || value === ''
      ? '—'
      : typeof value === 'boolean'
        ? t(value ? 'common.yes' : 'common.no')
        : typeof value === 'string' || typeof value === 'number'
          ? String(value)
          : JSON.stringify(value)
  );

// Подписи полей набора — те же, что в формах настройки; общие у всех групп — код, название, заметка.
const _COMMON_FIELDS: Readonly<Record<string, MessageKey>> = {
  code: 'setupForm.code',
  name: 'setupForm.name',
  note: 'setupForm.note',
};

export var FIELD_LABELS: Readonly<
  Record<SetGroup, Readonly<Record<string, MessageKey>>>
> = {
  sender: {
    enabled: 'setupForm.enabled',
    summaryAt: 'senders.summaryAtField',
  },
  type: {
    sender: 'setupForm.sender',
    role: 'analytics.role',
    properties: 'setupForm.properties',
  },
  property: {
    scope: 'setupForm.scope',
    kind: 'setupForm.kind',
    dictionary: 'setupForm.dictionary',
    dimension: 'setupForm.dimension',
    untrusted: 'setupForm.untrusted',
    reconcile: 'reconcile.label',
  },
  dictionary: {
    purpose: 'setupForm.purpose',
    utm: 'dictionaries.utm',
    length: 'dictionaries.length',
  },
  value: {
    dictionary: 'setupForm.dictionary',
    position: 'setupForm.position',
    awaitsSpend: 'setupForm.awaitsSpend',
  },
  schema: {
    sender: 'setupForm.sender',
    separator: 'schemas.separator',
    length: 'schemas.length',
    parts: 'schemas.parts',
  },
  referrer: {
    kind: 'referrers.kind',
    host: 'referrers.host',
    parts: 'referrers.parts',
  },
  link: {
    sender: 'links.sender',
    target: 'links.target',
    parts: 'links.parts',
  },
  milestone: {
    sender: 'milestones.sender',
    type: 'milestones.type',
    count: 'milestones.count',
    condition: 'milestones.condition',
    days: 'milestones.days',
    anchor: 'milestones.anchor',
    column: 'milestones.column',
    position: 'setupForm.position',
  },
  funnel: {
    strict: 'funnels.strict',
    main: 'funnels.main',
    steps: 'funnels.steps',
    position: 'setupForm.position',
  },
  check: {
    enabled: 'qualityForm.enabled',
    notify: 'qualityForm.notify',
    params: 'transfer.fieldParams',
  },
};

/** Подпись поля на языке менеджера; у поля без подписи — его имя из файла. */
export var fieldText = (group: SetGroup, field: string): string =>
  ((key) => (key === undefined ? field : t(key)))(
    Object.hasOwn(FIELD_LABELS[group], field)
      ? FIELD_LABELS[group][field]
      : Object.hasOwn(_COMMON_FIELDS, field)
        ? _COMMON_FIELDS[field]
        : undefined
  );

/** «Было → стало» у изменённых полей: было — с сайта, стало — из файла (у образца файла в браузере нет). */
export var fieldChanges = (
  setup: SetupView,
  file: Readonly<Record<string, unknown>> | null,
  group: SetGroup,
  key: string,
  fields: readonly string[]
): {
  readonly field: string;
  readonly from: string;
  readonly to: string | null;
}[] =>
  ((was, now) =>
    fields.map((field) => ({
      field,
      from: shownValue(was?.[field]),
      to: now === null ? null : shownValue(now[field]),
    })))(
    _find(setup as unknown as Readonly<Record<string, unknown>>, group, key),
    _find(file, group, key)
  );

/** Пустая настройка: ни отправителей, ни типов — экран предлагает образец вместо пустых вкладок. */
export var isEmptySetup = (
  setup: Pick<SetupView, 'senders' | 'types'>
): boolean => setup.senders.length === 0 && setup.types.length === 0;

/** Что внутри образца словами: «8 типов, 5 справочников, 1 веха, 1 воронка». */
export var SAMPLE_COUNTS: readonly (readonly [SetGroup, MessageKey])[] = [
  ['sender', 'transfer.countSenders'],
  ['type', 'transfer.countTypes'],
  ['dictionary', 'transfer.countDictionaries'],
  ['milestone', 'transfer.countMilestones'],
  ['funnel', 'transfer.countFunnels'],
];

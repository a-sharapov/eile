import { pipe } from '../../../shared/kernel/pipe.ts';
import type { GoSources, VisitSource } from './ports.ts';
import type {
  Dictionary,
  GoLink,
  LabelSchema,
  LabelSeparator,
  Parts,
  ReferrerRule,
  Setup,
  UtmParameter,
} from './setup.ts';

/** Замечание разбора: лишние отрезки, отрезок не из знаков кода, метка длиннее схемы, у отправителя нет схемы. */
export type LabelNote = 'invalid' | 'extra' | 'length' | 'schema';

/** Разобранная метка: части как в метке (строчными) и замечания; знакомы ли значения, решает `valueState`. */
export type ParsedLabel = {
  readonly parts: Parts;
  readonly notes: readonly LabelNote[];
};

/** Значение части по справочнику: есть, есть в архиве, нет. */
export type ValueState = 'known' | 'archived' | 'unknown';

/**
 * Откуда переход берёт части посещения: приём выключен, сам запрос (UTM или чужой сайт), посещение дня, заход
 * без Referer (соответствие `none`), своя страница без посещения.
 */
export type GoSource = 'disabled' | 'request' | 'visit' | 'none' | 'own';

export var LABEL_SEPARATORS: readonly LabelSeparator[] = ['__', '--', '.', '~'];

export var UTM_PARAMETERS: readonly UtmParameter[] = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
];

/** Переход: адрес занят ядром, до сайта и плагинов запрос не доходит. */
export var GO_PREFIX = '/_cms/go/';

/** Место метки в адресе назначения перехода. */
export var LABEL_TOKEN = '{label}';

/** Значение части у соответствия «любой другой сайт»: хост реферера через `partValue`. */
export var HOST_TOKEN = '{host}';

export var LABEL_LIMITS = {
  parts: 8,
  /** Предел длины значения части: 1–60, у новой части — 20. */
  part: 60,
  partDefault: 20,
  /** Предел метки схемы: 1–256, у новой — 64, как start-параметр Telegram. */
  label: 256,
  labelDefault: 64,
  host: 100,
  target: 500,
} as const;

// Отрезок метки — знаки кода; значение части строже: без `_` и `-` по краям и подряд, поэтому в нём не бывает
// разделителей `__` и `--`.
const _SEGMENT = /^[a-z0-9_-]+$/;
const _PART_VALUE = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const _HOST_PATTERN = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*(?:\.\*)?$/;

const _UTM: Readonly<Record<UtmParameter, keyof VisitSource>> = {
  utm_source: 'utmSource',
  utm_medium: 'utmMedium',
  utm_campaign: 'utmCampaign',
  utm_content: 'utmContent',
  utm_term: 'utmTerm',
};

const _NO_SOURCE: VisitSource = {
  utmSource: '',
  utmMedium: '',
  utmCampaign: '',
  utmContent: '',
  utmTerm: '',
  referrer: '',
};

/** Годное значение части: вид строже кода и не длиннее предела части. */
export var isPartValue = (raw: string, length: number): boolean =>
  raw.length <= length && _PART_VALUE.test(raw);

/**
 * Разбор метки по схеме отправителя: строчными, по разделителю схемы, i-й отрезок — i-я часть. Пустой отрезок —
 * части нет; лишние отрезки, знаки не кода и длина сверх предела — замечания, а не отказ.
 */
export var parseLabel = (
  schema: LabelSchema | null,
  label: string
): ParsedLabel =>
  ((text) =>
    text === ''
      ? { parts: {}, notes: [] }
      : schema === null
        ? { parts: {}, notes: ['schema'] }
        : ((segments) => ({
            parts: _partsOf(schema, segments),
            notes: [
              ...(segments
                .slice(0, schema.parts.length)
                .some((_) => _ !== '' && !_isSegment(_))
                ? (['invalid'] as const)
                : []),
              ...(segments.slice(schema.parts.length).some((_) => _ !== '')
                ? (['extra'] as const)
                : []),
              // Длина в знаках не больше длины в UTF-16: считать знаки нужно, только если та длиннее предела.
              ...(text.length > schema.length &&
              [...text].length > schema.length
                ? (['length'] as const)
                : []),
            ],
          }))(text.split(schema.separator)))(label.trim().toLowerCase());

const _isSegment = (segment: string | undefined): boolean =>
  segment !== undefined &&
  segment.length <= LABEL_LIMITS.part &&
  _SEGMENT.test(segment);

const _partsOf = (schema: LabelSchema, segments: readonly string[]): Parts =>
  Object.fromEntries(
    schema.parts.flatMap((part, index) =>
      ((segment) => (_isSegment(segment) ? [[part, segment as string]] : []))(
        segments[index]
      )
    )
  );

/** Части метки без замечаний — `parseLabel(…).parts`: свёртке человека замечания не нужны. */
export var labelParts = (schema: LabelSchema | null, label: string): Parts =>
  ((text) =>
    text === '' || schema === null
      ? {}
      : _partsOf(schema, text.split(schema.separator)))(
    label.trim().toLowerCase()
  );

const _trimEdges = (text: string): string => text.replace(/^[_-]+|[_-]+$/g, '');

/**
 * UTM или хост реферера — значением части: строчными, знаки не кода — `-`, подряд идущие `_` и `-` — первым из
 * них, без них по краям, до предела части. null — после чистки пусто.
 */
export var partValue = (
  raw: string,
  part: Pick<Dictionary, 'length'>
): string | null =>
  pipe(
    (_: string) => _.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
    (_) => _.replace(/[_-]+/g, (run) => run.charAt(0)),
    _trimEdges,
    (_) => _.slice(0, part.length ?? LABEL_LIMITS.part),
    _trimEdges,
    (_) => (_ === '' ? null : _)
  )(raw);

const _bareHost = (text: string): string =>
  text
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');

/** Шаблон хоста соответствия: строчными, без `www.` в начале; null — не шаблон. */
export var parseHostPattern = (raw: unknown): string | null =>
  typeof raw === 'string'
    ? ((text) =>
        text.length <= LABEL_LIMITS.host && _HOST_PATTERN.test(text)
          ? text
          : null)(_bareHost(raw))
    : null;

const _escape = (text: string): string => text.replace(/\./g, '\\.');

/** `instagram.com` — он и его поддомены; `google.*` — имя в любой зоне и его поддомены. */
export var hostMatches = (pattern: string, host: string): boolean =>
  pattern.endsWith('.*')
    ? new RegExp(`(?:^|\\.)${_escape(pattern.slice(0, -2))}\\.[^.]`).test(host)
    : host === pattern || host.endsWith(`.${pattern}`);

const _weight = (rule: ReferrerRule): number =>
  (rule.host ?? '').replace(/\.\*$/, '').length;

/** Соответствие для хоста реферера: самый длинный подошедший шаблон, иначе «любой сайт»; пусто — прямой заход. */
export var referrerOf = (setup: Setup, referrer: string): ReferrerRule | null =>
  ((host) =>
    host === ''
      ? (setup.referrers.find((_) => _.kind === 'none') ?? null)
      : (setup.referrers
          .filter((_) => _.kind === 'host' && hostMatches(_.host ?? '', host))
          .toSorted((a, b) => _weight(b) - _weight(a))[0] ??
        setup.referrers.find((_) => _.kind === 'any') ??
        null))(_bareHost(referrer));

const _part = (setup: Setup, code: string): Dictionary | undefined =>
  setup.dictionaries.find((_) => _.code === code && _.purpose === 'parts');

const _ruleParts = (rule: ReferrerRule, host: string, setup: Setup): Parts =>
  Object.fromEntries(
    Object.entries(rule.parts).flatMap(({ 0: code, 1: value }) =>
      ((part) =>
        part === undefined
          ? []
          : ((found) => (found === null ? [] : [[code, found]]))(
              value === HOST_TOKEN ? partValue(host, part) : value
            ))(_part(setup, code))
    )
  );

const _hasUtm = (source: VisitSource): boolean =>
  UTM_PARAMETERS.some((_) => source[_UTM[_]].trim() !== '');

/**
 * Части посещения: есть хоть один UTM — только из UTM, по параметру каждой части; иначе — по соответствию
 * реферера. Одна функция для перехода и для шагов-посещений воронки.
 */
export var partsOfVisit = (source: VisitSource, setup: Setup): Parts =>
  _hasUtm(source)
    ? Object.fromEntries(
        setup.dictionaries.flatMap((part) =>
          part.purpose !== 'parts' || part.utm === null
            ? []
            : ((value) => (value === null ? [] : [[part.code, value]]))(
                partValue(source[_UTM[part.utm]], part)
              )
        )
      )
    : ((rule) =>
        rule === null
          ? {}
          : _ruleParts(rule, _bareHost(source.referrer), setup))(
        referrerOf(setup, source.referrer)
      );

/** Метка из частей по схеме: пустая часть в середине — пустой отрезок, пустые в конце отбрасываются. */
export var buildLabel = (schema: LabelSchema, parts: Parts): string =>
  pipe(
    (_: LabelSchema) =>
      _.parts.map((part) => (Object.hasOwn(parts, part) ? parts[part]! : '')),
    (values) => values.slice(0, values.findLastIndex((_) => _ !== '') + 1),
    (values) => values.join(schema.separator)
  )(schema);

/** Адрес назначения с меткой: знаки метки не требуют кодирования. */
export var fillTarget = (target: string, label: string): string =>
  target.replace(LABEL_TOKEN, () => label);

// Хост адреса назначения кончается до {label}: метка из запроса не может сменить, куда ведёт переход.
const _AUTHORITY = /^https:\/\/[^/?#\\]+[/?#]/;

const _hostOf = (text: string): string | null =>
  ((url) => (url !== null && url.protocol === 'https:' ? url.host : null))(
    URL.parse(text)
  );

// URL.parse молча выбрасывает переводы строк и табуляцию: адрес с ними прошёл бы проверку, а в заголовке Location
// расщепил бы ответ. Пробелы, невидимые и управляющие знаки в адресе назначения — отказ.
const _HIDDEN = /[\s\p{C}]/u;

/**
 * Адрес назначения перехода: `https://` до 500 знаков, без пробелов и управляющих знаков, ровно один `{label}` —
 * после хоста; после подстановки — годный адрес с тем же хостом при любой метке. null — не годится.
 */
export var parseTarget = (raw: unknown): string | null =>
  typeof raw === 'string'
    ? ((text) =>
        text.length <= LABEL_LIMITS.target &&
        !_HIDDEN.test(text) &&
        text.split(LABEL_TOKEN).length === 2 &&
        _AUTHORITY.test(text.slice(0, text.indexOf(LABEL_TOKEN))) &&
        ((host) =>
          host !== null &&
          host !== '' &&
          host === _hostOf(fillTarget(text, 'b.c-d_e~f')))(
          _hostOf(fillTarget(text, 'a'))
        )
          ? text
          : null)(raw.trim())
    : null;

/** Знакомо ли значение части: справочник части по нынешней настройке, архив тоже знаком. */
export var valueState = (
  setup: Setup,
  part: string,
  value: string
): ValueState =>
  ((found) =>
    found === undefined
      ? 'unknown'
      : found.archivedAt === null
        ? 'known'
        : 'archived')(
    setup.values.find((_) => _.dictionary === part && _.code === value)
  );

/** Пять правил «Метки перехода»: какой источник даёт части посещения. */
export var goSourceOf = (enabled: boolean, sources: GoSources): GoSource =>
  !enabled
    ? 'disabled'
    : _hasUtm(sources.request) || sources.request.referer === 'foreign'
      ? 'request'
      : sources.visit !== null
        ? 'visit'
        : sources.request.referer === 'none'
          ? 'none'
          : 'own';

const _VISIT_PARTS: Readonly<
  Record<GoSource, (setup: Setup, sources: GoSources) => Parts>
> = {
  // Связать источник сайта с отправителем — решение владельца: без приёма событий — только заданные части.
  disabled: () => ({}),
  request: (setup, sources) => partsOfVisit(sources.request, setup),
  visit: (setup, sources) => partsOfVisit(sources.visit ?? _NO_SOURCE, setup),
  none: (setup) => partsOfVisit(_NO_SOURCE, setup),
  own: () => ({}),
};

/** Метка перехода: заданные заранее части важнее посещения, части не из схемы отправителя отбрасываются. */
export var goLabel = (
  setup: Setup,
  link: GoLink,
  enabled: boolean,
  sources: GoSources
): string =>
  ((schema) =>
    schema === undefined
      ? ''
      : buildLabel(schema, {
          ..._VISIT_PARTS[goSourceOf(enabled, sources)](setup, sources),
          ...link.parts,
        }))(setup.schemas.find((_) => _.sender === link.sender));

/** Куда ведёт переход: адрес назначения с меткой. */
export var goTarget = (
  setup: Setup,
  link: GoLink,
  enabled: boolean,
  sources: GoSources
): string => fillTarget(link.target, goLabel(setup, link, enabled, sources));

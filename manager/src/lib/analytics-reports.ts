import type {
  CohortBasis,
  CohortMetric,
  CompareKind,
  FeesMode,
  LabelSchema,
  Lifetime,
  LowDataThresholds,
  Parts,
  SetupView,
  Share,
} from './types.ts';

// Отчёты аналитики на экранах менеджера (ADR 0072, «Отчёты»): параметры в адресе, перенос между вкладками,
// раскрытие строки, доли, дни пояса, сборка метки. Пределы и правила — копии сервера
// (`analytics/domain/report.ts`, `application/query.ts`, `domain/labels.ts`); совпадение проверяет
// tests/manager-analytics.test.ts.

/** Параметры адреса только для чтения: `page.url.searchParams` их не меняет. */
export type QueryParams = Omit<
  URLSearchParams,
  'append' | 'delete' | 'set' | 'sort'
>;

/** Пределы отчёта — как `REPORT_LIMITS` сервера. */
export var REPORT_LIMITS = { rows: 50, filters: 10, days: 3660 } as const;

/**
 * «Мало данных» — пороги ядра, как `LOW_DATA` сервера: новых людей меньше 30, новых клиентов меньше 10. Экраны берут
 * пороги из шапки ответа (`lowDataOf`): их меняет настройка; это — запасное значение для ответа без поля.
 */
export var LOW_DATA: LowDataThresholds = { people: 30, customers: 10 };

/** Пороги «мало данных», по которым сервер приглушил строки этого ответа. */
export var lowDataOf = (
  head: { readonly lowData?: LowDataThresholds } | null | undefined
): LowDataThresholds => head?.lowData ?? LOW_DATA;

/** Значения строк: не указано, не из справочника (у метки — не из реестра), остальные сверх 50 строк. */
export var NONE = '~none';
export var UNKNOWN = '~unknown';
export var REST = '~rest';

/** Период по умолчанию — 30 дней: без параметра в адресе. */
export var DEFAULT_DAYS = 30;

/** Готовые периоды: 7, 30, 90 дней и 12 месяцев (`days=365`). */
export var PERIOD_PRESETS: readonly number[] = [7, 30, 90, 365];

/** Окна оплаты: за 7, за 30 дней, без срока (0). */
export var PAYMENT_WINDOWS: readonly (0 | 7 | 30)[] = [7, 30, 0];

/** Ключи адреса отчёта без фильтров — как `_REPORT_KEYS` маршрутов менеджера (без `limit`). */
export var REPORT_KEYS: readonly string[] = [
  'days',
  'from',
  'to',
  'all',
  'attribution',
  'group',
  'window',
  'test',
  'life',
  'fees',
  'compare',
  'basis',
  'metric',
];

/** Срок жизни LTV — как `LIFETIMES` сервера: месяцы, 0 — всё время (по умолчанию, без параметра). */
export var LIFETIMES: readonly Lifetime[] = [0, 3, 6, 12];

/** Выручка до комиссии (по умолчанию, без параметра) или после — как `FEES_MODES` сервера. */
export var FEES_MODES: readonly FeesMode[] = ['gross', 'net'];

/** С чем сравнить: без параметра — ни с чем. */
export var COMPARE_KINDS: readonly CompareKind[] = ['previous', 'year'];

/** Когорты по первой оплате или по приходу — как `COHORT_BASES` сервера. */
export var COHORT_BASES: readonly CohortBasis[] = ['payment', 'arrival'];

/** Показатели когорт по первой оплате — как `COHORT_METRICS` сервера; по умолчанию — накопленная выручка. */
export var COHORT_METRICS: readonly CohortMetric[] = [
  'cumulative',
  'monthly',
  'active',
];

/** Месяцы жизни когорт 0–12 — как `COHORT_LIMITS.life` сервера. */
export var COHORT_LIFE = 12;

/** Период когорт по умолчанию — 12 месяцев (`days=365`, без параметра), готовые — 6, 12 и 24 месяца. */
export var COHORT_DAYS = 365;
export var COHORT_PRESETS: readonly number[] = [183, 365, 730];

export var metricOf = (params: QueryParams): CohortMetric =>
  COHORT_METRICS.find((_) => _ === params.get('metric')) ?? 'cumulative';

/** Срок жизни из адреса; незнакомое значение — как без параметра. */
export var lifeOf = (params: QueryParams): Lifetime =>
  LIFETIMES.find((_) => String(_) === params.get('life')) ?? 0;

export var feesOf = (params: QueryParams): FeesMode =>
  params.get('fees') === 'net' ? 'net' : 'gross';

export var compareOf = (params: QueryParams): CompareKind | null =>
  COMPARE_KINDS.find((_) => _ === params.get('compare')) ?? null;

/** Ключи списка людей с параметрами отчёта — как `REPORT_PEOPLE_FIELDS` сервера (фильтры — отдельно). */
export var PEOPLE_REPORT_KEYS: readonly string[] = [
  'days',
  'from',
  'to',
  'all',
  'attribution',
  'milestone',
  'reached',
  'by',
  'funnel',
  'step',
  'stage',
];

/**
 * Что вкладки «Источники», «Воронки» и «Люди» передают друг другу: период, атрибуция, фильтры, тестовые,
 * комиссия и сравнение. Срок жизни — только у «Источников», он не переносится.
 */
export var CARRIED_KEYS: readonly string[] = [
  'days',
  'from',
  'to',
  'all',
  'attribution',
  'test',
  'fees',
  'compare',
];

const _FILTER = /^(?:part|trait|prop|answer)\.[a-z0-9_-]+$/;

/** Фильтр отчёта в адресе: `part.<код>`, `trait.<код>`, `prop.<код>`, `answer.<вопрос>`, `sender`. */
export var isFilterKey = (key: string): boolean =>
  key === 'sender' || _FILTER.test(key);

/** Фильтр списка людей с параметрами отчёта: `sender` у людей — свой, прежний фильтр. */
const _isPartFilter = (key: string): boolean => _FILTER.test(key);

export type ReportFilterEntry = {
  readonly key: string;
  readonly value: string;
};

/** Фильтры отчёта из адреса — по порядку в нём. */
export var filtersOf = (params: QueryParams): ReportFilterEntry[] =>
  [...params]
    .filter(({ 0: key, 1: value }) => isFilterKey(key) && value !== '')
    .map(({ 0: key, 1: value }) => ({ key, value }));

/** Параметры, которые вкладка отчётов отдаёт соседней: период, атрибуция, фильтры, тестовые. */
export var carriedQuery = (params: QueryParams): string =>
  ((carried) => (carried.size > 0 ? `?${carried}` : ''))(
    new URLSearchParams(
      [...params].filter(
        ({ 0: key, 1: value }) =>
          value !== '' && (CARRIED_KEYS.includes(key) || isFilterKey(key))
      )
    )
  );

const _search = (
  params: QueryParams,
  keep: (key: string) => boolean,
  patch: Readonly<Record<string, string | null>>
): string =>
  ((search) => (search.size > 0 ? `?${search}` : ''))(
    Object.entries(patch).reduce(
      (search, { 0: key, 1: value }) => (
        value === null || value === ''
          ? search.delete(key)
          : search.set(key, value),
        search
      ),
      new URLSearchParams(
        [...params].filter(({ 0: key, 1: value }) => value !== '' && keep(key))
      )
    )
  );

/** Запрос отчёта из адреса экрана: параметры отчёта и фильтры, поверх — `patch` (раскрытие строки, воронка). */
export var reportSearch = (
  params: QueryParams,
  patch: Readonly<Record<string, string | null>> = {}
): string =>
  _search(
    params,
    (key) => REPORT_KEYS.includes(key) || isFilterKey(key),
    patch
  );

/** Пришли ли люди из отчёта или воронки: есть параметр отчёта — как `REPORT_PEOPLE_FIELDS` сервера. */
export var fromReport = (params: QueryParams): boolean =>
  [...params].some(
    ({ 0: key, 1: value }) =>
      value !== '' && (PEOPLE_REPORT_KEYS.includes(key) || _isPartFilter(key))
  );

/** Параметры отчёта у списка людей: период, атрибуция, фильтры (кроме `sender`), веха, шаг воронки. */
export var peopleReportEntries = (params: QueryParams): [string, string][] =>
  [...params].filter(
    ({ 0: key, 1: value }) =>
      value !== '' && (PEOPLE_REPORT_KEYS.includes(key) || _isPartFilter(key))
  );

/** Выбранный период: последние N дней, свои даты или всё время. */
export type PeriodChoice =
  | { readonly kind: 'days'; readonly days: number }
  | { readonly kind: 'range'; readonly from: string; readonly to: string }
  | { readonly kind: 'all' };

const _DAY = /^\d{4}-\d{2}-\d{2}$/;
const _DAY_MS = 86_400_000;

/** День `ГГГГ-ММ-ДД`, который есть в календаре. */
export var isDay = (raw: unknown): raw is string =>
  typeof raw === 'string' &&
  _DAY.test(raw) &&
  !Number.isNaN(Date.parse(`${raw}T00:00:00Z`)) &&
  new Date(`${raw}T00:00:00Z`).toISOString().slice(0, 10) === raw;

/** День через `n` дней — как `addDays` сервера. */
export var addDays = (day: string, n: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * _DAY_MS)
    .toISOString()
    .slice(0, 10);

/** Дней от `from` до `to` включительно. */
export var daysBetween = (from: string, to: string): number =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / _DAY_MS
  ) + 1;

/** День момента в поясе — как `dayIn` сервера; пустой пояс — пояс этого браузера. */
export var dayIn = (moment: string | number, zone: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: zone || undefined,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(typeof moment === 'number' ? moment : Date.parse(moment));

const _FLAG: Readonly<Record<string, boolean>> = { '1': true, true: true };

/**
 * Период из адреса — по правилам сервера: `all` важнее своих дат, свои даты — важнее `days`; без конца — по
 * сегодня; `days` не число 1–3660 — как без параметра: 30 дней, у когорт — `fallback` 365.
 */
export var periodOf = (
  params: QueryParams,
  today: string,
  fallback = DEFAULT_DAYS
): PeriodChoice =>
  _FLAG[params.get('all') ?? ''] === true
    ? { kind: 'all' }
    : params.get('from') || params.get('to')
      ? {
          kind: 'range',
          from: params.get('from') || (params.get('to') ?? today),
          to: params.get('to') || today,
        }
      : ((days) => ({
          kind: 'days',
          days:
            /^\d+$/.test(days) &&
            Number(days) >= 1 &&
            Number(days) <= REPORT_LIMITS.days
              ? Number(days)
              : fallback,
        }))(params.get('days') ?? '');

/** Параметры адреса для периода: прежние заменяются; период по умолчанию — без параметра. */
export var periodPatch = (
  choice: PeriodChoice,
  fallback = DEFAULT_DAYS
): Record<string, string | null> =>
  choice.kind === 'all'
    ? { all: '1', days: null, from: null, to: null }
    : choice.kind === 'range'
      ? { from: choice.from, to: choice.to, days: null, all: null }
      : {
          days: choice.days === fallback ? null : String(choice.days),
          from: null,
          to: null,
          all: null,
        };

/**
 * Свои даты как их примет сервер: по порядку, конец — не позже сегодня в поясе отчёта, начало — не позже конца,
 * не длиннее 3660 дней. Экран ограничивает даты сам, а не ждёт отказа.
 */
export var clampRange = (
  from: string,
  to: string,
  today: string
): { from: string; to: string } =>
  ((first, last) =>
    ((end) =>
      ((start) => ({
        from:
          daysBetween(start, end) > REPORT_LIMITS.days
            ? addDays(end, 1 - REPORT_LIMITS.days)
            : start,
        to: end,
      }))(first > end ? end : first))(last > today ? today : last))(
    from <= to ? from : to,
    from <= to ? to : from
  );

/** Ключ фильтра по группе строк: `part:source` → `part.source`; у метки целиком фильтра нет. */
export var filterKeyOf = (group: string): string | null =>
  group === 'sender'
    ? 'sender'
    : /^(?:part|trait|prop|answer):[a-z0-9_-]+$/.test(group)
      ? group.replace(':', '.')
      : null;

/** Можно ли поставить фильтр по значению строки: «остальные» не фильтруются, у отправителя — только код. */
export var canFilter = (group: string, value: string): boolean =>
  filterKeyOf(group) !== null &&
  value !== '' &&
  value !== REST &&
  !(group === 'sender' && value.startsWith('~'));

const _byCode = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Первый по коду вопрос опроса не в архиве; все в архиве — первый из них (как `firstQuestion` сервера). */
export var firstQuestion = (
  setup: Pick<SetupView, 'dictionaries'>
): string | null =>
  setup.dictionaries
    .filter((_) => _.purpose === 'answers')
    .toSorted(
      (a, b) =>
        Number(a.archivedAt !== null) - Number(b.archivedAt !== null) ||
        _byCode(a.code, b.code)
    )[0]?.code ?? null;

/**
 * Следующий уровень строки при раскрытии: у части — следующая часть схемы, в которой она стоит (схемы не в
 * архиве — раньше, затем по коду отправителя); у «не указано» части — ответы на первый вопрос опроса. Другие
 * группы, «остальные» и последняя часть схемы не раскрываются — null.
 */
export var nextGroupOf = (
  setup: Pick<SetupView, 'dictionaries' | 'schemas'>,
  group: string,
  value: string
): string | null =>
  !group.startsWith('part:') || value === REST || value === ''
    ? null
    : value === NONE
      ? ((question) => (question === null ? null : `answer:${question}`))(
          firstQuestion(setup)
        )
      : ((part) =>
          ((schema) =>
            ((next) => (next === undefined ? null : `part:${next}`))(
              schema?.parts[schema.parts.indexOf(part) + 1]
            ))(
            setup.schemas
              .filter((_) => _.parts.includes(part))
              .toSorted(
                (a, b) =>
                  Number(a.archivedAt !== null) -
                    Number(b.archivedAt !== null) || _byCode(a.sender, b.sender)
              )[0]
          ))(group.slice('part:'.length));

/** Доля засчитанных; знаменатель ноль — null: на экране «—». */
export var shareRate = (share: Pick<Share, 'count' | 'base'>): number | null =>
  share.base > 0 ? share.count / share.base : null;

/** Доля от числа: шаг воронки от предыдущего или от первого; ноль или нет числа — null. */
export var rateOf = (
  count: number | null,
  base: number | null
): number | null =>
  count === null || base === null || base <= 0 ? null : count / base;

/** Метка из частей по схеме — как `buildLabel` сервера: пустая часть в середине — пустой отрезок, хвост отброшен. */
export var buildLabel = (
  schema: {
    readonly parts: readonly string[];
    readonly separator: LabelSchema['separator'];
  },
  parts: Readonly<Parts>
): string =>
  ((values) =>
    values
      .slice(0, values.findLastIndex((_) => _ !== '') + 1)
      .join(schema.separator))(
    schema.parts.map((part) => (Object.hasOwn(parts, part) ? parts[part]! : ''))
  );

/** Изменение к прошлому периоду: числа и суммы — долей от прежнего, доли — в процентных пунктах; было 0 — «новое». */
export type Change =
  | { readonly kind: 'percent'; readonly value: number }
  | { readonly kind: 'points'; readonly value: number }
  | { readonly kind: 'months'; readonly value: number }
  | { readonly kind: 'new' };

/** Число или сумма: `(сейчас − было) / было`; было 0 и сейчас не 0 — «новое»; нет одного из них — null. */
export var percentChange = (
  now: number | null | undefined,
  before: number | null | undefined
): Change | null =>
  now === null || now === undefined || before === null || before === undefined
    ? null
    : before === 0
      ? now === 0
        ? { kind: 'percent', value: 0 }
        : { kind: 'new' }
      : { kind: 'percent', value: (now - before) / Math.abs(before) };

/** Доля: разница в процентных пунктах; нет доли у одного из периодов — null. */
export var pointsChange = (
  now: number | null | undefined,
  before: number | null | undefined
): Change | null =>
  now === null || now === undefined || before === null || before === undefined
    ? null
    : { kind: 'points', value: (now - before) * 100 };

const _MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Месяц `ГГГГ-ММ`. */
export var isMonth = (raw: unknown): raw is string =>
  typeof raw === 'string' && _MONTH.test(raw);

/** Месяц через `n` месяцев — как `addMonths` сервера. */
export var addMonths = (month: string, n: number): string =>
  ((index) =>
    `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`)(
    Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + n
  );

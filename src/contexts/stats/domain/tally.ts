import type { Visit } from './visit.ts';

/**
 * Разрез сводки за день. Разрезы посещения (источник, вход, устройство…) считают посетителей и их просмотры;
 * разрезы страницы (адрес, язык страницы) — только просмотры: уникальных по странице статистика не помнит.
 */
export type Dimension =
  | 'total'
  | 'page'
  | 'language'
  | 'source'
  | 'referrer'
  | 'utm_source'
  | 'utm_medium'
  | 'utm_campaign'
  | 'entry'
  | 'device'
  | 'browser_language';

/** Прибавка к строке сводки дня. */
export type Increment = {
  readonly dimension: Dimension;
  readonly value: string;
  readonly visitors: number;
  readonly views: number;
};

/** Разрез целей: всего, по источнику и по странице входа посетителя. */
export type GoalDimension = 'total' | 'source' | 'entry';

export type GoalIncrement = {
  readonly goal: string;
  readonly dimension: GoalDimension;
  readonly value: string;
  /** Посетитель достиг цели впервые за день. */
  readonly visitors: number;
  readonly events: number;
};

/** Посетитель дня: посещение и сколько раз за день он достиг каждой цели. */
export type Visitor = Visit & {
  readonly goals: Readonly<Record<string, number>>;
};

// Пустое значение строки не заводит — кроме источника: пустой источник и есть прямой заход.
const _VISIT: readonly (readonly [Dimension, (visit: Visit) => string])[] = [
  ['source', (_) => _.source],
  ['referrer', (_) => _.referrer],
  ['utm_source', (_) => _.utmSource],
  ['utm_medium', (_) => _.utmMedium],
  ['utm_campaign', (_) => _.utmCampaign],
  ['entry', (_) => _.entry],
  ['device', (_) => _.device],
  ['browser_language', (_) => _.browserLanguage],
];

/** Разрезы посещения: в отчёте у них есть посетители. */
export var VISIT_DIMENSIONS: readonly Dimension[] = _VISIT.map(
  ({ 0: dimension }) => dimension
);

/** Просмотр страницы: всего, сама страница и её язык, разрезы посещения; `fresh` — первый за день. */
export var viewTally = (
  visit: Visit,
  fresh: boolean,
  page: { readonly path: string; readonly language: string }
): Increment[] =>
  ((visitors) => [
    { dimension: 'total', value: '', visitors, views: 1 },
    { dimension: 'page', value: page.path, visitors: 0, views: 1 },
    ...(page.language
      ? [
          {
            dimension: 'language' as const,
            value: page.language,
            visitors: 0,
            views: 1,
          },
        ]
      : []),
    ..._VISIT
      .map(({ 0: dimension, 1: value }) => ({
        dimension,
        value: value(visit),
        visitors,
        views: 1,
      }))
      .filter((_) => _.value !== '' || _.dimension === 'source'),
  ])(fresh ? 1 : 0);

// Повторы одной цели за день у одного посетителя дальше этого не считаются: двойной клик и скрипт,
// шлющий маячок в цикле, не раздувают число.
const _EVENTS_PER_DAY = 20;

/**
 * Посетитель достиг цели: прибавки ко всем разрезам с его источником и входом дня; null — повторов за день
 * уже слишком много.
 */
export var goalTally = (
  visitor: Visitor,
  goal: string
): { readonly visitor: Visitor; readonly increments: GoalIncrement[] } | null =>
  ((count) =>
    count >= _EVENTS_PER_DAY
      ? null
      : {
          visitor: {
            ...visitor,
            goals: { ...visitor.goals, [goal]: count + 1 },
          },
          increments: (
            [
              ['total', ''],
              ['source', visitor.source],
              ['entry', visitor.entry],
            ] as const
          ).map(({ 0: dimension, 1: value }) => ({
            goal,
            dimension,
            value,
            visitors: count === 0 ? 1 : 0,
            events: 1,
          })),
        })(visitor.goals[goal] ?? 0);

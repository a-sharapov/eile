import type { EventBus } from '../../../shared/kernel/events.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import type { StatsEvent } from '../domain/events.ts';
import type {
  Recorder,
  StatsReader,
  StatsSettingsRepository,
  ViewedPage,
} from '../domain/ports.ts';
import {
  dailyOf,
  type GoalKind,
  goalKindOf,
  goalsOf,
  limitOf,
  type OriginRow,
  type Period,
  periodOf,
  previousOf,
  REPORT_DIMENSIONS,
  type ReportQuery,
  type Row,
  type StatsReport,
  topOf,
  type VisitFilter,
  type VisitSums,
} from '../domain/report.ts';
import {
  changeStatsSettings,
  formGoal,
  goGoal,
  linkGoal,
  type StatsSettings,
} from '../domain/settings.ts';
import { VISIT_DIMENSIONS } from '../domain/tally.ts';
import {
  countableBeacon,
  countableGo,
  countableView,
  type Day,
  type GoSources,
  type Header,
  isBot,
  requestSourceOf,
  sourceOfOrigin,
  sourceOfVisit,
  visitOf,
} from '../domain/visit.ts';

/** Запрос посетителя глазами статистики. */
export type VisitRequest = {
  readonly header: Header;
  readonly url: URL;
};

/** Запрос перехода: цель засчитывает только GET. */
export type GoRequest = VisitRequest & { readonly method: string };

/** Названия для подписей целей: заголовки форм и названия переходов по их именам. */
type Names = {
  readonly forms: ReadonlyMap<string, string>;
  readonly links: ReadonlyMap<string, string>;
};

// Цель формы называется заголовком формы, цель ссылки — началом её адреса, цель перехода — его названием;
// у `go:` (любой переход) подписи нет: её даёт экран.
const _LABELS: Readonly<
  Record<GoalKind, (name: string, names: Names) => string>
> = {
  form: (name, _) => _.forms.get(name) ?? name,
  link: (name) => name,
  go: (name, _) => (name === '' ? '' : (_.links.get(name) ?? name)),
};

const _origins = (
  rows: readonly { readonly value: string; readonly visitors: number }[]
): OriginRow[] =>
  rows.map((_) => ({ source: sourceOfOrigin(_.value), visitors: _.visitors }));

export type StatsPorts = {
  readonly settings: StatsSettingsRepository;
  readonly reader: StatsReader;
  readonly recorder: Recorder;
  readonly bus: EventBus;
  /** Адрес сайта из настроек: его хост — свой, переход с него — не источник. */
  readonly siteUrl: () => string;
  /** Формы сайта: заголовок — название цели. */
  readonly forms: () => readonly {
    readonly name: string;
    readonly title: string;
  }[];
  /** Переходы аналитики: название — подпись цели `go:<код>`. */
  readonly links: () => readonly {
    readonly code: string;
    readonly name: string;
  }[];
};

const _hostOf = (url: string): string => URL.parse(url)?.hostname ?? '';

export var defineStatsService = ({
  settings,
  reader,
  recorder,
  bus,
  siteUrl,
  forms,
  links,
}: StatsPorts) => {
  const current = (): StatsSettings => settings.get();

  const own = (request: VisitRequest): string[] =>
    [request.url.hostname, _hostOf(siteUrl())].filter(Boolean);

  const label =
    (names: Names) =>
    (goal: string): string =>
      _LABELS[goalKindOf(goal)](goal.slice(goal.indexOf(':') + 1), names);

  // Посетители периода для аналитики: все, достигшие цели, вошедшие на странице или достигшие её, войдя там.
  const sumsOf = (period: Period, { goal, page }: VisitFilter): VisitSums =>
    goal !== undefined && page !== undefined
      ? {
          total:
            reader.reached(goal, 'entry', period).find((_) => _.value === page)
              ?.visitors ?? 0,
          origins: [],
        }
      : goal !== undefined
        ? {
            total: reader.reached(goal, 'total', period)[0]?.visitors ?? 0,
            origins: _origins(reader.reached(goal, 'origin', period)),
          }
        : page !== undefined
          ? { total: reader.visitors('entry', page, period), origins: [] }
          : {
              total: reader.totals(period).visitors,
              origins: _origins(reader.sums('origin', period)),
            };

  const sums = (period: Period) =>
    Object.fromEntries(
      Object.entries(REPORT_DIMENSIONS).map(({ 0: field, 1: dimension }) => [
        field,
        reader.sums(dimension, period),
      ])
    ) as Record<keyof typeof REPORT_DIMENSIONS, Row[]>;

  const bases = (rows: readonly Row[]): ReadonlyMap<string, number> =>
    new Map(rows.map((_) => [_.value, _.visitors]));

  const build = (
    period: Period,
    limit: number,
    enabled: boolean
  ): StatsReport => {
    const all = sums(period);
    const totals = reader.totals(period);
    return {
      ...period,
      today: recorder.today(),
      since: reader.since('total'),
      enabled,
      totals,
      previous: reader.totals(previousOf(period)),
      daily: dailyOf(period, reader.daily(period)),
      ...(Object.fromEntries(
        Object.entries(all).map(({ 0: field, 1: rows }) => [
          field,
          topOf(
            rows,
            VISIT_DIMENSIONS.includes(
              REPORT_DIMENSIONS[field as keyof typeof REPORT_DIMENSIONS]
            )
              ? 'visitors'
              : 'views',
            limit
          ),
        ])
      ) as Record<keyof typeof REPORT_DIMENSIONS, Row[]>),
      goals: goalsOf(
        reader.goals(period),
        totals.visitors,
        { source: bases(all.sources), entry: bases(all.entries) },
        label({
          forms: new Map(forms().map((_) => [_.name, _.title])),
          links: new Map(links().map((_) => [_.code, _.name])),
        }),
        limit
      ),
    };
  };

  return {
    settings: {
      get: current,
      save: (patch: Readonly<Record<string, unknown>>): StatsSettings =>
        pipe(
          (_: Readonly<Record<string, unknown>>) =>
            changeStatsSettings(current(), _),
          (_) => (
            settings.save(_),
            recorder.configure(_),
            // Маячок стоит в готовом HTML страниц: кэш страниц должен собраться заново.
            bus.publish({
              type: 'stats.settings_changed',
            } satisfies StatsEvent),
            _
          )
        )(patch),
    },
    /** Отчёт за период; буфер счётчика сначала уходит в базу, чтобы цифры были до этой минуты. */
    report: (query: ReportQuery = {}): StatsReport => (
      recorder.flush(),
      build(
        periodOf(query, recorder.today()),
        limitOf(query.limit),
        current().enabled
      )
    ),
    /** Просмотр страницы, если счёт включён и запрос — переход браузера. */
    view: (request: VisitRequest, client: string, page: ViewedPage): void =>
      void (
        current().enabled &&
        countableView(request.header) &&
        recorder.view(
          client,
          request.header('user-agent') ?? '',
          () =>
            visitOf(
              request.header,
              request.url.searchParams,
              page.path,
              own(request)
            ),
          page
        )
      ),
    /** Принятая заявка формы — цель посетителя дня, если он сегодня смотрел страницы. */
    submission: (form: string, client: string, userAgent: string): boolean =>
      current().enabled && recorder.goal(client, userAgent, formGoal(form)),
    /** Переход по ссылке-цели из маячка: только настроенное начало адреса и только от браузера. */
    link: (prefix: string, request: VisitRequest, client: string): boolean =>
      ((options) =>
        options.enabled &&
        options.beacon &&
        options.goalLinks.includes(prefix) &&
        countableBeacon(request.header) &&
        recorder.goal(
          client,
          request.header('user-agent') ?? '',
          linkGoal(prefix)
        ))(current()),
    /**
     * Источники метки перехода `code`: UTM и реферер самого запроса и посещение дня посетителя. Нажатие браузера
     * (GET, не бот, не предзагрузка) посетителя, который сегодня смотрел страницы, засчитывает цели `go:<код>` и
     * `go:`; HEAD и предзагрузка получают то же посещение без цели. Посещение ищется, только пока счёт включён.
     */
    go: (code: string, request: GoRequest, client: string): GoSources =>
      ((options, agent) => ({
        request: requestSourceOf(
          request.header,
          request.url.searchParams,
          own(request)
        ),
        visit:
          options.enabled && !isBot(agent)
            ? ((found) => (found === null ? null : sourceOfVisit(found)))(
                recorder.visit(
                  client,
                  agent,
                  countableGo(request.method, request.header)
                    ? [goGoal(code), goGoal('')]
                    : []
                )
              )
            : null,
      }))(current(), request.header('user-agent') ?? ''),
    /**
     * Посетители периода для аналитики (дни — в поясе статистики): всего и по `origin`; с целью — достигшие её,
     * со страницей — вошедшие на ней. Буфер счётчика сначала уходит в базу, как у отчёта.
     */
    visits: (period: Period, filter: VisitFilter = {}): VisitSums => (
      recorder.flush(), sumsOf(period, filter)
    ),
    /** С какого дня есть сводки посещений и с какого — их `origin` (с обновления, которое его ввело). */
    since: (): {
      readonly visits: Day | null;
      readonly origins: Day | null;
    } => (
      recorder.flush(),
      { visits: reader.since('total'), origins: reader.since('origin') }
    ),
    /** Ссылки-цели маячка; пусто — маячка на страницах нет. */
    beaconLinks: (): readonly string[] =>
      ((options) =>
        options.enabled && options.beacon ? options.goalLinks : [])(current()),
  };
};

export type StatsService = ReturnType<typeof defineStatsService>;

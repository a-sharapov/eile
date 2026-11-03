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
  goalsOf,
  limitOf,
  type Period,
  periodOf,
  previousOf,
  REPORT_DIMENSIONS,
  type ReportQuery,
  type Row,
  type StatsReport,
  topOf,
} from '../domain/report.ts';
import {
  changeStatsSettings,
  formGoal,
  linkGoal,
  type StatsSettings,
} from '../domain/settings.ts';
import { VISIT_DIMENSIONS } from '../domain/tally.ts';
import {
  countableBeacon,
  countableView,
  type Header,
  visitOf,
} from '../domain/visit.ts';

/** Запрос посетителя глазами статистики. */
export type VisitRequest = {
  readonly header: Header;
  readonly url: URL;
};

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
};

const _hostOf = (url: string): string => URL.parse(url)?.hostname ?? '';

export var defineStatsService = ({
  settings,
  reader,
  recorder,
  bus,
  siteUrl,
  forms,
}: StatsPorts) => {
  const current = (): StatsSettings => settings.get();

  const own = (request: VisitRequest): string[] =>
    [request.url.hostname, _hostOf(siteUrl())].filter(Boolean);

  // Цель формы называется заголовком формы, цель ссылки — началом её адреса.
  const label =
    (titles: ReadonlyMap<string, string>) =>
    (goal: string): string =>
      ((name) =>
        goal.startsWith('form:') ? (titles.get(name) ?? name) : name)(
        goal.slice(goal.indexOf(':') + 1)
      );

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
      since: reader.since(),
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
        label(new Map(forms().map((_) => [_.name, _.title]))),
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
    /** Ссылки-цели маячка; пусто — маячка на страницах нет. */
    beaconLinks: (): readonly string[] =>
      ((options) =>
        options.enabled && options.beacon ? options.goalLinks : [])(current()),
  };
};

export type StatsService = ReturnType<typeof defineStatsService>;

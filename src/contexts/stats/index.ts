import type { Database } from '../../platform/database.ts';
import {
  defineStatsService,
  type GoRequest,
  type StatsPorts,
  type VisitRequest,
} from './application/stats-service.ts';
import type { Recorder, ViewedPage } from './domain/ports.ts';
import type { GoSources } from './domain/visit.ts';
import { beaconHtml } from './infrastructure/beacon.ts';
import { defineRecorder } from './infrastructure/recorder.ts';
import {
  defineStatsReader,
  defineStatsSettingsRepository,
  defineStatsStore,
} from './infrastructure/sqlite-stats.ts';
import { defineBeaconHandler } from './interface/beacon-handler.ts';

export type { StatsService } from './application/stats-service.ts';
export type { StatsEvent } from './domain/events.ts';
export type { Recorder } from './domain/ports.ts';
export type {
  GoalKind,
  GoalReport,
  GoalSlice,
  OriginRow,
  Period,
  ReportQuery,
  Row,
  StatsReport,
  VisitFilter,
  VisitSums,
} from './domain/report.ts';
export type { StatsSettings } from './domain/settings.ts';
export type {
  Day,
  GoSources,
  RefererKind,
  VisitSource,
} from './domain/visit.ts';
export { GOAL_PATH } from './infrastructure/beacon.ts';
export {
  STATS_SERVER_TABLES,
  statsMigrations,
} from './infrastructure/migrations.ts';

// Таймер сервера: буфер счётчика — в базу, смена суток — без посетителей тоже.
const _FLUSH_MS = 15_000;

/**
 * Счётчик статистики — один на процесс, как кэш медиатеки: соль дня и буфер прибавок переживают пересборку
 * контекстов. Создаёт его корень приложения и отдаёт каждой сборке `defineStats`.
 */
export var defineStatsRecorder = ({
  db,
  clock,
}: {
  db: Database;
  clock: () => Date;
}) => {
  const recorder = defineRecorder({ store: defineStatsStore(db), clock });
  return {
    ...recorder,
    /** Фон сервера: запись буфера и смена суток по таймеру; остановка пишет остаток. */
    start: (): (() => void) =>
      ((timer) => () => (clearInterval(timer), recorder.flush()))(
        setInterval(recorder.tick, _FLUSH_MS)
      ),
  };
};

export type StatsRecorder = ReturnType<typeof defineStatsRecorder>;

/**
 * Контекст stats: счёт посетителей без cookie, цели, отчёт и маячок ссылок-целей; для аналитики — источники
 * перехода (`go`), посетители периода (`visits`) и с какого дня они есть (`since`).
 */
export var defineStats = ({
  db,
  bus,
  recorder,
  siteUrl,
  forms,
  links,
}: Pick<StatsPorts, 'bus' | 'siteUrl' | 'forms' | 'links'> & {
  db: Database;
  recorder: Recorder;
}) => {
  const service = defineStatsService({
    settings: defineStatsSettingsRepository(db),
    reader: defineStatsReader(db),
    recorder,
    bus,
    siteUrl,
    forms,
    links,
  });
  recorder.configure(service.settings.get());
  return {
    ...service,
    /** Просмотр страницы из ответа сайта. */
    view: (request: Request, client: string, page: ViewedPage): void =>
      service.view(
        {
          header: (name) => request.headers.get(name),
          url: new URL(request.url),
        } satisfies VisitRequest,
        client,
        page
      ),
    /** Источники метки перехода `link` и цели `go:<код>` и `go:` посетителю дня (ADR 0072). */
    go: (link: string, request: Request, client: string): GoSources =>
      service.go(
        link,
        {
          header: (name) => request.headers.get(name),
          url: new URL(request.url),
          method: request.method,
        } satisfies GoRequest,
        client
      ),
    /** Маячок для конца `<body>` страниц; выключен — пусто. */
    beacon: (): string => beaconHtml(service.beaconLinks()),
    handle: defineBeaconHandler(service, siteUrl),
  };
};

export type Stats = ReturnType<typeof defineStats>;

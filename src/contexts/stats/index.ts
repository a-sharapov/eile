import type { Database } from '../../platform/database.ts';
import {
  defineStatsService,
  type StatsPorts,
  type VisitRequest,
} from './application/stats-service.ts';
import type { Recorder, ViewedPage } from './domain/ports.ts';
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
  GoalReport,
  GoalSlice,
  ReportQuery,
  Row,
  StatsReport,
} from './domain/report.ts';
export type { StatsSettings } from './domain/settings.ts';
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

/** Контекст stats: счёт посетителей без cookie, цели, отчёт и маячок ссылок-целей. */
export var defineStats = ({
  db,
  bus,
  recorder,
  siteUrl,
  forms,
}: Pick<StatsPorts, 'bus' | 'siteUrl' | 'forms'> & {
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
    /** Маячок для конца `<body>` страниц; выключен — пусто. */
    beacon: (): string => beaconHtml(service.beaconLinks()),
    handle: defineBeaconHandler(service, siteUrl),
  };
};

export type Stats = ReturnType<typeof defineStats>;

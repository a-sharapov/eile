import type { Database } from '../../../platform/database.ts';
import { DEFAULT_OFFSITE, EMPTY_OFFSITE } from '../domain/offsite.ts';
import type {
  OffsiteRepository,
  UpkeepRepository,
  UpkeepState,
} from '../domain/ports.ts';
import { DEFAULT_SCHEDULE } from '../domain/schedule.ts';

const _EMPTY: UpkeepState = {
  schedule: DEFAULT_SCHEDULE,
  last: null,
  failure: null,
  checkUpdates: true,
  compacted: null,
};

// Одна строка JSON на таблицу: таблица — настройка сервера, в копию сайта не попадает (app.ts `_SERVER_ONLY`).
const _row = (db: Database, table: string) => ({
  get: db.query<{ value: string }, []>(
    `SELECT value FROM ${table} WHERE id = 1`
  ),
  upsert: db.query(`
    INSERT INTO ${table} (id, value, updated_at) VALUES (1, ?, ?)
    ON CONFLICT (id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`),
});

export var defineUpkeepRepository = (db: Database): UpkeepRepository => {
  const { get, upsert } = _row(db, 'upkeep_settings');
  return {
    get: (): UpkeepState =>
      ((row) =>
        row
          ? ((stored) => ({
              ..._EMPTY,
              ...stored,
              schedule: { ...DEFAULT_SCHEDULE, ...stored.schedule },
            }))(JSON.parse(row.value) as UpkeepState)
          : _EMPTY)(get.get()),
    save: (state) =>
      void upsert.run(JSON.stringify(state), new Date().toISOString()),
    exists: () => get.get() !== null,
  };
};

export var defineOffsiteRepository = (db: Database): OffsiteRepository => {
  const { get, upsert } = _row(db, 'upkeep_offsite');
  return {
    get: () =>
      ((row) =>
        row
          ? ((stored) => ({
              ...EMPTY_OFFSITE,
              ...stored,
              settings: { ...DEFAULT_OFFSITE, ...stored.settings },
            }))(JSON.parse(row.value) as typeof EMPTY_OFFSITE)
          : EMPTY_OFFSITE)(get.get()),
    save: (state) =>
      void upsert.run(JSON.stringify(state), new Date().toISOString()),
    exists: () => get.get() !== null,
  };
};

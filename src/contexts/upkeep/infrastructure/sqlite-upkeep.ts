import type { Database } from '../../../platform/database.ts';
import type { UpkeepRepository, UpkeepState } from '../domain/ports.ts';
import { DEFAULT_SCHEDULE } from '../domain/schedule.ts';

const _EMPTY: UpkeepState = {
  schedule: DEFAULT_SCHEDULE,
  last: null,
  failure: null,
  checkUpdates: true,
};

// Одна строка JSON: настройки сервера, в копию сайта не попадают (app.ts `_SERVER_ONLY`).
export var defineUpkeepRepository = (db: Database): UpkeepRepository => {
  const get = db.query<{ value: string }, []>(
    'SELECT value FROM upkeep_settings WHERE id = 1'
  );
  const upsert = db.query(`
    INSERT INTO upkeep_settings (id, value, updated_at) VALUES (1, ?, ?)
    ON CONFLICT (id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
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
  };
};

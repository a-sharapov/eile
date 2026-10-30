import type { Database } from '../../../platform/database.ts';
import type { SettingsRepository } from '../domain/settings-repository.ts';
import {
  DEFAULT_SETTINGS,
  type SiteSettings,
} from '../domain/site-settings.ts';

type SettingRow = { key: string; value: string };

// Строка на настройку, значение в JSON. Неизвестные ключи пропускаются, отсутствующие берутся из умолчаний.
export var defineSettingsRepository = (db: Database): SettingsRepository => {
  const rows = db.query<SettingRow, []>('SELECT key, value FROM site_settings');
  const upsert = db.query(
    'INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'
  );

  return {
    load: () =>
      rows
        .all()
        .reduce<SiteSettings>(
          (settings, row) =>
            row.key in DEFAULT_SETTINGS
              ? { ...settings, [row.key]: JSON.parse(row.value) }
              : settings,
          DEFAULT_SETTINGS
        ),
    save: (settings) =>
      db.transaction(() =>
        Object.entries(settings).forEach(
          ({ 0: key, 1: value }) => void upsert.run(key, JSON.stringify(value))
        )
      )(),
  };
};

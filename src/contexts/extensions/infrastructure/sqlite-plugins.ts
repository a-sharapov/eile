import type { Database, Migration } from '../../../platform/database.ts';
import type { Plugin, PluginName } from '../domain/plugin.ts';
import type { PluginRepository } from '../domain/ports.ts';

export var extensionsMigrations: readonly Migration[] = [
  {
    id: 'extensions/001_plugins',
    sql: `
      CREATE TABLE extensions_plugins (
        name TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        revision INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      ) WITHOUT ROWID;
    `,
  },
];

type PluginRow = {
  name: string;
  source: string;
  enabled: number;
  revision: number;
};

const _toPlugin = (row: PluginRow): Plugin => ({
  name: row.name as PluginName,
  source: row.source,
  enabled: row.enabled === 1,
  revision: row.revision,
});

export var definePluginRepository = (db: Database): PluginRepository => {
  const all = db.query<PluginRow, []>(
    'SELECT name, source, enabled, revision FROM extensions_plugins ORDER BY name'
  );
  const byName = db.query<PluginRow, [string]>(
    'SELECT name, source, enabled, revision FROM extensions_plugins WHERE name = ?'
  );
  const upsert = db.query(`
    INSERT INTO extensions_plugins (name, source, enabled, revision, updated_at)
    VALUES ($name, $source, $enabled, $revision, $now)
    ON CONFLICT (name) DO UPDATE SET
      source = excluded.source, enabled = excluded.enabled,
      revision = excluded.revision, updated_at = excluded.updated_at`);

  const remove = db.query('DELETE FROM extensions_plugins WHERE name = ?');

  return {
    remove: (name) => void remove.run(name),
    all: () => all.all().map(_toPlugin),
    get: (name) => {
      const row = byName.get(name);
      return row && _toPlugin(row);
    },
    save: (plugin) =>
      void upsert.run({
        ...plugin,
        enabled: Number(plugin.enabled),
        now: new Date().toISOString(),
      }),
  };
};

import type { Database } from '../../../platform/database.ts';
import type { Element, ElementKind, ElementName } from '../domain/element.ts';
import type { ElementRepository } from '../domain/element-repository.ts';

type ElementRow = {
  kind: ElementKind;
  name: string;
  source: string;
  revision: number;
};

const _UPSERT = `
  INSERT INTO design_elements (kind, name, source, revision, updated_at)
  VALUES ($kind, $name, $source, $revision, $now)
  ON CONFLICT (kind, name) DO UPDATE SET
    source = excluded.source, revision = excluded.revision,
    updated_at = excluded.updated_at`;

export var defineElementRepository = (db: Database): ElementRepository => {
  const byKey = db.query<ElementRow, [string, string]>(
    'SELECT kind, name, source, revision FROM design_elements WHERE kind = ? AND name = ?'
  );
  const upsert = db.query(_UPSERT);
  const remove = db.query(
    'DELETE FROM design_elements WHERE kind = ? AND name = ?'
  );
  const list = db.query<Omit<ElementRow, 'source'>, []>(
    'SELECT kind, name, revision FROM design_elements ORDER BY kind DESC, name'
  );

  return {
    get: (kind, name) => {
      const row = byKey.get(kind, name);
      return row && { ...row, name: row.name as ElementName };
    },
    list: () => list.all().map((_) => ({ ..._, name: _.name as ElementName })),
    save: (element: Element) =>
      void upsert.run({ ...element, now: new Date().toISOString() }),
    remove: (kind, name) => void remove.run(kind, name),
  };
};

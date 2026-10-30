import type { Database } from '../../../platform/database.ts';
import type {
  Field,
  FieldName,
  FieldType,
  FieldValue,
} from '../domain/field.ts';
import type { FieldRepository } from '../domain/field-repository.ts';

export type FieldRow = {
  name: string;
  label: string;
  type: string;
  options: string;
  default_value: string | null;
  inherit: number;
  templates: string;
};

const _UPSERT = `
  INSERT INTO content_fields
    (name, label, type, options, default_value, inherit, templates)
  VALUES ($name, $label, $type, $options, $defaultValue, $inherit, $templates)
  ON CONFLICT (name) DO UPDATE SET
    label = excluded.label, type = excluded.type, options = excluded.options,
    default_value = excluded.default_value, inherit = excluded.inherit,
    templates = excluded.templates`;

export var toField = (row: FieldRow): Field => ({
  name: row.name as FieldName,
  label: row.label,
  type: row.type as FieldType,
  options: JSON.parse(row.options),
  defaultValue:
    row.default_value === null
      ? null
      : (JSON.parse(row.default_value) as FieldValue),
  inherit: row.inherit === 1,
  templates: JSON.parse(row.templates),
});

export var defineFieldRepository = (db: Database): FieldRepository => {
  const all = db.query<FieldRow, []>(
    'SELECT * FROM content_fields ORDER BY name'
  );
  const byName = db.query<FieldRow, [string]>(
    'SELECT * FROM content_fields WHERE name = ?'
  );
  const upsert = db.query(_UPSERT);
  const removeValues = db.query(
    'DELETE FROM content_field_values WHERE field = ?'
  );
  const removeField = db.query('DELETE FROM content_fields WHERE name = ?');
  const remove = db.transaction((name: string) => {
    removeValues.run(name);
    removeField.run(name);
  });
  const usage = db.query<{ n: number }, [string]>(
    'SELECT count(*) AS n FROM content_field_values WHERE field = ?'
  );

  return {
    remove: (name) => void remove(name),
    usage: (name) => usage.get(name)?.n ?? 0,
    all: () => all.all().map(toField),
    get: (name) => {
      const row = byName.get(name);
      return row && toField(row);
    },
    save: (field) =>
      void upsert.run({
        name: field.name,
        label: field.label,
        type: field.type,
        options: JSON.stringify(field.options),
        defaultValue:
          field.defaultValue === null
            ? null
            : JSON.stringify(field.defaultValue),
        inherit: Number(field.inherit),
        templates: JSON.stringify(field.templates),
      }),
  };
};

import type { Brand } from '../../../shared/kernel/brand.ts';
import { type Changed, changed } from '../../../shared/kernel/changed.ts';
import { fail } from '../../../shared/kernel/errors.ts';
import type { ContentEvent } from './events.ts';

/** camelCase: шаблон обращается к полю как `page.fields.price`. */
export type FieldName = Brand<string, 'FieldName'>;

export type FieldType =
  | 'text'
  | 'richtext'
  | 'number'
  | 'boolean'
  | 'date'
  | 'select'
  | 'image';

export type FieldValue = string | number | boolean;

/** Дополнительное поле страниц (TV в Evo), назначается на шаблоны. */
export type Field = {
  readonly name: FieldName;
  readonly label: string;
  readonly type: FieldType;
  /** Допустимые значения поля `select`. */
  readonly options: readonly string[];
  readonly defaultValue: FieldValue | null;
  /** Нет своего значения — берётся у ближайшего предка (`@INHERIT` в Evo). */
  readonly inherit: boolean;
  readonly templates: readonly string[];
};

export type NewField = {
  readonly name: string;
  readonly label?: string;
  readonly type: string;
  readonly options?: readonly string[];
  readonly defaultValue?: FieldValue | null;
  readonly inherit?: boolean;
  readonly templates?: readonly string[];
};

export var FIELD_TYPES: readonly FieldType[] = [
  'text',
  'richtext',
  'number',
  'boolean',
  'date',
  'select',
  'image',
];

const _NAME = /^[a-z][A-Za-z0-9]{0,63}$/;
// Путь файла медиатеки без `/media/`: `banners/summer.jpg`.
const _MEDIA_PATH = /^[^/\s]\S*$/;
const _DATE = /^\d{4}-\d{2}-\d{2}$/;

// Date нормализует 2026-02-30 в 2 марта: дата верна, только если вернулась той же строкой.
const _sameDay = (value: string, date: Date): boolean =>
  !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);

const _isDate = (value: unknown): boolean =>
  typeof value === 'string' &&
  _DATE.test(value) &&
  _sameDay(value, new Date(`${value}T00:00:00Z`));

const _FITS: {
  readonly [T in FieldType]: (
    value: unknown,
    field: Pick<Field, 'options'>
  ) => boolean;
} = {
  text: (_) => typeof _ === 'string',
  richtext: (_) => typeof _ === 'string',
  number: (_) => typeof _ === 'number' && Number.isFinite(_),
  boolean: (_) => typeof _ === 'boolean',
  date: _isDate,
  select: (_, field) => typeof _ === 'string' && field.options.includes(_),
  image: (_) => typeof _ === 'string' && _MEDIA_PATH.test(_),
};

type FieldShape = Pick<Field, 'name' | 'type' | 'options'>;

export var parseFieldName = (raw: string): FieldName =>
  _NAME.test(raw)
    ? (raw as FieldName)
    : fail(
        'content.invalid_field_name',
        `Field name "${raw}" must be camelCase latin letters and digits`
      );

export var fitsField =
  (field: FieldShape) =>
  (value: unknown): value is FieldValue =>
    _FITS[field.type](value, field);

export var parseFieldValue =
  (field: FieldShape) =>
  (value: unknown): FieldValue =>
    fitsField(field)(value)
      ? value
      : fail(
          'content.invalid_field_value',
          `${field.name}: ${JSON.stringify(value)} is not a valid ${field.type}`
        );

const _type = (raw: string): FieldType =>
  FIELD_TYPES.includes(raw as FieldType)
    ? (raw as FieldType)
    : fail('content.invalid_field_type', `Unknown field type "${raw}"`);

const _options = (type: FieldType, options: readonly string[]) =>
  type === 'select' && options.length === 0
    ? fail('content.invalid_field_options', 'A select field needs options')
    : options;

const _default = (field: FieldShape, value: FieldValue | null) =>
  value === null ? null : parseFieldValue(field)(value);

/** Удаление поля: вместе с описанием уходят его значения на всех страницах. */
export var removeField = (field: Field): Changed<Field, ContentEvent> =>
  changed<Field, ContentEvent>(field, {
    type: 'content.field_removed',
    field: field.name,
  });

/** Создаёт поле или заменяет описание целиком: на уже сохранённые значения это не влияет. */
export var createField = (input: NewField): Changed<Field, ContentEvent> => {
  const name = parseFieldName(input.name);
  const type = _type(input.type);
  const options = _options(type, input.options ?? []);
  return changed<Field, ContentEvent>(
    {
      name,
      label: input.label?.trim() || name,
      type,
      options,
      defaultValue: _default(
        { name, type, options },
        input.defaultValue ?? null
      ),
      inherit: input.inherit ?? false,
      templates: [...new Set(input.templates ?? [])],
    },
    { type: 'content.field_saved', field: name }
  );
};

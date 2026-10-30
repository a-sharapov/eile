import { attempt } from '../../../shared/kernel/errors.ts';

/** Вид поля: тип `<input>`, `textarea`, `select`, группа вариантов, согласие или скрытое поле. */
export type FieldKind =
  | 'text'
  | 'email'
  | 'tel'
  | 'url'
  | 'number'
  | 'date'
  | 'time'
  | 'datetime-local'
  | 'range'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'consent'
  | 'hidden';

export type Option = { readonly value: string; readonly label: string };

/** Поле, каким его описывает HTML формы: правила — атрибуты HTML5, подпись — `data-label` или `<label>`. */
export type FieldSpec = {
  readonly name: string;
  readonly kind: FieldKind;
  readonly label: string;
  readonly required: boolean;
  readonly pattern: string | null;
  readonly min: string | null;
  readonly max: string | null;
  readonly step: string | null;
  readonly minLength: number | null;
  readonly maxLength: number | null;
  /** Несколько значений: группа галочек или `select multiple`. */
  readonly multiple: boolean;
  readonly options: readonly Option[];
  /** Откуда скрытое поле берёт значение: `page.title`, `utm`, `query:ref`… */
  readonly source: string | null;
  /** Свой текст ошибки из `data-message`. */
  readonly message: string | null;
};

/** Значение поля в заявке: ключ и подпись — правка формы не ломает старые заявки. */
export type Value = {
  readonly name: string;
  readonly label: string;
  readonly kind: FieldKind;
  readonly value: string;
};

export type Posted = Readonly<Record<string, readonly string[]>>;

export type Checked = {
  readonly values: Value[];
  /** Имя поля → текст ошибки. */
  readonly errors: Readonly<Record<string, string>>;
};

type Problem =
  | 'required'
  | 'email'
  | 'url'
  | 'number'
  | 'range'
  | 'pattern'
  | 'option'
  | 'short'
  | 'long';

/** Исход отправки целиком, а не одного поля. */
export type Outcome = 'invalid' | 'stale' | 'fast' | 'many';

const _MESSAGES: Readonly<
  Record<string, Readonly<Record<Problem | Outcome, string>>>
> = {
  ru: {
    required: 'Заполните это поле',
    email: 'Нужен адрес почты: name@example.com',
    url: 'Нужен адрес сайта: https://…',
    number: 'Нужно число',
    range: 'Значение вне допустимых границ',
    pattern: 'Значение не подходит по формату',
    option: 'Выберите вариант из списка',
    short: 'Слишком коротко',
    long: 'Слишком длинно',
    invalid: 'Проверьте поля формы',
    stale: 'Форма устарела — отправьте её ещё раз',
    fast: 'Подождите пару секунд и отправьте ещё раз',
    many: 'Слишком много отправок — попробуйте через несколько минут',
  },
  en: {
    required: 'Please fill in this field',
    email: 'Enter an email address: name@example.com',
    url: 'Enter a web address: https://…',
    number: 'Enter a number',
    range: 'The value is out of range',
    pattern: 'The value does not match the format',
    option: 'Choose an option from the list',
    short: 'Too short',
    long: 'Too long',
    invalid: 'Please check the form fields',
    stale: 'The form has expired — please send it again',
    fast: 'Wait a couple of seconds and send it again',
    many: 'Too many submissions — try again in a few minutes',
  },
};

/** Тексты на языке сайта; язык без своего словаря — английский. */
export var messagesFor = (language: string) =>
  _MESSAGES[language.split('-')[0]!.toLowerCase()] ?? _MESSAGES.en!;

// Строка поля без своего предела — не длиннее этого: заявка — не хранилище файлов.
const _LIMITS: Partial<Record<FieldKind, number>> = { textarea: 5000 };
const _DEFAULT_LIMIT = 500;

const _EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
const _DATE: Readonly<Partial<Record<FieldKind, RegExp>>> = {
  date: /^\d{4}-\d{2}-\d{2}$/,
  time: /^\d{2}:\d{2}(?::\d{2})?$/,
  'datetime-local': /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/,
};

// Шаблон HTML5 — целиком, флаг v; неверный шаблон — нет проверки, как в браузере.
const _matches = (pattern: string, value: string): boolean =>
  ((compiled) => compiled === null || compiled.test(value))(
    attempt(
      () => new RegExp(`^(?:${pattern})$`, 'v'),
      () => null
    )
  );

const _url = (value: string): boolean =>
  /^https?:\/\/\S+$/i.test(value) && URL.canParse(value);

const _numberOk = (field: FieldSpec, value: string): boolean =>
  ((number) =>
    Number.isFinite(number) &&
    (field.min === null || number >= Number(field.min)) &&
    (field.max === null || number <= Number(field.max)))(Number(value));

// Даты и время сравниваются строками ISO: так же, как min и max у браузера.
const _dateOk = (field: FieldSpec, value: string): boolean =>
  (_DATE[field.kind]?.test(value) ?? true) &&
  (field.min === null || value >= field.min) &&
  (field.max === null || value <= field.max);

const _CHECKS: Readonly<
  Partial<
    Record<FieldKind, (field: FieldSpec, value: string) => Problem | null>
  >
> = {
  email: (_field, value) => (_EMAIL.test(value) ? null : 'email'),
  url: (_field, value) => (_url(value) ? null : 'url'),
  number: (field, value) =>
    Number.isFinite(Number(value))
      ? _numberOk(field, value)
        ? null
        : 'range'
      : 'number',
  range: (field, value) => (_numberOk(field, value) ? null : 'range'),
  date: (field, value) => (_dateOk(field, value) ? null : 'range'),
  time: (field, value) => (_dateOk(field, value) ? null : 'range'),
  'datetime-local': (field, value) => (_dateOk(field, value) ? null : 'range'),
};

const _chosen = (field: FieldSpec, values: readonly string[]): boolean =>
  field.options.length === 0 ||
  values.every((_) => field.options.some((option) => option.value === _));

/** Что не так с полем; null — всё в порядке. */
const _problem = (
  field: FieldSpec,
  values: readonly string[]
): Problem | null => {
  const value = (values[0] ?? '').trim();
  const limit = field.maxLength ?? _LIMITS[field.kind] ?? _DEFAULT_LIMIT;
  const empty = values.every((_) => _.trim() === '');
  return empty
    ? field.required
      ? 'required'
      : null
    : ['select', 'radio', 'checkbox'].includes(field.kind) &&
        !_chosen(field, values)
      ? 'option'
      : values.some((_) => _.length > limit)
        ? 'long'
        : field.minLength !== null && value.length < field.minLength
          ? 'short'
          : (_CHECKS[field.kind]?.(field, value) ??
            (field.pattern !== null && !_matches(field.pattern, value)
              ? 'pattern'
              : null));
};

const _shown = (field: FieldSpec, values: readonly string[]): string =>
  field.kind === 'consent'
    ? values.length > 0
      ? '✓'
      : ''
    : field.options.length > 0
      ? values
          .map(
            (_) =>
              field.options.find((option) => option.value === _)?.label ?? _
          )
          .join(', ')
      : values.map((_) => _.trim()).join(', ');

/**
 * Значения по описанию полей: лишние поля отбрасываются, у каждого поля — первое значение, у групп —
 * все. Ошибка — текст из `data-message` поля или на языке сайта.
 */
export var checkValues = (
  fields: readonly FieldSpec[],
  posted: Posted,
  language: string
): Checked => {
  const messages = messagesFor(language);
  return fields.reduce<{ values: Value[]; errors: Record<string, string> }>(
    (acc, field) => {
      const raw = (posted[field.name] ?? []).filter((_) => _ !== '');
      const values = field.multiple ? raw : raw.slice(0, 1);
      const problem = field.kind === 'hidden' ? null : _problem(field, values);
      return problem
        ? {
            ...acc,
            errors: {
              ...acc.errors,
              [field.name]: field.message || messages[problem],
            },
          }
        : {
            ...acc,
            values: [
              ...acc.values,
              {
                name: field.name,
                label: field.label,
                kind: field.kind,
                value: _shown(field, values).slice(0, 5000),
              },
            ],
          };
    },
    { values: [], errors: {} }
  );
};

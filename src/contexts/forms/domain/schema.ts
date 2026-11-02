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
  | 'hidden'
  | 'file';

export type Option = { readonly value: string; readonly label: string };

/** Поле показано, только если другое поле заполнено (`values` пуст) или в нём одно из значений. */
export type ShowIf = {
  readonly field: string;
  readonly values: readonly string[];
};

/** Присланный файл без содержимого: проверка смотрит только на имя, тип и размер. */
export type Upload = {
  readonly name: string;
  readonly type: string;
  readonly size: number;
};

/** Файл поля по умолчанию — не больше 10 МБ, а `data-max-size` — не больше 20 МБ. */
export var FILE_LIMITS = {
  size: 10 * 1024 * 1024,
  ceiling: 20 * 1024 * 1024,
  perField: 10,
} as const;

/** `поле` или `поле=значение|значение` из `data-show-if`; пусто — условия нет. */
export var parseShowIf = (raw: string): ShowIf | null =>
  ((text) =>
    text === ''
      ? null
      : ((at) =>
          at < 0
            ? { field: text, values: [] }
            : {
                field: text.slice(0, at).trim(),
                values: text
                  .slice(at + 1)
                  .split('|')
                  .map((_) => _.trim())
                  .filter(Boolean),
              })(text.indexOf('=')))(raw.trim());

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
  /** Условие показа из `data-show-if`: скрытое поле не проверяется и в заявку не идёт. */
  readonly showIf: ShowIf | null;
  /** Файл: допустимые типы из `accept` — `.pdf`, `image/*`, `application/pdf`. */
  readonly accept: readonly string[];
  /** Файл: предел размера в байтах из `data-max-size` (МБ); null — по умолчанию. */
  readonly maxSize: number | null;
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
  | 'long'
  | 'large'
  | 'type';

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
    large: 'Файл слишком большой',
    type: 'Такой файл здесь не подходит',
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
    large: 'The file is too large',
    type: 'This kind of file is not accepted here',
    invalid: 'Please check the form fields',
    stale: 'The form has expired — please send it again',
    fast: 'Wait a couple of seconds and send it again',
    many: 'Too many submissions — try again in a few minutes',
  },
  de: {
    required: 'Bitte füllen Sie dieses Feld aus',
    email: 'Bitte geben Sie eine E-Mail-Adresse ein: name@example.com',
    url: 'Bitte geben Sie eine Webadresse ein: https://…',
    number: 'Bitte geben Sie eine Zahl ein',
    range: 'Der Wert liegt außerhalb des zulässigen Bereichs',
    pattern: 'Der Wert entspricht nicht dem erwarteten Format',
    option: 'Bitte wählen Sie eine Option aus der Liste',
    short: 'Die Eingabe ist zu kurz',
    long: 'Die Eingabe ist zu lang',
    large: 'Die Datei ist zu groß',
    type: 'Dieser Dateityp ist hier nicht zulässig',
    invalid: 'Bitte überprüfen Sie Ihre Angaben im Formular',
    stale: 'Das Formular ist abgelaufen – bitte senden Sie es noch einmal ab',
    fast: 'Bitte warten Sie einen Moment und senden Sie das Formular dann noch einmal ab',
    many: 'Zu viele Anfragen – bitte versuchen Sie es in ein paar Minuten erneut',
  },
};

/** Тексты на языке сайта; язык без своего словаря — английский. */
export var messagesFor = (language: string) =>
  _MESSAGES[language.split('-')[0]!.toLowerCase()] ?? _MESSAGES.en!;

/**
 * Тексты формы для посетителя на языке страницы: кнопки и счётчик шагов (`{n}` — номер, `{m}` — сколько
 * всего), подпись ловушки и ошибки отправки, которые показывает скрипт.
 */
export type FormTexts = {
  readonly next: string;
  readonly back: string;
  readonly progress: string;
  readonly trap: string;
  readonly failed: string;
  readonly offline: string;
  readonly tooLarge: string;
};

const _TEXTS: Readonly<Record<string, FormTexts>> = {
  ru: {
    next: 'Далее',
    back: 'Назад',
    progress: 'Шаг {n} из {m}',
    trap: 'Оставьте пустым',
    failed: 'Не удалось отправить форму.',
    offline: 'Нет связи с сайтом — попробуйте ещё раз.',
    tooLarge: 'Файлы слишком большие для одной заявки.',
  },
  en: {
    next: 'Next',
    back: 'Back',
    progress: 'Step {n} of {m}',
    trap: 'Leave empty',
    failed: 'The form could not be sent.',
    offline: 'No connection to the site. Please try again.',
    tooLarge: 'The files are too large for one submission.',
  },
  de: {
    next: 'Weiter',
    back: 'Zurück',
    progress: 'Schritt {n} von {m}',
    trap: 'Bitte leer lassen',
    failed: 'Das Formular konnte nicht gesendet werden.',
    offline:
      'Keine Verbindung zur Website. Bitte versuchen Sie es noch einmal.',
    tooLarge: 'Die Dateien sind für eine einzelne Anfrage zu groß.',
  },
};

export var formTextsFor = (language: string): FormTexts =>
  _TEXTS[language.split('-')[0]!.toLowerCase()] ?? _TEXTS.en!;

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
// Одно значение поля: длина, формат вида поля и шаблон.
const _valueProblem = (field: FieldSpec, raw: string): Problem | null =>
  ((value) =>
    field.minLength !== null && value.length < field.minLength
      ? 'short'
      : (_CHECKS[field.kind]?.(field, value) ??
        (field.pattern !== null && !_matches(field.pattern, value)
          ? 'pattern'
          : null)))(raw.trim());

// У поля с multiple проверяется каждое значение: иначе второе обходило бы формат и шаблон.
const _problem = (
  field: FieldSpec,
  values: readonly string[]
): Problem | null => {
  const limit = field.maxLength ?? _LIMITS[field.kind] ?? _DEFAULT_LIMIT;
  const empty = values.every((_) => _.trim() === '');
  return empty
    ? field.required
      ? 'required'
      : null
    : ['select', 'radio', 'checkbox'].includes(field.kind)
      ? _chosen(field, values)
        ? null
        : 'option'
      : values.some((_) => _.length > limit)
        ? 'long'
        : values
            .filter((_) => _.trim() !== '')
            .reduce<Problem | null>(
              (found, _) => found ?? _valueProblem(field, _),
              null
            );
};

// Тип из accept: `.pdf` — по имени файла, `image/*` — по началу типа, остальное — тип целиком.
const _accepted = (accept: readonly string[], upload: Upload): boolean =>
  accept.length === 0 ||
  accept.some((_) =>
    _.startsWith('.')
      ? upload.name.toLowerCase().endsWith(_)
      : _.endsWith('/*')
        ? upload.type.toLowerCase().startsWith(_.slice(0, -1))
        : upload.type.toLowerCase() === _
  );

const _fileProblem = (
  field: FieldSpec,
  uploads: readonly Upload[]
): Problem | null =>
  uploads.length === 0
    ? field.required
      ? 'required'
      : null
    : uploads.some((_) => _.size > (field.maxSize ?? FILE_LIMITS.size))
      ? 'large'
      : uploads.some((_) => !_accepted(field.accept, _))
        ? 'type'
        : null;

/** Файлы поля, которые возьмёт заявка: один, если поле не `multiple`, и не больше предела. */
export var uploadsOf = <T extends Upload>(
  field: FieldSpec,
  uploads: readonly T[]
): T[] =>
  uploads
    .filter((_) => _.name !== '' && _.size > 0)
    .slice(0, field.multiple ? FILE_LIMITS.perField : 1);

const _holds = (showIf: ShowIf, values: readonly string[]): boolean =>
  ((given) =>
    showIf.values.length === 0
      ? given.length > 0
      : given.some((_) => showIf.values.includes(_)))(
    values.filter((_) => _.trim() !== '')
  );

/** Значения для условий: у поля-файла — имена приложенных файлов, «показать, если приложили файл». */
export var shownValues = (
  fields: readonly FieldSpec[],
  posted: Posted,
  uploads: Readonly<Record<string, readonly Upload[]>>
): Posted => ({
  ...posted,
  ...Object.fromEntries(
    fields
      .filter((_) => _.kind === 'file')
      .map((_) => [
        _.name,
        uploadsOf(_, uploads[_.name] ?? []).map((upload) => upload.name),
      ])
  ),
});

/**
 * Показано ли поле при этих значениях: условие выполнено, и поле, от которого оно зависит, само
 * показано. Ссылка на поле, которого нет в форме, условия не скрывает — так же поступает скрипт.
 */
export var isShown = (
  fields: readonly FieldSpec[],
  posted: Posted,
  field: FieldSpec,
  seen: ReadonlySet<string> = new Set()
): boolean =>
  field.showIf === null
    ? true
    : seen.has(field.name)
      ? false
      : ((target) =>
          target === undefined ||
          (isShown(fields, posted, target, new Set([...seen, field.name])) &&
            _holds(field.showIf!, posted[field.showIf!.field] ?? [])))(
          fields.find((_) => _.name === field.showIf!.field)
        );

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
 * все. Скрытое условием поле не проверяется и в заявку не идёт. У файла значение — имена файлов. Ошибка —
 * текст из `data-message` поля или на языке сайта.
 */
export var checkValues = (
  fields: readonly FieldSpec[],
  posted: Posted,
  language: string,
  uploads: Readonly<Record<string, readonly Upload[]>> = {}
): Checked => {
  const messages = messagesFor(language);
  const shown = shownValues(fields, posted, uploads);
  return fields.reduce<{ values: Value[]; errors: Record<string, string> }>(
    (acc, field) => {
      const files = uploadsOf(field, uploads[field.name] ?? []);
      const raw =
        field.kind === 'file'
          ? files.map((_) => _.name)
          : (posted[field.name] ?? []).filter((_) => _ !== '');
      const values = field.multiple ? raw : raw.slice(0, 1);
      const problem =
        field.kind === 'hidden'
          ? null
          : field.kind === 'file'
            ? _fileProblem(field, files)
            : _problem(field, values);
      return !isShown(fields, shown, field)
        ? acc
        : problem
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

import {
  attempt,
  fail,
  isDomainError,
  rethrow,
} from '../../../shared/kernel/errors.ts';
import { CODE_LIMITS, isCode } from './codes.ts';
import { isCurrency, isMoney } from './money.ts';
import {
  type EventRole,
  ROLES,
  type RoleFieldKind,
  type RoleSpec,
} from './roles.ts';
import type { EventType, Property, PropertyKind, Setup } from './setup.ts';

/** Откуда событие: приёмник по HTTP или загрузка файла. */
export type EventOrigin = 'http' | 'file';

/** Касание из конверта: метка как пришла и момент в UTC. */
export type Touch = { readonly label: string; readonly at: string };

/** Значение признака; null — признак без значения. */
export type TraitValue = string | number | boolean | null;

/** Разобранный конверт: `at` — UTC с миллисекундами, `traits` и `data` — как пришли, со всеми ключами. */
export type Envelope = {
  readonly id: string;
  readonly type: string;
  readonly at: string;
  readonly subject: string | null;
  readonly test: boolean;
  readonly firstTouch: Touch | null;
  readonly lastTouch: Touch | null;
  readonly traits: Readonly<Record<string, TraitValue>>;
  readonly data: Readonly<Record<string, unknown>>;
};

/** Хранимое событие: роль в нём не пишется — её даёт справочник типов при свёртке. */
export type TrackedEvent = {
  readonly seq: number;
  readonly sender: string;
  readonly envelope: Envelope;
  readonly receivedAt: string;
  readonly origin: EventOrigin;
  /** Тело как пришло. */
  readonly body: string;
  /** SHA-256 канонического JSON тела, base64url: по нему повтор отличают от конфликта. */
  readonly hash: string;
};

/** Ошибки по путям полей: `{ "at": "…", "data.amount": "…" }`; тексты — по-английски. */
export type FieldErrors = Readonly<Record<string, string>>;

/**
 * Проверенное событие: роль — по справочнику типов отправителя (незнакомый тип — null); предупреждения —
 * `unknown_type`, `future`, `invalid_value:<путь>`, `unknown_value:<путь>`.
 */
export type CheckedEvent =
  | {
      readonly ok: true;
      readonly envelope: Envelope;
      readonly role: EventRole | null;
      readonly warnings: readonly string[];
    }
  | { readonly ok: false; readonly errors: FieldErrors };

/** Тело из текста: объект JSON и его канонический JSON для отпечатка. */
export type EventBody =
  | {
      readonly ok: true;
      readonly body: Readonly<Record<string, unknown>>;
      readonly canonical: string;
    }
  | { readonly ok: false; readonly errors: FieldErrors };

export type CheckContext = {
  readonly setup: Setup;
  readonly sender: string;
  /** Время приёма, ISO 8601. */
  readonly now: string;
};

export var EVENT_LIMITS = {
  /** Тело события и строка файла, байт. */
  body: 65_536,
  id: 128,
  subjectMin: 6,
  subject: 128,
  label: 256,
  reference: 128,
  version: 64,
  traits: 20,
  data: 100,
  /** Вложенность тела: глубже его не разобрать без риска переполнить стек. */
  depth: 32,
  /** Событие позже приёма больше чем на час принимается с предупреждением `future`. */
  futureMs: 60 * 60 * 1000,
} as const;

type Input = Readonly<Record<string, unknown>>;

const _ID = /^[A-Za-z0-9._:-]+$/;
const _DIGITS = /^\d+$/;
const _REFERENCE = /^[^\s\p{C}]+$/u;
const _MOMENT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(?:Z|([+-])(\d{2}):(\d{2}))$/;
const _DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const _EARLIEST = '2000-01-01T00:00:00.000Z';
const _LATEST = Date.UTC(10_000, 0, 1);

const _FIELDS = [
  'id',
  'type',
  'at',
  'subject',
  'test',
  'first_touch',
  'last_touch',
  'traits',
  'data',
];
const _TOUCH_FIELDS = ['label', 'at'];

const _ID_RULE = `is 1 to ${EVENT_LIMITS.id} characters A-Z a-z 0-9 . _ : -`;
const _TYPE_RULE = `is a code: a-z 0-9 _ - up to ${CODE_LIMITS.type} characters`;
const _AT_RULE =
  'is ISO 8601 with a time zone (Z or +02:00), not before 2000-01-01';
const _SUBJECT_RULE = `is a pseudonym of ${EVENT_LIMITS.subjectMin} to ${EVENT_LIMITS.subject} characters A-Z a-z 0-9 . _ : -, not only digits: not an email, a phone or a messenger ID`;
const _LABEL_RULE = `is a string up to ${EVENT_LIMITS.label} characters, may be empty`;
const _MONEY_RULE =
  'a decimal string or a number, no more digits after the point than the currency has';

const _isRecord = (raw: unknown): raw is Input =>
  raw !== null && typeof raw === 'object' && !Array.isArray(raw);

// null — как отсутствие поля: так шлют необязательное многие языки (None, nil).
const _absent = (raw: unknown): boolean => raw === undefined || raw === null;

const _rule = (raw: unknown, rule: string): string =>
  _absent(raw) ? 'is required' : rule;

const _length = (text: string): number => [...text].length;

const _calendar = (year: number, month: number, day: number): number | null =>
  ((time) =>
    ((date) =>
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
        ? time
        : null)(new Date(time)))(Date.UTC(year, month - 1, day));

const _offset = (
  sign: string | undefined,
  hours: string | undefined,
  minutes: string | undefined
): number | null =>
  sign === undefined
    ? 0
    : Number(hours) > 23 || Number(minutes) > 59
      ? null
      : (sign === '-' ? -1 : 1) *
        (Number(hours) * 60 + Number(minutes)) *
        60_000;

const _momentOf = (match: RegExpExecArray): string | null =>
  ((day, hours, minutes, seconds, offset) =>
    day === null ||
    offset === null ||
    hours > 23 ||
    minutes > 59 ||
    seconds > 59
      ? null
      : ((time) => (time < _LATEST ? new Date(time).toISOString() : null))(
          day +
            ((hours * 60 + minutes) * 60 + seconds) * 1000 +
            Number((match[7] ?? '').padEnd(3, '0').slice(0, 3)) -
            offset
        ))(
    _calendar(Number(match[1]), Number(match[2]), Number(match[3])),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] ?? 0),
    _offset(match[8], match[9], match[10])
  );

/** Момент ISO 8601 с поясом (`Z` или `+02:00`) → UTC с миллисекундами; null — не момент. */
export var momentOf = (raw: unknown): string | null =>
  typeof raw === 'string'
    ? ((match) => (match === null ? null : _momentOf(match)))(_MOMENT.exec(raw))
    : null;

/** День ГГГГ-ММ-ДД; null — такого дня в календаре нет. */
export var dayOf = (raw: unknown): string | null =>
  typeof raw === 'string'
    ? ((match) =>
        match !== null &&
        _calendar(Number(match[1]), Number(match[2]), Number(match[3])) !== null
          ? raw
          : null)(_DAY.exec(raw))
    : null;

export var isEventId = (raw: unknown): raw is string =>
  typeof raw === 'string' &&
  raw.length >= 1 &&
  raw.length <= EVENT_LIMITS.id &&
  _ID.test(raw);

/**
 * Псевдоним: в разрешённых знаках нет `@`, `+` и пробела, а из одних цифр он не бывает — так не пройдут ни
 * почта, ни телефон, ни номер в мессенджере. HMAC в hex или base64url проходит.
 */
export var isSubject = (raw: unknown): raw is string =>
  typeof raw === 'string' &&
  raw.length >= EVENT_LIMITS.subjectMin &&
  raw.length <= EVENT_LIMITS.subject &&
  _ID.test(raw) &&
  !_DIGITS.test(raw);

export var parseSubject = (raw: unknown): string =>
  isSubject(raw)
    ? raw
    : fail('analytics.invalid_subject', `The subject ${_SUBJECT_RULE}`);

const _canonical = (value: unknown, depth: number): unknown =>
  depth > EVENT_LIMITS.depth
    ? fail(
        'analytics.too_deep',
        `is nested deeper than ${EVENT_LIMITS.depth} levels`
      )
    : Array.isArray(value)
      ? value.map((_) => _canonical(_, depth + 1))
      : _isRecord(value)
        ? Object.fromEntries(
            Object.keys(value)
              .toSorted()
              .map((_) => [_, _canonical(value[_], depth + 1)])
          )
        : value;

/** Канонический JSON: ключи по алфавиту на всех уровнях, без пробелов; глубже 32 уровней — отказ. */
export var canonicalJson = (value: unknown): string =>
  JSON.stringify(_canonical(value, 0));

const _bodyError = (message: string): EventBody => ({
  ok: false,
  errors: { body: message },
});

/** Тело события из текста: объект JSON; иначе — ошибка `body`. */
export var readEventBody = (text: string): EventBody =>
  ((parsed) =>
    _isRecord(parsed)
      ? attempt<EventBody>(
          () => ({ ok: true, body: parsed, canonical: canonicalJson(parsed) }),
          (error) =>
            isDomainError(error) ? _bodyError(error.message) : rethrow(error)
        )
      : _bodyError('is not a JSON object'))(
    attempt(
      () => JSON.parse(text) as unknown,
      () => undefined
    )
  );

type Report = {
  readonly errors: FieldErrors;
  readonly warnings: readonly string[];
};

const _NONE: Report = { errors: {}, warnings: [] };

const _error = (path: string, message: string): Report => ({
  errors: { [path]: message },
  warnings: [],
});

const _warning = (warning: string): Report => ({
  errors: {},
  warnings: [warning],
});

// Первая ошибка пути остаётся: поле роли проверяется раньше одноимённого свойства.
const _merge = (reports: readonly Report[]): Report =>
  reports.reduce<Report>(
    (all, _) => ({
      errors: {
        ...all.errors,
        ...Object.fromEntries(
          Object.entries(_.errors).filter(
            ({ 0: path }) => !Object.hasOwn(all.errors, path)
          )
        ),
      },
      warnings: [...all.warnings, ..._.warnings],
    }),
    _NONE
  );

const _unknownFields = (
  input: Input,
  fields: readonly string[],
  prefix: string,
  what: string
): Report =>
  _merge(
    Object.keys(input)
      .filter((_) => !fields.includes(_))
      .map((_) =>
        _error(
          `${prefix}${_}`,
          `is not a field of ${what}: ${fields.join(', ')}`
        )
      )
  );

const _isValue = (
  setup: Setup,
  dictionary: string | null,
  code: string
): boolean =>
  setup.values.some((_) => _.dictionary === dictionary && _.code === code);

const _isCount = (raw: unknown): boolean =>
  Number.isSafeInteger(raw) && (raw as number) >= 0;

type FieldContext = {
  readonly setup: Setup;
  /** `data.currency`, если это валюта; иначе null. */
  readonly currency: string | null;
};

// Поле роли по виду: ответ — причина отказа, null — годится. Поля роли проверяются строго.
const _ROLE_KINDS: Readonly<
  Record<RoleFieldKind, (raw: unknown, context: FieldContext) => string | null>
> = {
  label: (raw) =>
    typeof raw === 'string' && _length(raw) <= EVENT_LIMITS.label
      ? null
      : _LABEL_RULE,
  code: (raw) =>
    isCode(raw, CODE_LIMITS.value)
      ? null
      : `is a code: a-z 0-9 _ - up to ${CODE_LIMITS.value} characters`,
  text: (raw) => (typeof raw === 'string' ? null : 'is a string'),
  moment: (raw) =>
    momentOf(raw) !== null ? null : 'is ISO 8601 with a time zone',
  amount: (raw, _) =>
    isMoney(raw, _.currency, true)
      ? null
      : `is money above zero: ${_MONEY_RULE}`,
  fee: (raw, _) =>
    isMoney(raw, _.currency, false)
      ? null
      : `is money from zero: ${_MONEY_RULE}`,
  currency: (raw) =>
    isCurrency(raw) ? null : 'is an ISO 4217 currency code: EUR, USD, JPY',
  reference: (raw) =>
    typeof raw === 'string' &&
    raw.length <= EVENT_LIMITS.reference &&
    _REFERENCE.test(raw)
      ? null
      : `is a string of 1 to ${EVENT_LIMITS.reference} characters without spaces`,
  day: (raw) => (dayOf(raw) !== null ? null : 'is a day: YYYY-MM-DD'),
  counts: (raw) =>
    _isRecord(raw) &&
    Object.entries(raw).every(
      ({ 0: type, 1: count }) =>
        isCode(type, CODE_LIMITS.type) && _isCount(count)
    )
      ? null
      : 'is { event type code: whole number from zero }',
  revenue: (raw) =>
    _isRecord(raw) &&
    Object.entries(raw).every(
      ({ 0: currency, 1: money }) =>
        isCurrency(currency) && isMoney(money, currency, false)
    )
      ? null
      : `is { currency: money from zero }: ${_MONEY_RULE}`,
  count: (raw) => (_isCount(raw) ? null : 'is a whole number from zero'),
  version: (raw) =>
    typeof raw === 'string' && _length(raw) <= EVENT_LIMITS.version
      ? null
      : `is a string up to ${EVENT_LIMITS.version} characters`,
};

const _roleReport = (spec: RoleSpec, data: Input, context: FieldContext) =>
  _merge(
    spec.fields.map((field) =>
      _absent(data[field.code])
        ? field.required
          ? _error(`data.${field.code}`, 'is required')
          : _NONE
        : ((problem) =>
            problem === null ? _NONE : _error(`data.${field.code}`, problem))(
            _ROLE_KINDS[field.kind](data[field.code], context)
          )
    )
  );

// Вопрос — справочник ответов, ответ — его значение; иначе событие принято, а вопрос или ответ — незнакомые.
const _surveyReport = (data: Input, context: FieldContext): Report =>
  !isCode(data.question, CODE_LIMITS.value) ||
  !isCode(data.answer, CODE_LIMITS.value)
    ? _NONE
    : !context.setup.dictionaries.some(
          (_) => _.code === data.question && _.purpose === 'answers'
        )
      ? _warning('unknown_value:data.question')
      : _isValue(context.setup, data.question, data.answer)
        ? _NONE
        : _warning('unknown_value:data.answer');

const _ROLE_EXTRA: Partial<
  Record<EventRole, (data: Input, context: FieldContext) => Report>
> = { survey: _surveyReport };

const _SUBJECT_RULES: Readonly<
  Record<RoleSpec['subject'], (subject: string | null) => Report>
> = {
  required: (subject) =>
    subject === null
      ? _error('subject', 'is required for this event type')
      : _NONE,
  forbidden: (subject) =>
    subject === null
      ? _NONE
      : _error('subject', 'is not sent with a summary: it counts a day'),
};

/** Значение по виду свойства: `unknown` — код вне справочника, его принимают с предупреждением. */
export type Verdict = 'valid' | 'invalid' | 'unknown';

const _PROPERTY_KINDS: Readonly<
  Record<
    PropertyKind,
    (raw: unknown, property: Property, context: FieldContext) => Verdict
  >
> = {
  string: (raw) => (typeof raw === 'string' ? 'valid' : 'invalid'),
  number: (raw) => (typeof raw === 'number' ? 'valid' : 'invalid'),
  money: (raw, _property, context) =>
    context.currency !== null && isMoney(raw, context.currency, false)
      ? 'valid'
      : 'invalid',
  date: (raw) =>
    dayOf(raw) !== null || momentOf(raw) !== null ? 'valid' : 'invalid',
  boolean: (raw) => (typeof raw === 'boolean' ? 'valid' : 'invalid'),
  choice: (raw, property, context) =>
    !isCode(raw, CODE_LIMITS.value)
      ? 'invalid'
      : _isValue(context.setup, property.dictionary, raw)
        ? 'valid'
        : 'unknown',
};

const _KIND_RULES: Readonly<Record<PropertyKind, string>> = {
  string: 'is a string',
  number: 'is a number',
  money: `is money from zero in data.currency: ${_MONEY_RULE}`,
  date: 'is a date: YYYY-MM-DD or ISO 8601 with a time zone',
  boolean: 'is true or false',
  choice: `is a code: a-z 0-9 _ - up to ${CODE_LIMITS.value} characters`,
};

// Обязательное свойство с негодным значением роняет событие; необязательное — нет: оно принято, а значение
// в разрезы и свёртку не идёт. Выбор вне справочника принят и в том, и в другом случае.
const _VERDICTS: Readonly<
  Record<
    Verdict,
    (path: string, property: Property, required: boolean) => Report
  >
> = {
  valid: () => _NONE,
  invalid: (path, property, required) =>
    required
      ? _error(path, _KIND_RULES[property.kind])
      : _warning(`invalid_value:${path}`),
  unknown: (path) => _warning(`unknown_value:${path}`),
};

const _valueReport = (
  path: string,
  raw: unknown,
  property: Property,
  required: boolean,
  context: FieldContext
): Report =>
  _absent(raw)
    ? required
      ? _error(path, 'is required')
      : _NONE
    : _VERDICTS[_PROPERTY_KINDS[property.kind](raw, property, context)](
        path,
        property,
        required
      );

const _propertiesReport = (
  type: EventType,
  data: Input,
  context: FieldContext
): Report =>
  _merge(
    type.properties.map((entry) =>
      ((property) =>
        property === undefined
          ? _NONE
          : _valueReport(
              `data.${entry.code}`,
              data[entry.code],
              property,
              entry.required,
              context
            ))(
        context.setup.properties.find(
          (_) => _.scope === 'event' && _.code === entry.code
        )
      )
    )
  );

// Признаки: объявленные — по виду, как необязательные свойства; необъявленные сохраняются как пришли.
const _traitsReport = (traits: Input, context: FieldContext): Report =>
  Object.keys(traits).length > EVENT_LIMITS.traits
    ? _error('traits', `is an object of up to ${EVENT_LIMITS.traits} traits`)
    : _merge(
        Object.entries(traits).map(({ 0: key, 1: value }) =>
          !isCode(key, CODE_LIMITS.property)
            ? _error(
                `traits.${key}`,
                `the key is a code: a-z 0-9 _ - up to ${CODE_LIMITS.property} characters`
              )
            : !_absent(value) &&
                typeof value !== 'string' &&
                typeof value !== 'number' &&
                typeof value !== 'boolean'
              ? _error(`traits.${key}`, 'is a string, a number or true/false')
              : ((property) =>
                  property === undefined
                    ? _NONE
                    : _valueReport(
                        `traits.${key}`,
                        value,
                        property,
                        false,
                        context
                      ))(
                  context.setup.properties.find(
                    (_) => _.scope === 'person' && _.code === key
                  )
                )
        )
      );

const _touchReport = (raw: unknown, path: string): Report =>
  _absent(raw)
    ? _NONE
    : _isRecord(raw)
      ? _merge([
          _unknownFields(raw, _TOUCH_FIELDS, `${path}.`, 'a touch'),
          typeof raw.label === 'string' &&
          _length(raw.label) <= EVENT_LIMITS.label
            ? _NONE
            : _error(`${path}.label`, _LABEL_RULE),
          ((at) =>
            at !== null && at >= _EARLIEST
              ? _NONE
              : _error(`${path}.at`, _AT_RULE))(momentOf(raw.at)),
        ])
      : _error(path, 'is { label, at }: the label of a link and its moment');

const _touchOf = (raw: unknown): Touch | null =>
  _isRecord(raw)
    ? { label: raw.label as string, at: momentOf(raw.at) as string }
    : null;

const _recordOr = (raw: unknown, empty: Input): Input | null =>
  _absent(raw) ? empty : _isRecord(raw) ? raw : null;

const _fieldsOf = (setup: Setup, data: Input): FieldContext => ({
  setup,
  currency: isCurrency(data.currency) ? data.currency : null,
});

/**
 * Годятся ли поля роли в `data` по её нынешним правилам: свёртка так узнаёт событие, принятое под другой
 * ролью. Псевдоним у события свёртки есть всегда — роль, где он запрещён, ему не годится.
 */
export var fitsRole = (role: EventRole, data: Input, setup: Setup): boolean =>
  ((spec, context) =>
    spec.subject === 'required' &&
    spec.fields.every((field) =>
      _absent(data[field.code])
        ? !field.required
        : _ROLE_KINDS[field.kind](data[field.code], context) === null
    ))(ROLES[role], _fieldsOf(setup, data));

/** Значение свойства или признака по его виду; валюта денег — `data.currency` того же события. */
export var verdictOf = (
  property: Property,
  raw: unknown,
  setup: Setup,
  data: Input
): Verdict =>
  _PROPERTY_KINDS[property.kind](raw, property, _fieldsOf(setup, data));

/**
 * Годно ли значение по виду свойства — не `invalid` у `verdictOf`. Выбор вне справочника годен, поэтому
 * справочник не просматривается: свёртке он не нужен, а значений в нём бывает тысячи.
 */
export var fitsKind = (
  property: Property,
  raw: unknown,
  setup: Setup,
  data: Input
): boolean =>
  property.kind === 'choice'
    ? isCode(raw, CODE_LIMITS.value)
    : verdictOf(property, raw, setup, data) !== 'invalid';

/**
 * Проверка события по снимку настройки, все ошибки сразу: конверт, роль типа и её поля, свойства типа,
 * признаки, опрос. Незнакомый тип проверяется только как конверт. Лишнее поле конверта — ошибка: опечатка
 * в имени не должна молча терять человека.
 */
export var checkEvent = (body: Input, context: CheckContext): CheckedEvent => {
  const at = momentOf(body.at);
  const type = isCode(body.type, CODE_LIMITS.type) ? body.type : null;
  const subject = _absent(body.subject)
    ? null
    : isSubject(body.subject)
      ? body.subject
      : undefined;
  const data = _recordOr(body.data, {});
  const traits = _recordOr(body.traits, {});
  const known =
    type === null
      ? null
      : (context.setup.types.find(
          (_) => _.sender === context.sender && _.code === type
        ) ?? null);
  const role = known?.role ?? null;
  const fields: FieldContext = {
    setup: context.setup,
    currency: ((_) => (isCurrency(_) ? _ : null))(data?.currency),
  };
  const report = _merge([
    _unknownFields(body, _FIELDS, '', 'the envelope'),
    isEventId(body.id) ? _NONE : _error('id', _rule(body.id, _ID_RULE)),
    type === null ? _error('type', _rule(body.type, _TYPE_RULE)) : _NONE,
    at !== null && at >= _EARLIEST
      ? _NONE
      : _error('at', _rule(body.at, _AT_RULE)),
    subject === undefined ? _error('subject', _SUBJECT_RULE) : _NONE,
    _absent(body.test) || typeof body.test === 'boolean'
      ? _NONE
      : _error('test', 'is true or false'),
    _touchReport(body.first_touch, 'first_touch'),
    _touchReport(body.last_touch, 'last_touch'),
    data === null || Object.keys(data).length > EVENT_LIMITS.data
      ? _error('data', `is an object of up to ${EVENT_LIMITS.data} keys`)
      : _NONE,
    traits === null
      ? _error('traits', `is an object of up to ${EVENT_LIMITS.traits} traits`)
      : _NONE,
    type !== null && known === null ? _warning('unknown_type') : _NONE,
    at !== null &&
    Date.parse(at) - Date.parse(context.now) > EVENT_LIMITS.futureMs
      ? _warning('future')
      : _NONE,
    role === null || subject === undefined
      ? _NONE
      : _SUBJECT_RULES[ROLES[role].subject](subject),
    role === null || data === null
      ? _NONE
      : _merge([
          _roleReport(ROLES[role], data, fields),
          (_ROLE_EXTRA[role] ?? (() => _NONE))(data, fields),
        ]),
    known === null || data === null
      ? _NONE
      : _propertiesReport(known, data, fields),
    traits === null ? _NONE : _traitsReport(traits, fields),
  ]);
  return Object.keys(report.errors).length > 0
    ? { ok: false, errors: report.errors }
    : {
        ok: true,
        role,
        warnings: report.warnings,
        envelope: {
          id: body.id as string,
          type: type as string,
          at: at as string,
          subject: subject ?? null,
          test: body.test === true,
          firstTouch: _touchOf(body.first_touch),
          lastTouch: _touchOf(body.last_touch),
          traits: traits as Readonly<Record<string, TraitValue>>,
          data: data as Input,
        },
      };
};

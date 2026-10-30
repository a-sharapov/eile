import type { Brand } from '../../../shared/kernel/brand.ts';
import { type Changed, changed } from '../../../shared/kernel/changed.ts';
import { fail } from '../../../shared/kernel/errors.ts';

/** Имя формы латиницей: в теге `[#Form:callback]` и в адресе приёма. */
export type FormName = Brand<string, 'FormName'>;

export type Moment = string;

/** Канал уведомлений о заявке; список — у контекста notify. */
export type Channel = 'telegram' | 'email';

/**
 * Форма как в eForm: исходник — обычный HTML, правила полей — атрибуты HTML5 (`required`, `type`,
 * `pattern`, `min`/`max`, `maxlength`). Сервер проверяет заявку по тем же атрибутам, что и браузер.
 */
export type Form = {
  readonly name: FormName;
  readonly title: string;
  readonly source: string;
  readonly submitLabel: string;
  /** Текст после отправки, если нет страницы «Спасибо». */
  readonly successText: string;
  readonly successPage: number | null;
  /** Заголовок уведомления: `{form}` — название формы, `{имя}` — значение поля. */
  readonly subject: string;
  /** Свои каналы уведомлений; null — как в настройках уведомлений. */
  readonly channels: readonly Channel[] | null;
  /** Сколько дней хранить заявки. */
  readonly retentionDays: number;
  /** Быстрее — не человек: заявка не принимается. */
  readonly minSeconds: number;
  /** Ссылки в полях — не спам (форма для партнёров, портфолио). */
  readonly allowLinks: boolean;
  /** Метка для аналитики: уходит в событие `cms:form-sent`. */
  readonly goal: string;
  readonly revision: number;
  readonly createdAt: Moment;
  readonly updatedAt: Moment;
};

export type FormInput = Partial<
  Omit<Form, 'name' | 'revision' | 'createdAt' | 'updatedAt'>
>;

export type FormsEvent =
  | {
      readonly type: 'forms.form_saved' | 'forms.form_removed';
      readonly name: FormName;
    }
  | {
      readonly type:
        | 'forms.submission_received'
        | 'forms.submission_changed'
        | 'forms.submission_removed';
      readonly submissionId: number;
      readonly form: string;
    };

export type FormChange = Changed<Form, FormsEvent>;

const _NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const _MAX_SOURCE = 100 * 1024;
const _CHANNELS: readonly Channel[] = ['telegram', 'email'];

/** Ловушка для ботов: поле, которого люди не видят и не заполняют. */
export var HONEYPOT = 'company_website';

export var DEFAULTS = {
  submitLabel: 'Отправить',
  successText: 'Спасибо! Заявка отправлена — скоро свяжемся.',
  subject: 'Заявка: {form}',
  retentionDays: 30,
  minSeconds: 3,
} as const;

export var parseFormName = (raw: string): FormName =>
  _NAME.test(raw)
    ? (raw as FormName)
    : fail(
        'forms.invalid_name',
        `Form name "${raw}" is lowercase latin letters, digits and hyphens`
      );

const _text = (value: unknown, max: number, code: string): string =>
  ((text) =>
    text.length <= max ? text : fail(code, `Longer than ${max} characters`))(
    typeof value === 'string' ? value.trim() : ''
  );

const _int = (value: unknown, low: number, high: number, code: string) =>
  ((number) =>
    Number.isInteger(number) && number >= low && number <= high
      ? number
      : fail(code, `A whole number from ${low} to ${high}`))(Number(value));

const _page = (value: unknown): number | null =>
  value === null || value === undefined || value === ''
    ? null
    : _int(value, 1, Number.MAX_SAFE_INTEGER, 'forms.invalid_page');

const _channels = (value: unknown): readonly Channel[] | null =>
  value === null || value === undefined
    ? null
    : Array.isArray(value)
      ? _CHANNELS.filter((_) => value.includes(_))
      : fail('forms.invalid_channels', 'Channels are a list');

// Пустое поле формы менеджера — умолчание: у каждой формы есть кнопка, текст «Спасибо» и тема.
const _settings = (input: FormInput, base: Form | null) => ({
  title:
    _text(input.title ?? base?.title, 200, 'forms.invalid_title') ||
    fail('forms.invalid_title', 'The title is required'),
  source: ((source) =>
    source.length > _MAX_SOURCE
      ? fail('forms.source_too_large', `Over ${_MAX_SOURCE} characters`)
      : source)(String(input.source ?? base?.source ?? '')),
  submitLabel:
    _text(input.submitLabel ?? base?.submitLabel, 100, 'forms.invalid_text') ||
    DEFAULTS.submitLabel,
  successText:
    _text(input.successText ?? base?.successText, 1000, 'forms.invalid_text') ||
    DEFAULTS.successText,
  successPage:
    input.successPage === undefined
      ? (base?.successPage ?? null)
      : _page(input.successPage),
  subject:
    _text(input.subject ?? base?.subject, 200, 'forms.invalid_text') ||
    DEFAULTS.subject,
  channels:
    input.channels === undefined
      ? (base?.channels ?? null)
      : _channels(input.channels),
  retentionDays: _int(
    input.retentionDays ?? base?.retentionDays ?? DEFAULTS.retentionDays,
    1,
    3650,
    'forms.invalid_retention'
  ),
  minSeconds: _int(
    input.minSeconds ?? base?.minSeconds ?? DEFAULTS.minSeconds,
    0,
    60,
    'forms.invalid_seconds'
  ),
  allowLinks: Boolean(input.allowLinks ?? base?.allowLinks ?? false),
  goal: _text(input.goal ?? base?.goal, 100, 'forms.invalid_text'),
});

export var createForm = (
  name: FormName,
  input: FormInput,
  now: Moment
): FormChange =>
  changed<Form, FormsEvent>(
    {
      name,
      ..._settings(input, null),
      revision: 1,
      createdAt: now,
      updatedAt: now,
    },
    { type: 'forms.form_saved', name }
  );

export var editForm =
  (input: FormInput, now: Moment) =>
  (form: Form): FormChange =>
    ((next) =>
      JSON.stringify({ ...form, updatedAt: '', revision: 0 }) ===
      JSON.stringify({ ...next, updatedAt: '', revision: 0 })
        ? changed<Form, FormsEvent>(form)
        : changed<Form, FormsEvent>(
            { ...next, revision: form.revision + 1, updatedAt: now },
            { type: 'forms.form_saved', name: form.name }
          ))({ ...form, ..._settings(input, form) });

export var removeForm = (form: Form): FormChange =>
  changed<Form, FormsEvent>(form, {
    type: 'forms.form_removed',
    name: form.name,
  });

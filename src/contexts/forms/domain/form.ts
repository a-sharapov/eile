import type { Brand } from '../../../shared/kernel/brand.ts';
import { type Changed, changed } from '../../../shared/kernel/changed.ts';
import { fail } from '../../../shared/kernel/errors.ts';
import { PROOF_DEFAULTS, type ProofLevel, parseProofLevel } from './proof.ts';
import { parseWebhookUrl } from './webhook.ts';

/** Имя формы латиницей: в теге `[#Form:callback]` и в адресе приёма. */
export type FormName = Brand<string, 'FormName'>;

export type Moment = string;

/** Канал уведомлений о заявке; список — у контекста notify. */
export type Channel = 'telegram' | 'email';

/** Письмо отправителю: подтверждение на адрес из заявки. */
export type Confirmation = {
  readonly enabled: boolean;
  /** Имя поля с адресом; пусто — первое поле type=email. */
  readonly field: string;
  /** Тема и текст письма: `{form}` — название формы, `{имя поля}` — его значение. */
  readonly subject: string;
  readonly text: string;
};

/** Вебхук формы: каждая принятая заявка уходит JSON-ом на адрес, подписанная секретом. */
export type Webhook = {
  /** https://…; пусто — вебхука нет. */
  readonly url: string;
  /** Ключ подписи `X-Eile-Signature`; выдаёт его сервер, а не тот, кто сохраняет форму. */
  readonly secret: string;
};

export var NO_CONFIRMATION: Confirmation = {
  enabled: false,
  field: '',
  subject: '',
  text: '',
};

export var NO_WEBHOOK: Webhook = { url: '', secret: '' };

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
  /** Доказательство работы в браузере: выключено или сложность задачи (ADR 0053). */
  readonly proof: ProofLevel;
  /** Метка для аналитики: уходит в событие `cms:form-sent`. */
  readonly goal: string;
  readonly confirmation: Confirmation;
  readonly webhook: Webhook;
  readonly revision: number;
  readonly createdAt: Moment;
  readonly updatedAt: Moment;
};

export type FormInput = Partial<
  Omit<
    Form,
    'name' | 'revision' | 'createdAt' | 'updatedAt' | 'confirmation' | 'webhook'
  >
> & {
  readonly confirmation?: Partial<Confirmation>;
  /** Адрес вебхука; `renew` — выдать новый секрет. Сам секрет приходит только с сервера. */
  readonly webhook?: { readonly url?: string; readonly renew?: boolean };
};

/** Что форма берёт у сайта при сохранении: язык текстов по умолчанию и свежий секрет для вебхука. */
export type FormSetup = { readonly language: string; readonly secret: string };

export type FormsEvent =
  | {
      readonly type: 'forms.form_saved' | 'forms.form_removed';
      readonly name: FormName;
    }
  | {
      readonly type: 'forms.submission_changed' | 'forms.submission_removed';
      readonly submissionId: number;
      readonly form: string;
    }
  | {
      readonly type: 'forms.submission_received';
      readonly submissionId: number;
      readonly form: string;
      /** Значения по именам полей: плагин передаст заявку дальше. Шина в памяти — событие нигде не хранится. */
      readonly values: Readonly<Record<string, string>>;
      /** Подписи значений скрытых полей с `data-labels`: в `values` у них ключ, как пришёл. */
      readonly labels: Readonly<Record<string, string>>;
      /** Спам тоже сохраняется и приходит сюда: дальше его передавать не нужно. */
      readonly spam: boolean;
    };

export type FormChange = Changed<Form, FormsEvent>;

const _NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const _MAX_SOURCE = 100 * 1024;
const _CHANNELS: readonly Channel[] = ['telegram', 'email'];

/** Ловушка для ботов: поле, которого люди не видят и не заполняют. */
export var HONEYPOT = 'company_website';

export var DEFAULTS = {
  retentionDays: 30,
  minSeconds: 3,
} as const;

/** Тексты формы, которые посетитель или менеджер видят, если в настройке пусто. */
export type FormDefaults = {
  readonly submitLabel: string;
  readonly successText: string;
  readonly subject: string;
};

const _DEFAULT_TEXTS: Readonly<Record<string, FormDefaults>> = {
  ru: {
    submitLabel: 'Отправить',
    successText: 'Спасибо! Заявка отправлена — скоро свяжемся.',
    subject: 'Заявка: {form}',
  },
  en: {
    submitLabel: 'Send',
    successText:
      'Thank you! Your message has been sent. We will be in touch soon.',
    subject: 'Submission: {form}',
  },
  de: {
    submitLabel: 'Absenden',
    successText:
      'Vielen Dank! Ihre Anfrage wurde gesendet. Wir melden uns in Kürze bei Ihnen.',
    subject: 'Anfrage: {form}',
  },
};

/** Тексты по умолчанию на языке сайта; язык без своих текстов — английский, как ошибки полей. */
export var defaultsFor = (language: string): FormDefaults =>
  _DEFAULT_TEXTS[language.split('-')[0]!.toLowerCase()] ?? _DEFAULT_TEXTS.en!;

const _SETUP: FormSetup = { language: 'ru', secret: '' };

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

const _object = (value: unknown, code: string): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fail(code, 'Expected an object');

// Включённое письмо без текста ушло бы пустым: текст обязателен, тема по умолчанию — название формы.
const _confirmation = (value: unknown, base: Confirmation): Confirmation =>
  value === undefined || value === null
    ? base
    : ((input) =>
        ((next) =>
          next.enabled && next.text === ''
            ? fail(
                'forms.invalid_confirmation',
                'The confirmation email needs a text'
              )
            : next)({
          enabled: Boolean(input.enabled ?? base.enabled),
          field: _text(
            input.field ?? base.field,
            100,
            'forms.invalid_confirmation'
          ),
          subject: _text(
            input.subject ?? base.subject,
            200,
            'forms.invalid_text'
          ),
          text: _text(input.text ?? base.text, 5000, 'forms.invalid_text'),
        }))(_object(value, 'forms.invalid_confirmation'));

// Секрет выдаётся вместе с первым адресом и по просьбе `renew`; без адреса прежний секрет сохраняется.
const _webhook = (value: unknown, base: Webhook, secret: string): Webhook =>
  value === undefined || value === null
    ? base
    : ((input) =>
        ((url) => ({
          url,
          secret:
            url !== '' && (input.renew === true || base.secret === '')
              ? secret ||
                fail('forms.invalid_webhook', 'No secret for the webhook')
              : base.secret,
        }))(input.url === undefined ? base.url : parseWebhookUrl(input.url)))(
        _object(value, 'forms.invalid_webhook')
      );

// Пустое поле формы менеджера — умолчание: у каждой формы есть кнопка, текст «Спасибо» и тема.
const _settings = (input: FormInput, base: Form | null, setup: FormSetup) => ({
  title:
    _text(input.title ?? base?.title, 200, 'forms.invalid_title') ||
    fail('forms.invalid_title', 'The title is required'),
  source: ((source) =>
    source.length > _MAX_SOURCE
      ? fail('forms.source_too_large', `Over ${_MAX_SOURCE} characters`)
      : source)(String(input.source ?? base?.source ?? '')),
  submitLabel:
    _text(input.submitLabel ?? base?.submitLabel, 100, 'forms.invalid_text') ||
    defaultsFor(setup.language).submitLabel,
  successText:
    _text(input.successText ?? base?.successText, 1000, 'forms.invalid_text') ||
    defaultsFor(setup.language).successText,
  successPage:
    input.successPage === undefined
      ? (base?.successPage ?? null)
      : _page(input.successPage),
  subject:
    _text(input.subject ?? base?.subject, 200, 'forms.invalid_text') ||
    defaultsFor(setup.language).subject,
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
  proof:
    input.proof === undefined
      ? (base?.proof ?? PROOF_DEFAULTS.created)
      : parseProofLevel(input.proof),
  goal: _text(input.goal ?? base?.goal, 100, 'forms.invalid_text'),
  confirmation: _confirmation(
    input.confirmation,
    base?.confirmation ?? NO_CONFIRMATION
  ),
  webhook: _webhook(input.webhook, base?.webhook ?? NO_WEBHOOK, setup.secret),
});

export var createForm = (
  name: FormName,
  input: FormInput,
  now: Moment,
  setup: FormSetup = _SETUP
): FormChange =>
  changed<Form, FormsEvent>(
    {
      name,
      ..._settings(input, null, setup),
      revision: 1,
      createdAt: now,
      updatedAt: now,
    },
    { type: 'forms.form_saved', name }
  );

export var editForm =
  (input: FormInput, now: Moment, setup: FormSetup = _SETUP) =>
  (form: Form): FormChange =>
    ((next) =>
      JSON.stringify({ ...form, updatedAt: '', revision: 0 }) ===
      JSON.stringify({ ...next, updatedAt: '', revision: 0 })
        ? changed<Form, FormsEvent>(form)
        : changed<Form, FormsEvent>(
            { ...next, revision: form.revision + 1, updatedAt: now },
            { type: 'forms.form_saved', name: form.name }
          ))({ ...form, ..._settings(input, form, setup) });

export var removeForm = (form: Form): FormChange =>
  changed<Form, FormsEvent>(form, {
    type: 'forms.form_removed',
    name: form.name,
  });

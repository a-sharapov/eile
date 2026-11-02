import { fail } from '../../../shared/kernel/errors.ts';
import type { Confirmation, Form } from './form.ts';
import type { FieldSpec, Value } from './schema.ts';

/** Письмо отправителю: адрес из заявки, тема и текст без разметки. */
export type Letter = {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
};

/** Кому и когда уже ушло письмо: «форма|адрес» → момент в мс. */
export type ConfirmationLog = ReadonlyMap<string, number>;

/**
 * Одно письмо на адрес с формы за 10 минут: иначе форма стала бы рассылкой на чужие адреса. Журнал живёт в
 * памяти процесса, как лимит отправок с адреса.
 */
export var CONFIRMATION_WINDOW_MS = 10 * 60 * 1000;

// Строже поля type=email: один адрес, без скобок, кавычек и пробелов — ни второго получателя, ни заголовка.
const _ADDRESS =
  /^[^\s@<>()[\]\\,;:"']{1,64}@[^\s@<>()[\]\\,;:"']+\.[^\s@<>()[\]\\,;:"']+$/u;

// Управляющие символы и переключатели направления текста: заголовок письма и подмена видимого текста.
const _CONTROL = /[\p{Cc}\p{Zl}\p{Zp}\p{Bidi_Control}]/gu;

/** Поле с адресом отправителя: названное в настройке или первое поле почты. */
export var addressField = (
  fields: readonly FieldSpec[],
  confirmation: Confirmation
): FieldSpec | null =>
  (confirmation.field
    ? fields.find((_) => _.name === confirmation.field)
    : fields.find((_) => _.kind === 'email')) ?? null;

/** Включённое письмо без поля для адреса — ошибка настройки: письмо некому было бы слать. */
export var assertConfirmation = (
  fields: readonly FieldSpec[],
  confirmation: Confirmation
): Confirmation =>
  !confirmation.enabled || addressField(fields, confirmation)
    ? confirmation
    : fail(
        'forms.invalid_confirmation',
        confirmation.field
          ? `The form has no field "${confirmation.field}" for the address`
          : 'The form has no email field for the address'
      );

// Значение посетителя в письме: в теме — одной строкой, в тексте — переводы строк остаются.
const _clean = (value: string, oneLine: boolean): string =>
  ((text) => (oneLine ? text.replace(/\n/g, ' ') : text))(
    value
      .replace(/\r\n?/g, '\n')
      .replace(_CONTROL, (_) => (_ === '\n' ? _ : ' '))
  ).slice(0, 1000);

/** `{form}` — название формы, `{имя поля}` — значение поля; незнакомое имя остаётся как есть. */
export var fillTemplate = (
  template: string,
  formTitle: string,
  values: readonly Value[],
  oneLine: boolean
): string =>
  template.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (match, key: string) =>
    _clean(
      key === 'form'
        ? formTitle
        : (values.find((_) => _.name === key)?.value ?? match),
      oneLine
    )
  );

/** Адрес, на который можно слать: один, похожий на почту; иначе null. */
export var addressOf = (value: string): string | null =>
  ((address) => (_ADDRESS.test(address) ? address : null))(value.trim());

/** Письмо отправителю по заявке; null — письма нет: выключено, адреса нет или он не похож на почту. */
export var letterOf = (
  form: Pick<Form, 'title' | 'confirmation'>,
  fields: readonly FieldSpec[],
  values: readonly Value[]
): Letter | null =>
  ((field) =>
    ((to) =>
      to === null
        ? null
        : {
            to,
            subject: _clean(
              fillTemplate(
                form.confirmation.subject || '{form}',
                form.title,
                values,
                true
              ),
              true
            )
              .trim()
              .slice(0, 200),
            text: fillTemplate(
              form.confirmation.text,
              form.title,
              values,
              false
            ).slice(0, 10_000),
          })(
      form.confirmation.enabled && field
        ? addressOf(values.find((_) => _.name === field.name)?.value ?? '')
        : null
    ))(addressField(fields, form.confirmation));

/** Можно ли слать письмо на этот адрес с этой формы сейчас и журнал после решения; старое забывается. */
export var admitConfirmation = (
  log: ConfirmationLog,
  form: string,
  address: string,
  now: number
): { readonly allowed: boolean; readonly log: ConfirmationLog } =>
  ((fresh, key) =>
    fresh.has(key)
      ? { allowed: false, log: fresh }
      : { allowed: true, log: new Map([...fresh, [key, now]]) })(
    new Map(
      [...log]
        .filter(({ 1: at }) => now - at < CONFIRMATION_WINDOW_MS)
        .slice(-5000)
    ),
    `${form}|${address.toLowerCase()}`
  );

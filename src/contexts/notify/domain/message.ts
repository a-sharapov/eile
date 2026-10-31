/** Канал уведомлений: бот Telegram или почта. */
export type ChannelKind = 'telegram' | 'email';

export var CHANNELS: readonly ChannelKind[] = ['telegram', 'email'];

/** Что уведомление сообщает: заявку с сайта, сбой, проверку канала или письмо пользователю менеджера. */
export type Topic = 'forms' | 'incidents' | 'test' | 'account';

/** Важность сбоя: ниже порога из настроек сбой идёт только в журнал. */
export type Severity = 'critical' | 'error' | 'warning' | 'info';

export var SEVERITIES: readonly Severity[] = [
  'critical',
  'error',
  'warning',
  'info',
];

/** Важнее или так же важен, как порог. */
export var atLeast = (severity: Severity, threshold: Severity): boolean =>
  SEVERITIES.indexOf(severity) <= SEVERITIES.indexOf(threshold);

/** Уведомление без оформления: канал сам решает, как показать строки, текст и ссылку. */
export type Message = {
  readonly topic: Topic;
  readonly title: string;
  /** Строки «подпись: значение» — поля заявки. */
  readonly fields: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  /** Свободный текст: подробности сбоя. */
  readonly text: string;
  /** Текст моноширинным: стек ошибки. */
  readonly mono: boolean;
  readonly link: { readonly label: string; readonly url: string } | null;
  /** Ответить на письмо — этому адресу: почта посетителя. */
  readonly replyTo: string | null;
  readonly severity: Severity | null;
};

export var message = (
  input: Partial<Message> & Pick<Message, 'title'>
): Message => ({
  topic: 'test',
  fields: [],
  text: '',
  mono: false,
  link: null,
  replyTo: null,
  severity: null,
  ...input,
});

const _SEVERITY_LABEL: Readonly<Record<Severity, string>> = {
  critical: 'Критично',
  error: 'Ошибка',
  warning: 'Внимание',
  info: 'Для сведения',
};

/** Заголовок с важностью: «Критично: сайт отвечает 500». */
export var headline = (item: Message): string =>
  item.severity
    ? `${_SEVERITY_LABEL[item.severity]}: ${item.title}`
    : item.title;

/** Ссылка в уведомлении — только http(s): `javascript:` из заявки в письмо не попадёт. */
export var safeUrl = (url: string): string | null =>
  /^https?:\/\//i.test(url) ? url : null;

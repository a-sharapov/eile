import { type Changed, changed } from '../../../shared/kernel/changed.ts';
import { fail } from '../../../shared/kernel/errors.ts';
import type { ManagerLanguage } from '../../../shared/kernel/manager-language.ts';
import type { Form, FormsEvent, Moment } from './form.ts';
import type { Value } from './schema.ts';

/** new — новая, in_work — в работе, done — обработана, spam — спам (без уведомления). */
export type SubmissionStatus = 'new' | 'in_work' | 'done' | 'spam';

export var STATUSES: readonly SubmissionStatus[] = [
  'new',
  'in_work',
  'done',
  'spam',
];

/** Откуда пришла заявка: страница, откуда пришёл посетитель, метки рекламы. */
export type SubmissionContext = {
  readonly pageId: number | null;
  readonly pageTitle: string;
  readonly url: string;
  readonly referrer: string;
  readonly utm: Readonly<Record<string, string>>;
};

/** Заявка с формы: снимок полей с подписями, контекст, адрес посетителя и статус обработки. */
export type Submission = {
  readonly id: number;
  readonly form: string;
  readonly formTitle: string;
  readonly values: readonly Value[];
  readonly context: SubmissionContext;
  readonly ip: string;
  readonly userAgent: string;
  readonly status: SubmissionStatus;
  readonly note: string;
  /** Когда менеджер впервые открыл заявку: непрочитанные — на конверте в шапке. */
  readonly readAt: Moment | null;
  readonly readBy: number | null;
  readonly createdAt: Moment;
  readonly updatedAt: Moment;
};

export type NewSubmission = Omit<
  Submission,
  'id' | 'note' | 'readAt' | 'readBy' | 'updatedAt'
>;

export type SubmissionChange = Changed<Submission, FormsEvent>;

const _changed = (submission: Submission): FormsEvent => ({
  type: 'forms.submission_changed',
  submissionId: submission.id,
  form: submission.form,
});

/** Первое открытие менеджером; повторное ничего не меняет. */
export var markRead =
  (userId: number, now: Moment) =>
  (submission: Submission): SubmissionChange =>
    submission.readAt
      ? changed<Submission, FormsEvent>(submission)
      : ((next) => changed<Submission, FormsEvent>(next, _changed(next)))({
          ...submission,
          readAt: now,
          readBy: userId,
          updatedAt: now,
        });

/** Статус и заметка менеджера. */
export var changeSubmission =
  (
    changes: { readonly status?: unknown; readonly note?: unknown },
    now: Moment
  ) =>
  (submission: Submission): SubmissionChange => {
    const status =
      changes.status === undefined
        ? submission.status
        : STATUSES.includes(changes.status as SubmissionStatus)
          ? (changes.status as SubmissionStatus)
          : fail('forms.invalid_status', `No status ${String(changes.status)}`);
    const note =
      changes.note === undefined
        ? submission.note
        : String(changes.note).slice(0, 5000);
    return status === submission.status && note === submission.note
      ? changed<Submission, FormsEvent>(submission)
      : ((next) => changed<Submission, FormsEvent>(next, _changed(next)))({
          ...submission,
          status,
          note,
          updatedAt: now,
        });
  };

/** Уведомление о заявке без оформления: канал notify решает, как его показать. */
export type Notice = {
  readonly topic: 'forms';
  readonly title: string;
  readonly fields: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  readonly text: string;
  readonly mono: boolean;
  readonly link: { readonly label: string; readonly url: string } | null;
  readonly replyTo: string | null;
  readonly severity: null;
  /** Язык подписей уведомления: из настроек уведомлений. */
  readonly language: ManagerLanguage;
};

// Подписи уведомления о заявке; поля формы подписаны как на сайте — это её содержимое.
const _NOTICE: Readonly<
  Record<ManagerLanguage, { readonly page: string; readonly open: string }>
> = {
  en: { page: 'Page', open: 'Open the submission' },
  de: { page: 'Seite', open: 'Anfrage öffnen' },
  ru: { page: 'Страница', open: 'Открыть заявку' },
};

/** Тема: `{form}` — название формы, `{имя поля}` — его значение. */
export var subjectOf = (
  template: string,
  formTitle: string,
  values: readonly Value[]
): string =>
  template
    .replace(/\{([a-zA-Z0-9_.-]+)\}/g, (match, key: string) =>
      key === 'form'
        ? formTitle
        : (values.find((_) => _.name === key)?.value ?? match)
    )
    .slice(0, 300);

/**
 * Уведомление о заявке: поля, страница и ссылка в менеджер, ответ — на почту посетителя. Скрытое поле
 * в нём — только с подписями (`data-labels`): такое выбрали на сайте, как вариант списка.
 */
export var noticeOf = (
  form: Pick<Form, 'subject'>,
  submission: NewSubmission & { readonly id: number },
  siteUrl: string,
  language: ManagerLanguage
): Notice => ({
  topic: 'forms',
  title: subjectOf(form.subject, submission.formTitle, submission.values),
  fields: [
    ...submission.values
      .filter(
        (_) => (_.kind !== 'hidden' || _.raw !== undefined) && _.value !== ''
      )
      .map((_) => ({ label: _.label, value: _.value })),
    ...(submission.context.pageTitle
      ? [
          {
            label: _NOTICE[language].page,
            value:
              `${submission.context.pageTitle} ${submission.context.url}`.trim(),
          },
        ]
      : []),
    ...Object.entries(submission.context.utm).map(({ 0: key, 1: value }) => ({
      label: key,
      value,
    })),
  ],
  text: '',
  mono: false,
  link: siteUrl
    ? {
        label: _NOTICE[language].open,
        url: `${siteUrl}/manager/forms?id=${submission.id}`,
      }
    : null,
  replyTo: submission.values.find((_) => _.kind === 'email')?.value ?? null,
  severity: null,
  language,
});

const _LINK =
  /\bhttps?:\/\/|\bwww\.|\b[a-z0-9][a-z0-9-]*\.(?:ru|com|net|org|info|biz|top|xyz|online|site|club|pro|io|me|su|shop|store)\b/iu;
const _MARKUP = /<\s*\/?\s*(?:a|script|iframe|img|div|span|p)\b|\[\/?url\b/i;
// Почтовый адрес в тексте («пишите на ivan@mail.ru») — не ссылка.
const _EMAIL_IN_TEXT = /\S+@\S+/g;

/**
 * Спам по содержанию: ссылки (если форма их не ждёт) и разметка в любом поле, кроме адресов. Спам
 * сохраняется со статусом «спам» и без уведомления — ошибку фильтра можно поправить в менеджере.
 */
export var looksLikeSpam = (
  values: readonly Value[],
  allowLinks: boolean
): boolean =>
  values
    .filter(
      (_) => _.kind !== 'email' && _.kind !== 'url' && _.kind !== 'hidden'
    )
    .some(
      (_) =>
        _MARKUP.test(_.value) ||
        (!allowLinks && _LINK.test(_.value.replace(_EMAIL_IN_TEXT, '')))
    );

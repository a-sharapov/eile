import { fail } from '../../../shared/kernel/errors.ts';
import { sentValues, valueLabels } from './schema.ts';
import type { Submission } from './submission.ts';

/** pending — ждёт попытки, delivered — приёмник ответил 2xx, failed — попытки кончились или отказ насовсем. */
export type WebhookStatus = 'pending' | 'delivered' | 'failed';

/** Доставка заявки на вебхук формы: одна на заявку, с числом попыток и последней ошибкой. */
export type WebhookDelivery = {
  readonly submissionId: number;
  readonly form: string;
  /** Куда ушла последняя попытка. */
  readonly url: string;
  readonly status: WebhookStatus;
  readonly attempts: number;
  readonly nextAt: string;
  readonly lastError: string;
  readonly createdAt: string;
  readonly deliveredAt: string | null;
};

/**
 * Тело запроса вебхука: значения по именам полей, у файлов — только имена. У скрытого поля с `data-labels`
 * в `values` — ключ, как пришёл, а подпись — в `labels`.
 */
export type WebhookPayload = {
  readonly form: string;
  readonly submissionId: number;
  readonly receivedAt: string;
  readonly values: Readonly<Record<string, string>>;
  /** Только если в заявке есть скрытое поле с подписями: без него тело то же, что до подписей. */
  readonly labels?: Readonly<Record<string, string>>;
  readonly files: readonly string[];
  readonly page: { readonly id: number | null; readonly url: string } | null;
};

/** Отказ приёмника: насовсем (адрес или данные не те) или на время (сбой сервера, сеть, нет ответа). */
export type WebhookFailure = {
  readonly permanent: boolean;
  readonly message: string;
};

/** Заголовок подписи: `sha256=` и HMAC-SHA256 тела секретом формы в hex. */
export var SIGNATURE_HEADER = 'X-Eile-Signature';

/** Паузы перед повторами: минута, 5 и 30 минут, 2 часа — всего пять попыток, потом отказ. */
export var WEBHOOK_RETRY_MS: readonly number[] = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
];

// http:// — только для приёмника на этой же машине: заявку с личными данными по сети открытым текстом не шлём.
const _LOCAL = new Set(['localhost', '127.0.0.1']);

/** Адрес вебхука: https://…, а http:// — только localhost и 127.0.0.1; пусто — вебхука нет. */
export var parseWebhookUrl = (raw: unknown): string =>
  ((text) =>
    text === ''
      ? ''
      : text.length <= 2000 &&
          URL.canParse(text) &&
          ((url) =>
            url.protocol === 'https:' ||
            (url.protocol === 'http:' && _LOCAL.has(url.hostname)))(
            new URL(text)
          )
        ? text
        : fail(
            'forms.invalid_webhook',
            'The webhook address is https://…; http:// only for localhost and 127.0.0.1'
          ))(typeof raw === 'string' ? raw.trim() : '');

/** Заявка телом вебхука. */
export var payloadOf = (
  submission: Pick<
    Submission,
    'id' | 'form' | 'values' | 'context' | 'createdAt'
  >,
  files: readonly string[]
): WebhookPayload =>
  ((labels) => ({
    form: submission.form,
    submissionId: submission.id,
    receivedAt: submission.createdAt,
    values: sentValues(submission.values),
    ...(Object.keys(labels).length > 0 ? { labels } : {}),
    files,
    page:
      submission.context.pageId === null && submission.context.url === ''
        ? null
        : { id: submission.context.pageId, url: submission.context.url },
  }))(valueLabels(submission.values));

// Подождать и повторить: таймаут запроса, «рано», лимит частоты.
const _RETRIED = new Set([408, 425, 429]);

/**
 * Ответ приёмника по коду HTTP: 2xx — доставлено (null); 5xx, 408, 425 и 429 — повторить позже; редирект и
 * прочие 4xx — насовсем: адрес или данные не те, повтор того же ничего не изменит.
 */
export var answerFailure = (
  status: number,
  text: string
): WebhookFailure | null =>
  status >= 200 && status < 300
    ? null
    : {
        permanent: !(status >= 500 || _RETRIED.has(status)),
        message: `HTTP ${status}${text.trim() ? `: ${text.trim().replace(/\s+/g, ' ').slice(0, 200)}` : ''}`,
      };

/** Когда следующая попытка после неудачной `attempts`-й; null — попыток больше нет. */
export var nextWebhookAttempt = (
  attempts: number,
  failure: WebhookFailure,
  now: number
): number | null =>
  ((delay) => (failure.permanent || delay === undefined ? null : now + delay))(
    WEBHOOK_RETRY_MS[attempts - 1]
  );

import type { WebhookAnswer, WebhookPost } from '../domain/ports.ts';
import { SIGNATURE_HEADER } from '../domain/webhook.ts';

// Приёмник, который думает дольше, считаем недоступным: попытка повторится по расписанию.
const _TIMEOUT_MS = 10_000;

/** Подпись тела секретом формы: `sha256=` и HMAC-SHA256 в hex — приёмник считает её так же и сравнивает. */
export var signatureOf = (body: string, secret: string): string =>
  `sha256=${new Bun.CryptoHasher('sha256', secret).update(body).digest('hex')}`;

// Текст ошибки fetch содержит адрес целиком, а в адресе бывает пароль: наружу — только вид ошибки.
const _networkError = (error: unknown): Error =>
  new Error(
    (error as { name?: string })?.name === 'TimeoutError'
      ? `No answer in ${_TIMEOUT_MS / 1000} seconds`
      : `Network error: ${(error as { code?: string })?.code ?? (error as { name?: string })?.name ?? 'unknown'}`
  );

// Ответ 2xx не читаем — только освобождаем соединение; текст ошибки — первые сотни знаков для менеджера.
const _answer = (response: Response): Promise<WebhookAnswer> =>
  response.ok
    ? (response.body?.cancel() ?? Promise.resolve()).then(
        () => ({ status: response.status, text: '' }),
        () => ({ status: response.status, text: '' })
      )
    : response.text().then(
        (text) => ({ status: response.status, text: text.slice(0, 500) }),
        () => ({ status: response.status, text: '' })
      );

/** POST заявки на вебхук: JSON, подпись, срок ответа; редирект не выполняется — это ответ приёмника. */
export var postWebhook: WebhookPost = (url, body, secret) =>
  fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'user-agent': 'Eile',
      [SIGNATURE_HEADER]: signatureOf(body, secret),
    },
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(_TIMEOUT_MS),
  }).then(_answer, (error) => Promise.reject(_networkError(error)));

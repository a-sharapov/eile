import type { ChannelKind, Message } from './message.ts';

/** pending — ждёт отправки, sent — ушло, failed — попытки кончились или канал отказал насовсем. */
export type DeliveryStatus = 'pending' | 'sent' | 'failed';

/** Строка очереди: одно уведомление одному адресату канала. */
export type Delivery = {
  readonly id: number;
  readonly channel: ChannelKind;
  /** Чат Telegram или адреса письма через запятую. */
  readonly recipient: string;
  readonly message: Message;
  /** Чьё уведомление: `submission:12`, `incident:3`; null — проверка канала. */
  readonly source: string | null;
  readonly status: DeliveryStatus;
  readonly attempts: number;
  readonly nextAt: string;
  /** Последняя ошибка канала как есть: по ней видно, что чинить. */
  readonly lastError: string;
  readonly createdAt: string;
  readonly sentAt: string | null;
};

/** Отказ канала: насовсем (неверный токен, чат удалён) или на время (сеть, лимит), с паузой от канала. */
export type SendFailure = {
  readonly permanent: boolean;
  /** Сколько ждать по просьбе канала (Telegram 429), мс; null — по расписанию. */
  readonly retryAfter: number | null;
  readonly message: string;
};

/** Паузы между попытками: минута, 5 и 30 минут, 2 и 12 часов — потом отказ. */
export var RETRY_DELAYS_MS: readonly number[] = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  12 * 60 * 60_000,
];

/** Когда следующая попытка после неудачной `attempts`-й; null — попыток больше нет. */
export var nextAttempt = (
  attempts: number,
  failure: SendFailure,
  now: number
): number | null =>
  ((delay) =>
    failure.permanent || delay === undefined
      ? null
      : now + Math.max(delay, failure.retryAfter ?? 0))(
    RETRY_DELAYS_MS[attempts - 1]
  );

/** Ошибка адаптера канала в отказ: незнакомая ошибка — временная, сеть могла моргнуть. */
export var failureOf = (error: unknown): SendFailure => {
  const known = (error ?? {}) as Partial<SendFailure>;
  return {
    permanent: known.permanent === true,
    retryAfter:
      typeof known.retryAfter === 'number' && known.retryAfter > 0
        ? known.retryAfter
        : null,
    message: (
      (error instanceof Error ? error.message : String(error)) || 'unknown'
    ).slice(0, 500),
  };
};

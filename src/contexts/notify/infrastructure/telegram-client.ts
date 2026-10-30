import type { SendFailure } from '../domain/delivery.ts';
import { headline, type Message, safeUrl } from '../domain/message.ts';
import type { TelegramApi } from '../domain/ports.ts';
import type { Chat } from '../domain/settings.ts';

/** Предел сообщения Telegram — 4096 знаков; режем с запасом. */
export var TELEGRAM_LIMIT = 4000;

const _TIMEOUT_MS = 15_000;

const _lines = (item: Message, site: string): string[] => [
  `<b>${Bun.escapeHTML(headline(item))}</b>`,
  ...item.fields.map(
    (_) => `<b>${Bun.escapeHTML(_.label)}:</b> ${Bun.escapeHTML(_.value)}`
  ),
  ...(item.text
    ? [
        item.mono
          ? `<pre>${Bun.escapeHTML(item.text)}</pre>`
          : Bun.escapeHTML(item.text),
      ]
    : []),
  ...((url) =>
    url
      ? [
          `<a href="${Bun.escapeHTML(url)}">${Bun.escapeHTML(item.link!.label)}</a>`,
        ]
      : [])(item.link && safeUrl(item.link.url)),
  ...(site ? [`<i>${Bun.escapeHTML(site)}</i>`] : []),
];

// Строка длиннее предела режется по знакам; разрезанный `<pre>` потерял бы закрывающий тег,
// поэтому моноширинный текст укорачивается заранее.
const _pieces = (line: string): string[] =>
  Array.from(
    { length: Math.ceil(line.length / TELEGRAM_LIMIT) || 1 },
    (_, at) => line.slice(at * TELEGRAM_LIMIT, (at + 1) * TELEGRAM_LIMIT)
  );

/** Текст для parse_mode HTML кусками не длиннее предела: строки собираются, пока влезают. */
export var telegramTexts = (item: Message, site: string): string[] =>
  _lines(
    item.mono && item.text.length > TELEGRAM_LIMIT / 2
      ? { ...item, text: `${item.text.slice(0, TELEGRAM_LIMIT / 2)}…` }
      : item,
    site
  )
    .flatMap(_pieces)
    .reduce<string[]>(
      (chunks, line) =>
        chunks.length > 0 &&
        chunks.at(-1)!.length + line.length + 1 <= TELEGRAM_LIMIT
          ? [...chunks.slice(0, -1), `${chunks.at(-1)}\n${line}`]
          : [...chunks, line],
      []
    );

type Reply<T> = {
  readonly ok?: boolean;
  readonly result?: T;
  readonly error_code?: number;
  readonly description?: string;
  readonly parameters?: { readonly retry_after?: number };
};

type Update = {
  readonly message?: { readonly chat?: TelegramChat };
  readonly channel_post?: { readonly chat?: TelegramChat };
  readonly my_chat_member?: { readonly chat?: TelegramChat };
};

type TelegramChat = {
  readonly id: number;
  readonly title?: string;
  readonly username?: string;
  readonly first_name?: string;
  readonly last_name?: string;
};

// 400 (чата нет), 401 (токен), 403 (бота заблокировали или удалили из чата) не пройдут и потом.
const _failure = (status: number, reply: Reply<unknown>): SendFailure & Error =>
  Object.assign(new Error(reply.description ?? `Telegram answered ${status}`), {
    permanent: status === 400 || status === 401 || status === 403,
    retryAfter: reply.parameters?.retry_after
      ? reply.parameters.retry_after * 1000
      : null,
  });

// Сеть и таймаут — временный отказ: очередь повторит позже. Ошибки fetch несут полный адрес, а в нём
// токен бота: он не должен попасть в журнал недоставленного и в менеджер.
const _network =
  (token: string) =>
  (error: unknown): Promise<never> =>
    Promise.reject(
      Object.assign(
        new Error(
          error instanceof DOMException && error.name === 'TimeoutError'
            ? 'Telegram did not answer in time'
            : `Cannot reach Telegram: ${String(error).replaceAll(token, '<token>')}`
        ),
        { permanent: false, retryAfter: null }
      )
    );

const _chatOf = (chat: TelegramChat): Chat => ({
  id: String(chat.id),
  title:
    chat.title ??
    ([chat.first_name, chat.last_name].filter(Boolean).join(' ') ||
      (chat.username ? `@${chat.username}` : String(chat.id))),
});

/**
 * Bot API по HTTPS. На каждый прокси — своя `Bun.FetchSession`: соединения с api.telegram.org живут
 * между отправками. Пустой прокси — как задано в окружении сервера (HTTPS_PROXY).
 */
export var defineTelegramClient = ({
  base = 'https://api.telegram.org',
}: {
  /** Адрес Bot API; тесты подставляют свой сервер. */
  base?: string;
} = {}): TelegramApi => {
  const sessions = new Map<string, Bun.FetchSession>();
  const sessionOf = (proxy: string): Bun.FetchSession =>
    sessions.get(proxy) ??
    ((session) => (sessions.set(proxy, session), session))(
      new Bun.FetchSession({ proxy: proxy || undefined })
    );

  const call = <T>(
    settings: { readonly token: string; readonly proxy: string },
    method: string,
    body?: Record<string, unknown>
  ): Promise<T> =>
    sessionOf(settings.proxy)
      .fetch(`${base}/bot${settings.token}/${method}`, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(_TIMEOUT_MS),
        // Bot API не переадресует: редирект — чужой адрес, туда токен не уходит.
        redirect: 'error',
      })
      .then(undefined, _network(settings.token))
      .then((response) =>
        response
          .json()
          .then(undefined, () => ({}))
          .then((_) => _ as Reply<T>)
          .then((reply) =>
            response.ok && reply.ok
              ? (reply.result as T)
              : Promise.reject(_failure(response.status, reply))
          )
      );

  return {
    send: (settings, chat, item, site) =>
      telegramTexts(item, site)
        .reduce<Promise<unknown>>(
          (chain, text) =>
            chain.then(() =>
              call(settings, 'sendMessage', {
                chat_id: chat,
                text,
                parse_mode: 'HTML',
                link_preview_options: { is_disabled: true },
              })
            ),
          Promise.resolve()
        )
        .then(() => undefined),
    me: (settings) =>
      call<{ username?: string }>(settings, 'getMe').then(
        (_) => `@${_.username ?? 'bot'}`
      ),
    chats: (settings) =>
      call<Update[]>(settings, 'getUpdates?limit=100').then((updates) => [
        ...new Map(
          updates
            .map((_) => (_.message ?? _.channel_post ?? _.my_chat_member)?.chat)
            .filter((_) => _ !== undefined)
            .map((_) => [String(_.id), _chatOf(_)] as const)
        ).values(),
      ]),
  };
};

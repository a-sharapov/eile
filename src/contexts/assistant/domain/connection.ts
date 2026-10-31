import { fail } from '../../../shared/kernel/errors.ts';

/**
 * Подключение ИИ: OpenAI-совместимый API (DeepSeek, OpenAI, локальная модель). Ключ живёт только на
 * сервере; `instructions` — указания владельца сайта, которые получает каждый запрос.
 */
export type Connection = {
  /** База API: `https://api.deepseek.com`; путь `/chat/completions` добавляется сам. */
  readonly url: string;
  readonly model: string;
  readonly key: string;
  readonly instructions: string;
  /** Модель принимает картинки: описание картинки она пишет, глядя на неё. DeepSeek — нет. */
  readonly vision: boolean;
};

export type ConnectionInput = {
  readonly url?: unknown;
  readonly model?: unknown;
  /** Пусто — ключ остаётся прежним (в форму он не возвращается), если адрес API тот же. */
  readonly key?: unknown;
  readonly instructions?: unknown;
  readonly vision?: unknown;
};

const _URL = /^https?:\/\/[^\s/$.?#][^\s]*$/i;
const _MAX_INSTRUCTIONS = 2000;

const _text = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

// Хост адреса API без схемы и пути: сменился хост — прежний ключ туда не уходит.
const _host = (url: string): string =>
  url
    .replace(/^https?:\/\//i, '')
    .split(/[/?#]/)[0]!
    .toLowerCase();

/** Новое подключение из формы; ключ без нового значения берётся у прежнего — только для того же хоста. */
export var parseConnection = (
  input: ConnectionInput,
  previous: Connection | null
): Connection =>
  ((url, model, key, instructions) => ({
    url: _URL.test(url)
      ? url.replace(/\/+$/, '')
      : fail('assistant.invalid_url', 'The API address must be http(s)://…'),
    model: model || fail('assistant.no_model', 'The model is required'),
    key:
      key ||
      (previous && _host(previous.url) === _host(url) ? previous.key : '') ||
      fail('assistant.no_key', 'The key is required'),
    instructions:
      instructions.length <= _MAX_INSTRUCTIONS
        ? instructions
        : fail(
            'assistant.long_instructions',
            `Instructions are longer than ${_MAX_INSTRUCTIONS}`
          ),
    vision: input.vision === true,
  }))(
    _text(input.url),
    _text(input.model),
    _text(input.key),
    _text(input.instructions)
  );

/** Адрес запроса: база API или уже полный путь `…/chat/completions`. */
export var endpointOf = (connection: Connection): string =>
  connection.url.endsWith('/chat/completions')
    ? connection.url
    : `${connection.url}/chat/completions`;

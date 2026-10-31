import { fail } from '../../../shared/kernel/errors.ts';
import type {
  ChatAnswer,
  ChatMessage,
  ModelClient,
  ToolCall,
} from '../domain/ports.ts';

// Длинный шаблон модель пишет минуту-другую; дольше — уже не ответ, а зависание.
const _TIMEOUT_MS = 120_000;

type Completion = {
  readonly choices?: readonly {
    readonly message?: {
      readonly content?: string | null;
      readonly tool_calls?: readonly {
        readonly id?: string;
        readonly function?: {
          readonly name?: string;
          readonly arguments?: string;
        };
      }[];
    };
  }[];
  readonly error?: { readonly message?: string };
};

// Сеть и таймаут — до ответа; ошибки разбора ответа дальше идут как есть.
const _network = (error: unknown): never =>
  error instanceof DOMException && error.name === 'TimeoutError'
    ? fail('assistant.timeout', 'The model did not answer in time')
    : fail('assistant.unreachable', `Cannot reach the API: ${String(error)}`);

type _Request = {
  readonly endpoint: string;
  readonly key: string;
  readonly body: Readonly<Record<string, unknown>>;
};

const _post =
  (fetcher: typeof fetch) =>
  ({ endpoint, key, body }: _Request): Promise<Completion> =>
    fetcher(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ ...body, stream: false }),
      signal: AbortSignal.timeout(_TIMEOUT_MS),
      // Переадресацию не выполняем: адрес API задан явно, а редирект увёл бы запрос (с телом) куда угодно.
      redirect: 'manual',
    })
      .then(undefined, _network)
      .then((response) =>
        (response.json() as Promise<Completion>)
          .then(undefined, (): Completion => ({}))
          .then((body) =>
            response.status >= 300 && response.status < 400
              ? fail(
                  'assistant.failed',
                  `${response.status}: the API redirects, give its final address`
                )
              : response.ok
                ? body
                : fail(
                    'assistant.failed',
                    `${response.status}: ${body.error?.message ?? response.statusText}`
                  )
          )
      );

// Реплики агента — в формате OpenAI: вызовы инструментов и их ответы со своими полями.
const _wire = (message: ChatMessage): Record<string, unknown> =>
  message.role === 'tool'
    ? { role: 'tool', tool_call_id: message.callId, content: message.content }
    : message.role === 'assistant' && message.calls?.length
      ? {
          role: 'assistant',
          content: message.content || null,
          tool_calls: message.calls.map((_) => ({
            id: _.id,
            type: 'function',
            function: { name: _.name, arguments: _.arguments },
          })),
        }
      : { role: message.role, content: message.content };

const _calls = (body: Completion): ToolCall[] =>
  (body.choices?.[0]?.message?.tool_calls ?? []).map((_, index) => ({
    id: _.id ?? `call_${index}`,
    name: _.function?.name ?? '',
    arguments: _.function?.arguments ?? '{}',
  }));

const _answer = (body: Completion): ChatAnswer =>
  ((content, calls) =>
    content === '' && calls.length === 0
      ? fail('assistant.empty', 'The model returned nothing')
      : { content, calls })(
    body.choices?.[0]?.message?.content ?? '',
    _calls(body)
  );

/** Клиент OpenAI-совместимого API: DeepSeek, OpenAI, OpenRouter, локальные модели. */
export var defineOpenAiClient = (
  fetcher: typeof fetch = fetch
): ModelClient => ({
  complete: (request) =>
    _post(fetcher)({
      endpoint: request.endpoint,
      key: request.key,
      body: {
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
      },
    }).then(
      (body) =>
        // Пустая строка — тоже «ничего»: модель с рассуждением исчерпала лимит до ответа.
        body.choices?.[0]?.message?.content ||
        fail('assistant.empty', 'The model returned nothing')
    ),
  chat: (request) =>
    _post(fetcher)({
      endpoint: request.endpoint,
      key: request.key,
      body: {
        model: request.model,
        messages: request.messages.map(_wire),
        tools: request.tools.map((_) => ({
          type: 'function',
          function: {
            name: _.name,
            description: _.description,
            parameters: _.parameters,
          },
        })),
        temperature: request.temperature,
        max_tokens: request.maxTokens,
      },
    }).then(_answer),
});

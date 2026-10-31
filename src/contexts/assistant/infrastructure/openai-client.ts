import { fail } from '../../../shared/kernel/errors.ts';
import type { ModelClient } from '../domain/ports.ts';

// Длинный шаблон модель пишет минуту-другую; дольше — уже не ответ, а зависание.
const _TIMEOUT_MS = 120_000;

type Completion = {
  readonly choices?: readonly {
    readonly message?: { readonly content?: string };
  }[];
  readonly error?: { readonly message?: string };
};

// Сеть и таймаут — до ответа; ошибки разбора ответа дальше идут как есть.
const _network = (error: unknown): never =>
  error instanceof DOMException && error.name === 'TimeoutError'
    ? fail('assistant.timeout', 'The model did not answer in time')
    : fail('assistant.unreachable', `Cannot reach the API: ${String(error)}`);

/** Клиент OpenAI-совместимого API: DeepSeek, OpenAI, OpenRouter, локальные модели. */
export var defineOpenAiClient = (
  fetcher: typeof fetch = fetch
): ModelClient => ({
  complete: (request) =>
    fetcher(request.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${request.key}`,
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: false,
      }),
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
                ? (body.choices?.[0]?.message?.content ??
                  fail('assistant.empty', 'The model returned nothing'))
                : fail(
                    'assistant.failed',
                    `${response.status}: ${body.error?.message ?? response.statusText}`
                  )
          )
      ),
});

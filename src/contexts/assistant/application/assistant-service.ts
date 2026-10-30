import { fail } from '../../../shared/kernel/errors.ts';
import {
  type Connection,
  type ConnectionInput,
  endpointOf,
  parseConnection,
} from '../domain/connection.ts';
import type { ConnectionRepository, ModelClient } from '../domain/ports.ts';
import {
  buildPrompt,
  cleanOutput,
  type Prompt,
  parseRequest,
  parseTarget,
  type SiteFacts,
  type Target,
} from '../domain/prompt.ts';

/** Подключение для формы: всё, кроме ключа, — его менеджер не показывает и не отдаёт. */
export type ConnectionStatus = {
  readonly connected: boolean;
  readonly url: string;
  readonly model: string;
  readonly instructions: string;
};

const _status = (connection: Connection | null): ConnectionStatus => ({
  connected: connection !== null,
  url: connection?.url ?? '',
  model: connection?.model ?? '',
  instructions: connection?.instructions ?? '',
});

export var defineAssistantService = ({
  connections,
  client,
  site,
}: {
  connections: ConnectionRepository;
  client: ModelClient;
  site: () => SiteFacts;
}) => {
  const ask = (connection: Connection, prompt: Prompt): Promise<string> =>
    client.complete({
      endpoint: endpointOf(connection),
      key: connection.key,
      model: connection.model,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: prompt.temperature,
      maxTokens: prompt.maxTokens,
    });

  const connected = (): Connection =>
    connections.get() ??
    fail('assistant.not_connected', 'AI is not connected in settings');

  return {
    connection: {
      status: (): ConnectionStatus => _status(connections.get()),
      save: (input: ConnectionInput): ConnectionStatus =>
        ((next) => (connections.save(next), _status(next)))(
          parseConnection(input, connections.get())
        ),
      remove: (): void => connections.remove(),
      /** Короткий запрос, чтобы проверить адрес, ключ и модель; ответ модели — как есть. */
      test: (): Promise<string> =>
        Promise.resolve()
          .then(connected)
          .then((connection) =>
            ask(connection, {
              system: 'Ответь одним словом.',
              user: 'Скажи «готово».',
              temperature: 0,
              // С запасом: модели с рассуждениями тратят часть лимита до ответа.
              maxTokens: 64,
            })
          ),
    },
    /** Значение поля по запросу человека: системный промпт знает сайт, поле и его правила. */
    generate: (
      input: Record<string, unknown>,
      request: unknown
    ): Promise<string> =>
      Promise.resolve()
        .then(() => ({
          connection: connected(),
          target: parseTarget(input),
          text: parseRequest(request),
        }))
        .then(({ connection, target, text }) =>
          ask(
            connection,
            buildPrompt(target, text, site(), connection.instructions)
          ).then((raw) => cleanOutput(target, raw))
        ),
    target: parseTarget,
  };
};

export type AssistantService = ReturnType<typeof defineAssistantService>;
export type { Target };

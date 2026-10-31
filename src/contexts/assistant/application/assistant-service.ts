import { fail } from '../../../shared/kernel/errors.ts';
import {
  AGENT_LIMITS,
  type AgentStep,
  type AgentUser,
  agentMessages,
  agentPrompt,
  parseArguments,
  parseTurns,
} from '../domain/agent.ts';
import {
  type Connection,
  type ConnectionInput,
  endpointOf,
  parseConnection,
} from '../domain/connection.ts';
import type {
  ChatMessage,
  ConnectionRepository,
  ImageSource,
  ModelClient,
  ToolCall,
  ToolSpec,
} from '../domain/ports.ts';
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
  /** Модель видит картинки: описание картинки пишет, глядя на неё. */
  readonly vision: boolean;
};

/** Инструменты агента и их исполнитель: какие — решает менеджер по правам человека. */
export type AgentTools = {
  readonly specs: readonly ToolSpec[];
  readonly execute: (
    name: string,
    args: Readonly<Record<string, unknown>>
  ) => Promise<{ readonly text: string; readonly ok: boolean }>;
};

export type AgentRequest = {
  readonly turns: unknown;
  readonly user: AgentUser;
  readonly language: string;
  readonly place: string;
  readonly tools: AgentTools;
  /** Шаг сделан — менеджер показывает его сразу, не дожидаясь ответа. */
  readonly onStep: (step: AgentStep) => void;
};

export type AgentReply = {
  readonly reply: string;
  readonly steps: number;
  /** Кончились шаги: агент сделал не всё — человек может попросить продолжить. */
  readonly stopped: boolean;
};

const _status = (connection: Connection | null): ConnectionStatus => ({
  connected: connection !== null,
  url: connection?.url ?? '',
  model: connection?.model ?? '',
  instructions: connection?.instructions ?? '',
  vision: connection?.vision ?? false,
});

const _SEES =
  'The image itself is attached to the request: describe what it shows, not its file name.';

export var defineAssistantService = ({
  connections,
  client,
  site,
  images = () => null,
}: {
  connections: ConnectionRepository;
  client: ModelClient;
  site: () => SiteFacts;
  /** Картинка медиатеки для модели, которая видит. */
  images?: ImageSource;
}) => {
  const ask = (
    connection: Connection,
    prompt: Prompt,
    image: ReturnType<ImageSource> = null
  ): Promise<string> =>
    client.complete({
      endpoint: endpointOf(connection),
      key: connection.key,
      model: connection.model,
      messages: [
        {
          role: 'system',
          content: image ? `${prompt.system}\n${_SEES}` : prompt.system,
        },
        {
          role: 'user',
          content: image
            ? [
                { type: 'text', text: prompt.user },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${image.type};base64,${image.data.toBase64()}`,
                  },
                },
              ]
            : prompt.user,
        },
      ],
      temperature: prompt.temperature,
      maxTokens: prompt.maxTokens,
    });

  // Вызов инструмента: битые аргументы и сбой — тоже ответ, по нему модель поправится сама.
  const callTool =
    (request: AgentRequest) =>
    (call: ToolCall): Promise<ChatMessage> =>
      ((args) =>
        (args === null
          ? Promise.resolve({
              text: 'invalid_arguments: the arguments must be a JSON object',
              ok: false,
            })
          : request.tools
              .execute(call.name, args)
              .then(undefined, (error: unknown) => ({
                text: error instanceof Error ? error.message : String(error),
                ok: false,
              }))
        ).then(
          (result) => (
            request.onStep({
              tool: call.name,
              arguments: args ?? {},
              ok: result.ok,
              result: result.text.slice(0, AGENT_LIMITS.preview),
            }),
            {
              role: 'tool' as const,
              callId: call.id,
              content: result.text.slice(0, AGENT_LIMITS.result),
            }
          )
        ))(parseArguments(call.arguments));

  // Модель → инструменты по очереди (создать, потом править) → снова модель, пока она не ответит словами.
  const loop =
    (connection: Connection, request: AgentRequest) =>
    (
      messages: readonly ChatMessage[],
      round: number,
      steps: number
    ): Promise<AgentReply> =>
      round >= AGENT_LIMITS.steps
        ? Promise.resolve({ reply: '', steps, stopped: true })
        : client
            .chat({
              endpoint: endpointOf(connection),
              key: connection.key,
              model: connection.model,
              messages,
              tools: request.tools.specs,
              temperature: 0.3,
              maxTokens: 12_000,
            })
            .then((answer) =>
              answer.calls.length === 0
                ? { reply: answer.content, steps, stopped: false }
                : answer.calls
                    .reduce<Promise<ChatMessage[]>>(
                      (done, call) =>
                        done.then((results) =>
                          callTool(request)(call).then((_) => [...results, _])
                        ),
                      Promise.resolve([])
                    )
                    .then((results) =>
                      loop(connection, request)(
                        [
                          ...messages,
                          {
                            role: 'assistant',
                            content: answer.content,
                            calls: answer.calls,
                          },
                          ...results,
                        ],
                        round + 1,
                        steps + answer.calls.length
                      )
                    )
            );

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
              maxTokens: 1000,
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
            buildPrompt(target, text, site(), connection.instructions),
            connection.vision && target.image !== ''
              ? images(target.image)
              : null
          ).then((raw) => cleanOutput(target, raw))
        ),
    target: parseTarget,
    /** Разговор с агентом: он сам вызывает инструменты, пока не ответит словами. */
    agent: (request: AgentRequest): Promise<AgentReply> =>
      Promise.resolve()
        .then(() => ({
          connection: connected(),
          turns: parseTurns(request.turns),
        }))
        .then(({ connection, turns }) =>
          loop(connection, request)(
            agentMessages(
              agentPrompt({
                site: site(),
                user: request.user,
                language: request.language,
                instructions: connection.instructions,
                place: request.place.slice(0, 500),
              }),
              turns
            ),
            0,
            0
          )
        ),
  };
};

export type AssistantService = ReturnType<typeof defineAssistantService>;
export type { Target };

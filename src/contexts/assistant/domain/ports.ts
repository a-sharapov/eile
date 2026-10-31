import type { Connection } from './connection.ts';

export type ConnectionRepository = {
  readonly get: () => Connection | null;
  readonly save: (connection: Connection) => void;
  readonly remove: () => void;
};

/** Кусок сообщения в формате OpenAI: текст или картинка адресом data: — для моделей, которые видят. */
export type ContentPart =
  | { readonly type: 'text'; readonly text: string }
  | {
      readonly type: 'image_url';
      readonly image_url: { readonly url: string };
    };

/** Сообщения диалога с моделью в формате OpenAI. */
export type Message = {
  readonly role: 'system' | 'user';
  readonly content: string | readonly ContentPart[];
};

/** Картинка медиатеки для модели: байты и тип; null — не картинка или слишком большая. */
export type ImageSource = (
  path: string
) => { readonly data: Uint8Array; readonly type: string } | null;

/** Вызов инструмента, о котором просит модель; аргументы — строка JSON, как её прислала модель. */
export type ToolCall = {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
};

/** Реплика диалога агента: слова, вызовы инструментов и их ответы. */
export type ChatMessage =
  | { readonly role: 'system' | 'user'; readonly content: string }
  | {
      readonly role: 'assistant';
      readonly content: string;
      readonly calls?: readonly ToolCall[];
    }
  | {
      readonly role: 'tool';
      readonly callId: string;
      readonly content: string;
    };

/** Инструмент для модели: имя, что делает и JSON Schema аргументов. */
export type ToolSpec = {
  readonly name: string;
  readonly description: string;
  readonly parameters: Readonly<Record<string, unknown>>;
};

/** Ответ модели в диалоге: текст или просьба вызвать инструменты. */
export type ChatAnswer = {
  readonly content: string;
  readonly calls: readonly ToolCall[];
};

type _Endpoint = {
  readonly endpoint: string;
  readonly key: string;
  readonly model: string;
  readonly temperature: number;
  readonly maxTokens: number;
};

/** Ответ модели на один запрос: адрес, ключ и модель — из подключения. */
export type ModelClient = {
  /** Диалог с инструментами: модель отвечает текстом или вызовами. */
  readonly chat: (
    request: _Endpoint & {
      readonly messages: readonly ChatMessage[];
      readonly tools: readonly ToolSpec[];
    }
  ) => Promise<ChatAnswer>;
  readonly complete: (request: {
    readonly endpoint: string;
    readonly key: string;
    readonly model: string;
    readonly messages: readonly Message[];
    readonly temperature: number;
    readonly maxTokens: number;
  }) => Promise<string>;
};

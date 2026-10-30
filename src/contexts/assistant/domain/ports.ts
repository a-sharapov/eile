import type { Connection } from './connection.ts';

export type ConnectionRepository = {
  readonly get: () => Connection | null;
  readonly save: (connection: Connection) => void;
  readonly remove: () => void;
};

/** Сообщения диалога с моделью в формате OpenAI. */
export type Message = {
  readonly role: 'system' | 'user';
  readonly content: string;
};

/** Ответ модели на один запрос: адрес, ключ и модель — из подключения. */
export type ModelClient = {
  readonly complete: (request: {
    readonly endpoint: string;
    readonly key: string;
    readonly model: string;
    readonly messages: readonly Message[];
    readonly temperature: number;
    readonly maxTokens: number;
  }) => Promise<string>;
};

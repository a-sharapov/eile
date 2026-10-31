import type { Database } from '../../platform/database.ts';
import { defineAssistantService } from './application/assistant-service.ts';
import type { ImageSource } from './domain/ports.ts';
import type { SiteFacts } from './domain/prompt.ts';
import { defineOpenAiClient } from './infrastructure/openai-client.ts';
import { defineConnectionRepository } from './infrastructure/sqlite-connection.ts';

export type {
  AgentReply,
  AgentTools,
  AssistantService,
  ConnectionStatus,
} from './application/assistant-service.ts';
export type { AgentStep } from './domain/agent.ts';
export { GUIDE } from './domain/guide.ts';
export type { ToolSpec } from './domain/ports.ts';
export type { SiteFacts, TargetKind } from './domain/prompt.ts';
export { isCode } from './domain/prompt.ts';
export {
  ASSISTANT_TABLE,
  assistantMigrations,
} from './infrastructure/sqlite-connection.ts';

/** Контекст assistant: подключение ИИ и генерация значений полей по запросу человека. */
export var defineAssistant = ({
  db,
  site,
  images,
  fetcher,
}: {
  db: Database;
  site: () => SiteFacts;
  images?: ImageSource;
  /** Подмена HTTP в тестах: поддельная модель вместо настоящей. */
  fetcher?: typeof fetch;
}) =>
  defineAssistantService({
    connections: defineConnectionRepository(db),
    client: defineOpenAiClient(fetcher),
    site,
    images,
  });

import type { Database } from '../../platform/database.ts';
import { defineAssistantService } from './application/assistant-service.ts';
import type { SiteFacts } from './domain/prompt.ts';
import { defineOpenAiClient } from './infrastructure/openai-client.ts';
import { defineConnectionRepository } from './infrastructure/sqlite-connection.ts';

export type {
  AssistantService,
  ConnectionStatus,
} from './application/assistant-service.ts';
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
  fetcher,
}: {
  db: Database;
  site: () => SiteFacts;
  /** Подмена HTTP в тестах: поддельная модель вместо настоящей. */
  fetcher?: typeof fetch;
}) =>
  defineAssistantService({
    connections: defineConnectionRepository(db),
    client: defineOpenAiClient(fetcher),
    site,
  });

import type { EventBus } from '../../shared/kernel/events.ts';
import {
  type Clock,
  defineDiagnosticsService,
} from './application/diagnostics-service.ts';
import {
  indexFacts,
  linkChecks,
  mediaChecks,
  pageChecks,
  type SiteFacts,
  settingsChecks,
} from './domain/site-checks.ts';

export type { DiagnosticsService } from './application/diagnostics-service.ts';
export type {
  Check,
  DiagnosticsReport,
  Finding,
  FindingItem,
  Fix,
  GroupId,
  Severity,
} from './domain/diagnostics.ts';
export { finding } from './domain/diagnostics.ts';
export type {
  FactFile,
  FactForm,
  FactPage,
  SiteFacts,
} from './domain/site-checks.ts';

/**
 * Контекст diagnostics: быстрая проверка сайта — ссылки, страницы, медиа, настройки. Встроенные
 * проверки читают снимок сайта `facts`; остальные модули добавляют свои через `register`.
 */
export var defineDiagnostics = ({
  bus,
  clock,
  facts,
}: {
  bus: EventBus;
  clock: Clock;
  facts: () => SiteFacts;
}) => {
  const service = defineDiagnosticsService({ bus, clock });
  // Один снимок на все встроенные проверки: сайт читается один раз за отчёт.
  service.register({
    id: 'site',
    run: () =>
      ((index) => [
        ...linkChecks(index),
        ...pageChecks(index),
        ...mediaChecks(index),
        ...settingsChecks(index),
      ])(indexFacts(facts())),
  });
  return service;
};

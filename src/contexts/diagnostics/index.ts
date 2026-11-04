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
import { CHECK_TEXTS } from './domain/texts.ts';

export type { DiagnosticsService } from './application/diagnostics-service.ts';
export {
  type Blind,
  checkDomain,
  type DnsResolver,
  type DomainReport,
  type ZoneResolver,
} from './application/domain-check.ts';
export {
  checkRedirects,
  MAX_HOPS,
  type Probe,
  type RedirectReport,
} from './application/redirect-check.ts';
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
export {
  bareAddress,
  type DnsAnswer,
  isPublicAddress,
  parseDomainName,
  type RecordChange,
  type RecordType,
  zoneLine,
} from './domain/dns.ts';
export {
  ACME_ISSUER,
  localTarget,
  planOf,
} from './domain/domain-check.ts';
export {
  type Addresses,
  DKIM_SELECTORS,
  type DkimKey,
  type DomainFacts,
  type DomainFinding,
  type DomainFindingId,
  type DomainStatus,
  type DomainWhen,
  SWITCH_TTL,
  type TtlEntry,
} from './domain/domain-facts.ts';
export {
  type Hop,
  OUTCOMES,
  type Outcome,
  parseUrlList,
  type RedirectResult,
  type RedirectSummary,
  shownUrl,
  type UrlEntry,
} from './domain/redirect-check.ts';
export type {
  FactFile,
  FactForm,
  FactPage,
  SiteFacts,
} from './domain/site-checks.ts';
export { SPF_LOOKUP_LIMIT, spfLookups } from './domain/spf.ts';
export {
  DOH_PROVIDERS,
  defineDohResolver,
  type Fetch,
} from './infrastructure/doh-resolver.ts';
export { defineSystemResolver } from './infrastructure/system-resolver.ts';
export { type Load, readUrlSource } from './infrastructure/url-source.ts';

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
    run: (language) =>
      ((index, say) => [
        ...linkChecks(index, say),
        ...pageChecks(index, say),
        ...mediaChecks(index, say, language),
        ...settingsChecks(index, say),
      ])(indexFacts(facts()), CHECK_TEXTS[language]),
  });
  return service;
};

import { attempt } from '../../../shared/kernel/errors.ts';
import type { EventBus } from '../../../shared/kernel/events.ts';
import type { ManagerLanguage } from '../../../shared/kernel/manager-language.ts';
import {
  type Check,
  type DiagnosticsReport,
  type Finding,
  ordered,
  problemsOf,
} from '../domain/diagnostics.ts';
import { CHECK_TEXTS } from '../domain/texts.ts';

export type Clock = () => Date;

// Сайт меняется событиями, а очередь уведомлений и файлы на диске — без них: отчёт живёт не дольше
// пяти минут, даже если событий не было.
const _TTL_MS = 5 * 60 * 1000;

// Упавшая проверка — тоже находка: отчёт не должен пропадать из-за одной ошибки.
const _broken =
  (check: Check, language: ManagerLanguage) =>
  (error: unknown): Finding[] => [
    {
      id: `check.failed.${check.id}`,
      group: 'server',
      severity: 'error',
      title: CHECK_TEXTS[language].checkFailed(check.id),
      hint: error instanceof Error ? error.message : String(error),
      items: [{ label: check.id }],
      count: 1,
    },
  ];

/**
 * Диагностика сайта: набор проверок и отчёт по ним. Отчёт считается при первом запросе и держится
 * до любого события сайта; проверки других модулей добавляются через `register`.
 */
export var defineDiagnosticsService = ({
  bus,
  clock,
}: {
  bus: EventBus;
  clock: Clock;
}) => {
  const checks = new Map<string, Check>();
  // Свой отчёт на каждый язык менеджера: тексты находок собираются на нём.
  const cached = new Map<ManagerLanguage, DiagnosticsReport>();
  bus.onAny(() => cached.clear());

  const compute = (language: ManagerLanguage): DiagnosticsReport => {
    const started = performance.now();
    const findings = ordered(
      [...checks.values()].flatMap((check) =>
        attempt(() => [...check.run(language)], _broken(check, language))
      )
    );
    return {
      generatedAt: clock().toISOString(),
      problems: problemsOf(findings),
      tookMs: Math.round(performance.now() - started),
      findings,
    };
  };

  const fresh = (
    report: DiagnosticsReport | undefined
  ): report is DiagnosticsReport =>
    report !== undefined &&
    clock().getTime() - Date.parse(report.generatedAt) < _TTL_MS;

  const remember = (
    language: ManagerLanguage,
    report: DiagnosticsReport
  ): DiagnosticsReport => (cached.set(language, report), report);

  return {
    /** Отчёт; `again` — посчитать заново, не глядя в кэш («Обновить» в менеджере). */
    report: (
      again = false,
      language: ManagerLanguage = 'en'
    ): DiagnosticsReport =>
      ((report) =>
        !again && fresh(report)
          ? report
          : remember(language, compute(language)))(cached.get(language)),
    /** Добавить проверку; с тем же id — заменить. */
    register: (check: Check): void => (
      checks.set(check.id, check), cached.clear()
    ),
  };
};

export type DiagnosticsService = ReturnType<typeof defineDiagnosticsService>;

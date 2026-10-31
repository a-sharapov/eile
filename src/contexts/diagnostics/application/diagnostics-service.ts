import { attempt } from '../../../shared/kernel/errors.ts';
import type { EventBus } from '../../../shared/kernel/events.ts';
import {
  type Check,
  type DiagnosticsReport,
  type Finding,
  ordered,
  problemsOf,
} from '../domain/diagnostics.ts';

export type Clock = () => Date;

// Сайт меняется событиями, а очередь уведомлений и файлы на диске — без них: отчёт живёт не дольше
// пяти минут, даже если событий не было.
const _TTL_MS = 5 * 60 * 1000;

// Упавшая проверка — тоже находка: отчёт не должен пропадать из-за одной ошибки.
const _broken =
  (check: Check) =>
  (error: unknown): Finding[] => [
    {
      id: `check.failed.${check.id}`,
      group: 'server',
      severity: 'error',
      title: `Проверка «${check.id}» не выполнилась`,
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
  let cached: DiagnosticsReport | null = null;
  bus.onAny(() => void (cached = null));

  const compute = (): DiagnosticsReport => {
    const started = performance.now();
    const findings = ordered(
      [...checks.values()].flatMap((check) =>
        attempt(() => [...check.run()], _broken(check))
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
    report: DiagnosticsReport | null
  ): report is DiagnosticsReport =>
    report !== null &&
    clock().getTime() - Date.parse(report.generatedAt) < _TTL_MS;

  return {
    /** Отчёт; `again` — посчитать заново, не глядя в кэш («Обновить» в менеджере). */
    report: (again = false): DiagnosticsReport =>
      !again && fresh(cached) ? cached : (cached = compute()),
    /** Добавить проверку; с тем же id — заменить. */
    register: (check: Check): void => (
      checks.set(check.id, check), void (cached = null)
    ),
  };
};

export type DiagnosticsService = ReturnType<typeof defineDiagnosticsService>;

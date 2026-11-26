import { api } from './api.ts';
import { can } from './session.svelte.ts';
import type { QualityStatus } from './types.ts';

// Нерешённые сбои проверок данных в последние наступившие сутки (ADR 0072, этап 4): одна точка в меню у
// «Статистики» и у вкладки «Качество». Читается при входе, после каждого перехода и после снятия на экране — тихо,
// как счётчик предложений: ошибка оставляет прежнее число. Без права analytics.read запроса нет.

export var quality = $state<QualityStatus>({
  failures: 0,
  warnings: 0,
  day: null,
});

export var refreshQuality = (): void =>
  void (
    can('analytics.read') &&
    api.get<QualityStatus>('/analytics/quality/status').then(
      (_) => void Object.assign(quality, _),
      () => undefined
    )
  );

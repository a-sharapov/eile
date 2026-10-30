import { api } from './api.ts';
import type { InboxSummary } from './types.ts';

/** Сводка заявок для конверта в шапке: непрочитанные, по формам, последние. */
export var inbox = $state<{ summary: InboxSummary | null }>({ summary: null });

const _EVERY_MS = 30_000;

export var refreshInbox = (): Promise<void> =>
  api
    .get<InboxSummary>('/inbox/summary')
    .then((_) => void (inbox.summary = _))
    .catch(() => undefined);

/**
 * Опрос раз в 30 секунд, пока вкладка видна, и сразу при возвращении на неё. Возвращает остановку.
 * Ошибку не показываем: конверт просто остаётся с прежним числом.
 */
export var watchInbox = (): (() => void) => {
  void refreshInbox();
  const timer = setInterval(
    () => void (document.visibilityState === 'visible' && refreshInbox()),
    _EVERY_MS
  );
  const visible = () =>
    void (document.visibilityState === 'visible' && refreshInbox());
  document.addEventListener('visibilitychange', visible);
  return () => (
    clearInterval(timer),
    document.removeEventListener('visibilitychange', visible)
  );
};

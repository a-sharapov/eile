/** Что сделали со страницей — строка журнала правок на «Обзоре». */
export type PageAction =
  | 'created'
  | 'edited'
  | 'published'
  | 'unpublished'
  | 'moved'
  | 'trashed'
  | 'restored'
  | 'duplicated';

/** Правка страницы в менеджере: кто, что и когда. Имя — на момент правки. */
export type Activity = {
  readonly pageId: number;
  readonly action: PageAction;
  readonly userId: number;
  readonly userName: string;
  /** ISO 8601, UTC. */
  readonly at: string;
};

export type ActivityLog = {
  readonly record: (entry: Activity) => void;
  /** Последние правки, новые первыми. */
  readonly recent: (limit: number) => readonly Activity[];
};

const _MERGE_MS = 10 * 60_000;

/**
 * Повтор той же правки той же страницы тем же человеком в пределах 10 минут — одна строка журнала:
 * сохранение страницы и её полей, частые Ctrl+S не вытесняют остальные правки.
 */
export var continues = (last: Activity, next: Activity): boolean =>
  last.pageId === next.pageId &&
  last.action === next.action &&
  last.userId === next.userId &&
  Date.parse(next.at) - Date.parse(last.at) < _MERGE_MS;

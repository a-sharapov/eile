/** Место в файле базы: всего и в свободных страницах — их SQLite не отдаёт диску сам. */
export type DatabaseSpace = {
  readonly size: number;
  readonly free: number;
};

/** Последнее сжатие базы: когда, размер до и после и сколько длилось. */
export type CompactRun = {
  readonly at: string;
  readonly before: number;
  readonly after: number;
  readonly ms: number;
};

const _MB = 1024 * 1024;

/** Ночное сжатие — только если свободно не меньше 8 МиБ и не меньше пятой части файла. */
export var COMPACT_MIN_FREE = 8 * _MB;
export var COMPACT_MIN_SHARE = 0.2;

/**
 * VACUUM пишет новую базу во временный файл и затем всю её — в журнал WAL: на диске нужно ещё два
 * размера живых данных.
 */
export var compactNeeds = (space: DatabaseSpace): number =>
  2 * (space.size - space.free);

export var worthCompacting = (space: DatabaseSpace): boolean =>
  space.free >= COMPACT_MIN_FREE &&
  space.free >= space.size * COMPACT_MIN_SHARE;

/** Сжимать ли ночью: стоит того и места на диске хватает. */
export var shouldCompact = (space: DatabaseSpace, diskFree: number): boolean =>
  worthCompacting(space) && diskFree >= compactNeeds(space);

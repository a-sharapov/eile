import { fail } from '../../../shared/kernel/errors.ts';

/** Как часто: каждые N часов от времени `at`; 24 — раз в сутки. */
export type BackupEvery = 1 | 6 | 12 | 24;

/** Расписание автокопий сайта. По умолчанию выключено: где хранить копии, решает владелец. */
export type BackupSchedule = {
  readonly enabled: boolean;
  readonly every: BackupEvery;
  /** Время первой копии суток по часам сервера, `HH:MM`. */
  readonly at: string;
  /** Сколько последних автокопий хранить; старые удаляются. */
  readonly keep: number;
  /** Каталог копий: пусто — `backups` рядом с базой, относительный путь — от каталога базы. */
  readonly folder: string;
};

/** Последняя удачная автокопия. */
export type BackupRun = {
  readonly at: string;
  readonly file: string;
  readonly size: number;
  /** Сделана кнопкой «Сделать копию сейчас», а не по расписанию. */
  readonly manual: boolean;
};

/** Последний сбой автокопии; удачная копия его снимает. */
export type BackupFailure = {
  readonly at: string;
  readonly message: string;
};

export var DEFAULT_SCHEDULE: BackupSchedule = {
  enabled: false,
  every: 24,
  at: '03:30',
  keep: 7,
  folder: '',
};

const _EVERY: readonly number[] = [1, 6, 12, 24];
const _AT = /^([01]\d|2[0-3]):[0-5]\d$/;
const _MAX_KEEP = 365;

type Rule = readonly [(_: BackupSchedule) => boolean, string, string];

const _RULES: readonly Rule[] = [
  [
    (_) => _EVERY.includes(_.every),
    'upkeep.invalid_every',
    'Backups run every 1, 6, 12 or 24 hours',
  ],
  [(_) => _AT.test(_.at), 'upkeep.invalid_time', 'Time is HH:MM, 00:00–23:59'],
  [
    (_) => Number.isInteger(_.keep) && _.keep >= 1 && _.keep <= _MAX_KEEP,
    'upkeep.invalid_keep',
    `Keep from 1 to ${_MAX_KEEP} copies`,
  ],
  [
    (_) => _.folder.length <= 1024 && !_.folder.includes('\0'),
    'upkeep.invalid_folder',
    'The backup folder path is not valid',
  ],
];

/** Правка расписания: незаданное берётся из `base`, итог проверяется целиком. */
export var parseSchedule = (
  patch: Readonly<Partial<Record<keyof BackupSchedule, unknown>>>,
  base: BackupSchedule = DEFAULT_SCHEDULE
): BackupSchedule =>
  _RULES.reduce<BackupSchedule>(
    (schedule, { 0: valid, 1: code, 2: message }) =>
      valid(schedule) ? schedule : fail(code, message),
    {
      enabled:
        patch.enabled === undefined ? base.enabled : patch.enabled === true,
      every: Number(patch.every ?? base.every) as BackupEvery,
      at: String(patch.at ?? base.at).trim(),
      keep: Number(patch.keep ?? base.keep),
      folder: String(patch.folder ?? base.folder).trim(),
    }
  );

/** Выражение `Bun.cron`: минута из `at`, часы — от `at` с шагом `every` по кругу суток. */
export var cronOf = (schedule: BackupSchedule): string =>
  ((hour, minute) =>
    `${minute} ${
      schedule.every === 1
        ? '*'
        : Array.from(
            { length: 24 / schedule.every },
            (_, index) => (hour + index * schedule.every) % 24
          )
            .toSorted((a, b) => a - b)
            .join(',')
    } * * *`)(Number(schedule.at.slice(0, 2)), Number(schedule.at.slice(3)));

const _pad = (value: number): string => String(value).padStart(2, '0');

/** Начало имени автокопий базы: по нему копии находятся и старые удаляются. */
export var copyPrefix = (database: string): string => `${database}-auto-`;

/** Имя автокопии по часам сервера: site-auto-20261031-0330.db. */
export var copyName = (database: string, at: Date): string =>
  `${copyPrefix(database)}${at.getFullYear()}${_pad(at.getMonth() + 1)}${_pad(at.getDate())}-${_pad(at.getHours())}${_pad(at.getMinutes())}.db`;

import { describe, expect, it } from 'bun:test';
import { isDomainError } from '../../../shared/kernel/errors.ts';
import {
  copyName,
  copyPrefix,
  cronOf,
  DEFAULT_SCHEDULE,
  parseSchedule,
} from './schedule.ts';

const codeOf = (patch: Record<string, unknown>): string | null => {
  try {
    parseSchedule(patch);
    return null;
  } catch (error) {
    return isDomainError(error) ? error.code : String(error);
  }
};

describe('расписание автокопий', () => {
  it('по умолчанию выключено: раз в сутки в 03:30, хранить 7', () => {
    expect(DEFAULT_SCHEDULE).toEqual({
      enabled: false,
      every: 24,
      at: '03:30',
      keep: 7,
      folder: '',
    });
  });

  it('правка берёт незаданное из прежнего расписания', () => {
    const base = parseSchedule({ enabled: true, every: 6, keep: 3 });
    expect(parseSchedule({ at: '01:05' }, base)).toEqual({
      enabled: true,
      every: 6,
      at: '01:05',
      keep: 3,
      folder: '',
    });
    expect(parseSchedule({ enabled: false }, base).enabled).toBe(false);
  });

  it('частота, время, число копий и каталог проверяются', () => {
    expect(codeOf({ every: 5 })).toBe('upkeep.invalid_every');
    expect(codeOf({ at: '24:00' })).toBe('upkeep.invalid_time');
    expect(codeOf({ at: '3:30' })).toBe('upkeep.invalid_time');
    expect(codeOf({ keep: 0 })).toBe('upkeep.invalid_keep');
    expect(codeOf({ keep: 1.5 })).toBe('upkeep.invalid_keep');
    expect(codeOf({ keep: 366 })).toBe('upkeep.invalid_keep');
    expect(codeOf({ folder: 'a\0b' })).toBe('upkeep.invalid_folder');
    expect(codeOf({ every: '12', keep: '30', at: ' 23:59 ' })).toBeNull();
  });

  it('cron: минута из времени, часы с шагом по кругу суток', () => {
    const at = (every: number, time: string) =>
      cronOf(parseSchedule({ every, at: time }));
    expect(at(24, '03:30')).toBe('30 3 * * *');
    expect(at(12, '14:05')).toBe('5 2,14 * * *');
    expect(at(6, '03:00')).toBe('0 3,9,15,21 * * *');
    expect(at(1, '00:45')).toBe('45 * * * *');
  });

  it('имя копии — по часам сервера, с общим началом для ротации', () => {
    const name = copyName('site', new Date(2026, 9, 31, 3, 7));
    expect(name).toBe('site-auto-20261031-0307.db');
    expect(name.startsWith(copyPrefix('site'))).toBe(true);
  });
});

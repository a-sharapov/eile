import { describe, expect, it } from 'bun:test';
import {
  COMPACT_MIN_FREE,
  compactNeeds,
  shouldCompact,
  worthCompacting,
} from './compaction.ts';

const MB = 1024 * 1024;

describe('сжатие базы', () => {
  it('стоит того, когда свободно не меньше 8 МиБ и пятой части файла', () => {
    expect(worthCompacting({ size: 63 * MB, free: 21 * MB })).toBe(true);
    expect(worthCompacting({ size: 200 * MB, free: 20 * MB })).toBe(false);
    expect(worthCompacting({ size: 10 * MB, free: 4 * MB })).toBe(false);
    expect(
      worthCompacting({ size: 5 * COMPACT_MIN_FREE, free: COMPACT_MIN_FREE })
    ).toBe(true);
  });

  it('диску нужно два размера живых данных: временная база и журнал', () => {
    expect(compactNeeds({ size: 63 * MB, free: 21 * MB })).toBe(84 * MB);
    expect(shouldCompact({ size: 63 * MB, free: 21 * MB }, 84 * MB)).toBe(true);
    expect(shouldCompact({ size: 63 * MB, free: 21 * MB }, 83 * MB)).toBe(
      false
    );
  });
});

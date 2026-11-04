import { describe, expect, it } from 'bun:test';
import { parseReviewSettings, statusAfter } from './change-set.ts';
import { expiresAt, isLive, parseDays, splitToken } from './share-link.ts';

describe('ссылка предпросмотра', () => {
  it('токен — 12 знаков поиска и 32 секрета; чужой формат — null', () => {
    const token = `${'a'.repeat(12)}${'B'.repeat(32)}`;
    expect(splitToken(token)).toEqual({
      selector: 'a'.repeat(12),
      verifier: 'B'.repeat(32),
    });
    expect(splitToken(`${token}x`)).toBeNull();
    expect(splitToken('../../manager')).toBeNull();
  });

  it('срок: по умолчанию из настроек, 1–90 дней', () => {
    expect(parseDays(undefined, 7)).toBe(7);
    expect(parseDays('3', 7)).toBe(3);
    expect(() => parseDays(0, 7)).toThrow();
    expect(() => parseDays(91, 7)).toThrow();
    expect(expiresAt(new Date('2026-11-03T10:00:00Z'), 7)).toBe(
      '2026-11-10T10:00:00.000Z'
    );
    expect(
      isLive(
        { expiresAt: '2026-11-10T10:00:00.000Z' },
        '2026-11-10T10:00:00.000Z'
      )
    ).toBe(false);
  });
});

describe('набор правок', () => {
  const set = {
    id: 1,
    agent: {
      userId: 1,
      userName: 'A',
      tokenId: 2,
      tokenName: 'k',
      group: 'key:2',
    },
    title: '',
    description: '',
    status: 'ready' as const,
    createdAt: '',
    updatedAt: '',
    submittedAt: null,
    closedAt: null,
  };

  it('закрыт, когда ждущих не осталось', () => {
    expect(statusAfter(set, ['accepted', 'rejected'])).toBe('closed');
    expect(statusAfter(set, ['accepted', 'pending'])).toBe('ready');
    expect(statusAfter({ ...set, status: 'open' }, ['pending'])).toBe('open');
  });

  it('настройки проверяются', () => {
    expect(
      parseReviewSettings({ agents: true }, { agents: false, linkDays: 7 })
    ).toEqual({ agents: true, linkDays: 7 });
    expect(() =>
      parseReviewSettings({ agents: 'yes' }, { agents: false, linkDays: 7 })
    ).toThrow();
    expect(() =>
      parseReviewSettings({ linkDays: 0 }, { agents: false, linkDays: 7 })
    ).toThrow();
  });
});

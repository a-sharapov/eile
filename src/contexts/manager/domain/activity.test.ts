import { describe, expect, it } from 'bun:test';
import { type Activity, continues } from './activity.ts';

const _edit: Activity = {
  pageId: 2,
  action: 'edited',
  userId: 1,
  userName: 'Анна',
  at: '2026-10-30T10:00:00.000Z',
};

describe('журнал правок', () => {
  it('повтор той же правки в течение 10 минут — продолжение прежней строки', () => {
    expect(continues(_edit, { ..._edit, at: '2026-10-30T10:09:00.000Z' })).toBe(
      true
    );
  });

  it('другая страница, другое действие, другой человек или пауза — новая строка', () => {
    expect(continues(_edit, { ..._edit, pageId: 3 })).toBe(false);
    expect(continues(_edit, { ..._edit, action: 'published' })).toBe(false);
    expect(continues(_edit, { ..._edit, userId: 2 })).toBe(false);
    expect(continues(_edit, { ..._edit, at: '2026-10-30T10:11:00.000Z' })).toBe(
      false
    );
  });
});

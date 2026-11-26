import { describe, expect, it } from 'bun:test';
import { attempt, isDomainError } from '../../../shared/kernel/errors.ts';
import {
  keyLabel,
  keyLog,
  readCarriedKeys,
  type SenderKey,
  staleUse,
} from './keys.ts';

const code = (run: () => unknown): string | null =>
  attempt(
    () => (run(), null),
    (error) => (isDomainError(error) ? error.code : String(error))
  );

const KEY: SenderKey = {
  id: 1,
  sender: 'bot',
  label: 'Бот',
  hash: 'a'.repeat(64),
  hint: 'x9Qz',
  createdAt: '2027-11-14T18:00:00.000Z',
  usedAt: '2027-11-14T18:00:00.000Z',
};

describe('ключ отправителя', () => {
  it('подпись — 1–100 знаков; не дали — по умолчанию', () => {
    expect(keyLabel(undefined, 'Бот')).toBe('Бот');
    expect(keyLabel('', 'Бот')).toBe('Бот');
    expect(keyLabel('  Бот на сервере  ', 'Бот')).toBe('Бот на сервере');
    expect(code(() => keyLabel('   ', 'Бот'))).toBe('analytics.invalid_item');
    expect(code(() => keyLabel('я'.repeat(101), 'Бот'))).toBe(
      'analytics.invalid_item'
    );
  });

  it('«когда пользовались» — не чаще раза в пять минут', () => {
    expect(staleUse({ ...KEY, usedAt: null }, '2027-11-14T18:00:01Z')).toBe(
      true
    );
    expect(staleUse(KEY, '2027-11-14T18:04:59.999Z')).toBe(false);
    expect(staleUse(KEY, '2027-11-14T18:05:00.000Z')).toBe(true);
  });

  it('строка журнала о ключе: отправитель и номер, подпись и последние знаки — без хэша', () => {
    const author = { id: 1, name: 'Анна', agent: false };
    const issued = keyLog('created', KEY, author, KEY.createdAt);
    expect(issued).toEqual({
      at: KEY.createdAt,
      author,
      item: 'key',
      key: 'bot/1',
      action: 'created',
      before: null,
      after: {
        id: 1,
        sender: 'bot',
        label: 'Бот',
        hint: 'x9Qz',
        createdAt: KEY.createdAt,
        usedAt: KEY.usedAt,
      },
    });
    const revoked = keyLog('removed', KEY, null, '2027-11-15T09:00:00.000Z');
    expect(revoked).toMatchObject({ action: 'removed', after: null });
    expect(JSON.stringify([issued, revoked])).not.toContain(KEY.hash);
  });

  it('ключи из файла настроек сервера — с хэшем sha256 и кодом отправителя', () => {
    const carried = {
      sender: 'bot',
      label: 'Бот',
      keyHash: 'a'.repeat(64),
      hint: 'x9Qz',
      createdAt: KEY.createdAt,
    };
    expect(readCarriedKeys([carried])).toEqual([carried]);
    expect(code(() => readCarriedKeys({}))).toBe('analytics.invalid_settings');
    expect(
      code(() => readCarriedKeys([{ ...carried, keyHash: 'evk_secret' }]))
    ).toBe('analytics.invalid_settings');
    expect(code(() => readCarriedKeys([{ ...carried, sender: 'Bot' }]))).toBe(
      'analytics.invalid_settings'
    );
  });
});

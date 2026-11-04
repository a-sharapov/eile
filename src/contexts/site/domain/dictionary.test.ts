import { describe, expect, it } from 'bun:test';
import { createCustomSetting } from './dictionary.ts';

describe('своя настройка', () => {
  it('пояснение — одна строка без лишних пробелов; без пояснения — пусто', () => {
    expect(
      createCustomSetting('phone', '+49', '  Телефон \n в шапке ').note
    ).toBe('Телефон в шапке');
    expect(createCustomSetting('phone', '+49').note).toBe('');
  });

  it('пояснение длиннее 500 знаков отклоняется', () => {
    expect(() => createCustomSetting('phone', '', 'x'.repeat(501))).toThrow(
      'over 500 characters'
    );
  });
});

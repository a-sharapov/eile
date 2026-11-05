import { describe, expect, it } from 'bun:test';
import {
  createCustomSetting,
  createTranslation,
  patchTranslation,
} from './dictionary.ts';

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

describe('значение в несколько строк', () => {
  it('переводы строк — LF: список по пункту на строку переживает сохранение', () => {
    expect(
      createTranslation('topics', { ru: 'Кухня\r\nВанная\rГостиная' }).values.ru
    ).toBe('Кухня\nВанная\nГостиная');
    expect(createCustomSetting('contacts', 'a | b\r\nc | d').value).toBe(
      'a | b\nc | d'
    );
  });
});

describe('правка перевода по языкам', () => {
  const greeting = createTranslation('greeting', { ru: 'Привет', en: 'Hi' });

  it('названные языки заменяются, остальные остаются; пустой текст убирает язык', () => {
    expect(
      patchTranslation('greeting', greeting, { en: 'Hello' }, ['ru', 'en'])
        .values
    ).toEqual({ ru: 'Привет', en: 'Hello' });
    expect(
      patchTranslation('greeting', greeting, { en: '' }, ['ru', 'en']).values
    ).toEqual({ ru: 'Привет' });
    expect(
      patchTranslation('fresh', undefined, { ru: 'Новый' }, ['ru']).values
    ).toEqual({ ru: 'Новый' });
  });

  it('новый текст — только на языке сайта; прежний текст чужого языка не мешает', () => {
    expect(() =>
      patchTranslation('greeting', greeting, { fr: 'Salut' }, ['ru', 'en'])
    ).toThrow('"fr" is not a language of the site');
    expect(
      patchTranslation('greeting', greeting, { ru: 'Здравствуйте', en: 'Hi' }, [
        'ru',
      ]).values
    ).toEqual({ ru: 'Здравствуйте', en: 'Hi' });
  });
});

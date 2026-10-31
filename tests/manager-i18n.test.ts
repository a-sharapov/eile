import { describe, expect, it } from 'bun:test';
import * as de from '../manager/src/lib/locales/de.ts';
import * as en from '../manager/src/lib/locales/en.ts';
import * as ru from '../manager/src/lib/locales/ru.ts';

// Словари менеджера: ru.ts — образец; en и de повторяют ключи, подстановки и формы чисел.

const _RU = { messages: ru.messages, errors: ru.errors } as const;
const _OTHERS = {
  en: { messages: en.messages, errors: en.errors },
  de: { messages: de.messages, errors: de.errors },
} as const;
const _PLURAL_FORMS: Readonly<Record<string, readonly number[]>> = {
  ru: [1, 3],
  en: [1, 2],
  de: [1, 2],
};

// Формы числа — строка с {n} и «|»; просто «|» бывает и в тексте: «значение | Подпись».
const plural = (text: string): boolean =>
  text.includes('|') && text.includes('{n}');

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{([a-z][A-Za-z]*)\}/g)].map((_) => _[1]!).toSorted();

describe.each(Object.entries(_OTHERS))('словарь %s', (language, dictionary) => {
  it.each(['messages', 'errors'] as const)(
    '%s: те же ключи в том же порядке',
    (part) => {
      expect(Object.keys(dictionary[part])).toEqual(Object.keys(_RU[part]));
    }
  );

  it('подстановки те же, что в русском, строк без перевода нет', () => {
    const broken = Object.entries({ ...ru.messages, ...ru.errors }).filter(
      ([key, source]) =>
        ((target) =>
          !target?.trim() ||
          /[А-Яа-яЁё]/.test(target) ||
          placeholders(source).some((_) => !placeholders(target).includes(_)))(
          (
            { ...dictionary.messages, ...dictionary.errors } as Record<
              string,
              string
            >
          )[key]
        )
    );
    expect(broken.map(([key]) => key)).toEqual([]);
  });

  it('формы чисел — по правилам языка', () => {
    const counts = Object.values(dictionary.messages)
      .filter(plural)
      .map((_) => _.split('|').length);
    expect(counts.filter((_) => !_PLURAL_FORMS[language]!.includes(_))).toEqual(
      []
    );
  });
});

it('русские формы чисел — одна или три', () => {
  expect(
    Object.values(ru.messages)
      .filter(plural)
      .filter((_) => !_PLURAL_FORMS.ru!.includes(_.split('|').length))
  ).toEqual([]);
});

// Строки интерфейса — только в словарях: кириллица в коде менеджера вне комментариев значит забытую строку.
const _ALLOWED = new Set([
  'manager/src/lib/locales/ru.ts',
  // Названия языков — на самих языках.
  'manager/src/lib/i18n.ts',
  // Таблица транслитерации заголовка в адрес.
  'manager/src/lib/translit.ts',
  'manager/src/routes/(app)/help/HelpRu.svelte',
]);

const _code = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

it('в коде менеджера нет строк интерфейса мимо словарей', async () => {
  const files = await Array.fromAsync(
    new Bun.Glob('manager/src/**/*.{ts,svelte}').scan('.')
  );
  const found = (
    await Promise.all(
      files
        .filter((_) => !_ALLOWED.has(_))
        .map((file) =>
          Bun.file(file)
            .text()
            .then((source) =>
              _code(source)
                .split('\n')
                .filter((_) => /[А-Яа-яЁё]/.test(_))
                .map((_) => `${file}: ${_.trim()}`)
            )
        )
    )
  ).flat();
  expect(found).toEqual([]);
});

// Помощь — отдельный текст на каждом языке; разделы те же, иначе поиск и ссылки #раздел найдут не всё.
it('помощь: на всех языках одни и те же разделы в том же порядке', async () => {
  const sections = (language: string) =>
    Bun.file(`manager/src/routes/(app)/help/Help${language}.svelte`)
      .text()
      .then((_) =>
        [..._.matchAll(/<(?:section|h2) id="([a-z-]+)"/g)].map((_) => _[1])
      );
  const {
    0: ru,
    1: en,
    2: de,
  } = await Promise.all(['Ru', 'En', 'De'].map(sections));
  expect(ru).toContain('admin-code');
  expect(en).toEqual(ru);
  expect(de).toEqual(ru);
});

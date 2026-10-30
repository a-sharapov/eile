import type { Brand } from '../../../shared/kernel/brand.ts';
import { fail } from '../../../shared/kernel/errors.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';

/** Один сегмент URL: строчная латиница и цифры через одиночные дефисы, можно с расширением: `feed.xml`. */
export type Alias = Brand<string, 'Alias'>;

const _ALIAS = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+)?$/;
const _MAX_LENGTH = 100;

const _CYRILLIC: Readonly<Record<string, string>> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  і: 'i',
  ї: 'yi',
  є: 'ye',
  ґ: 'g',
};

export var parseAlias = (raw: string): Alias =>
  raw.length <= _MAX_LENGTH && _ALIAS.test(raw)
    ? (raw as Alias)
    : fail(
        'content.invalid_alias',
        `Alias "${raw}" must be lowercase latin letters, digits and dashes, with an optional .extension`
      );

/** Алиас из заголовка с транслитерацией кириллицы (в Evo это делал плагин TransAlias). */
export var aliasFromTitle = (title: string): Alias =>
  pipe<string, Alias>(
    (_: string) => _.toLowerCase(),
    (_: string) => [..._].map((char) => _CYRILLIC[char] ?? char).join(''),
    (_: string) => _.normalize('NFKD').replace(/\p{M}/gu, ''),
    (_: string) => _.replace(/[^a-z0-9]+/g, '-').slice(0, _MAX_LENGTH),
    (_: string) => _.replace(/^-+|-+$/g, ''),
    (_: string) =>
      _ ||
      fail('content.invalid_alias', `Cannot derive an alias from "${title}"`)
  )(title);

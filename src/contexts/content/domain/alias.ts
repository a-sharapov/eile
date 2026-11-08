import type { Brand } from '../../../shared/kernel/brand.ts';
import { fail } from '../../../shared/kernel/errors.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import { transliterate } from '../../../shared/kernel/translit.ts';

export { transliterate };

/** Один сегмент URL: строчная латиница и цифры через одиночные дефисы, можно с расширением: `feed.xml`. */
export type Alias = Brand<string, 'Alias'>;

const _ALIAS = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+)?$/;
const _MAX_LENGTH = 100;

export var parseAlias = (raw: string): Alias =>
  raw.length <= _MAX_LENGTH && _ALIAS.test(raw)
    ? (raw as Alias)
    : fail(
        'content.invalid_alias',
        `Alias "${raw}" must be lowercase latin letters, digits and dashes, with an optional .extension`
      );

/**
 * Алиас из заголовка с транслитерацией (в Evo это делал плагин TransAlias). `language` — язык страницы с
 * учётом ветки: у немецкой умлауты пишутся с e.
 */
export var aliasFromTitle = (title: string, language = ''): Alias =>
  pipe(
    (_: string) => transliterate(_, language),
    (_: string) => _.replace(/[^a-z0-9]+/g, '-').slice(0, _MAX_LENGTH),
    (_: string) => _.replace(/^-+|-+$/g, ''),
    (_: string) =>
      (_ ||
        fail(
          'content.invalid_alias',
          `Cannot derive an alias from "${title}"`
        )) as Alias
  )(title);

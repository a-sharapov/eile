// Та же транслитерация, что у алиасов страниц на сервере (shared/kernel/translit.ts):
// «Фото альбом» в папке медиатеки станет foto-albom, а не пропадёт.
const _CYRILLIC: Readonly<Record<string, string>> = Object.fromEntries(
  'а:a б:b в:v г:g д:d е:e ё:e ж:zh з:z и:i й:y к:k л:l м:m н:n о:o п:p р:r с:s т:t у:u ф:f х:h ц:ts ч:ch ш:sh щ:sch ъ: ы:y ь: э:e ю:yu я:ya і:i ї:yi є:ye ґ:g ў:u'
    .split(' ')
    .map((_) => _.split(':') as [string, string])
);

// Латинские буквы, которые не раскладываются на основу и диакритику.
const _LATIN: Readonly<Record<string, string>> = Object.fromEntries(
  'ß:ss æ:ae œ:oe ø:o ł:l đ:d ð:d þ:th ı:i ħ:h ŧ:t ŋ:n ŀ:l'
    .split(' ')
    .map((_) => _.split(':') as [string, string])
);

// По-немецки умлаут пишется буквой с e.
const _GERMAN: Readonly<Record<string, string>> = { ä: 'ae', ö: 'oe', ü: 'ue' };

const _german = (language: string): boolean => /^de(?:-|$)/i.test(language);

/** `language` — язык страницы с учётом ветки и сайта: у немецкой умлауты пишутся с e. */
export var transliterate = (text: string, language = ''): string =>
  ((tables) =>
    [...text.toLowerCase()]
      .map((char) => tables.find((_) => char in _)?.[char] ?? char)
      .join('')
      .normalize('NFKD')
      .replace(/\p{M}/gu, ''))(
    _german(language) ? [_GERMAN, _LATIN, _CYRILLIC] : [_LATIN, _CYRILLIC]
  );

/** Алиас из заголовка, как его соберёт сервер (content/domain/alias.ts `aliasFromTitle`). */
export var aliasFromTitle = (title: string, language = ''): string =>
  transliterate(title, language)
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 100)
    .replace(/^-+|-+$/g, '');

/**
 * Адрес следует за заголовком, пока его не задали вручную: он пуст или собран из этого заголовка — на
 * этом языке или на другом (страницу перенесли в ветку на другом языке, сменился язык сайта).
 */
export var followsTitle = (
  alias: string,
  title: string,
  language = ''
): boolean =>
  alias === '' ||
  [language, '', 'de'].some((_) => alias === aliasFromTitle(title, _));

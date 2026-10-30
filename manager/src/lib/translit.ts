// Та же транслитерация, что у алиасов страниц на сервере (content/domain/alias.ts):
// «Фото альбом» в папке медиатеки станет foto-albom, а не пропадёт.
const _CYRILLIC: Readonly<Record<string, string>> = Object.fromEntries(
  'а:a б:b в:v г:g д:d е:e ё:e ж:zh з:z и:i й:y к:k л:l м:m н:n о:o п:p р:r с:s т:t у:u ф:f х:h ц:ts ч:ch ш:sh щ:sch ъ: ы:y ь: э:e ю:yu я:ya і:i ї:yi є:ye ґ:g'
    .split(' ')
    .map((_) => _.split(':') as [string, string])
);

export var transliterate = (text: string): string =>
  [...text.toLowerCase()]
    .map((char) => _CYRILLIC[char] ?? char)
    .join('')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '');

/** Алиас из заголовка, как его соберёт сервер (content/domain/alias.ts `aliasFromTitle`). */
export var aliasFromTitle = (title: string): string =>
  transliterate(title)
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 100)
    .replace(/^-+|-+$/g, '');

/** Адрес следует за заголовком, пока его не задали вручную: он пуст или собран из этого заголовка. */
export var followsTitle = (alias: string, title: string): boolean =>
  alias === '' || alias === aliasFromTitle(title);

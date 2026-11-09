// Транслитерация — общая: алиасы страниц (content) и имена файлов связанной папки (media, ADR 0065).

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
  ў: 'u',
};

// Латинские буквы, которые не раскладываются на основу и диакритику: без таблицы они стали бы дефисом.
const _LATIN: Readonly<Record<string, string>> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ı: 'i',
  ħ: 'h',
  ŧ: 't',
  ŋ: 'n',
  ŀ: 'l',
};

// По-немецки умлаут пишется буквой с e: Über → ueber, а не uber, как у турецкой или финской страницы.
const _GERMAN: Readonly<Record<string, string>> = { ä: 'ae', ö: 'oe', ü: 'ue' };

const _german = (language: string): boolean => /^de(?:-|$)/i.test(language);

/** Латиница из любого письма: кириллица по таблице, особые буквы по таблице, остальное — без диакритики. */
export var transliterate = (text: string, language = ''): string =>
  ((tables) =>
    [...text.toLowerCase()]
      .map((char) => tables.find((_) => char in _)?.[char] ?? char)
      .join('')
      .normalize('NFKD')
      .replace(/\p{M}/gu, ''))(
    _german(language) ? [_GERMAN, _LATIN, _CYRILLIC] : [_LATIN, _CYRILLIC]
  );

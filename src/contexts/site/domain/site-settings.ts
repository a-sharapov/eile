import { fail } from '../../../shared/kernel/errors.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';

export type SiteSettings = {
  readonly name: string;
  /** Язык сайта по умолчанию, BCP 47: `<html lang>` и запасной язык переводов. */
  readonly language: string;
  /** Другие языки сайта: страницы и ветки получают их в своих настройках, переводы — по колонке на язык. */
  readonly languages: readonly string[];
  /** Страница, которая отдаётся по `/`. */
  readonly homePageId: number | null;
  /** Страница, которая рендерится со статусом 404. */
  readonly notFoundPageId: number | null;
  /** Адрес сайта для canonical, sitemap и соцсетей: `https://example.com`; пусто — из запроса. */
  readonly siteUrl: string;
  /** Описание сайта для llms.txt и страниц без своего описания. */
  readonly description: string;
  /** Картинка для соцсетей по умолчанию — путь файла медиатеки. */
  readonly socialImage: string;
  /** Пускать поисковых ботов ИИ (ответы со ссылками на сайт). */
  readonly aiSearch: boolean;
  /** Разрешить ботам ИИ брать тексты для обучения моделей. */
  readonly aiTraining: boolean;
  /** Дополнительные строки robots.txt — как есть, в конце файла. */
  readonly robots: string;
  /** Синонимы для поиска по сайту: строка — группа, варианты через запятую. */
  readonly searchSynonyms: string;
  /** Слово в адресе порций списка: `page` — `/blog/page-2`. */
  readonly pagingSegment: string;
  /** canonical у порций 2, 3…: на саму порцию (self) или на первую (first). */
  readonly pagingCanonical: PagingCanonical;
  /** Память сервера под кэш страниц, МБ: 64 — около 3000 страниц по 10 КБ кириллицы. */
  readonly pageCacheMb: number;
};

export type PagingCanonical = 'self' | 'first';

export var DEFAULT_SETTINGS: SiteSettings = {
  name: 'Мой сайт',
  language: 'en',
  languages: [],
  homePageId: null,
  notFoundPageId: null,
  siteUrl: '',
  description: '',
  socialImage: '',
  aiSearch: true,
  aiTraining: true,
  robots: '',
  searchSynonyms: '',
  pagingSegment: 'page',
  pagingCanonical: 'self',
  pageCacheMb: 64,
};

const _LANGUAGE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

// undefined — «не менять», null — «сбросить».
const _definedOnly = (patch: Partial<SiteSettings>): Partial<SiteSettings> =>
  Object.fromEntries(
    Object.entries(patch).filter(({ 1: value }) => value !== undefined)
  );

const _validPageId = (id: number | null): boolean =>
  id === null || (Number.isSafeInteger(id) && id > 0);

const _name = (settings: SiteSettings): SiteSettings =>
  pipe(
    (_: string) => _.trim(),
    (name: string) =>
      name
        ? { ...settings, name }
        : fail('site.invalid_name', 'Site name cannot be empty')
  )(settings.name);

const _language = (settings: SiteSettings): SiteSettings =>
  _LANGUAGE.test(settings.language) &&
  settings.languages.every((_) => _LANGUAGE.test(_))
    ? {
        ...settings,
        // Язык по умолчанию в списке не повторяется.
        languages: [...new Set(settings.languages)].filter(
          (_) => _ !== settings.language
        ),
      }
    : fail(
        'site.invalid_language',
        `"${settings.language}" is not a language tag like "en" or "ru"`
      );

const _pages = (settings: SiteSettings): SiteSettings => {
  const invalid = [settings.homePageId, settings.notFoundPageId].find(
    (_) => !_validPageId(_)
  );
  return invalid === undefined
    ? settings
    : fail('site.invalid_page', `Invalid page id ${invalid}`);
};

const _SITE_URL = /^https?:\/\/[^/\s?#]+$/;
const _MEDIA_PATH = /^[^/\s]\S*$/;

// Адрес — без завершающего `/`: к нему приписываются пути страниц.
const _siteUrl = (settings: SiteSettings): SiteSettings =>
  ((url) =>
    url === '' || _SITE_URL.test(url)
      ? { ...settings, siteUrl: url }
      : fail(
          'site.invalid_url',
          `"${settings.siteUrl}" is not a site address like https://example.com`
        ))(settings.siteUrl.trim().replace(/\/+$/, ''));

const _discovery = (settings: SiteSettings): SiteSettings =>
  settings.description.length > 500
    ? fail(
        'site.invalid_description',
        'Site description is over 500 characters'
      )
    : settings.socialImage !== '' && !_MEDIA_PATH.test(settings.socialImage)
      ? fail(
          'site.invalid_image',
          `"${settings.socialImage}" is not a media path`
        )
      : settings.robots.length > 5000
        ? fail(
            'site.invalid_robots',
            'Extra robots.txt rules are over 5000 characters'
          )
        : settings.searchSynonyms.length > 20000
          ? fail(
              'site.invalid_synonyms',
              'Search synonyms are over 20000 characters'
            )
          : settings;

// Латиница и цифры через дефис: слово стоит в адресе перед `-N`.
const _SEGMENT = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const _CANONICAL: readonly PagingCanonical[] = ['self', 'first'];

const _paging = (settings: SiteSettings): SiteSettings =>
  settings.pagingSegment.length > 32 || !_SEGMENT.test(settings.pagingSegment)
    ? fail(
        'site.invalid_paging',
        `"${settings.pagingSegment}" is not a paging word like "page"`
      )
    : _CANONICAL.includes(settings.pagingCanonical)
      ? settings
      : fail(
          'site.invalid_paging',
          `Paging canonical is "self" or "first", not "${settings.pagingCanonical}"`
        );

// Меньше 16 МБ кэш вытесняет сам себя, больше 4 ГБ — скорее опечатка, чем замысел.
const _cache = (settings: SiteSettings): SiteSettings =>
  Number.isInteger(settings.pageCacheMb) &&
  settings.pageCacheMb >= 16 &&
  settings.pageCacheMb <= 4096
    ? settings
    : fail(
        'site.invalid_cache',
        `Page cache size is 16 to 4096 MB, not "${settings.pageCacheMb}"`
      );

export var changeSettings = (
  current: SiteSettings,
  patch: Partial<SiteSettings>
): SiteSettings =>
  pipe(
    (_: Partial<SiteSettings>) => ({ ...current, ..._definedOnly(_) }),
    _name,
    _language,
    _pages,
    _siteUrl,
    _discovery,
    _paging,
    _cache
  )(patch);

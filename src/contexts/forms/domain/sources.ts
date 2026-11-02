import { fail } from '../../../shared/kernel/errors.ts';

/** Что знает сервер, когда рисует форму или принимает заявку: страница, запрос, сайт, время. */
export type SourceContext = {
  readonly page: {
    readonly id: number;
    readonly title: string;
    readonly path: string;
  } | null;
  /** Адрес сайта для полного адреса страницы; пусто — только путь. */
  readonly origin: string;
  readonly query: Readonly<Record<string, string>>;
  /** Cookie посетителя в этом запросе: при показе формы и при отправке. */
  readonly cookie: (name: string) => string | null;
  readonly referrer: string;
  readonly siteName: string;
  /** Поле страницы: `page.field:price`. */
  readonly field: (name: string) => string | null;
  /** Своя настройка сайта: `setting:phone`. */
  readonly setting: (key: string) => string | null;
  readonly now: string;
};

/** Источник скрытого поля для выбора в редакторе формы: значение `data-source` и подпись. */
export type SourceChoice = {
  readonly value: string;
  readonly label: string;
  /** Нужно имя после двоеточия: поле страницы, параметр адреса, cookie, своя настройка. */
  readonly needsKey?: boolean;
};

export var SOURCES: readonly SourceChoice[] = [
  { value: 'page.title', label: 'Страница: заголовок' },
  { value: 'page.url', label: 'Страница: адрес' },
  { value: 'page.id', label: 'Страница: id' },
  { value: 'page.field:', label: 'Страница: поле…', needsKey: true },
  { value: 'utm', label: 'Метки UTM' },
  { value: 'query:', label: 'Параметр адреса…', needsKey: true },
  { value: 'cookie:', label: 'Cookie посетителя…', needsKey: true },
  { value: 'referrer', label: 'Откуда пришёл посетитель' },
  { value: 'site.name', label: 'Название сайта' },
  { value: 'setting:', label: 'Своя настройка сайта…', needsKey: true },
  { value: 'time', label: 'Время отправки' },
];

const _UTM = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
];

/** Метки UTM из параметров адреса. */
export var utmOf = (
  query: Readonly<Record<string, string>>
): Record<string, string> =>
  Object.fromEntries(
    _UTM.filter((_) => query[_]).map((_) => [_, query[_]!.slice(0, 200)])
  );

/** Метки UTM строкой для скрытого поля и обратно. */
export var utmText = (utm: Readonly<Record<string, string>>): string =>
  new URLSearchParams(utm).toString();

export var parseUtm = (text: string): Record<string, string> =>
  utmOf(Object.fromEntries(new URLSearchParams(text)));

const _keyed = (source: string, prefix: string): string | null =>
  source.startsWith(prefix) ? source.slice(prefix.length) : null;

// Cookie самой CMS — вход в менеджер (cms_session, __Host-cms_session), флеш формы и всё, что она заведёт
// под своей приставкой: в странице и в заявке её значение увели бы вместе с сеансом.
const _RESERVED_COOKIE = /^(?:cms_|__host-|__secure-)/i;
// Имя cookie — token из RFC 6265.
const _COOKIE_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,100}$/;

/** Cookie самой CMS: в поле формы её не взять ни при сохранении, ни при показе. */
export var reservedCookie = (name: string): boolean =>
  _RESERVED_COOKIE.test(name);

const _cookieAllowed = (name: string): boolean =>
  _COOKIE_NAME.test(name) && !reservedCookie(name);

/**
 * Источники полей, которые нельзя сохранить: служебная cookie CMS и не имя cookie. Пустое имя — ещё не
 * выбрано: такое поле просто пустое, как `query:` без имени.
 */
export var assertSources = <T extends { readonly source: string | null }>(
  fields: readonly T[]
): readonly T[] =>
  ((name) =>
    name === undefined
      ? fields
      : reservedCookie(name)
        ? fail(
            'forms.reserved_cookie',
            `Cookie "${name}" belongs to the CMS: a form field cannot take its value`
          )
        : fail('forms.invalid_cookie', `"${name}" is not a cookie name`))(
    fields
      .flatMap((_) =>
        ((key) => (key ? [key] : []))(_keyed(_.source ?? '', 'cookie:'))
      )
      .find((_) => !_cookieAllowed(_))
  );

// Таблица источников без имени; с именем — после двоеточия.
const _PLAIN: Readonly<Record<string, (context: SourceContext) => string>> = {
  'page.title': (_) => _.page?.title ?? '',
  'page.url': (_) => (_.page ? `${_.origin}${_.page.path}` : ''),
  'page.path': (_) => _.page?.path ?? '',
  'page.id': (_) => (_.page ? String(_.page.id) : ''),
  utm: (_) => utmText(utmOf(_.query)),
  referrer: (_) => _.referrer,
  'site.name': (_) => _.siteName,
  time: (_) => _.now,
};

/** Значение скрытого поля по его источнику; незнакомый источник — пусто. */
export var resolveSource = (source: string, context: SourceContext): string =>
  (
    _PLAIN[source]?.(context) ??
    ((field) => (field ? context.field(field) : null))(
      _keyed(source, 'page.field:')
    ) ??
    ((param) => (param ? context.query[param] : null))(
      _keyed(source, 'query:')
    ) ??
    ((name) => (name && _cookieAllowed(name) ? context.cookie(name) : null))(
      _keyed(source, 'cookie:')
    ) ??
    ((key) => (key ? context.setting(key) : null))(
      _keyed(source, 'setting:')
    ) ??
    ''
  ).slice(0, 1000);

/**
 * Источники, которые знает только браузер посетителя в момент показа: их значение приходит с формой. Cookie
 * сервер читает сам — из запроса, с которым пришла заявка.
 */
export var fromVisitor = (source: string): boolean =>
  source === 'utm' || source === 'referrer' || source.startsWith('query:');

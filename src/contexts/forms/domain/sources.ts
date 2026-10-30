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
  /** Нужно имя после двоеточия: поле страницы, параметр адреса, своя настройка. */
  readonly needsKey?: boolean;
};

export var SOURCES: readonly SourceChoice[] = [
  { value: 'page.title', label: 'Страница: заголовок' },
  { value: 'page.url', label: 'Страница: адрес' },
  { value: 'page.id', label: 'Страница: id' },
  { value: 'page.field:', label: 'Страница: поле…', needsKey: true },
  { value: 'utm', label: 'Метки UTM' },
  { value: 'query:', label: 'Параметр адреса…', needsKey: true },
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
    ((key) => (key ? context.setting(key) : null))(
      _keyed(source, 'setting:')
    ) ??
    ''
  ).slice(0, 1000);

/** Источники, которые знает только браузер посетителя в момент показа: их значение приходит с формой. */
export var fromVisitor = (source: string): boolean =>
  source === 'utm' || source === 'referrer' || source.startsWith('query:');

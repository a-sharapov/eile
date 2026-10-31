import { PRODUCT } from '../product.ts';
import type { Language } from './language.ts';
import { type Paint, padEnd } from './paint.ts';
import { PROGRAM } from './program.ts';

/** Что сказать при запуске сервера. */
export type ServeSummary = {
  readonly version: string;
  /** Адрес сервера: `http://localhost:8080/`. */
  readonly url: string;
  readonly db: string;
  /** База только что создана — в ней приветствие. */
  readonly fresh: boolean;
  readonly pages: number;
  readonly published: number;
  readonly trashed: number;
  /** Ссылка первичной настройки: пока пользователей нет. */
  readonly setupUrl: string | null;
  /** HTTPS без прокси: срок сертификата (null — ещё выпускается) и тестовый ли центр. */
  readonly https?: {
    readonly notAfter: string | null;
    readonly staging: boolean;
  };
};

const _count = (n: number, one: string, few: string, many: string): string =>
  `${n} ${
    n % 10 === 1 && n % 100 !== 11
      ? one
      : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)
        ? few
        : many
  }`;

const _PAGES: Readonly<Record<Language, (n: number) => string>> = {
  ru: (n) => _count(n, 'страница', 'страницы', 'страниц'),
  en: (n) => `${n} ${n === 1 ? 'page' : 'pages'}`,
};

/** «12 страниц», «1 page»: формы числа для сводок CLI. */
export var pages = (n: number, language: Language): string =>
  _PAGES[language](n);

const _TEXT = {
  ru: {
    tagline: 'сайт и менеджер в одном файле',
    parts: 'страницы, шаблоны, медиатека',
    site: 'Сайт',
    manager: 'Менеджер',
    db: 'База',
    pages: 'Страницы',
    published: 'опубликовано',
    trashed: 'в корзине',
    certificate: (date: string) => `сертификат до ${date}`,
    issuing: 'выпускается сертификат',
    meanwhile: '— пока сайт по HTTP',
    staging: ' · тестовый центр',
    fresh: 'Новая база: страница приветствия и пустой шаблон.',
    ready: 'Готовый сайт — блог, портфолио, магазин:',
    noUsers: 'Пользователей ещё нет. Администратор создаётся по ссылке:',
    noBrowser: 'или без браузера:',
    email: '<почта>',
    help: '— команды и примеры ·',
    stop: '— остановить',
  },
  en: {
    tagline: 'site and manager in one file',
    parts: 'pages, templates, media',
    site: 'Site',
    manager: 'Manager',
    db: 'Database',
    pages: 'Pages',
    published: 'published',
    trashed: 'in trash',
    certificate: (date: string) => `certificate until ${date}`,
    issuing: 'issuing a certificate',
    meanwhile: '(HTTP until then)',
    staging: ' · staging CA',
    fresh: 'New database: a welcome page and a blank template.',
    ready: 'Ready-made sites (blog, portfolio, shop):',
    noUsers: 'No users yet. Create the administrator at:',
    noBrowser: 'or without a browser:',
    email: '<email>',
    help: 'for commands and examples ·',
    stop: 'to stop',
  },
} satisfies Record<Language, unknown>;

/** Строка под названием: что такое Eile — в MOTD и в шапке справки. */
export var tagline = (language: Language): string => _TEXT[language].tagline;

// Знак — ветка схемы сайта со статусами страниц, как в дереве менеджера: опубликована, по расписанию,
// черновик. Рядом — название и строка о том, что это.
const _mark = (paint: Paint, version: string, language: Language): string[] => [
  `  ${paint.ok('●')}${paint.dim('─┬─')}${paint.ok('●')}  ${paint.accent(PRODUCT)} ${paint.dim(version)}`,
  `    ${paint.dim('├─')}${paint.warn('◐')}  ${_TEXT[language].tagline}`,
  `    ${paint.dim('└─')}${paint.dim('○')}  ${paint.dim(_TEXT[language].parts)}`,
];

const _https = (
  paint: Paint,
  https: NonNullable<ServeSummary['https']>,
  language: Language
): string =>
  ((text) =>
    (https.notAfter
      ? text.certificate(https.notAfter.slice(0, 10))
      : `${paint.warn(text.issuing)} ${paint.dim(text.meanwhile)}`) +
    (https.staging ? paint.dim(text.staging) : ''))(_TEXT[language]);

const _row = (paint: Paint, label: string, value: string): string =>
  `  ${padEnd(paint.dim(label), 11)}${value}`;

/** Приветствие `cms serve`: знак, адреса, база, сводка по страницам и что делать дальше. */
export var motd = (
  paint: Paint,
  summary: ServeSummary,
  language: Language
): string =>
  ((text) =>
    [
      '',
      ..._mark(paint, summary.version, language),
      '',
      _row(paint, text.site, paint.path(summary.url)),
      ...(summary.https
        ? [_row(paint, 'HTTPS', _https(paint, summary.https, language))]
        : []),
      _row(
        paint,
        text.manager,
        paint.path(new URL('manager', summary.url).href)
      ),
      _row(paint, text.db, summary.db),
      _row(
        paint,
        text.pages,
        [
          pages(summary.pages, language),
          `${paint.ok('●')} ${text.published} ${summary.published}`,
          ...(summary.trashed > 0
            ? [`${text.trashed} ${summary.trashed}`]
            : []),
        ].join(paint.dim(' · '))
      ),
      ...(summary.fresh
        ? [
            '',
            `  ${paint.ok('▸')} ${text.fresh}`,
            `    ${paint.dim(text.ready)} ${paint.bold(PROGRAM)} ${paint.command('new')}`,
          ]
        : []),
      ...(summary.setupUrl
        ? [
            '',
            `  ${paint.warn('▸')} ${text.noUsers}`,
            `    ${paint.path(summary.setupUrl)}`,
            `    ${paint.dim(text.noBrowser)} ${paint.bold(PROGRAM)} ${paint.command('users add')} ${paint.dim(text.email)}`,
          ]
        : []),
      '',
      `  ${paint.bold(PROGRAM)} ${paint.command('help')} ${paint.dim(text.help)} Ctrl+C ${paint.dim(text.stop)}`,
      '',
    ].join('\n'))(_TEXT[language]);

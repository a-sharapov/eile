import { PRODUCT } from '../product.ts';
import { type Paint, padEnd } from './paint.ts';

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

/** «12 страниц», «1 страница»: русские формы числа для сводок CLI. */
export var pages = (n: number): string =>
  _count(n, 'страница', 'страницы', 'страниц');

// Знак — ветка схемы сайта со статусами страниц, как в дереве менеджера: опубликована, по расписанию,
// черновик. Рядом — название и строка о том, что это.
const _mark = (paint: Paint, version: string): string[] => [
  `  ${paint.ok('●')}${paint.dim('─┬─')}${paint.ok('●')}  ${paint.accent(PRODUCT)} ${paint.dim(version)}`,
  `    ${paint.dim('├─')}${paint.warn('◐')}  сайт и менеджер в одном файле`,
  `    ${paint.dim('└─')}${paint.dim('○')}  ${paint.dim('страницы, шаблоны, медиатека')}`,
];

const _https = (
  paint: Paint,
  https: NonNullable<ServeSummary['https']>
): string =>
  (https.notAfter
    ? `сертификат до ${https.notAfter.slice(0, 10)}`
    : `${paint.warn('выпускается сертификат')} ${paint.dim('— пока сайт по HTTP')}`) +
  (https.staging ? paint.dim(' · тестовый центр') : '');

const _row = (paint: Paint, label: string, value: string): string =>
  `  ${padEnd(paint.dim(label), 11)}${value}`;

/** Приветствие `cms serve`: знак, адреса, база, сводка по страницам и что делать дальше. */
export var motd = (paint: Paint, summary: ServeSummary): string =>
  [
    '',
    ..._mark(paint, summary.version),
    '',
    _row(paint, 'Сайт', paint.path(summary.url)),
    ...(summary.https
      ? [_row(paint, 'HTTPS', _https(paint, summary.https))]
      : []),
    _row(paint, 'Менеджер', paint.path(new URL('manager', summary.url).href)),
    _row(paint, 'База', summary.db),
    _row(
      paint,
      'Страницы',
      [
        pages(summary.pages),
        `${paint.ok('●')} опубликовано ${summary.published}`,
        ...(summary.trashed > 0 ? [`в корзине ${summary.trashed}`] : []),
      ].join(paint.dim(' · '))
    ),
    ...(summary.fresh
      ? [
          '',
          `  ${paint.ok('▸')} Новая база: страница приветствия и пустой шаблон.`,
          `    ${paint.dim('Готовый сайт — блог, портфолио, магазин:')} ${paint.bold('cms')} ${paint.command('new')}`,
        ]
      : []),
    ...(summary.setupUrl
      ? [
          '',
          `  ${paint.warn('▸')} Пользователей ещё нет. Администратор создаётся по ссылке:`,
          `    ${paint.path(summary.setupUrl)}`,
          `    ${paint.dim('или без браузера:')} ${paint.bold('cms')} ${paint.command('users add')} ${paint.dim('<почта>')}`,
        ]
      : []),
    '',
    `  ${paint.bold('cms')} ${paint.command('help')} ${paint.dim('— команды и примеры ·')} Ctrl+C ${paint.dim('— остановить')}`,
    '',
  ].join('\n');

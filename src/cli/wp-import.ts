import { type App, createApp } from '../app.ts';
import { parseDump } from '../evo-import/sql-dump.ts';
import {
  clearWelcome,
  untouched,
  WELCOME,
  WELCOME_EN,
} from '../scaffolds/index.ts';
import { importWordPress, type WpReport } from '../wp-import/import.ts';
import { parseMediaSource } from '../wp-import/media.ts';
import { siteFromDump, siteFromWxr, type WpSite } from '../wp-import/source.ts';
import { type Context, cliError } from './context.ts';
import type { Language } from './language.ts';
import { type Paint, padEnd } from './paint.ts';
import { PROGRAM } from './program.ts';
import { onSnapshot } from './redirects.ts';

const _SAY = {
  ru: {
    needFile:
      'Нужен файл: экспорт WordPress (WXR, .xml) или дамп MySQL (.sql, .sql.gz) — cms import-wp <файл> --db site.db',
    noFile: (file: string) => `Нет файла ${file}.`,
    badInto: (raw: string) => `--into — id страницы, а не «${raw}».`,
    done: (db: string) => `Перенесено из WordPress в ${db}:`,
    dry: (db: string) => `Пробный прогон для ${db} — база не изменена:`,
    source: { wxr: 'экспорт WXR', sql: 'дамп MySQL' },
    pages: 'Страницы',
    posts: 'Записи',
    taxonomy: 'Рубрики',
    media: 'Медиатека',
    text: 'Текст',
    seo: 'SEO',
    menu: 'Меню',
    redirects: 'Переадресации',
    authors: 'Авторы',
    counts: (c: WpReport['pages']) =>
      [
        `${c.total}`,
        c.published ? `опубликовано ${c.published}` : '',
        c.drafts ? `черновики ${c.drafts}` : '',
        c.scheduled ? `по расписанию ${c.scheduled}` : '',
        c.private ? `личные → черновики ${c.private}` : '',
        c.protected ? `с паролем → черновики ${c.protected}` : '',
      ].filter(Boolean),
    section: (title: string, id: number, created: boolean) =>
      `в разделе «${title}» [~${id}~]${created ? ', раздел новый' : ''}`,
    terms: (r: WpReport['taxonomy']) =>
      `рубрик ${r.categories}, меток ${r.tags} → поля categories и tags; архивы ведут в раздел`,
    multiple: (n: number) => `записей с несколькими рубриками: ${n}`,
    mediaLine: (m: WpReport['media']) =>
      m.source === null
        ? `вложений ${m.attachments} — не перенесены: нет --media`
        : `${m.imported} из ${m.attachments} файлов · обложки ${m.featured}`,
    variants: 'уменьшенные копии картинок сервер сделает сам при запуске',
    textLine: (n: WpReport['content']) =>
      [
        `картинки ${n.figures}`,
        `галереи ${n.galleries}`,
        `видео ${n.videos}`,
        `ссылки на страницы ${n.links}`,
        n.tables ? `таблицы → абзацы ${n.tables}` : '',
        n.shifted ? 'заголовки сдвинуты: h1 печатает шаблон' : '',
      ].filter(Boolean),
    seoLine: (s: WpReport['seo']) =>
      s.plugins.length === 0
        ? 'полей SEO нет'
        : `${s.plugins.join(', ')}: заголовки ${s.titles} · описания ${s.descriptions} · noindex ${s.noindex}`,
    menuLine: (m: NonNullable<WpReport['menu']>) =>
      `«${m.name}»: пунктов ${m.items}, на месте ${m.placed}, ссылками ${m.links}; страниц не в меню ${m.hidden} — скрыты`,
    noMenu: 'меню нет — порядок страниц из WordPress, все видны',
    rulesLine: (r: WpReport['redirects']) =>
      `${r.created}: точных ${r.created - r.query - r.prefix}, с query ${r.query}, разделов ${r.prefix}`,
    authorsLine: (list: string) => `${list} — пользователи не переносятся`,
    attention: 'Требует внимания:',
    forms: (names: string) =>
      `формы плагинов: ${names} — соберите заново в «Формах»`,
    builders: 'вёрстка конструкторов и ACF не переносится, текст — сохранён:',
    noText: 'текста нет',
    unresolved: 'свои ссылки без страницы (остались адресом):',
    images: 'картинки не из медиатеки (убраны):',
    embeds: 'встраивания стали ссылками:',
    shortcodes: 'шорткоды без соответствия (убраны, текст внутри — остался):',
    blocks: 'блоки без соответствия:',
    mediaSkipped: 'файлы не перенесены:',
    rulesSkipped: 'правила не созданы:',
    nested: (n: number) =>
      `вложенность меню расходится с деревом страниц у ${n} пунктов: дерево не менялось`,
    menuSkipped: 'пункты меню без соответствия:',
    skippedTypes: 'не переносятся:',
    comments: (n: number) => `комментарии: ${n}`,
    html: (n: number) => `блоки «Свой HTML»: ${n} — разметка почищена`,
    code: (n: number) =>
      `код и предформатированный текст: ${n} — строками-абзацами`,
    warnings: 'ошибки записей:',
    more: (n: number) => `… и ещё ${n}`,
    run: 'Запустить сайт:',
    again: 'Перенос по-настоящему — та же команда без --dry-run.',
    reasons: {
      missing: 'нет файла',
      'too-large': 'больше 25 МБ',
      type: 'тип не принимает медиатека',
      exists: 'уже есть в медиатеке',
      'download-failed': 'не скачался',
      'read-failed': 'не прочитался',
    } as Record<string, string>,
  },
  en: {
    needFile:
      'A file is needed: a WordPress export (WXR, .xml) or a MySQL dump (.sql, .sql.gz) — cms import-wp <file> --db site.db',
    noFile: (file: string) => `No file ${file}.`,
    badInto: (raw: string) => `--into takes a page id, not “${raw}”.`,
    done: (db: string) => `Imported from WordPress into ${db}:`,
    dry: (db: string) => `Dry run for ${db} — the database is unchanged:`,
    source: { wxr: 'WXR export', sql: 'MySQL dump' },
    pages: 'Pages',
    posts: 'Posts',
    taxonomy: 'Categories',
    media: 'Media',
    text: 'Text',
    seo: 'SEO',
    menu: 'Menu',
    redirects: 'Redirects',
    authors: 'Authors',
    counts: (c: WpReport['pages']) =>
      [
        `${c.total}`,
        c.published ? `published ${c.published}` : '',
        c.drafts ? `drafts ${c.drafts}` : '',
        c.scheduled ? `scheduled ${c.scheduled}` : '',
        c.private ? `private → drafts ${c.private}` : '',
        c.protected ? `password → drafts ${c.protected}` : '',
      ].filter(Boolean),
    section: (title: string, id: number, created: boolean) =>
      `in the section “${title}” [~${id}~]${created ? ', a new section' : ''}`,
    terms: (r: WpReport['taxonomy']) =>
      `${r.categories} categories, ${r.tags} tags → fields categories and tags; archives lead to the section`,
    multiple: (n: number) => `posts with several categories: ${n}`,
    mediaLine: (m: WpReport['media']) =>
      m.source === null
        ? `${m.attachments} attachments — not imported: no --media`
        : `${m.imported} of ${m.attachments} files · featured ${m.featured}`,
    variants: 'the server makes the smaller image copies itself when it starts',
    textLine: (n: WpReport['content']) =>
      [
        `images ${n.figures}`,
        `galleries ${n.galleries}`,
        `videos ${n.videos}`,
        `page links ${n.links}`,
        n.tables ? `tables → paragraphs ${n.tables}` : '',
        n.shifted ? 'headings shifted: the template prints h1' : '',
      ].filter(Boolean),
    seoLine: (s: WpReport['seo']) =>
      s.plugins.length === 0
        ? 'no SEO fields'
        : `${s.plugins.join(', ')}: titles ${s.titles} · descriptions ${s.descriptions} · noindex ${s.noindex}`,
    menuLine: (m: NonNullable<WpReport['menu']>) =>
      `“${m.name}”: ${m.items} items, ${m.placed} placed, ${m.links} as links; ${m.hidden} pages not in the menu — hidden`,
    noMenu: 'no menu — page order from WordPress, all visible',
    rulesLine: (r: WpReport['redirects']) =>
      `${r.created}: exact ${r.created - r.query - r.prefix}, with a query ${r.query}, sections ${r.prefix}`,
    authorsLine: (list: string) => `${list} — users are not imported`,
    attention: 'Needs attention:',
    forms: (names: string) =>
      `plugin forms: ${names} — rebuild them in “Forms”`,
    builders: 'page builder and ACF layouts are not imported, their text is:',
    noText: 'no text',
    unresolved: 'own links without a page (kept as addresses):',
    images: 'images not in the media library (removed):',
    embeds: 'embeds turned into links:',
    shortcodes: 'unmapped shortcodes (removed, the text inside kept):',
    blocks: 'unmapped blocks:',
    mediaSkipped: 'files not imported:',
    rulesSkipped: 'rules not created:',
    nested: (n: number) =>
      `menu nesting differs from the page tree for ${n} items: the tree was not changed`,
    menuSkipped: 'unmapped menu items:',
    skippedTypes: 'not imported:',
    comments: (n: number) => `comments: ${n}`,
    html: (n: number) => `“Custom HTML” blocks: ${n} — markup cleaned`,
    code: (n: number) => `code and preformatted text: ${n} — as paragraphs`,
    warnings: 'record errors:',
    more: (n: number) => `… and ${n} more`,
    run: 'Run the site:',
    again: 'To import for real, run the same command without --dry-run.',
    reasons: {
      missing: 'no file',
      'too-large': 'larger than 25 MB',
      type: 'type not accepted by the media library',
      exists: 'already in the media library',
      'download-failed': 'download failed',
      'read-failed': 'could not be read',
    } as Record<string, string>,
  },
} satisfies Record<Language, unknown>;

type _Say = (typeof _SAY)['ru'];

const _LIMIT = 10;

const _row = (paint: Paint, label: string, value: string): string =>
  `  ${padEnd(paint.dim(label), 15)}${value}`;

const _list = (
  paint: Paint,
  say: _Say,
  title: string,
  items: readonly string[]
): string[] =>
  items.length === 0
    ? []
    : [
        `  ${paint.warn('•')} ${title}`,
        ...items.slice(0, _LIMIT).map((_) => `      ${_}`),
        ...(items.length > _LIMIT
          ? [`      ${paint.dim(say.more(items.length - _LIMIT))}`]
          : []),
      ];

const _counted = (table: Readonly<Record<string, number>>): string[] =>
  Object.entries(table)
    .toSorted((a, b) => b[1] - a[1])
    .map(({ 0: name, 1: n }) => `${name} ×${n}`);

/** Отчёт переноса для человека: сводка, затем то, что требует внимания. */
export var reportText = (
  paint: Paint,
  language: Language,
  db: string,
  report: WpReport
): string => {
  const say = _SAY[language];
  const dot = paint.dim(' · ');
  const attention = [
    ...(report.content.forms.length > 0
      ? [`  ${paint.warn('•')} ${say.forms(report.content.forms.join(', '))}`]
      : []),
    ..._list(
      paint,
      say,
      say.builders,
      report.builders.map(
        (_) =>
          `${_.builder}: «${_.title}» [~${_.id}~]${_.text ? '' : ` — ${say.noText}`}`
      )
    ),
    ..._list(paint, say, say.unresolved, report.content.unresolved),
    ..._list(paint, say, say.images, report.content.images),
    ..._list(paint, say, say.embeds, report.content.embeds),
    ..._list(paint, say, say.shortcodes, _counted(report.content.shortcodes)),
    ..._list(paint, say, say.blocks, _counted(report.content.blocks)),
    ...(report.content.html > 0
      ? [`  ${paint.warn('•')} ${say.html(report.content.html)}`]
      : []),
    ...(report.content.code > 0
      ? [`  ${paint.warn('•')} ${say.code(report.content.code)}`]
      : []),
    ..._list(
      paint,
      say,
      say.mediaSkipped,
      report.media.skipped.map(
        (_) => `${_.file} — ${say.reasons[_.reason] ?? _.reason}`
      )
    ),
    ...(report.menu && report.menu.nested > 0
      ? [`  ${paint.warn('•')} ${say.nested(report.menu.nested)}`]
      : []),
    ..._list(paint, say, say.menuSkipped, report.menu?.skipped ?? []),
    ..._list(
      paint,
      say,
      say.rulesSkipped,
      report.redirects.skipped.map((_) => `${_.from} — ${_.reason}`)
    ),
    ..._list(paint, say, say.skippedTypes, [
      ...report.skipped.map((_) => `${_.type} (${_.status}) ×${_.count}`),
      ...(report.comments > 0 ? [say.comments(report.comments)] : []),
    ]),
    ..._list(paint, say, say.warnings, report.warnings),
  ];
  return [
    `${paint.ok('✓')} ${report.dryRun ? say.dry(db) : say.done(db)} ${paint.dim(`(${say.source[report.source]})`)}`,
    _row(paint, say.pages, say.counts(report.pages).join(dot)),
    ...(report.posts.total > 0
      ? [
          _row(
            paint,
            say.posts,
            [
              ...say.counts(report.posts),
              ...(report.section
                ? [
                    say.section(
                      report.section.title,
                      report.section.id,
                      report.section.created
                    ),
                  ]
                : []),
            ].join(dot)
          ),
          _row(
            paint,
            say.taxonomy,
            [
              say.terms(report.taxonomy),
              ...(report.taxonomy.multiple > 0
                ? [say.multiple(report.taxonomy.multiple)]
                : []),
            ].join(dot)
          ),
        ]
      : []),
    _row(paint, say.media, say.mediaLine(report.media)),
    ...(report.media.images > 0 && !report.dryRun
      ? [_row(paint, '', paint.dim(say.variants))]
      : []),
    _row(paint, say.text, say.textLine(report.content).join(dot)),
    _row(paint, say.seo, say.seoLine(report.seo)),
    _row(paint, say.menu, report.menu ? say.menuLine(report.menu) : say.noMenu),
    _row(paint, say.redirects, say.rulesLine(report.redirects)),
    ...(report.authors.length > 0
      ? [
          _row(
            paint,
            say.authors,
            say.authorsLine(
              report.authors.map((_) => `${_.name} (${_.posts})`).join(', ')
            )
          ),
        ]
      : []),
    ...(attention.length > 0
      ? ['', paint.warn(say.attention), ...attention]
      : []),
    '',
    report.dryRun
      ? say.again
      : `${say.run} ${paint.bold(PROGRAM)} ${paint.flag('--db')} ${db}`,
  ].join('\n');
};

/** Сайт WordPress из файла: WXR по началу текста, дамп — всё остальное; `.gz` распаковывается. */
export var readWordPress = (bytes: Uint8Array<ArrayBuffer>): WpSite =>
  ((raw) =>
    ((head) =>
      head.startsWith('<?xml') || head.startsWith('<rss')
        ? siteFromWxr(raw)
        : siteFromDump(parseDump(new TextDecoder().decode(raw))))(
      new TextDecoder()
        .decode(raw.subarray(0, 256))
        .replace(/^\uFEFF/, '')
        .trimStart()
    ))(bytes[0] === 0x1f && bytes[1] === 0x8b ? Bun.gunzipSync(bytes) : bytes);

const _into = (ctx: Context): number | null =>
  ctx.options.into === undefined ? null : Number(ctx.options.into);

// Нетронутое приветствие новой базы — не работа человека: перенос заменяет его, как `cms new`.
const _run = (
  app: App,
  site: WpSite,
  ctx: Context,
  dryRun: boolean
): Promise<WpReport> =>
  Promise.resolve().then(() =>
    ((into) => (
      void (
        into === null &&
        [WELCOME, WELCOME_EN].some((_) => untouched(_, app)) &&
        clearWelcome(app)
      ),
      importWordPress(app, site, {
        into,
        media: ctx.options.media ? parseMediaSource(ctx.options.media) : null,
        dryRun,
      })
    ))(_into(ctx))
  );

/** `cms import-wp <файл>`: перенос сайта WordPress; `--dry-run` — на снимке базы, без записи. */
export var runImportWp = (ctx: Context): Promise<void> =>
  (ctx.args[0] === undefined
    ? Promise.reject(cliError(_SAY[ctx.language].needFile))
    : ctx.options.into !== undefined && !/^[1-9]\d*$/.test(ctx.options.into)
      ? Promise.reject(cliError(_SAY[ctx.language].badInto(ctx.options.into)))
      : Promise.resolve(ctx.args[0])
  )
    .then((file) =>
      Bun.file(file)
        .exists()
        .then((exists) =>
          exists
            ? Bun.file(file).bytes()
            : Promise.reject(cliError(_SAY[ctx.language].noFile(file)))
        )
    )
    .then(readWordPress)
    .then((site) =>
      ctx.options.dryRun
        ? Bun.file(ctx.options.db)
            .exists()
            .then((exists) =>
              exists
                ? onSnapshot(ctx.options.db, (app) =>
                    _run(app, site, ctx, true)
                  )
                : ((app) =>
                    _run(app, site, ctx, true).finally(() => app.close()))(
                    createApp()
                  )
            )
        : ((app) => _run(app, site, ctx, false).finally(() => app.close()))(
            createApp({
              databasePath: ctx.options.db,
              ...(ctx.options.mediaCache
                ? { mediaCache: ctx.options.mediaCache }
                : {}),
            })
          )
    )
    .then((report) =>
      ctx.out(
        ctx.options.json
          ? JSON.stringify(report, null, 2)
          : reportText(ctx.paint, ctx.language, ctx.options.db, report)
      )
    );

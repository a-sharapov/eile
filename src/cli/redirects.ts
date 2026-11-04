import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type App, createApp } from '../app.ts';
import {
  checkRedirects,
  type Hop,
  MAX_HOPS,
  OUTCOMES,
  type Outcome,
  type Probe,
  type RedirectReport,
  type RedirectResult,
  readUrlSource,
  shownUrl,
} from '../contexts/diagnostics/index.ts';
import { backupDatabase } from '../platform/database.ts';
import { PRODUCT } from '../product.ts';
import { type Context, cliError } from './context.ts';
import type { Language } from './language.ts';
import { type Paint, padEnd } from './paint.ts';
import { named, PROGRAM } from './program.ts';
import { readStdin } from './prompt.ts';
import { VERSION } from './version.ts';

/** Сеть для `--base`, sitemap по адресу и файлов индекса sitemap; тесты подставляют свою. */
export type Network = (url: string, init: RequestInit) => Promise<Response>;

const _SAY = {
  ru: {
    noDb: (db: string) => `Нет базы ${db}. Укажите файл: --db site.db`,
    needList:
      'Нужен список старых адресов: файл, sitemap.xml (файл или адрес) или stdin — cms help diagnose',
    noFile: (file: string) => `Нет файла ${file}.`,
    notLoaded: (url: string, status: number) =>
      `${url} не скачался: ответ ${status}`,
    empty: 'В списке нет ни одного адреса.',
    badBase: (base: string) =>
      `--base — адрес сайта вида https://example.com, а не ${base}`,
    failed: (n: number) => `Адресов с ошибками: ${n}`,
    checked: (n: number, origin: string) => `Адресов ${n} на ${origin}`,
    snapshot: (db: string) => `снимок базы ${db}`,
    live: 'по сети',
    fine: (n: number) => `в порядке ${n}`,
    broken: (n: number) => `с ошибками ${n}`,
    slash: (n: number) => `со слэшем на конце ${n}`,
    slashFates: { removed: 'слэш убран', kept: 'слэш остался' },
    query: (n: number) => `с query ${n}`,
    queryFates: {
      kept: 'query сохранён',
      dropped: 'потерян',
      changed: 'изменён',
    },
    noAnswer: 'нет ответа',
    outcomes: {
      moved: 'переадресация',
      same: 'отвечает сам',
      chain: 'цепочка',
      temporary: 'временная переадресация',
      loop: 'петля',
      too_many: `больше ${MAX_HOPS} переходов`,
      external: 'на другой хост',
      not_found: 'нет страницы',
      error: 'ошибка',
      unreachable: 'нет ответа',
      wrong_target: 'не туда',
      query_ignored: 'query не учтён',
    } satisfies Record<Outcome, string>,
    chain: (n: number) => `переходов ${n}, а нужен один`,
    temporary: (status: number) =>
      `${status} — временная: поисковики оставят старый адрес, нужна 301`,
    loop: 'петля: адрес ведёт туда, где уже был',
    tooMany: `больше ${MAX_HOPS} переходов`,
    external: (host: string) => `уводит на другой хост: ${host}`,
    notFound: 'нет страницы',
    error: (status: number) => `ответ ${status}`,
    unreachable: (error: string) => `нет ответа: ${error}`,
    wrongTarget: (expected: string) => `ждали ${expected}`,
    queryIgnored: (path: string) =>
      `страницу выбирает путь ${path}, query она не видит: старый адрес молча открывает её`,
  },
  en: {
    noDb: (db: string) => `No database ${db}. Name the file: --db site.db`,
    needList:
      'A list of old addresses is needed: a file, sitemap.xml (a file or an address) or stdin. See cms help diagnose',
    noFile: (file: string) => `No file ${file}.`,
    notLoaded: (url: string, status: number) =>
      `${url} did not download: it answered ${status}`,
    empty: 'The list has no addresses.',
    badBase: (base: string) =>
      `--base is a site address like https://example.com, not ${base}`,
    failed: (n: number) => `Addresses with problems: ${n}`,
    checked: (n: number, origin: string) => `${n} addresses on ${origin}`,
    snapshot: (db: string) => `a snapshot of ${db}`,
    live: 'over the network',
    fine: (n: number) => `fine ${n}`,
    broken: (n: number) => `with problems ${n}`,
    slash: (n: number) => `with a trailing slash ${n}`,
    slashFates: { removed: 'slash removed', kept: 'slash kept' },
    query: (n: number) => `with a query ${n}`,
    queryFates: { kept: 'query kept', dropped: 'dropped', changed: 'changed' },
    noAnswer: 'no answer',
    outcomes: {
      moved: 'redirected',
      same: 'answers itself',
      chain: 'chain',
      temporary: 'temporary redirect',
      loop: 'loop',
      too_many: `over ${MAX_HOPS} hops`,
      external: 'to another host',
      not_found: 'not found',
      error: 'error',
      unreachable: 'no answer',
      wrong_target: 'wrong target',
      query_ignored: 'query ignored',
    } satisfies Record<Outcome, string>,
    chain: (n: number) => `${n} hops where one is enough`,
    temporary: (status: number) =>
      `${status} is temporary: search engines keep the old address, use 301`,
    loop: 'a loop: the address leads back where it has been',
    tooMany: `over ${MAX_HOPS} hops`,
    external: (host: string) => `leaves for another host: ${host}`,
    notFound: 'no such page',
    error: (status: number) => `answers ${status}`,
    unreachable: (error: string) => `no answer: ${error}`,
    wrongTarget: (expected: string) => `expected ${expected}`,
    queryIgnored: (path: string) =>
      `the path ${path} picks the page and the query does not: the old address opens it silently`,
  },
} satisfies Record<Language, unknown>;

type _Say = (typeof _SAY)['ru'];

const _reject = (message: string): Promise<never> =>
  Promise.reject(cliError(named(PROGRAM)(message)));

const _REQUEST = {
  redirect: 'manual',
  headers: {
    accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
    'user-agent': `${PRODUCT}/${VERSION} (redirect check)`,
  },
} satisfies RequestInit;

// --- откуда список ------------------------------------------------------------------

const _load =
  (ctx: Context, net: Network) =>
  (url: string): Promise<Uint8Array> =>
    net(url, {
      headers: { 'user-agent': _REQUEST.headers['user-agent'] },
      signal: AbortSignal.timeout(30_000),
    }).then((response) =>
      response.ok
        ? response.bytes()
        : _reject(_SAY[ctx.language].notLoaded(url, response.status))
    );

// Без аргумента в терминале — подсказка: иначе команда молча ждала бы ввода.
const _source = (ctx: Context, net: Network): Promise<Uint8Array> =>
  ((source, say) =>
    source === undefined && ctx.tty
      ? _reject(say.needList)
      : source === undefined || source === '-'
        ? readStdin().bytes()
        : /^https?:\/\//i.test(source)
          ? _load(ctx, net)(source)
          : Bun.file(source)
              .exists()
              .then((exists) =>
                exists ? Bun.file(source).bytes() : _reject(say.noFile(source))
              ))(ctx.args[1], _SAY[ctx.language]);

// --- где проверять ------------------------------------------------------------------

const _origin = (raw: string): string | null =>
  URL.canParse(raw) && /^https?:$/.test(new URL(raw).protocol)
    ? new URL(raw).origin
    : null;

/**
 * Работа на снимке базы (VACUUM INTO, как у cms backup) в папке 700: живая база не меняется. Так идут проверка
 * редиректов — она ходит по сайту, а сайт при этом пишет счётчики, — и пробный перенос `cms import-wp --dry-run`.
 */
export var onSnapshot = <T>(
  db: string,
  run: (app: App) => Promise<T>
): Promise<T> =>
  ((dir) =>
    Promise.resolve()
      .then(() => {
        const copy = join(dir, 'site.db');
        const source = new Database(db, { readwrite: true });
        try {
          backupDatabase(source, copy);
        } finally {
          source.close();
        }
        const app = createApp({
          databasePath: copy,
          mediaCache: join(dir, 'media-cache'),
        });
        return run(app).finally(() => app.close());
      })
      .finally(() => rmSync(dir, { recursive: true, force: true })))(
    mkdtempSync(join(tmpdir(), 'cms-redirects-'))
  );

// Адрес сайта из настроек: относительные и полные переадресации на него — свои. Нет его — localhost.
const _siteOrigin = (app: App): string =>
  _origin(app.site.settings.get().siteUrl) ?? 'http://localhost';

const _inProcess =
  (app: App): Probe =>
  (url) =>
    app.fetch(new Request(url, _REQUEST));

const _network =
  (net: Network): Probe =>
  (url) =>
    net(url, { ..._REQUEST, signal: AbortSignal.timeout(15_000) });

// --- отчёт ---------------------------------------------------------------------------

const _WARN: ReadonlySet<Outcome> = new Set(['chain', 'temporary']);

const _mark = (paint: Paint, result: RedirectResult): string =>
  result.ok
    ? paint.ok('✓')
    : _WARN.has(result.outcome)
      ? paint.warn('!')
      : paint.error('✗');

const _step = (paint: Paint, say: _Say, origin: string, hop: Hop): string =>
  hop.status === null
    ? paint.error(say.noAnswer)
    : hop.location
      ? `${hop.status} ${paint.dim('→')} ${shownUrl(hop.location, origin)}`
      : String(hop.status);

const _moves = (result: RedirectResult): number =>
  result.hops.filter((_) => _.location !== null && _.status !== null).length;

const _REASON: Readonly<
  Record<Outcome, (say: _Say, result: RedirectResult, origin: string) => string>
> = {
  moved: () => '',
  same: () => '',
  chain: (say, _) => say.chain(_moves(_)),
  temporary: (say, _) =>
    say.temporary(
      _.hops.find((hop) => [302, 303, 307].includes(hop.status ?? 0))?.status ??
        302
    ),
  loop: (say) => say.loop,
  too_many: (say) => say.tooMany,
  external: (say, _) =>
    say.external(new URL(_.hops.at(-1)?.location ?? _.final).host),
  not_found: (say) => say.notFound,
  error: (say, _) => say.error(_.status ?? 0),
  unreachable: (say, _) => say.unreachable(_.hops.at(-1)?.error ?? ''),
  wrong_target: (say, _) => say.wrongTarget(_.expected ?? ''),
  query_ignored: (say, _) => say.queryIgnored(new URL(_.url).pathname),
};

// Колонка старых адресов — по самому длинному, но не шире 40: длинный адрес сдвигает только свою строку.
const _rows = (paint: Paint, say: _Say, report: RedirectReport): string[] =>
  ((width) =>
    report.results.map((result) =>
      ((reason) =>
        `${_mark(paint, result)} ${padEnd(shownUrl(result.url, report.origin), width)}  ${result.hops
          .map((_) => _step(paint, say, report.origin, _))
          .join(paint.dim(' · '))}${reason ? paint.dim(` — ${reason}`) : ''}`)(
        result.ok ? '' : _REASON[result.outcome](say, result, report.origin)
      )
    ))(
    Math.min(
      40,
      Math.max(
        0,
        ...report.results.map((_) => shownUrl(_.url, report.origin).length)
      )
    )
  );

const _counts = (say: _Say, report: RedirectReport, ok: boolean): string =>
  OUTCOMES.filter(
    (_) =>
      (_ === 'moved' || _ === 'same') === ok &&
      (report.summary.outcomes[_] ?? 0) > 0
  )
    .map((_) => `${say.outcomes[_]} ${report.summary.outcomes[_]}`)
    .join(' · ');

const _summary = (
  paint: Paint,
  say: _Say,
  report: RedirectReport,
  where: string
): string[] =>
  ((summary) => [
    '',
    `${paint.bold(say.checked(summary.total, report.origin))} ${paint.dim(`(${where})`)}`,
    `  ${paint.ok('✓')} ${say.fine(summary.ok)}${summary.ok > 0 ? `: ${_counts(say, report, true)}` : ''}`,
    ...(summary.failed > 0
      ? [
          `  ${paint.error('✗')} ${say.broken(summary.failed)}: ${_counts(say, report, false)}`,
        ]
      : []),
    ...(summary.slash.removed + summary.slash.kept > 0
      ? [
          `  ${paint.dim('/')} ${say.slash(summary.slash.removed + summary.slash.kept)}: ${say.slashFates.removed} ${summary.slash.removed} · ${say.slashFates.kept} ${summary.slash.kept}`,
        ]
      : []),
    ...(summary.query.kept + summary.query.dropped + summary.query.changed > 0
      ? [
          `  ${paint.dim('?')} ${say.query(summary.query.kept + summary.query.dropped + summary.query.changed)}: ${say.queryFates.kept} ${summary.query.kept} · ${say.queryFates.dropped} ${summary.query.dropped} · ${say.queryFates.changed} ${summary.query.changed}`,
        ]
      : []),
  ])(report.summary);

// Ошибки — код выхода 1: проверку можно поставить в CI перед переключением домена.
const _reported =
  (ctx: Context, where: string) =>
  (report: RedirectReport): Promise<void> =>
    ((say) => (
      ctx.out(
        ctx.options.json
          ? JSON.stringify(report, null, 2)
          : [
              ..._rows(ctx.paint, say, report),
              ..._summary(ctx.paint, say, report, where),
            ].join('\n')
      ),
      report.summary.failed > 0
        ? _reject(say.failed(report.summary.failed))
        : Promise.resolve()
    ))(_SAY[ctx.language]);

/**
 * `cms diagnose redirects [<список>|<sitemap>|-]`: каждый старый адрес — на сайт; ждём один 301/308 и 200
 * на своём хосте. Без `--base` — на снимке базы `--db` прямо в процессе, без сети; с `--base` — живой сайт.
 */
export var runRedirects = (ctx: Context, net: Network = fetch): Promise<void> =>
  ((say) =>
    _source(ctx, net)
      .then((bytes) => readUrlSource(bytes, _load(ctx, net)))
      .then((entries) => (entries.length === 0 ? _reject(say.empty) : entries))
      .then((entries) =>
        ctx.options.base !== undefined
          ? ((origin) =>
              origin === null
                ? _reject(say.badBase(ctx.options.base!))
                : checkRedirects({
                    probe: _network(net),
                    origin,
                    entries,
                  }).then(_reported(ctx, say.live)))(_origin(ctx.options.base))
          : Bun.file(ctx.options.db)
              .exists()
              .then((exists) =>
                exists
                  ? onSnapshot(ctx.options.db, (app) =>
                      checkRedirects({
                        probe: _inProcess(app),
                        origin: _siteOrigin(app),
                        entries,
                      })
                    ).then(_reported(ctx, say.snapshot(ctx.options.db)))
                  : _reject(say.noDb(ctx.options.db))
              )
      ))(_SAY[ctx.language]);

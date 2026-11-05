import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from '../app.ts';
import {
  defineReleases,
  GITHUB_API,
  parseReleasesUrl,
} from '../contexts/upkeep/index.ts';
import { REPOSITORY } from '../product.ts';
import {
  applyScaffold,
  clearWelcome,
  SCAFFOLDS,
  SCAFFOLDS_EN,
  type Scaffold,
  type ScaffoldReport,
  scaffoldsFor,
  untouched,
  WELCOME,
  WELCOME_EN,
} from '../scaffolds/index.ts';
import {
  buildPackage,
  checkPackage,
  type LoadedPackage,
  loadPackage,
  type PackageCheck,
  type PackageOrigin,
  packageSource,
  type SourceDeps,
  scaffoldPackage,
} from '../scaffolds/package/index.ts';
import { attempt, isDomainError } from '../shared/kernel/errors.ts';
import type { Problem } from '../workspace/index.ts';
import type { Options } from './args.ts';
import { type Context, cliError } from './context.ts';
import type { Language } from './language.ts';
import { type Paint, padEnd } from './paint.ts';
import { named, PROGRAM } from './program.ts';
import { VERSION } from './version.ts';

// `cms new`: встроенный каркас или пакет — файлом, папкой, по адресу или официальный по имени; `cms
// scaffold pack|export` для авторов пакетов (ADR 0022, ADR 0056).

const _SAY = {
  ru: {
    kb: 'КБ',
    scaffoldArg: '<каркас>',
    newMore: '— подробнее: cms help new',
    packages:
      'Пакет каркаса — файлом .zip, папкой, по адресу https с --sha256 или официальный по имени',
    about: (title: string, summary: string) => `${title} — ${summary}`,
    noScaffold: (name: string, names: string, reason: string) =>
      `Нет каркаса «${name}». Встроенные: ${names} — cms new. Официальный пакет: ${reason}`,
    noPath: (path: string) => `Нет файла или папки ${path}.`,
    hasSite: (db: string, name: string) =>
      `В базе ${db} уже есть сайт. Каркас — в новую базу: cms new ${name} --db ${name}.db`,
    created: (title: string, name: string) => `${title} «${name}» — в`,
    checked: (title: string) =>
      `Пакет «${title}» проверен, на сайт ничего не записано:`,
    pages: 'Страницы',
    elements: 'Элементы',
    fieldsAndForms: 'Поля и формы',
    media: 'Медиатека',
    translations: 'Переводы',
    keys: (n: number) => `ключей ${n}`,
    redirects: 'Редиректы',
    rules: (n: number) => `правил ${n}`,
    templates: (n: number) => `шаблонов ${n}`,
    components: (n: number) => `компонентов ${n}`,
    scripts: (n: number) => `скриптов ${n}`,
    plugins: (n: number) => `плагинов ${n}`,
    fields: (n: number) => `полей ${n}`,
    forms: (n: number) => `форм ${n}`,
    files: (n: number) => `файлов ${n}`,
    run: 'Запуск:',
    restart: ' — если сервер на этой базе уже работает, перезапустите его',
    fromRelease: (version: string) =>
      `из выпуска v${version}, SHA-256 сверена с SHA256SUMS`,
    pinned: 'SHA-256 совпала с --sha256',
    folder: 'папка на этой машине',
    package: 'Пакет',
    problems: (n: number) =>
      `Пакет не поставлен: проблем ${n}. Сайт не тронут.`,
    packProblems: (n: number) => `Архив не собран: проблем ${n}.`,
    pluginsWarning: (n: number) =>
      `В пакете плагины (${n}) — код на TypeScript, который сервер исполняет на каждом запросе с правами процесса: файлы, база, сеть. Ставьте так только код, который прочли сами. Пакет из сети с плагинами не ставьте никогда.`,
    pluginsFromNetwork:
      'Этот пакет скачан из сети: его плагины — чужой код на вашем сервере.',
    packedPlugins: (n: number) =>
      `В пакете плагины (${n}): cms new поставит его только с --allow-plugins.`,
    packed: (name: string, file: string) => `Пакет ${name} — в ${file}:`,
    size: 'Размер',
    noScaffoldCommand: (name: string) =>
      name === ''
        ? 'Что сделать: cms scaffold pack <папка> или cms scaffold export <каркас> — cms help scaffold'
        : `Нет команды cms scaffold ${name}: есть pack и export — cms help scaffold`,
    needFolder: 'Нужна папка пакета: cms scaffold pack <папка>',
    needName: (names: string) =>
      `Какой каркас выгрузить? Встроенные: ${names} — cms scaffold export <каркас>`,
    noBuiltIn: (name: string, names: string) =>
      `Нет встроенного каркаса «${name}». Есть: ${names}`,
    notEmpty: (dir: string) =>
      `Папка ${dir} не пуста: выберите другую или добавьте --force.`,
    exported: (name: string, dir: string, n: number) =>
      `Каркас ${name} — в папке ${dir}: файлов ${n}`,
    next: 'Дальше:',
    reasons: {
      'package.not_published': 'в выпуске этой версии его нет',
      'package.no_release':
        'в ленте выпусков нет версии этой cms — пакеты ставятся из её выпуска',
      'upkeep.releases_unavailable': 'страница релизов не ответила',
      _: 'не нашёлся',
    } as Readonly<Record<string, string>>,
  },
  en: {
    kb: 'KB',
    scaffoldArg: '<scaffold>',
    newMore: '· details: cms help new',
    packages:
      'A scaffold package: a .zip file, a folder, an https address with --sha256, or an official one by name',
    about: (title: string, summary: string) => `${title}: ${summary}`,
    noScaffold: (name: string, names: string, reason: string) =>
      `No scaffold “${name}”. Built in: ${names} (cms new). Official package: ${reason}`,
    noPath: (path: string) => `No file or folder ${path}.`,
    hasSite: (db: string, name: string) =>
      `${db} already has a site. Put the scaffold into a new database: cms new ${name} --db ${name}.db`,
    created: (title: string, name: string) => `${title} “${name}” in`,
    checked: (title: string) =>
      `Package “${title}” checked, nothing written to the site:`,
    pages: 'Pages',
    elements: 'Elements',
    fieldsAndForms: 'Fields, forms',
    media: 'Media',
    translations: 'Translations',
    keys: (n: number) => `keys ${n}`,
    redirects: 'Redirects',
    rules: (n: number) => `rules ${n}`,
    templates: (n: number) => `templates ${n}`,
    components: (n: number) => `components ${n}`,
    scripts: (n: number) => `scripts ${n}`,
    plugins: (n: number) => `plugins ${n}`,
    fields: (n: number) => `fields ${n}`,
    forms: (n: number) => `forms ${n}`,
    files: (n: number) => `files ${n}`,
    run: 'Run:',
    restart: ' (if a server already runs on this database, restart it)',
    fromRelease: (version: string) =>
      `from release v${version}, SHA-256 checked against SHA256SUMS`,
    pinned: 'SHA-256 matches --sha256',
    folder: 'a folder on this machine',
    package: 'Package',
    problems: (n: number) =>
      `Package not installed: ${n} problem(s). The site is untouched.`,
    packProblems: (n: number) => `No archive built: ${n} problem(s).`,
    pluginsWarning: (n: number) =>
      `The package has plugins (${n}): TypeScript the server runs on every request with the rights of the process: files, database, network. Install this only for code you have read yourself. Never install a package with plugins from the network.`,
    pluginsFromNetwork:
      'This package came from the network: its plugins are someone else’s code on your server.',
    packedPlugins: (n: number) =>
      `The package has plugins (${n}): cms new installs it only with --allow-plugins.`,
    packed: (name: string, file: string) => `Package ${name} in ${file}:`,
    size: 'Size',
    noScaffoldCommand: (name: string) =>
      name === ''
        ? 'What to do: cms scaffold pack <folder> or cms scaffold export <scaffold> (cms help scaffold)'
        : `No command cms scaffold ${name}: there are pack and export (cms help scaffold)`,
    needFolder: 'Name the package folder: cms scaffold pack <folder>',
    needName: (names: string) =>
      `Which scaffold to export? Built in: ${names} (cms scaffold export <scaffold>)`,
    noBuiltIn: (name: string, names: string) =>
      `No built-in scaffold “${name}”. There are: ${names}`,
    notEmpty: (dir: string) =>
      `The folder ${dir} is not empty: pick another one or add --force.`,
    exported: (name: string, dir: string, n: number) =>
      `Scaffold ${name} in the folder ${dir}: files ${n}`,
    next: 'Next:',
    reasons: {
      'package.not_published': 'the release of this version has none',
      'package.no_release':
        'the releases feed has no release of this cms version, and packages come from it',
      'upkeep.releases_unavailable': 'the releases page did not answer',
      _: 'not found',
    } as Readonly<Record<string, string>>,
  },
} satisfies Record<Language, unknown>;

type _Say = (typeof _SAY)['ru'];

const _say = (ctx: Pick<Context, 'language'>): _Say => _SAY[ctx.language];

const _reject = (message: string): Promise<never> =>
  Promise.reject(cliError(message));

const _row = (paint: Paint, label: string, value: string): string =>
  `  ${padEnd(paint.dim(label), 14)}${value}`;

const _dot = (paint: Paint): string => paint.dim(' · ');

// Новая база встречает на языке системы: приветствие и язык сайта.
const _WELCOMES: readonly Scaffold[] = [WELCOME, WELCOME_EN];

// CMS_RELEASES_URL — уже проверенным; не задан — GitHub.
const _releasesUrl = (options: Options): string =>
  options.releasesUrl
    ? parseReleasesUrl(options.releasesUrl, options.releasesInsecure === true)
    : GITHUB_API;

const _names = (language: Language): string =>
  scaffoldsFor(language)
    .map((_) => _.name)
    .join(', ');

// --- отчёт ---------------------------------------------------------------

const _reportLines = (
  paint: Paint,
  say: _Say,
  report: ScaffoldReport
): string[] => [
  _row(paint, say.pages, String(report.pages)),
  _row(
    paint,
    say.elements,
    [
      say.templates(report.templates),
      say.components(report.components),
      ...(report.scripts > 0 ? [say.scripts(report.scripts)] : []),
      ...(report.plugins > 0 ? [say.plugins(report.plugins)] : []),
    ].join(_dot(paint))
  ),
  _row(
    paint,
    say.fieldsAndForms,
    `${say.fields(report.fields)}${_dot(paint)}${say.forms(report.forms)}`
  ),
  ...(report.media > 0
    ? [_row(paint, say.media, say.files(report.media))]
    : []),
  ...(report.translations > 0
    ? [_row(paint, say.translations, say.keys(report.translations))]
    : []),
  ...(report.redirects > 0
    ? [_row(paint, say.redirects, say.rules(report.redirects))]
    : []),
];

const _where = (problem: Problem): string =>
  problem.line === undefined
    ? problem.file
    : `${problem.file}:${problem.line}:${problem.column ?? 1}`;

// Та же строка, что у `cms elements check`: файл:строка:столбец, сообщение, код.
const _problemLines = (paint: Paint, problems: readonly Problem[]): string[] =>
  problems.map(
    (_) =>
      `${paint.error('✗')} ${paint.path(_where(_))}  ${_.message.replace(/\s*\n\s*/g, ' ')} ${paint.dim(_.code)}`
  );

const _originLine = (paint: Paint, say: _Say, origin: PackageOrigin): string =>
  `${paint.dim(`${say.package}:`)} ${paint.path(origin.label)}${paint.dim(
    ` · ${
      origin.verified === 'release'
        ? say.fromRelease(origin.release ?? '')
        : origin.verified === 'pinned'
          ? say.pinned
          : origin.sha256 === null
            ? say.folder
            : `SHA-256 ${origin.sha256}`
    }`
  )}`;

const _pluginLines = (
  paint: Paint,
  say: _Say,
  plugins: number,
  origin: PackageOrigin
): string[] =>
  plugins === 0
    ? []
    : [
        `${paint.warn('!')} ${paint.warn(say.pluginsWarning(plugins))}`,
        ...(origin.verified === 'none'
          ? []
          : [`${paint.warn('!')} ${paint.warn(say.pluginsFromNetwork)}`]),
      ];

// --- cms new -------------------------------------------------------------

const _catalog = (paint: Paint, language: Language): string =>
  ((say) =>
    [
      '',
      // Каркасы — на языке CLI: по-английски и сами сайты английские.
      ...scaffoldsFor(language).map(
        (_) =>
          `  ${padEnd(paint.command(_.name), 12)}${say.about(_.title, _.summary)}`
      ),
      '',
      `  ${paint.bold(PROGRAM)} ${paint.command('new')} ${paint.dim(say.scaffoldArg)} ${paint.flag('--db')} site.db ${paint.dim(named(PROGRAM)(say.newMore))}`,
      `  ${paint.dim(say.packages)}`,
      '',
    ].join('\n'))(_SAY[language]);

type _Installed = {
  readonly report: ScaffoldReport;
  readonly name: string;
};

// Каркас ложится на новую базу или на нетронутое приветствие одной транзакцией: всё или ничего.
// Пользователи остаются. Варианты картинок сервер нарезает тут же, а не при первом запуске.
const _install = (ctx: Context, scaffold: Scaffold): Promise<_Installed> =>
  ((app) =>
    Promise.resolve()
      .then(() =>
        _WELCOMES.some((_) => untouched(_, app))
          ? app.transaction(
              () => (
                clearWelcome(app),
                applyScaffold(scaffold, app, ctx.options.name)
              )
            )
          : _reject(_say(ctx).hasSite(ctx.options.db, scaffold.name))
      )
      .then((report) =>
        app.media.variants
          .run()
          .then(() => ({ report, name: app.site.settings.get().name }))
      )
      .finally(() => app.close()))(createApp({ databasePath: ctx.options.db }));

const _created = (
  ctx: Context,
  scaffold: Scaffold,
  installed: _Installed,
  before: readonly string[] = []
): void =>
  ((say) =>
    ctx.out(
      [
        ...before,
        `${ctx.paint.ok('✓')} ${say.created(scaffold.title, installed.name)} ${ctx.paint.path(ctx.options.db)}:`,
        ..._reportLines(ctx.paint, say, installed.report),
        '',
        `${say.run} ${ctx.paint.bold(PROGRAM)} ${ctx.paint.flag('--db')} ${ctx.options.db}${ctx.paint.dim(say.restart)}`,
      ].join('\n')
    ))(_say(ctx));

const _deps = (ctx: Context): SourceDeps =>
  ((get) => ({
    fetch: get,
    releases: defineReleases({
      base: _releasesUrl(ctx.options),
      repository: REPOSITORY,
      version: VERSION,
      fetch: get,
    }),
    version: VERSION,
    insecure: ctx.options.releasesInsecure === true,
    ...(ctx.options.sha256 ? { sha256: ctx.options.sha256 } : {}),
  }))(ctx.fetch ?? fetch);

const _exists = (path: string): boolean =>
  attempt(
    () => (statSync(path), true),
    () => false
  );

// Имя без пути и .zip, которого нет на диске, — опечатка в имени каркаса, а не путь.
const _looksLikePath = (arg: string): boolean =>
  /[\\/]|\.zip$/i.test(arg) || _exists(arg);

const _load = (ctx: Context, arg: string): Promise<LoadedPackage> =>
  ((source) =>
    source.kind === 'path' && !_looksLikePath(source.path)
      ? _reject(
          _say(ctx).noScaffold(arg, _names(ctx.language), _say(ctx).reasons._!)
        )
      : source.kind === 'path' && !_exists(source.path)
        ? _reject(_say(ctx).noPath(source.path))
        : Promise.resolve()
            .then(() => loadPackage(source, _deps(ctx)))
            .then(undefined, (error) =>
              source.kind === 'official' &&
              (!isDomainError(error) || error.code in _say(ctx).reasons)
                ? _reject(
                    _say(ctx).noScaffold(
                      arg,
                      _names(ctx.language),
                      isDomainError(error)
                        ? (_say(ctx).reasons[error.code] ?? error.message)
                        : _say(ctx).reasons['upkeep.releases_unavailable']!
                    )
                  )
                : Promise.reject(error)
            ))(packageSource(arg));

const _checked = (ctx: Context, loaded: LoadedPackage): PackageCheck =>
  loaded.problems.length > 0
    ? {
        manifest: null,
        scaffold: null,
        report: null,
        problems: loaded.problems,
      }
    : checkPackage(loaded.files, {
        language: ctx.language,
        allowPlugins: ctx.options.allowPlugins === true,
      });

const _refused = (
  ctx: Context,
  problems: readonly Problem[]
): Promise<never> => (
  ctx.out(_problemLines(ctx.paint, problems).join('\n')),
  _reject(_say(ctx).problems(problems.length))
);

const _newPackage = (ctx: Context, arg: string): Promise<void> =>
  _load(ctx, arg).then((loaded) =>
    ((check, say) =>
      check.problems.length > 0 ||
      check.scaffold === null ||
      check.report === null
        ? _refused(ctx, check.problems)
        : ((scaffold, report, head) =>
            ctx.options.check
              ? Promise.resolve(
                  ctx.out(
                    [
                      ...head,
                      `${ctx.paint.ok('✓')} ${say.checked(scaffold.title)}`,
                      ..._reportLines(ctx.paint, say, report),
                    ].join('\n')
                  )
                )
              : _install(ctx, scaffold).then((installed) =>
                  _created(ctx, scaffold, installed, head)
                ))(check.scaffold, check.report, [
            _originLine(ctx.paint, say, loaded.origin),
            ..._pluginLines(
              ctx.paint,
              say,
              check.report.plugins,
              loaded.origin
            ),
          ]))(_checked(ctx, loaded), _say(ctx))
  );

/** `cms new`: список, встроенный каркас по имени или пакет. */
export var runNew = (ctx: Context): Promise<void> =>
  ((arg) =>
    arg === undefined
      ? Promise.resolve(ctx.out(_catalog(ctx.paint, ctx.language)))
      : ((builtIn) =>
          builtIn
            ? _install(ctx, builtIn).then((_) => _created(ctx, builtIn, _))
            : _newPackage(ctx, arg))(
          scaffoldsFor(ctx.language).find((_) => _.name === arg)
        ))(ctx.args[0]);

// --- cms scaffold --------------------------------------------------------

const _size = (bytes: number, say: _Say): string =>
  `${Math.max(1, Math.round(bytes / 1024))} ${say.kb}`;

const _pack = (ctx: Context): Promise<void> =>
  ((dir, say) =>
    dir === undefined
      ? _reject(say.needFolder)
      : !_exists(dir)
        ? _reject(say.noPath(dir))
        : ((built) =>
            'problems' in built
              ? (ctx.out(_problemLines(ctx.paint, built.problems).join('\n')),
                _reject(say.packProblems(built.problems.length)))
              : ((file) =>
                  Bun.write(file, built.bytes).then(() =>
                    ctx.out(
                      [
                        `${ctx.paint.ok('✓')} ${say.packed(built.manifest.name, file)}`,
                        _row(ctx.paint, 'SHA-256', built.sha256),
                        _row(
                          ctx.paint,
                          say.size,
                          `${_size(built.bytes.byteLength, say)}${_dot(ctx.paint)}${say.files(built.files.size)}`
                        ),
                        ..._reportLines(ctx.paint, say, built.report),
                        ...(built.report.plugins > 0
                          ? [
                              '',
                              `${ctx.paint.warn('!')} ${ctx.paint.warn(say.packedPlugins(built.report.plugins))}`,
                            ]
                          : []),
                      ].join('\n')
                    )
                  ))(ctx.options.output ?? `${built.manifest.name}.zip`))(
            buildPackage(dir, { language: ctx.language, plugins: true })
          ))(ctx.args[1], _say(ctx));

const _empty = (dir: string): boolean =>
  attempt(
    () => readdirSync(dir).length === 0,
    () => true
  );

// Заголовок и описание — на каждом языке, на котором каркас есть.
const _texts = (name: string) =>
  ((ru, en) => ({
    title: { ...(ru ? { ru: ru.title } : {}), ...(en ? { en: en.title } : {}) },
    summary: {
      ...(ru ? { ru: ru.summary } : {}),
      ...(en ? { en: en.summary } : {}),
    },
  }))(
    SCAFFOLDS.find((_) => _.name === name),
    SCAFFOLDS_EN.find((_) => _.name === name)
  );

const _export = (ctx: Context): Promise<void> =>
  ((name, say) =>
    ((scaffold) =>
      name === undefined
        ? _reject(say.needName(_names(ctx.language)))
        : scaffold === undefined
          ? _reject(say.noBuiltIn(name, _names(ctx.language)))
          : ((dir) =>
              !_empty(dir) && !ctx.options.force
                ? _reject(say.notEmpty(dir))
                : ((files) =>
                    Promise.all(
                      [...files].map(({ 0: path, 1: bytes }) =>
                        Bun.write(join(dir, path), bytes)
                      )
                    ).then(() =>
                      ctx.out(
                        [
                          `${ctx.paint.ok('✓')} ${say.exported(name, dir, files.size)}`,
                          `${say.next} ${ctx.paint.bold(PROGRAM)} ${ctx.paint.command('scaffold')} pack ${dir}`,
                        ].join('\n')
                      )
                    ))(scaffoldPackage(scaffold, _texts(name))))(
              ctx.args[2] ?? name
            ))(scaffoldsFor(ctx.language).find((_) => _.name === name)))(
    ctx.args[1],
    _say(ctx)
  );

const _SCAFFOLD: Readonly<Record<string, (ctx: Context) => Promise<void>>> = {
  pack: _pack,
  export: _export,
};

/** `cms scaffold pack|export`: пакеты каркасов для авторов. */
export var runScaffold = (ctx: Context): Promise<void> =>
  (
    _SCAFFOLD[ctx.args[0] ?? ''] ??
    (() => _reject(_say(ctx).noScaffoldCommand(ctx.args[0] ?? '')))
  )(ctx);

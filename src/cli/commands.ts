import { Database } from 'bun:sqlite';
import { type App, createApp } from '../app.ts';
import { LETS_ENCRYPT, parseDomains } from '../contexts/certificates/index.ts';
import {
  defineReleases,
  type UpdateResult,
  updateProgram,
} from '../contexts/upkeep/index.ts';
import { importEvo } from '../evo-import/import.ts';
import { parseDump } from '../evo-import/sql-dump.ts';
import { PRODUCT, REPOSITORY } from '../product.ts';
import {
  applyScaffold,
  clearWelcome,
  SCAFFOLDS,
  type Scaffold,
  untouched,
  WELCOME,
} from '../scaffolds/index.ts';
import { isDomainError } from '../shared/kernel/errors.ts';
import type { Options } from './args.ts';
import { COMMANDS, commandHelp, overview, suggest } from './help.ts';
import { httpsUrl, type ServeBase, serveSecure } from './https.ts';
import { motd, pages } from './motd.ts';
import { type Paint, padEnd } from './paint.ts';
import { promptHidden } from './prompt.ts';
import { VERSION } from './version.ts';

export type Context = {
  readonly args: readonly string[];
  readonly options: Options;
  readonly paint: Paint;
  /** stdin и stdout — терминал: можно спросить пароль скрыто. */
  readonly tty: boolean;
  readonly out: (text: string) => void;
};

/** Ошибка для человека: печатается как есть, процесс выходит с кодом 1. */
export type CliError = Error & { readonly cli: true };

export var cliError = (message: string): CliError =>
  Object.assign(new Error(message), { cli: true as const });

export var isCliError = (error: unknown): error is CliError =>
  error instanceof Error && 'cli' in error;

const _reject = (message: string): Promise<never> =>
  Promise.reject(cliError(message));

// Ошибки контекстов — на языке справки, а не «Password must be at least 10 characters».
const _DOMAIN: Readonly<Record<string, string>> = {
  'identity.weak_password': 'Пароль — не короче 10 символов.',
  'identity.email_taken': 'С этой почтой уже есть пользователь.',
  'identity.invalid_email': 'Это не похоже на адрес почты.',
  'identity.invalid_role': 'Такой роли нет: admin или editor.',
  'evo.no_site_content':
    'В дампе нет таблицы site_content — это точно дамп сайта Evo?',
  'backup.invalid': 'Это не копия сайта: нужен файл .db или JSON из backup.',
  'backup.foreign': `Это база SQLite, но не сайта на ${PRODUCT}.`,
  'backup.newer': `Копия сделана более новой версией ${PRODUCT} — обновите программу.`,
  'upkeep.not_binary':
    'cms update заменяет установленный бинарник, а этот cms запущен из исходников: обновите репозиторий.',
  'upkeep.unsupported_platform':
    'Для этой системы сборок нет: нужны Linux или macOS на x64 или arm64.',
  'upkeep.releases_unavailable':
    'Страница релизов не ответила — проверьте сеть и попробуйте позже.',
  'upkeep.download_failed':
    'Новая версия не скачалась — проверьте сеть и попробуйте ещё раз.',
  'upkeep.asset_missing':
    'В новом выпуске нет сборки для этой системы — обновите позже или установщиком.',
  'upkeep.checksum_mismatch':
    'Контрольная сумма не совпала: файл повреждён или подменён. Установленный cms не тронут.',
  'upkeep.binary_broken':
    'Новая версия не запускается на этой системе — установленный cms не тронут.',
  'upkeep.no_write':
    'Нет прав на запись в каталог cms: запустите cms update через sudo.',
  'certificates.invalid_domain':
    'Это не домен для сертификата: нужно имя вроде example.com — без *, IP и localhost.',
  'certificates.no_domain': 'Нужен домен: --domain example.com',
};

export var explain = (error: unknown): string =>
  isCliError(error)
    ? error.message
    : isDomainError(error)
      ? (_DOMAIN[error.code] ?? error.message)
      : error instanceof Error
        ? error.message
        : String(error);

// У работающего сервера свежие данные ещё в журнале WAL рядом с базой: считаем и его.
const _dbSize = (db: string): number =>
  Bun.file(db).size + Bun.file(`${db}-wal`).size;

const _size = (bytes: number): string =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} КБ`
    : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;

// Команды, которые читают сайт, не создают новую пустую базу по опечатке в пути.
const _existingDb = (db: string): Promise<string> =>
  Bun.file(db)
    .exists()
    .then((exists) =>
      exists
        ? db
        : _reject(
            `Нет базы ${db}. Укажите файл: --db site.db (новую создаёт cms serve).`
          )
    );

const _withApp = <T>(
  db: string,
  run: (app: App) => T | Promise<T>
): Promise<T> =>
  _existingDb(db).then((path) => {
    const app = createApp({ databasePath: path });
    return Promise.resolve()
      .then(() => run(app))
      .finally(() => app.close());
  });

const _row = (paint: Paint, label: string, value: string): string =>
  `  ${padEnd(paint.dim(label), 14)}${value}`;

const _dot = (paint: Paint): string => paint.dim(' · ');

// --- serve ---------------------------------------------------------------

const _BASE: ServeBase = {
  // Восстановление сайта из копии приходит одним телом: база с медиатекой бывает большой. Потолок
  // каждого маршрута API строже и проверяется после входа (manager/interface/api.ts `_BODY_LIMIT`).
  maxRequestBodySize: 2 * 1024 ** 3,
  // Страница ошибки Bun в режиме разработки показывает исходник и пути — посетителю она не нужна.
  development: false,
  error: (error) => (
    console.error(error), new Response('Internal Server Error', { status: 500 })
  ),
};

// Каталог ACME: свой (стенд) → тестовый Let's Encrypt → боевой.
const _directory = (options: Options): string =>
  options.acmeDirectory ??
  (options.acmeStaging ? LETS_ENCRYPT.staging : LETS_ENCRYPT.production);

// С --domain сервер сам держит HTTPS: HTTP-порт — для проверки и переадресации, сертификат — от Let's Encrypt.
const _listen = (
  ctx: Context,
  app: App,
  domains: readonly string[] | null
): { url: () => string; stop: () => void } =>
  domains
    ? ((httpsPort) =>
        ((secure) => ({
          url: () =>
            secure.secured()
              ? httpsUrl(domains, httpsPort)
              : `http://${domains[0]}${secure.http.port === 80 ? '' : `:${secure.http.port}`}/`,
          stop: secure.stop,
        }))(
          serveSecure({
            app,
            domains,
            port: Number(ctx.options.port),
            httpsPort,
            base: _BASE,
            issued: (certificate) =>
              ctx.out(
                `${ctx.paint.ok('✓')} Сертификат HTTPS до ${certificate.notAfter.slice(0, 10)}: ${ctx.paint.path(httpsUrl(domains, httpsPort))}`
              ),
            failed: (error) =>
              ctx.out(
                `${ctx.paint.error('✗')} Сертификат HTTPS не выпущен: ${error}\n  ${ctx.paint.dim('Следующая попытка — через час; подробности — в журнале сбоев менеджера.')}`
              ),
          })
        ))(Number(ctx.options.httpsPort ?? '443'))
    : ((server) => ({
        url: () => server.url.href,
        stop: () => void server.stop(),
      }))(
        Bun.serve({
          ..._BASE,
          port: Number(ctx.options.port),
          fetch: app.fetch,
        })
      );

const _serve = (ctx: Context): Promise<void> =>
  Bun.file(ctx.options.db)
    .exists()
    .then((existed) => {
      const domains = ctx.options.domain
        ? parseDomains(ctx.options.domain)
        : null;
      const app = createApp({
        databasePath: ctx.options.db,
        scaffold: WELCOME,
        trustProxy: ctx.options.trustProxy,
        background: true,
        ...(domains
          ? {
              https: {
                domains,
                email: ctx.options.email ?? '',
                directory: _directory(ctx.options),
              },
            }
          : {}),
      });
      const server = _listen(ctx, app, domains);
      const shutdown = () => (server.stop(), app.close(), process.exit(0));
      ['SIGINT', 'SIGTERM'].forEach(
        (signal) => void process.on(signal, shutdown)
      );
      const tree = app.content.drafts.tree();
      const token = app.identity.setup.token();
      const https = app.certificates.status();
      ctx.out(
        motd(ctx.paint, {
          version: VERSION,
          url: server.url(),
          db: ctx.options.db,
          fresh: !existed,
          pages: tree.length,
          published: tree.filter((_) => _.published && !_.trashed).length,
          trashed: tree.filter((_) => _.trashed).length,
          setupUrl: token
            ? new URL(`/manager/setup?token=${token}`, server.url()).href
            : null,
          ...(https
            ? { https: { notAfter: https.notAfter, staging: https.staging } }
            : {}),
        })
      );
    });

// --- new -----------------------------------------------------------------

const _catalog = (paint: Paint): string =>
  [
    '',
    ...SCAFFOLDS.map(
      (_) => `  ${padEnd(paint.command(_.name), 12)}${_.title} — ${_.summary}`
    ),
    '',
    `  ${paint.bold('cms')} ${paint.command('new')} ${paint.dim('<каркас>')} ${paint.flag('--db')} site.db ${paint.dim('— подробнее: cms help new')}`,
    '',
  ].join('\n');

const _scaffold = (name: string): Promise<Scaffold> =>
  ((found) =>
    found
      ? Promise.resolve(found)
      : _reject(
          `Нет каркаса «${name}». Есть: ${SCAFFOLDS.map((_) => _.name).join(', ')} — cms new`
        ))(SCAFFOLDS.find((_) => _.name === name));

// Каркас ложится на новую базу или на нетронутое приветствие; пользователи остаются.
const _new = (ctx: Context): Promise<void> =>
  ctx.args[0] === undefined
    ? Promise.resolve(ctx.out(_catalog(ctx.paint)))
    : _scaffold(ctx.args[0])
        .then((scaffold) => {
          const app = createApp({ databasePath: ctx.options.db });
          return Promise.resolve()
            .then(() =>
              untouched(WELCOME, app)
                ? (clearWelcome(app),
                  {
                    scaffold,
                    report: applyScaffold(scaffold, app, ctx.options.name),
                    name: app.site.settings.get().name,
                  })
                : _reject(
                    `В базе ${ctx.options.db} уже есть сайт. Каркас — в новую базу: cms new ${scaffold.name} --db ${scaffold.name}.db`
                  )
            )
            .finally(() => app.close());
        })
        .then(({ scaffold, report, name }) =>
          ctx.out(
            [
              `${ctx.paint.ok('✓')} ${scaffold.title} «${name}» — в ${ctx.paint.path(ctx.options.db)}:`,
              _row(ctx.paint, 'Страницы', String(report.pages)),
              _row(
                ctx.paint,
                'Элементы',
                `шаблонов ${report.templates}${_dot(ctx.paint)}компонентов ${report.components}`
              ),
              _row(
                ctx.paint,
                'Поля и формы',
                `полей ${report.fields}${_dot(ctx.paint)}форм ${report.forms}`
              ),
              '',
              `Запуск: ${ctx.paint.bold('cms')} ${ctx.paint.flag('--db')} ${ctx.options.db}${ctx.paint.dim(' — если сервер на этой базе уже работает, перезапустите его')}`,
            ].join('\n')
          )
        );

// --- info ----------------------------------------------------------------

const _schema = (db: string): { count: number; last: string } => {
  const sqlite = new Database(db, { readonly: true });
  const row = sqlite
    .query<{ count: number; last: string | null }, []>(
      'SELECT count(*) AS count, (SELECT id FROM _migrations ORDER BY applied_at DESC, id DESC LIMIT 1) AS last FROM _migrations'
    )
    .get();
  sqlite.close();
  return { count: row?.count ?? 0, last: row?.last ?? '—' };
};

const _VARIANT = /@\d+\.[a-z0-9]+$/;

const _info = (ctx: Context): Promise<void> =>
  _withApp(ctx.options.db, (app) => {
    const { paint } = ctx;
    const tree = app.content.drafts.tree();
    const elements = app.design.elements.list();
    const users = app.identity.users.list();
    const settings = app.site.settings.get();
    const kinds = (kind: string) =>
      elements.filter((_) => _.kind === kind).length;
    return {
      lines: [
        _row(
          paint,
          'Сайт',
          `«${settings.name}»${_dot(paint)}язык ${settings.language}`
        ),
        _row(
          paint,
          'Страницы',
          [
            pages(tree.length),
            `${paint.ok('●')} опубликовано ${tree.filter((_) => _.published && !_.trashed).length}`,
            `в корзине ${tree.filter((_) => _.trashed).length}`,
          ].join(_dot(paint))
        ),
        _row(
          paint,
          'Элементы',
          [
            `шаблонов ${kinds('template')}`,
            `компонентов ${kinds('component')}`,
            `плагинов ${app.extensions.plugins.list().length}`,
            `полей ${app.content.fields.list().length}`,
          ].join(_dot(paint))
        ),
        _row(
          paint,
          'Медиатека',
          `файлов ${app.media.files.list().filter((_) => !_VARIANT.test(_.path)).length}`
        ),
        _row(
          paint,
          'Пользователи',
          `${users.length}${_dot(paint)}администраторов ${users.filter((_) => _.role === 'admin').length}`
        ),
      ],
    };
  }).then(({ lines }) =>
    Promise.resolve(_schema(ctx.options.db)).then((schema) =>
      ctx.out(
        [
          '',
          _row(
            ctx.paint,
            'База',
            `${ctx.paint.path(ctx.options.db)}${_dot(ctx.paint)}${_size(_dbSize(ctx.options.db))}`
          ),
          _row(
            ctx.paint,
            'Схема',
            `миграций ${schema.count}${_dot(ctx.paint)}последняя ${ctx.paint.dim(schema.last)}`
          ),
          ...lines,
          '',
        ].join('\n')
      )
    )
  );

// --- users ---------------------------------------------------------------

const _ROLES: Readonly<Record<string, string>> = {
  admin: 'администратор',
  editor: 'редактор',
};

const _list = (ctx: Context): Promise<void> =>
  _withApp(ctx.options.db, (app) => app.identity.users.list()).then((users) =>
    ctx.out(
      users.length === 0
        ? `Пользователей нет. Новый: ${ctx.paint.bold('cms')} ${ctx.paint.command('users add')} ${ctx.paint.dim('<почта>')}`
        : [
            ctx.paint.dim(
              `  ${padEnd('id', 5)}${padEnd('почта', 30)}${padEnd('имя', 22)}роль`
            ),
            ...users.map(
              (_) =>
                `  ${padEnd(String(_.id), 5)}${padEnd(_.email, 30)}${padEnd(_.name, 22)}${
                  _.role === 'admin'
                    ? ctx.paint.accent(_ROLES[_.role]!)
                    : (_ROLES[_.role] ?? _.role)
                }`
            ),
          ].join('\n')
    )
  );

// Пароль: из stdin для скриптов, в терминале — скрыто и дважды, иначе — объясняем, как передать.
const _password = (ctx: Context): Promise<string> =>
  ctx.options.passwordStdin
    ? Bun.stdin.text().then((_) => _.replace(/\r?\n$/, ''))
    : ctx.tty
      ? promptHidden('Новый пароль: ').then((first) =>
          promptHidden('Ещё раз:      ').then((second) =>
            first === second ? first : _reject('Пароли не совпали.')
          )
        )
      : _reject(
          'Нет терминала для скрытого ввода. Передайте пароль через --password-stdin.'
        );

const _email = (ctx: Context, usage: string): Promise<string> =>
  ctx.args[1] ? Promise.resolve(ctx.args[1]) : _reject(`Нужна почта: ${usage}`);

const _add = (ctx: Context): Promise<void> =>
  _email(ctx, 'cms users add <почта>').then((email) =>
    _existingDb(ctx.options.db)
      .then(() => _password(ctx))
      .then((password) =>
        _withApp(ctx.options.db, (app) =>
          app.identity.users.create({
            email,
            name: ctx.options.name,
            role:
              ctx.options.role ??
              (app.identity.users.list().length === 0 ? 'admin' : 'editor'),
            password,
          })
        )
      )
      .then((user) =>
        ctx.out(
          `${ctx.paint.ok('✓')} ${user.name} <${user.email}> — ${_ROLES[user.role] ?? user.role}. Вход: /manager`
        )
      )
  );

const _setPassword = (ctx: Context): Promise<void> =>
  _email(ctx, 'cms users password <почта>').then((email) =>
    _withApp(ctx.options.db, (app) =>
      app.identity.users
        .list()
        .find((_) => _.email === email.trim().toLowerCase())
    )
      .then(
        (user) =>
          user ??
          _reject(`Нет пользователя с почтой ${email}. Список — cms users`)
      )
      .then((user) =>
        _password(ctx).then((password) =>
          _withApp(ctx.options.db, (app) =>
            app.identity.users.setPassword(user.id, password)
          )
        )
      )
      .then((user) =>
        ctx.out(
          `${ctx.paint.ok('✓')} Пароль ${user.email} сменён, все его сеансы закрыты.`
        )
      )
  );

const _USERS: Readonly<Record<string, (ctx: Context) => Promise<void>>> = {
  list: _list,
  add: _add,
  password: _setPassword,
};

const _users = (ctx: Context): Promise<void> =>
  (
    _USERS[ctx.args[0] ?? 'list'] ??
    (() =>
      _reject(
        `Нет подкоманды users ${ctx.args[0]}. Есть: add, password — cms help users`
      ))
  )(ctx);

// --- backup и import-evo ---------------------------------------------------

const _today = (): string => new Date().toISOString().slice(0, 10);

const _backup = (ctx: Context): Promise<void> =>
  ((target) =>
    Bun.file(target)
      .exists()
      .then((exists) =>
        exists
          ? _reject(`Файл ${target} уже есть — выберите другое имя.`)
          : _withApp(
              ctx.options.db,
              (app): Promise<unknown> =>
                // Имя с .json — записи текстом, иначе — файл базы.
                target.endsWith('.json')
                  ? Bun.write(target, JSON.stringify(app.archive(), null, 2))
                  : Promise.resolve(app.backup(target))
            )
      )
      .then(() =>
        ctx.out(
          `${ctx.paint.ok('✓')} Копия сайта: ${ctx.paint.path(target)}${_dot(ctx.paint)}${_size(Bun.file(target).size)}`
        )
      ))(ctx.args[0] ?? `cms-${_today()}.db`);

// Восстановление: база может быть и новой — так сайт переезжает на другой сервер.
const _restore = (ctx: Context): Promise<void> =>
  (ctx.args[0]
    ? Promise.resolve(ctx.args[0])
    : _reject('Нужен файл копии: cms restore <файл> --db site.db')
  )
    .then((file) =>
      Bun.file(file)
        .exists()
        .then((exists) =>
          exists ? Bun.file(file).bytes() : _reject(`Нет файла ${file}.`)
        )
    )
    .then((bytes) => {
      const app = createApp({ databasePath: ctx.options.db });
      return app
        .restore(bytes)
        .then((report) =>
          ctx.out(
            [
              `${ctx.paint.ok('✓')} Сайт восстановлен в ${ctx.paint.path(ctx.options.db)}${_dot(ctx.paint)}${pages(report.pages)}`,
              ...(report.savedTo
                ? [
                    `  ${ctx.paint.dim('Прежнее состояние:')} ${ctx.paint.path(report.savedTo)}`,
                  ]
                : []),
            ].join('\n')
          )
        )
        .finally(() => app.close());
    });

const _import = (ctx: Context): Promise<void> =>
  (ctx.args[0]
    ? Promise.resolve(ctx.args[0])
    : _reject('Нужен файл дампа: cms import-evo <dump.sql> --db site.db')
  )
    .then((dump) =>
      Bun.file(dump)
        .exists()
        .then((exists) =>
          exists ? Bun.file(dump).text() : _reject(`Нет файла ${dump}.`)
        )
    )
    .then((sql) => {
      const app = createApp({ databasePath: ctx.options.db });
      return Promise.resolve()
        .then(() =>
          app.content.isEmpty()
            ? importEvo(app, parseDump(sql))
            : _reject(
                `В базе ${ctx.options.db} уже есть страницы. Перенос — в новую базу: --db new-site.db`
              )
        )
        .finally(() => app.close());
    })
    .then((report) =>
      ctx.out(
        [
          `${ctx.paint.ok('✓')} Перенесено в ${ctx.paint.path(ctx.options.db)}:`,
          _row(ctx.paint, 'Страницы', String(report.pages)),
          _row(
            ctx.paint,
            'Элементы',
            `шаблонов ${report.templates}${_dot(ctx.paint)}компонентов ${report.components}`
          ),
          _row(
            ctx.paint,
            'Поля',
            `${report.fields}${_dot(ctx.paint)}значений ${report.values}`
          ),
          ...(report.snippets.length > 0
            ? [
                _row(
                  ctx.paint,
                  ctx.paint.warn('Сниппеты'),
                  `${report.snippets.join(', ')} — вызовы остались комментариями`
                ),
              ]
            : []),
          ...(report.warnings.length > 0
            ? [
                '',
                ctx.paint.warn(`Предупреждения (${report.warnings.length}):`),
                ...report.warnings.map((_) => `  ${ctx.paint.dim('•')} ${_}`),
              ]
            : []),
          '',
          `Запуск: ${ctx.paint.bold('cms')} ${ctx.paint.flag('--db')} ${ctx.options.db}`,
        ].join('\n')
      )
    );

// --- справка ---------------------------------------------------------------

/** Нет такой команды: подсказка с ближайшей и путь к списку. */
export var unknownCommand = (name: string): CliError =>
  ((near) =>
    cliError(
      [
        `Нет команды «${name}».`,
        ...(near ? [`Возможно, вы имели в виду: cms ${near}`] : []),
        'Все команды — cms help',
      ].join('\n')
    ))(suggest(name));

export var helpFor = (
  paint: Paint,
  name: string | undefined
): Promise<string> =>
  name === undefined
    ? Promise.resolve(overview(paint))
    : ((help) =>
        help
          ? Promise.resolve(commandHelp(paint, help))
          : Promise.reject(unknownCommand(name)))(
        COMMANDS.find((_) => _.name === name)
      );

// --- update ----------------------------------------------------------------

const _UPDATE: Readonly<
  Record<UpdateResult['status'], (paint: Paint, result: UpdateResult) => string>
> = {
  current: (paint, _) =>
    `${paint.ok('✓')} Установлена последняя версия: ${PRODUCT} ${_.current}`,
  available: (paint, _) =>
    _.status === 'available'
      ? [
          `Доступна ${paint.bold(`${PRODUCT} ${_.release.version}`)}${paint.dim(` · установлена ${_.current}`)}`,
          `  ${paint.path(_.release.url)}`,
          `  Обновить: ${paint.bold('cms')} ${paint.command('update')}`,
        ].join('\n')
      : '',
  updated: (paint, _) =>
    _.status === 'updated'
      ? [
          `${paint.ok('✓')} ${PRODUCT} обновлена: ${_.current} → ${paint.bold(_.release.version)}`,
          `  ${padEnd(paint.dim('Прежняя'), 10)}${paint.path(_.previous)}`,
          `  ${paint.warn('▸')} Перезапустите сервер: новая версия заработает после перезапуска.`,
        ].join('\n')
      : '',
};

const _update = (ctx: Context): Promise<void> =>
  updateProgram({
    releases: defineReleases({ repository: REPOSITORY, version: VERSION }),
    current: VERSION,
    check: ctx.options.check === true,
  }).then((result) => ctx.out(_UPDATE[result.status](ctx.paint, result)));

export var RUN: Readonly<Record<string, (ctx: Context) => Promise<void>>> = {
  serve: _serve,
  new: _new,
  info: _info,
  users: _users,
  backup: _backup,
  restore: _restore,
  'import-evo': _import,
  update: _update,
  help: (ctx) => helpFor(ctx.paint, ctx.args[0]).then(ctx.out),
  version: (ctx) => Promise.resolve(ctx.out(`${PRODUCT} ${VERSION}`)),
};

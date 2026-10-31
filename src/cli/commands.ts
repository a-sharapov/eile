import { Database } from 'bun:sqlite';
import { watch } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { type App, createApp } from '../app.ts';
import { LETS_ENCRYPT, parseDomains } from '../contexts/certificates/index.ts';
import type { Finding } from '../contexts/diagnostics/index.ts';
import type { UserView } from '../contexts/identity/index.ts';
import { defineAgentSession } from '../contexts/manager/index.ts';
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
  type Scaffold,
  scaffoldsFor,
  untouched,
  WELCOME,
  WELCOME_EN,
} from '../scaffolds/index.ts';
import { attempt, isDomainError } from '../shared/kernel/errors.ts';
import { pipe } from '../shared/kernel/pipe.ts';
import {
  agentsGuide,
  CLAUDE_MD,
  type Files,
  type Problem,
  type PushReport,
  pull,
  push,
  readFolder,
} from '../workspace/index.ts';
import type { Options } from './args.ts';
import { COMMANDS, commandHelp, overview, unknownText } from './help.ts';
import { httpsUrl, type ServeBase, serveSecure } from './https.ts';
import type { Language } from './language.ts';
import { motd, pages } from './motd.ts';
import { type Paint, padEnd } from './paint.ts';
import { named, PROGRAM } from './program.ts';
import { promptHidden } from './prompt.ts';
import { VERSION } from './version.ts';

export type Context = {
  readonly args: readonly string[];
  readonly options: Options;
  readonly paint: Paint;
  readonly language: Language;
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
const _DOMAIN: Readonly<Record<Language, Readonly<Record<string, string>>>> = {
  ru: {
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
  },
  en: {
    'identity.weak_password': 'A password needs at least 10 characters.',
    'identity.email_taken': 'There is already a user with this email.',
    'identity.invalid_email': 'This does not look like an email address.',
    'identity.invalid_role': 'No such role: admin or editor.',
    'evo.no_site_content':
      'The dump has no site_content table. Is it really a dump of an Evo site?',
    'backup.invalid':
      'This is not a site copy: use a .db or JSON file made by backup.',
    'backup.foreign': `This is an SQLite database, but not a ${PRODUCT} site.`,
    'backup.newer': `The copy was made by a newer ${PRODUCT}: update the program first.`,
    'upkeep.not_binary':
      'cms update replaces the installed binary, and this cms runs from source: update the repository instead.',
    'upkeep.unsupported_platform':
      'There are no builds for this system: Linux or macOS on x64 or arm64 only.',
    'upkeep.releases_unavailable':
      'The releases page did not answer. Check the network and try again later.',
    'upkeep.download_failed':
      'The new version did not download. Check the network and try again.',
    'upkeep.asset_missing':
      'The new release has no build for this system. Update later or with the installer.',
    'upkeep.checksum_mismatch':
      'The checksum does not match: the file is damaged or replaced. The installed cms is untouched.',
    'upkeep.binary_broken':
      'The new version does not run on this system. The installed cms is untouched.',
    'upkeep.no_write':
      'No write access to the cms directory: run cms update with sudo.',
    'certificates.invalid_domain':
      'This is not a domain for a certificate: use a name like example.com, without *, IP addresses or localhost.',
    'certificates.no_domain': 'A domain is needed: --domain example.com',
  },
};

export var explain = (error: unknown, language: Language): string =>
  isCliError(error)
    ? error.message
    : isDomainError(error)
      ? (_DOMAIN[language][error.code] ?? error.message)
      : error instanceof Error
        ? error.message
        : String(error);

const _SAY = {
  ru: {
    kb: 'КБ',
    mb: 'МБ',
    decimal: ',',
    noDb: (db: string) =>
      `Нет базы ${db}. Укажите файл: --db site.db (новую создаёт cms serve).`,
    issued: (date: string) => `Сертификат HTTPS до ${date}:`,
    notIssued: (error: string) => `Сертификат HTTPS не выпущен: ${error}`,
    retry:
      'Следующая попытка — через час; подробности — в журнале сбоев менеджера.',
    scaffoldArg: '<каркас>',
    newMore: '— подробнее: cms help new',
    about: (title: string, summary: string) => `${title} — ${summary}`,
    noScaffold: (name: string, names: string) =>
      `Нет каркаса «${name}». Есть: ${names} — cms new`,
    hasSite: (db: string, name: string) =>
      `В базе ${db} уже есть сайт. Каркас — в новую базу: cms new ${name} --db ${name}.db`,
    created: (title: string, name: string) => `${title} «${name}» — в`,
    pages: 'Страницы',
    elements: 'Элементы',
    fieldsAndForms: 'Поля и формы',
    fields: 'Поля',
    templates: (n: number) => `шаблонов ${n}`,
    components: (n: number) => `компонентов ${n}`,
    plugins: (n: number) => `плагинов ${n}`,
    fieldCount: (n: number) => `полей ${n}`,
    forms: (n: number) => `форм ${n}`,
    values: (n: number) => `значений ${n}`,
    run: 'Запуск:',
    restart: ' — если сервер на этой базе уже работает, перезапустите его',
    site: 'Сайт',
    siteLine: (name: string) => `«${name}»`,
    language: (language: string) => `язык ${language}`,
    published: (n: number) => `опубликовано ${n}`,
    trashed: (n: number) => `в корзине ${n}`,
    media: 'Медиатека',
    files: (n: number) => `файлов ${n}`,
    users: 'Пользователи',
    admins: (n: number) => `администраторов ${n}`,
    db: 'База',
    schema: 'Схема',
    migrations: (n: number) => `миграций ${n}`,
    last: 'последняя',
    roles: { admin: 'администратор', editor: 'редактор' } as Readonly<
      Record<string, string>
    >,
    noUsers: 'Пользователей нет. Новый:',
    email: '<почта>',
    columns: ['почта', 'имя', 'роль'] as readonly [string, string, string],
    newPassword: 'Новый пароль: ',
    again: 'Ещё раз:      ',
    cancelled: 'Отменено.',
    mismatch: 'Пароли не совпали.',
    noTerminal:
      'Нет терминала для скрытого ввода. Передайте пароль через --password-stdin.',
    needEmail: (usage: string) => `Нужна почта: ${usage}`,
    added: (who: string, role: string) => `${who} — ${role}. Вход: /manager`,
    noUser: (email: string) =>
      `Нет пользователя с почтой ${email}. Список — cms users`,
    passwordSet: (email: string) =>
      `Пароль ${email} сменён, все его сеансы закрыты.`,
    noSubcommand: (name: string | undefined) =>
      `Нет подкоманды users ${name}. Есть: add, password — cms help users`,
    exists: (file: string) => `Файл ${file} уже есть — выберите другое имя.`,
    copied: 'Копия сайта:',
    needCopy: 'Нужен файл копии: cms restore <файл> --db site.db',
    noFile: (file: string) => `Нет файла ${file}.`,
    restored: 'Сайт восстановлен в',
    before: 'Прежнее состояние:',
    needDump: 'Нужен файл дампа: cms import-evo <dump.sql> --db site.db',
    hasPages: (db: string) =>
      `В базе ${db} уже есть страницы. Перенос — в новую базу: --db new-site.db`,
    imported: 'Перенесено в',
    snippets: 'Сниппеты',
    snippetsLeft: (names: string) => `${names} — вызовы остались комментариями`,
    warnings: (n: number) => `Предупреждения (${n}):`,
    current: (version: string) =>
      `Установлена последняя версия: ${PRODUCT} ${version}`,
    available: 'Доступна',
    installed: (version: string) => ` · установлена ${version}`,
    updateWith: 'Обновить:',
    updated: `${PRODUCT} обновлена:`,
    previous: 'Прежняя',
    alias: 'Второе имя',
    restartServer:
      'Перезапустите сервер: новая версия заработает после перезапуска.',
    pulled: 'Элементы сайта — в папке',
    written: (n: number) => `записано файлов ${n}`,
    unchanged: (n: number) => `без изменений ${n}`,
    agentsMd: 'правила CMS и этого сайта для ИИ-агентов',
    onlyInFolder: 'Только в папке',
    pushed: (n: number) => `В сайт — файлов ${n}`,
    inSync: 'Папка и сайт совпадают',
    checked: (n: number) => `Всё в порядке; при отправке изменится файлов ${n}`,
    notInFolder: 'Нет в папке, в сайте остались',
    pruneHint: 'удалить из сайта — --prune',
    notSaved: (n: number) => `Ничего не сохранено: ошибок ${n}`,
    found: (n: number) => `Найдено ошибок: ${n}`,
    noElementsCommand: (name: string | undefined) =>
      `Нет подкоманды elements ${name ?? ''}. Есть: pull, check, push — cms help elements`,
    noFolder: (dir: string) =>
      `Нет папки ${dir}. Выложить в неё элементы: cms elements pull ${dir}`,
    watching: (dir: string) =>
      `Слежу за ${dir}: сохранённый файл уходит в сайт. Остановить — Ctrl+C`,
    healthy: 'Диагностика ничего не нашла',
    andMore: (n: number) => `и ещё ${n}`,
    siteErrors: (n: number) => `На сайте ошибок: ${n}`,
    noAgentUser:
      'Агент работает от имени пользователя, а их нет. Создайте администратора: cms users add <почта> --role admin',
    mcpReady: (site: string, who: string, role: string) =>
      `MCP: сайт «${site}», агент работает как ${who} (${role}). Сообщения — в stdin, ответы — в stdout.`,
  },
  en: {
    kb: 'KB',
    mb: 'MB',
    decimal: '.',
    noDb: (db: string) =>
      `No database ${db}. Name the file: --db site.db (cms serve creates a new one).`,
    issued: (date: string) => `HTTPS certificate until ${date}:`,
    notIssued: (error: string) => `HTTPS certificate not issued: ${error}`,
    retry: 'Next try in an hour; details are in the manager’s error log.',
    scaffoldArg: '<scaffold>',
    newMore: '· details: cms help new',
    about: (title: string, summary: string) => `${title}: ${summary}`,
    noScaffold: (name: string, names: string) =>
      `No scaffold “${name}”. There are: ${names} (cms new)`,
    hasSite: (db: string, name: string) =>
      `${db} already has a site. Put the scaffold into a new database: cms new ${name} --db ${name}.db`,
    created: (title: string, name: string) => `${title} “${name}” in`,
    pages: 'Pages',
    elements: 'Elements',
    fieldsAndForms: 'Fields, forms',
    fields: 'Fields',
    templates: (n: number) => `templates ${n}`,
    components: (n: number) => `components ${n}`,
    plugins: (n: number) => `plugins ${n}`,
    fieldCount: (n: number) => `fields ${n}`,
    forms: (n: number) => `forms ${n}`,
    values: (n: number) => `values ${n}`,
    run: 'Run:',
    restart: ' (if a server already runs on this database, restart it)',
    site: 'Site',
    siteLine: (name: string) => `“${name}”`,
    language: (language: string) => `language ${language}`,
    published: (n: number) => `published ${n}`,
    trashed: (n: number) => `in trash ${n}`,
    media: 'Media',
    files: (n: number) => `files ${n}`,
    users: 'Users',
    admins: (n: number) => `administrators ${n}`,
    db: 'Database',
    schema: 'Schema',
    migrations: (n: number) => `migrations ${n}`,
    last: 'last',
    roles: { admin: 'administrator', editor: 'editor' } as Readonly<
      Record<string, string>
    >,
    noUsers: 'No users. Add one:',
    email: '<email>',
    columns: ['email', 'name', 'role'] as readonly [string, string, string],
    newPassword: 'New password: ',
    again: 'Once more:    ',
    cancelled: 'Cancelled.',
    mismatch: 'The passwords do not match.',
    noTerminal:
      'No terminal for hidden input. Pass the password with --password-stdin.',
    needEmail: (usage: string) => `An email is needed: ${usage}`,
    added: (who: string, role: string) =>
      `${who}, ${role}. Sign in at /manager`,
    noUser: (email: string) =>
      `No user with the email ${email}. List them: cms users`,
    passwordSet: (email: string) =>
      `Password of ${email} changed, all of its sessions are closed.`,
    noSubcommand: (name: string | undefined) =>
      `No subcommand users ${name}. There are: add, password (cms help users)`,
    exists: (file: string) => `${file} already exists. Choose another name.`,
    copied: 'Site copy:',
    needCopy: 'A copy file is needed: cms restore <file> --db site.db',
    noFile: (file: string) => `No file ${file}.`,
    restored: 'Site restored into',
    before: 'Previous state:',
    needDump: 'A dump file is needed: cms import-evo <dump.sql> --db site.db',
    hasPages: (db: string) =>
      `${db} already has pages. Import into a new database: --db new-site.db`,
    imported: 'Imported into',
    snippets: 'Snippets',
    snippetsLeft: (names: string) => `${names}: their calls stay as comments`,
    warnings: (n: number) => `Warnings (${n}):`,
    current: (version: string) =>
      `The latest version is installed: ${PRODUCT} ${version}`,
    available: 'Available:',
    installed: (version: string) => ` · installed ${version}`,
    updateWith: 'Update:',
    updated: `${PRODUCT} updated:`,
    previous: 'Previous',
    alias: 'Second name',
    restartServer: 'Restart the server: the new version runs after a restart.',
    pulled: 'Site elements are in',
    written: (n: number) => `${n} files written`,
    unchanged: (n: number) => `${n} unchanged`,
    agentsMd: 'CMS and site rules for AI agents',
    onlyInFolder: 'Only in the folder',
    pushed: (n: number) => `${n} files saved to the site`,
    inSync: 'The folder matches the site',
    checked: (n: number) => `All good; a push would change ${n} files`,
    notInFolder: 'Not in the folder, kept on the site',
    pruneHint: 'delete them from the site with --prune',
    notSaved: (n: number) => `Nothing saved; problems found: ${n}`,
    found: (n: number) => `Problems found: ${n}`,
    noElementsCommand: (name: string | undefined) =>
      `No subcommand elements ${name ?? ''}. There are pull, check, push: cms help elements`,
    noFolder: (dir: string) =>
      `No folder ${dir}. Put the elements there first: cms elements pull ${dir}`,
    watching: (dir: string) =>
      `Watching ${dir}: a saved file goes to the site. Stop with Ctrl+C`,
    healthy: 'Diagnostics found nothing',
    andMore: (n: number) => `and ${n} more`,
    siteErrors: (n: number) => `Errors on the site: ${n}`,
    noAgentUser:
      'The agent works as a user, and there are none. Add an administrator: cms users add <email> --role admin',
    mcpReady: (site: string, who: string, role: string) =>
      `MCP: site "${site}", the agent works as ${who} (${role}). Messages go to stdin, answers come from stdout.`,
  },
} satisfies Record<Language, unknown>;

type _Say = (typeof _SAY)['ru'];

const _say = (ctx: Pick<Context, 'language'>): _Say => _SAY[ctx.language];

// У работающего сервера свежие данные ещё в журнале WAL рядом с базой: считаем и его.
const _dbSize = (db: string): number =>
  Bun.file(db).size + Bun.file(`${db}-wal`).size;

const _size = (bytes: number, say: _Say): string =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} ${say.kb}`
    : `${(bytes / 1024 / 1024).toFixed(1).replace('.', say.decimal)} ${say.mb}`;

// Команды, которые читают сайт, не создают новую пустую базу по опечатке в пути.
const _existingDb = (ctx: Context): Promise<string> =>
  Bun.file(ctx.options.db)
    .exists()
    .then((exists) =>
      exists ? ctx.options.db : _reject(_say(ctx).noDb(ctx.options.db))
    );

const _withApp = <T>(
  ctx: Context,
  run: (app: App) => T | Promise<T>
): Promise<T> =>
  _existingDb(ctx).then((path) => {
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
                `${ctx.paint.ok('✓')} ${_say(ctx).issued(certificate.notAfter.slice(0, 10))} ${ctx.paint.path(httpsUrl(domains, httpsPort))}`
              ),
            failed: (error) =>
              ctx.out(
                `${ctx.paint.error('✗')} ${_say(ctx).notIssued(String(error))}\n  ${ctx.paint.dim(_say(ctx).retry)}`
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

// Новая база встречает на языке системы: приветствие и язык сайта.
const _WELCOME: Readonly<Record<Language, Scaffold>> = {
  ru: WELCOME,
  en: WELCOME_EN,
};

const _serve = (ctx: Context): Promise<void> =>
  Bun.file(ctx.options.db)
    .exists()
    .then((existed) => {
      const domains = ctx.options.domain
        ? parseDomains(ctx.options.domain)
        : null;
      const app = createApp({
        databasePath: ctx.options.db,
        scaffold: _WELCOME[ctx.language],
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
        motd(
          ctx.paint,
          {
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
          },
          ctx.language
        )
      );
    });

// --- new -----------------------------------------------------------------

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
      '',
    ].join('\n'))(_SAY[language]);

const _scaffold = (ctx: Context, name: string): Promise<Scaffold> =>
  ((found) =>
    found
      ? Promise.resolve(found)
      : _reject(
          _say(ctx).noScaffold(
            name,
            scaffoldsFor(ctx.language)
              .map((_) => _.name)
              .join(', ')
          )
        ))(scaffoldsFor(ctx.language).find((_) => _.name === name));

// Каркас ложится на новую базу или на нетронутое приветствие; пользователи остаются.
const _new = (ctx: Context): Promise<void> =>
  ctx.args[0] === undefined
    ? Promise.resolve(ctx.out(_catalog(ctx.paint, ctx.language)))
    : _scaffold(ctx, ctx.args[0])
        .then((scaffold) => {
          const app = createApp({ databasePath: ctx.options.db });
          return Promise.resolve()
            .then(() =>
              Object.values(_WELCOME).some((_) => untouched(_, app))
                ? (clearWelcome(app),
                  {
                    scaffold,
                    report: applyScaffold(scaffold, app, ctx.options.name),
                    name: app.site.settings.get().name,
                  })
                : _reject(_say(ctx).hasSite(ctx.options.db, scaffold.name))
            )
            .finally(() => app.close());
        })
        .then(({ scaffold, report, name }) =>
          ((say) =>
            ctx.out(
              [
                `${ctx.paint.ok('✓')} ${say.created(scaffold.title, name)} ${ctx.paint.path(ctx.options.db)}:`,
                _row(ctx.paint, say.pages, String(report.pages)),
                _row(
                  ctx.paint,
                  say.elements,
                  `${say.templates(report.templates)}${_dot(ctx.paint)}${say.components(report.components)}`
                ),
                _row(
                  ctx.paint,
                  say.fieldsAndForms,
                  `${say.fieldCount(report.fields)}${_dot(ctx.paint)}${say.forms(report.forms)}`
                ),
                '',
                `${say.run} ${ctx.paint.bold(PROGRAM)} ${ctx.paint.flag('--db')} ${ctx.options.db}${ctx.paint.dim(say.restart)}`,
              ].join('\n')
            ))(_say(ctx))
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
  _withApp(ctx, (app) => {
    const { paint } = ctx;
    const say = _say(ctx);
    const tree = app.content.drafts.tree();
    const elements = app.design.elements.list();
    const users = app.identity.users.list();
    const settings = app.site.settings.get();
    const kinds = (kind: string) =>
      elements.filter((_) => _.kind === kind).length;
    return {
      facts: {
        site: { name: settings.name, language: settings.language },
        pages: {
          total: tree.length,
          published: tree.filter((_) => _.published && !_.trashed).length,
          trashed: tree.filter((_) => _.trashed).length,
        },
        elements: {
          templates: kinds('template'),
          components: kinds('component'),
          plugins: app.extensions.plugins.list().length,
          fields: app.content.fields.list().length,
        },
        media: app.media.files.list().filter((_) => !_VARIANT.test(_.path))
          .length,
        users: {
          total: users.length,
          admins: users.filter((_) => _.role === 'admin').length,
        },
      },
      lines: [
        _row(
          paint,
          say.site,
          `${say.siteLine(settings.name)}${_dot(paint)}${say.language(settings.language)}`
        ),
        _row(
          paint,
          say.pages,
          [
            pages(tree.length, ctx.language),
            `${paint.ok('●')} ${say.published(tree.filter((_) => _.published && !_.trashed).length)}`,
            say.trashed(tree.filter((_) => _.trashed).length),
          ].join(_dot(paint))
        ),
        _row(
          paint,
          say.elements,
          [
            say.templates(kinds('template')),
            say.components(kinds('component')),
            say.plugins(app.extensions.plugins.list().length),
            say.fieldCount(app.content.fields.list().length),
          ].join(_dot(paint))
        ),
        _row(
          paint,
          say.media,
          say.files(
            app.media.files.list().filter((_) => !_VARIANT.test(_.path)).length
          )
        ),
        _row(
          paint,
          say.users,
          `${users.length}${_dot(paint)}${say.admins(users.filter((_) => _.role === 'admin').length)}`
        ),
      ],
    };
  }).then(({ facts, lines }) =>
    Promise.resolve(_schema(ctx.options.db)).then((schema) =>
      ((say) =>
        ctx.out(
          ctx.options.json
            ? JSON.stringify(
                {
                  db: {
                    path: ctx.options.db,
                    bytes: _dbSize(ctx.options.db),
                    migrations: schema.count,
                    last: schema.last,
                  },
                  ...facts,
                },
                null,
                2
              )
            : [
                '',
                _row(
                  ctx.paint,
                  say.db,
                  `${ctx.paint.path(ctx.options.db)}${_dot(ctx.paint)}${_size(_dbSize(ctx.options.db), say)}`
                ),
                _row(
                  ctx.paint,
                  say.schema,
                  `${say.migrations(schema.count)}${_dot(ctx.paint)}${say.last} ${ctx.paint.dim(schema.last)}`
                ),
                ...lines,
                '',
              ].join('\n')
        ))(_say(ctx))
    )
  );

// --- users ---------------------------------------------------------------

const _role = (say: _Say, role: string): string => say.roles[role] ?? role;

const _list = (ctx: Context): Promise<void> =>
  _withApp(ctx, (app) => app.identity.users.list()).then((users) =>
    ((say) =>
      ctx.out(
        ctx.options.json
          ? JSON.stringify(users, null, 2)
          : users.length === 0
            ? `${say.noUsers} ${ctx.paint.bold(PROGRAM)} ${ctx.paint.command('users add')} ${ctx.paint.dim(say.email)}`
            : [
                ctx.paint.dim(
                  `  ${padEnd('id', 5)}${padEnd(say.columns[0], 30)}${padEnd(say.columns[1], 22)}${say.columns[2]}`
                ),
                ...users.map(
                  (_) =>
                    `  ${padEnd(String(_.id), 5)}${padEnd(_.email, 30)}${padEnd(_.name, 22)}${
                      _.role === 'admin'
                        ? ctx.paint.accent(_role(say, _.role))
                        : _role(say, _.role)
                    }`
                ),
              ].join('\n')
      ))(_say(ctx))
  );

// Пароль: из stdin для скриптов, в терминале — скрыто и дважды, иначе — объясняем, как передать.
const _password = (ctx: Context): Promise<string> =>
  ((say) =>
    ctx.options.passwordStdin
      ? Bun.stdin.text().then((_) => _.replace(/\r?\n$/, ''))
      : ctx.tty
        ? promptHidden(say.newPassword, say.cancelled).then((first) =>
            promptHidden(say.again, say.cancelled).then((second) =>
              first === second ? first : _reject(say.mismatch)
            )
          )
        : _reject(say.noTerminal))(_say(ctx));

const _email = (ctx: Context, usage: string): Promise<string> =>
  ctx.args[1]
    ? Promise.resolve(ctx.args[1])
    : _reject(_say(ctx).needEmail(usage));

const _add = (ctx: Context): Promise<void> =>
  _email(ctx, `cms users add ${_say(ctx).email}`).then((email) =>
    _existingDb(ctx).then(
      pipe(
        () => _password(ctx),
        (password) =>
          _withApp(ctx, (app) =>
            app.identity.users.create({
              email,
              name: ctx.options.name,
              role:
                ctx.options.role ??
                (app.identity.users.list().length === 0 ? 'admin' : 'editor'),
              password,
            })
          ),
        (user) =>
          ctx.out(
            `${ctx.paint.ok('✓')} ${_say(ctx).added(`${user.name} <${user.email}>`, _role(_say(ctx), user.role))}`
          )
      )
    )
  );

const _setPassword = (ctx: Context): Promise<void> =>
  _email(ctx, `cms users password ${_say(ctx).email}`).then((email) =>
    _withApp(ctx, (app) =>
      app.identity.users
        .list()
        .find((_) => _.email === email.trim().toLowerCase())
    ).then(
      pipe(
        (user) => user ?? _reject(_say(ctx).noUser(email)),
        (user) =>
          _password(ctx).then((password) =>
            _withApp(ctx, (app) =>
              app.identity.users.setPassword(user.id, password)
            )
          ),
        (user) =>
          ctx.out(`${ctx.paint.ok('✓')} ${_say(ctx).passwordSet(user.email)}`)
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
    (() => _reject(_say(ctx).noSubcommand(ctx.args[0])))
  )(ctx);

// --- elements ------------------------------------------------------------

const _folderOf = (ctx: Context): string => ctx.args[1] ?? '.';

const _folder = (ctx: Context, dir: string): Promise<Files> =>
  readFolder(dir).then(undefined, () => _reject(_say(ctx).noFolder(dir)));

const _where = (problem: Problem): string =>
  problem.line === undefined
    ? problem.file
    : `${problem.file}:${problem.line}:${problem.column ?? 1}`;

const _pushLines = (ctx: Context, report: PushReport): string[] =>
  ((say, paint, count) => [
    ...(report.problems.length > 0
      ? report.problems.map(
          (_) =>
            `${paint.error('✗')} ${paint.path(_where(_))}  ${_.message.replace(/\s*\n\s*/g, ' ')} ${paint.dim(_.code)}`
        )
      : [
          `${paint.ok('✓')} ${count === 0 ? say.inSync : report.saved ? say.pushed(count) : say.checked(count)}`,
          ...report.added.map((_) => `  ${paint.ok('+')} ${_}`),
          ...report.changed.map((_) => `  ${paint.warn('~')} ${_}`),
          ...report.removed.map((_) => `  ${paint.error('-')} ${_}`),
        ]),
    ...(report.missing.length > 0
      ? [
          `  ${paint.dim(`${say.notInFolder}: ${report.missing.join(', ')}; ${say.pruneHint}`)}`,
        ]
      : []),
  ])(
    _say(ctx),
    ctx.paint,
    report.added.length + report.changed.length + report.removed.length
  );

// Ошибки — в stdout вместе с итогом, код выхода 1: так их видят и человек, и агент.
const _reported =
  (ctx: Context, dryRun: boolean) =>
  (report: PushReport): Promise<void> => (
    ctx.out(
      ctx.options.json
        ? JSON.stringify(report, null, 2)
        : _pushLines(ctx, report).join('\n')
    ),
    report.problems.length > 0
      ? _reject(
          (dryRun ? _say(ctx).found : _say(ctx).notSaved)(
            report.problems.length
          )
        )
      : Promise.resolve()
  );

const _send = (ctx: Context, dryRun: boolean): Promise<void> =>
  ((dir) =>
    _withApp(ctx, (app) =>
      _folder(ctx, dir).then((folder) =>
        push(app, folder, { prune: ctx.options.prune, dryRun })
      )
    ).then(_reported(ctx, dryRun)))(_folderOf(ctx));

// Сохранённый файл — в сайт; молчим, если отправлять нечего. Сервер на той же базе подхватит сам.
const _watching = (ctx: Context): Promise<void> =>
  ((dir) =>
    _existingDb(ctx).then((path) =>
      _folder(ctx, dir).then(
        () =>
          new Promise<void>(() => {
            const app = createApp({ databasePath: path });
            let timer: ReturnType<typeof setTimeout> | undefined;
            const run = (): Promise<void> =>
              readFolder(dir)
                .then(
                  (folder) => (app.follow(), push(app, folder, ctx.options))
                )
                .then(
                  (report) =>
                    void (
                      (report.problems.length > 0 ||
                        report.added.length +
                          report.changed.length +
                          report.removed.length >
                          0) &&
                      ctx.out(
                        [
                          ctx.paint.dim(new Date().toLocaleTimeString()),
                          ..._pushLines(ctx, report),
                        ].join('\n')
                      )
                    ),
                  (error) => ctx.out(explain(error, ctx.language))
                );
            ctx.out(_say(ctx).watching(dir));
            void run();
            watch(dir, { recursive: true }, () => {
              clearTimeout(timer);
              timer = setTimeout(run, 150);
            });
          })
      )
    ))(_folderOf(ctx));

const _pull = (ctx: Context): Promise<void> =>
  ((dir) =>
    _withApp(ctx, (app) =>
      Bun.file(join(dir, 'CLAUDE.md'))
        .exists()
        .then((claude) =>
          pull(
            app,
            dir,
            new Map([
              [
                'AGENTS.md',
                agentsGuide(app, {
                  db: relative(resolve(dir), resolve(ctx.options.db)),
                  program: PROGRAM,
                }),
              ],
              ...(claude ? [] : [['CLAUDE.md', CLAUDE_MD] as const]),
            ])
          )
        )
    ).then((report) =>
      ((say, paint) =>
        ctx.out(
          ctx.options.json
            ? JSON.stringify(report, null, 2)
            : [
                `${paint.ok('✓')} ${say.pulled} ${paint.path(dir)}: ${say.written(report.written.length)}${_dot(paint)}${say.unchanged(report.same)}`,
                `  ${paint.bold('AGENTS.md')} ${paint.dim(`— ${say.agentsMd}`)}`,
                ...(report.extra.length > 0
                  ? [
                      `  ${paint.dim(`${say.onlyInFolder}: ${report.extra.join(', ')}`)}`,
                    ]
                  : []),
              ].join('\n')
        ))(_say(ctx), ctx.paint)
    ))(_folderOf(ctx));

const _ELEMENTS: Readonly<Record<string, (ctx: Context) => Promise<void>>> = {
  pull: _pull,
  check: (ctx) => _send(ctx, true),
  push: (ctx) => (ctx.options.watch ? _watching(ctx) : _send(ctx, false)),
};

const _elements = (ctx: Context): Promise<void> =>
  (
    _ELEMENTS[ctx.args[0] ?? ''] ??
    (() => _reject(_say(ctx).noElementsCommand(ctx.args[0])))
  )(ctx);

// --- diagnose --------------------------------------------------------------

const _SEVERITY: Readonly<Record<string, (paint: Paint) => string>> = {
  error: (paint) => paint.error('✗'),
  warning: (paint) => paint.warn('!'),
  info: (paint) => paint.dim('i'),
};

const _ITEMS_SHOWN = 5;

const _findingLines = (paint: Paint, say: _Say, finding: Finding): string[] => [
  `${(_SEVERITY[finding.severity] ?? _SEVERITY.info!)(paint)} ${paint.bold(finding.title)}${finding.count > 1 ? paint.dim(` · ${finding.count}`) : ''}`,
  `  ${paint.dim(finding.hint)}`,
  ...finding.items
    .slice(0, _ITEMS_SHOWN)
    .map(
      (_) =>
        `  ${paint.dim('•')} ${_.label}${_.detail ? paint.dim(` — ${_.detail}`) : ''}`
    ),
  ...(finding.count > _ITEMS_SHOWN
    ? [`  ${paint.dim(say.andMore(finding.count - _ITEMS_SHOWN))}`]
    : []),
];

// Ошибки — код выхода 1: проверку можно поставить в CI или cron.
const _diagnose = (ctx: Context): Promise<void> =>
  _withApp(ctx, (app) => app.diagnostics.report(true, ctx.language)).then(
    (report) =>
      ((say, errors) => (
        ctx.out(
          ctx.options.json
            ? JSON.stringify(report, null, 2)
            : report.findings.length === 0
              ? `${ctx.paint.ok('✓')} ${say.healthy}`
              : report.findings
                  .flatMap((_) => ['', ..._findingLines(ctx.paint, say, _)])
                  .slice(1)
                  .join('\n')
        ),
        errors > 0 ? _reject(say.siteErrors(errors)) : Promise.resolve()
      ))(
        _say(ctx),
        report.findings.filter((_) => _.severity === 'error').length
      )
  );

// --- mcp -------------------------------------------------------------------

// От чьего имени агент: --user, иначе первый администратор.
const _agentUser = (ctx: Context, app: App): Promise<UserView> =>
  ((users) =>
    ((user) =>
      user
        ? Promise.resolve(user)
        : _reject(
            ctx.options.user
              ? _say(ctx).noUser(ctx.options.user)
              : _say(ctx).noAgentUser
          ))(
      ctx.options.user
        ? users.find((_) => _.email === ctx.options.user!.trim().toLowerCase())
        : users.find((_) => _.role === 'admin')
    ))(app.identity.users.list());

// Сообщения MCP по stdio — строками JSON; кусок без перевода строки ждёт продолжения.
const _lines = (): TransformStream<string, string> => {
  let rest = '';
  return new TransformStream({
    transform: (chunk, controller) =>
      ((parts) => (
        (rest = parts.pop() ?? ''),
        parts
          .filter((_) => _.trim() !== '')
          .forEach((_) => void controller.enqueue(_))
      ))(`${rest}${chunk}`.split('\n')),
    flush: (controller) => void (rest.trim() && controller.enqueue(rest)),
  });
};

const _PARSE_ERROR = {
  jsonrpc: '2.0',
  id: null,
  error: { code: -32700, message: 'Parse error' },
};

// stdout — только ответы протокола: всё для человека идёт в stderr.
const _answer = (reply: unknown): void =>
  void (reply !== null && process.stdout.write(`${JSON.stringify(reply)}\n`));

const _mcp = (ctx: Context): Promise<void> =>
  _existingDb(ctx).then((path) => {
    const app = createApp({ databasePath: path });
    return (
      _agentUser(ctx, app)
        // Один процесс — один сеанс агента: прочитал заявки — код и настройки до конца процесса закрыты.
        .then((user) => ({ user, session: defineAgentSession() }))
        .then(
          ({ user, session }) => (
            process.stderr.write(
              `${named(PROGRAM)(_say(ctx).mcpReady(app.site.settings.get().name, user.email, user.role))}\n`
            ),
            Bun.stdin
              .stream()
              .pipeThrough(new TextDecoderStream())
              .pipeThrough(_lines())
              .pipeTo(
                new WritableStream({
                  write: (line) =>
                    ((message) =>
                      message === _PARSE_ERROR
                        ? _answer(_PARSE_ERROR)
                        : app.mcp(message, user, session).then(_answer))(
                      attempt(
                        () => JSON.parse(line) as unknown,
                        () => _PARSE_ERROR
                      )
                    ),
                })
              )
          )
        )
        .finally(() => app.close())
    );
  });

// --- backup и import-evo ---------------------------------------------------

const _today = (): string => new Date().toISOString().slice(0, 10);

const _backup = (ctx: Context): Promise<void> =>
  ((target) =>
    Bun.file(target)
      .exists()
      .then((exists) =>
        exists
          ? _reject(_say(ctx).exists(target))
          : _withApp(
              ctx,
              (app): Promise<unknown> =>
                // Имя с .json — записи текстом, иначе — файл базы.
                target.endsWith('.json')
                  ? Bun.write(target, JSON.stringify(app.archive(), null, 2))
                  : Promise.resolve(app.backup(target))
            )
      )
      .then(() =>
        ctx.out(
          `${ctx.paint.ok('✓')} ${_say(ctx).copied} ${ctx.paint.path(target)}${_dot(ctx.paint)}${_size(Bun.file(target).size, _say(ctx))}`
        )
      ))(ctx.args[0] ?? `cms-${_today()}.db`);

// Восстановление: база может быть и новой — так сайт переезжает на другой сервер.
const _restore = (ctx: Context): Promise<void> =>
  (ctx.args[0] ? Promise.resolve(ctx.args[0]) : _reject(_say(ctx).needCopy))
    .then((file) =>
      Bun.file(file)
        .exists()
        .then((exists) =>
          exists ? Bun.file(file).bytes() : _reject(_say(ctx).noFile(file))
        )
    )
    .then((bytes) => {
      const app = createApp({ databasePath: ctx.options.db });
      return app
        .restore(bytes)
        .then((report) =>
          ctx.out(
            [
              `${ctx.paint.ok('✓')} ${_say(ctx).restored} ${ctx.paint.path(ctx.options.db)}${_dot(ctx.paint)}${pages(report.pages, ctx.language)}`,
              ...(report.savedTo
                ? [
                    `  ${ctx.paint.dim(_say(ctx).before)} ${ctx.paint.path(report.savedTo)}`,
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
    : _reject(_say(ctx).needDump)
  ).then(
    pipe(
      (dump) =>
        Bun.file(dump)
          .exists()
          .then((exists) =>
            exists ? Bun.file(dump).text() : _reject(_say(ctx).noFile(dump))
          ),
      (sql) =>
        ((app) =>
          Promise.resolve()
            .then(() =>
              app.content.isEmpty()
                ? importEvo(app, parseDump(sql))
                : _reject(_say(ctx).hasPages(ctx.options.db))
            )
            .finally(() => app.close()))(
          createApp({ databasePath: ctx.options.db })
        ),
      (report) =>
        ((say) =>
          ctx.out(
            [
              `${ctx.paint.ok('✓')} ${say.imported} ${ctx.paint.path(ctx.options.db)}:`,
              _row(ctx.paint, say.pages, String(report.pages)),
              _row(
                ctx.paint,
                say.elements,
                `${say.templates(report.templates)}${_dot(ctx.paint)}${say.components(report.components)}`
              ),
              _row(
                ctx.paint,
                say.fields,
                `${report.fields}${_dot(ctx.paint)}${say.values(report.values)}`
              ),
              ...(report.snippets.length > 0
                ? [
                    _row(
                      ctx.paint,
                      ctx.paint.warn(say.snippets),
                      say.snippetsLeft(report.snippets.join(', '))
                    ),
                  ]
                : []),
              ...(report.warnings.length > 0
                ? [
                    '',
                    ctx.paint.warn(say.warnings(report.warnings.length)),
                    ...report.warnings.map(
                      (_) => `  ${ctx.paint.dim('•')} ${_}`
                    ),
                  ]
                : []),
              '',
              `${say.run} ${ctx.paint.bold(PROGRAM)} ${ctx.paint.flag('--db')} ${ctx.options.db}`,
            ].join('\n')
          ))(_say(ctx))
    )
  );

// --- справка ---------------------------------------------------------------

/** Нет такой команды: подсказка с ближайшей и путь к списку. */
export var unknownCommand = (name: string, language: Language): CliError =>
  cliError(unknownText(name, language));

export var helpFor = (
  paint: Paint,
  name: string | undefined,
  language: Language
): Promise<string> =>
  (name === undefined
    ? Promise.resolve(overview(paint, language))
    : ((help) =>
        help
          ? Promise.resolve(commandHelp(paint, help, language))
          : Promise.reject(unknownCommand(name, language)))(
        COMMANDS[language].find((_) => _.name === name)
      )
  ).then(named(PROGRAM));

// --- update ----------------------------------------------------------------

const _UPDATE: Readonly<
  Record<
    UpdateResult['status'],
    (paint: Paint, result: UpdateResult, say: _Say) => string
  >
> = {
  current: (paint, _, say) => `${paint.ok('✓')} ${say.current(_.current)}`,
  available: (paint, _, say) =>
    _.status === 'available'
      ? [
          `${say.available} ${paint.bold(`${PRODUCT} ${_.release.version}`)}${paint.dim(say.installed(_.current))}`,
          `  ${paint.path(_.release.url)}`,
          `  ${say.updateWith} ${paint.bold(PROGRAM)} ${paint.command('update')}`,
        ].join('\n')
      : '',
  updated: (paint, _, say) =>
    _.status === 'updated'
      ? [
          `${paint.ok('✓')} ${say.updated} ${_.current} → ${paint.bold(_.release.version)}`,
          `  ${padEnd(paint.dim(say.previous), 10)}${paint.path(_.previous)}`,
          ...(_.alias
            ? [`  ${padEnd(paint.dim(say.alias), 10)}${paint.path(_.alias)}`]
            : []),
          `  ${paint.warn('▸')} ${say.restartServer}`,
        ].join('\n')
      : '',
};

const _update = (ctx: Context): Promise<void> =>
  updateProgram({
    releases: defineReleases({ repository: REPOSITORY, version: VERSION }),
    current: VERSION,
    check: ctx.options.check === true,
  }).then((result) =>
    ctx.out(_UPDATE[result.status](ctx.paint, result, _say(ctx)))
  );

export var RUN: Readonly<Record<string, (ctx: Context) => Promise<void>>> = {
  serve: _serve,
  new: _new,
  info: _info,
  users: _users,
  backup: _backup,
  restore: _restore,
  'import-evo': _import,
  elements: _elements,
  mcp: _mcp,
  diagnose: _diagnose,
  update: _update,
  help: (ctx) => helpFor(ctx.paint, ctx.args[0], ctx.language).then(ctx.out),
  version: (ctx) => Promise.resolve(ctx.out(`${PRODUCT} ${VERSION}`)),
};

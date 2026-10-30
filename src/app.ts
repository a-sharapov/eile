import { VERSION } from './cli/version.ts';
import {
  ASSISTANT_TABLE,
  type AssistantService,
  assistantMigrations,
  defineAssistant,
} from './contexts/assistant/index.ts';
import {
  type Clock,
  type ContentService,
  contentMigrations,
  defineContent,
} from './contexts/content/index.ts';
import {
  BUILTIN_COMPONENTS,
  defineComponentRuntime,
  defineDelivery,
  defineRenderScope,
} from './contexts/delivery/index.ts';
import {
  ASSETS_PREFIX,
  type DesignService,
  defineDesign,
  designMigrations,
} from './contexts/design/index.ts';
import {
  defineExtensions,
  type ExtensionsService,
  extensionsMigrations,
} from './contexts/extensions/index.ts';
import {
  defineForms,
  FORMS_PREFIX,
  FORMS_SERVER_TABLES,
  type Forms,
  formsMigrations,
} from './contexts/forms/index.ts';
import {
  defineIdentity,
  type IdentityService,
  identityMigrations,
} from './contexts/identity/index.ts';
import {
  defineManager,
  MANAGER_PATH,
  managerMigrations,
} from './contexts/manager/index.ts';
import {
  defineMedia,
  MEDIA_PREFIX,
  type Media,
  mediaMigrations,
} from './contexts/media/index.ts';
import {
  defineNotify,
  NOTIFY_TABLES,
  type Notify,
  notifyMigrations,
  type Transports,
} from './contexts/notify/index.ts';
import {
  defineSite,
  type SiteService,
  siteMigrations,
} from './contexts/site/index.ts';
import { KIT } from './kit/index.ts';
import {
  type Archive,
  databaseFromArchive,
  exportArchive,
  isSqlite,
  prepareDatabase,
  restoreDatabase,
  snapshot,
  tempPath,
} from './platform/archive.ts';
import {
  backupDatabase,
  copyPrefix,
  type Database,
  keepNewest,
  type Migration,
  migrate,
  openDatabase,
} from './platform/database.ts';
import { defineEventBus } from './platform/event-bus.ts';
import { applyScaffold, type Scaffold } from './scaffolds/scaffold.ts';
import { attempt, fail } from './shared/kernel/errors.ts';
import { errorDetail, errorKey } from './shared/kernel/report.ts';

export type AppOptions = {
  /** Файл SQLite; по умолчанию база в памяти. */
  readonly databasePath?: string;
  /** Каркас, которым наполняется пустая база: у сервера — приветствие, у тестов — демо-сайт. */
  readonly scaffold?: Scaffold;
  /** Часы для расписания публикаций; тесты подставляют свои. */
  readonly clock?: Clock;
  /** За своим обратным прокси: протокол, адрес сайта и посетителя — из X-Forwarded-*. */
  readonly trustProxy?: boolean;
  /** Фоновая отправка уведомлений по расписанию — у сервера; CLI и тесты обходятся без неё. */
  readonly background?: boolean;
  /** Каналы уведомлений без сети — для тестов. */
  readonly transports?: Transports;
};

/** То, что Bun передаёт в fetch вторым аргументом: по нему узнаём адрес посетителя. */
export type ClientSource = {
  readonly requestIP: (request: Request) => { readonly address: string } | null;
};

export type App = {
  readonly fetch: (
    request: Request,
    server?: ClientSource
  ) => Promise<Response>;
  readonly content: ContentService;
  readonly design: DesignService;
  readonly site: SiteService;
  readonly identity: IdentityService;
  readonly extensions: ExtensionsService;
  readonly media: Media;
  readonly assistant: AssistantService;
  readonly notify: Notify;
  readonly forms: Forms;
  /** Копия всего сайта в один файл: база, элементы, медиа. */
  readonly backup: (target: string) => void;
  /** Записи сайта текстом (JSON); сеансов входа в нём нет. */
  readonly archive: () => Archive;
  /** Восстановить сайт из копии — файла .db или JSON. */
  readonly restore: (bytes: Uint8Array) => Promise<RestoreReport>;
  readonly close: () => void;
};

export type RestoreReport = {
  /** Страниц в восстановленном сайте. */
  readonly pages: number;
  /** Куда сохранено состояние до восстановления; null — база в памяти. */
  readonly savedTo: string | null;
};

const _MIGRATIONS: readonly Migration[] = [
  ...siteMigrations,
  ...contentMigrations,
  ...designMigrations,
  ...identityMigrations,
  ...extensionsMigrations,
  ...mediaMigrations,
  ...managerMigrations,
  ...assistantMigrations,
  ...notifyMigrations,
  ...formsMigrations,
];

// Сеансы входа, подключение ИИ (его ключ), каналы уведомлений и их очередь — не содержимое сайта, а
// этого сервера: в копию не попадают и при восстановлении остаются свои.
const _SERVER_ONLY = [
  'identity_sessions',
  ASSISTANT_TABLE,
  ...NOTIFY_TABLES,
  ...FORMS_SERVER_TABLES,
];

// Копий «до восстановления» рядом с базой — не больше трёх последних.
const _KEEP_BEFORE_RESTORE = 3;

// События, о которых владелец сайта хочет знать, даже если всё работает: кто получил доступ к менеджеру.
const _AUDIT: Readonly<Record<string, string>> = {
  'identity.user_created': 'В менеджере новый пользователь',
  'identity.role_changed': 'У пользователя менеджера сменилась роль',
  'identity.user_removed': 'Пользователь менеджера удалён',
};

const _isManager = (path: string): boolean =>
  path === MANAGER_PATH || path.startsWith(`${MANAGER_PATH}/`);

type Parts = Omit<App, 'backup' | 'archive' | 'restore' | 'close'>;

type Backup = {
  readonly database: () => Promise<Uint8Array>;
  readonly archive: () => Archive;
  readonly restore: (bytes: Uint8Array) => Promise<RestoreReport>;
};

// Контексты на открытой базе. Восстановление копии собирает их заново: кэши страниц, шаблонов и
// плагинов не переживают замену записей.
const _compose = (db: Database, options: AppOptions, backup: Backup): Parts => {
  const clock = options.clock ?? (() => new Date());
  const bus = defineEventBus();

  const site = defineSite({ db, bus });
  const settings = site.settings.get;
  const notify = defineNotify({
    db,
    clock,
    site: () => ((_) => ({ name: _.name, url: _.siteUrl }))(settings()),
    transports: options.transports,
  });
  const report = notify.incidents.report;
  bus.onAny(
    (event) =>
      void (
        _AUDIT[event.type] &&
        report({
          kind: event.type,
          severity: 'info',
          title: _AUDIT[event.type]!,
          detail: `Пользователь #${(event as { userId?: number }).userId ?? '?'}`,
          key: `${event.type}:${(event as { userId?: number }).userId}`,
        })
      )
  );
  // Сбой расписания не должен ронять отдачу страниц: как в Evo, публикация проверяется в начале запроса.
  const scheduleFailed = (error: unknown): void => (
    console.error(error),
    report({
      kind: 'content.schedule_failed',
      severity: 'error',
      title: 'Не сработало расписание публикаций',
      detail: errorDetail(error),
      key: errorKey('content.schedule_failed', error),
    })
  );
  const content = defineContent({ db, bus, clock });
  const identity = defineIdentity({ db, bus, clock });
  const scope = defineRenderScope();
  const media = defineMedia({ db, bus });
  // Переводы и свои настройки — для `{i18n.key}`, `[@key]`, `t()` и `setting()` в шаблонах и контенте.
  const dictionary = {
    text: site.translations.text,
    value: site.customSettings.value,
  };
  const runtime = defineComponentRuntime(
    content.published,
    settings,
    scope,
    media,
    dictionary
  );
  const design = defineDesign({
    db,
    bus,
    runtime,
    builtins: BUILTIN_COMPONENTS,
  });
  const extensions = defineExtensions({ db, bus, runtime, report });
  const assistant = defineAssistant({
    db,
    site: () =>
      ((_) => ({
        name: _.name,
        language: _.language,
        description: _.description,
        url: _.siteUrl,
      }))(settings()),
  });
  // Формы: страница — для скрытых полей и возврата, заявка — в уведомления по маршруту формы.
  const forms = defineForms({
    db,
    bus,
    clock,
    report,
    site: () =>
      ((_) => ({ name: _.name, url: _.siteUrl, language: _.language }))(
        settings()
      ),
    pages: {
      page: (id) =>
        ((page) =>
          page && {
            id: page.id,
            title: page.longTitle || page.title,
            path: page.id === settings().homePageId ? '/' : page.path,
            language: page.language,
            fields: page.fields,
          })(content.published.page(id)),
      setting: site.customSettings.value,
    },
    notify: (notice, channels, source) =>
      void notify.send(notice, channels, source),
  });
  const delivery = defineDelivery({
    content: content.published,
    settings,
    views: design.views,
    scope,
    bus,
    hooks: extensions.hooks,
    dictionary,
    report,
    modules: { Form: forms.render },
  });

  void (
    options.scaffold &&
    content.isEmpty() &&
    applyScaffold(options.scaffold, { content, design, site, forms })
  );

  const manager = defineManager({
    content,
    design,
    site,
    identity,
    extensions,
    media,
    preview: delivery.preview,
    backup,
    assistant,
    kit: KIT,
    report,
    notify,
    forms,
    pageCache: delivery.cache,
    version: VERSION,
    db,
  });

  const serve = (request: Request, client: string): Promise<Response> => {
    const path = new URL(request.url).pathname;
    return _isManager(path)
      ? manager.handle(request, client)
      : path.startsWith(FORMS_PREFIX)
        ? forms.handle(request, client)
        : path.startsWith(`${ASSETS_PREFIX}/`)
          ? design.assets(request)
          : path.startsWith(MEDIA_PREFIX)
            ? Promise.resolve(media.handle(request))
            : delivery.handle(request);
  };

  return {
    fetch: (request, server) =>
      Promise.resolve()
        .then(content.schedule.runDue)
        .then(undefined, scheduleFailed)
        .then(() => serve(request, server?.requestIP(request)?.address ?? '')),
    content,
    design,
    site,
    identity,
    extensions,
    media,
    assistant,
    notify,
    forms,
  };
};

// Состояние до восстановления — рядом с файлом базы: site.db → site.before-restore-20261030-120000.db.
const _beforeRestore = (databasePath: string | undefined): string | null =>
  databasePath && databasePath !== ':memory:'
    ? databasePath.replace(
        /(\.db)?$/,
        `.before-restore-${new Date().toISOString().slice(0, 23).replace(/[-:.]/g, '').replace('T', '-')}.db`
      )
    : null;

const _parseArchive = (bytes: Uint8Array): Archive =>
  attempt(
    () => JSON.parse(new TextDecoder().decode(bytes)) as Archive,
    () => fail('backup.invalid', 'The file is neither a .db nor a JSON backup')
  );

// За своим прокси запрос — таким, каким его видел посетитель: протокол и хост из X-Forwarded-*.
const _forwarded = (request: Request): Request =>
  ((url, proto, host) =>
    ((next) => (next === request.url ? request : new Request(next, request)))(
      `${proto === 'https' || proto === 'http' ? proto : url.protocol.slice(0, -1)}://${host && /^[\w.-]+(?::\d+)?$/.test(host) ? host : url.host}${url.pathname}${url.search}`
    ))(
    new URL(request.url),
    request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim(),
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  );

// Посетитель — последний адрес в X-Forwarded-For: его дописал сам прокси, остальное мог прислать кто угодно.
const _forwardedClient = (request: Request, fallback: string): string =>
  request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || fallback;

/** Корень композиции: единственное место, которое знает все контексты. */
export var createApp = (options: AppOptions = {}): App => {
  const db = openDatabase(options.databasePath ?? ':memory:');
  migrate(db, _MIGRATIONS);

  // Копия текущего сайта сохраняется рядом с базой, затем записи заменяются, контексты собираются
  // заново; сеанс того, кто восстанавливал, остаётся, если в копии он тот же человек.
  const restore = (bytes: Uint8Array): Promise<RestoreReport> => {
    const source = tempPath();
    return (
      isSqlite(bytes)
        ? Bun.write(source, bytes).then(() =>
            prepareDatabase(source, _MIGRATIONS)
          )
        : Promise.resolve(bytes).then((_) =>
            databaseFromArchive(_parseArchive(_), source, _MIGRATIONS)
          )
    )
      .then(() => {
        // Пустой базе (переезд на новый сервер) нечего терять — копию «до» не делаем.
        const savedTo =
          parts.content.isEmpty() && parts.identity.users.list().length === 0
            ? null
            : _beforeRestore(options.databasePath);
        void (
          savedTo &&
          (backupDatabase(db, savedTo),
          keepNewest(
            savedTo,
            copyPrefix(options.databasePath!, 'before-restore'),
            _KEEP_BEFORE_RESTORE
          ))
        );
        const before = parts.identity.users
          .list()
          .map((_) => ({ id: _.id, email: _.email }));
        restoreDatabase(db, source, _SERVER_ONLY);
        stopBackground();
        parts = _compose(db, { ...options, scaffold: undefined }, backup);
        stopBackground = startBackground();
        parts.identity.sessions.closeChanged(before);
        return { pages: parts.content.drafts.tree().length, savedTo };
      })
      .finally(() =>
        Bun.file(source)
          .delete()
          .then(undefined, () => undefined)
      );
  };

  const backup: Backup = {
    database: () => snapshot(db, _SERVER_ONLY),
    archive: () => exportArchive(db, _SERVER_ONLY),
    restore,
  };

  let parts = _compose(db, options, backup);
  // Фон — у собранных заново контекстов: восстановление копии останавливает прежний и запускает новый.
  const startBackground = (): (() => void) =>
    options.background
      ? ((notify, forms) => () => (notify(), forms()))(
          parts.notify.start(),
          parts.forms.start()
        )
      : () => undefined;
  let stopBackground = startBackground();

  return {
    fetch: (request, server) =>
      options.trustProxy
        ? parts.fetch(_forwarded(request), {
            requestIP: () => ({
              address: _forwardedClient(
                request,
                server?.requestIP(request)?.address ?? ''
              ),
            }),
          })
        : parts.fetch(request, server),
    get content() {
      return parts.content;
    },
    get design() {
      return parts.design;
    },
    get site() {
      return parts.site;
    },
    get identity() {
      return parts.identity;
    },
    get extensions() {
      return parts.extensions;
    },
    get media() {
      return parts.media;
    },
    get assistant() {
      return parts.assistant;
    },
    get notify() {
      return parts.notify;
    },
    get forms() {
      return parts.forms;
    },
    backup: (target) => backupDatabase(db, target, _SERVER_ONLY),
    archive: backup.archive,
    restore,
    close: () => (stopBackground(), db.close()),
  };
};

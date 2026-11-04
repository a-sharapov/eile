import { VERSION } from './cli/version.ts';
import {
  ASSISTANT_TABLE,
  type Assistant,
  assistantMigrations,
  defineAssistant,
} from './contexts/assistant/index.ts';
import {
  CERTIFICATES_TABLES,
  type Certificates,
  certificatesMigrations,
  defineCertificates,
  type HttpsOptions,
} from './contexts/certificates/index.ts';
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
  type DiagnosticsService,
  defineDiagnostics,
} from './contexts/diagnostics/index.ts';
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
  IDENTITY_SERVER_TABLES,
  type Identity,
  identityMigrations,
  type UserView,
} from './contexts/identity/index.ts';
import {
  type AgentSession,
  defineManager,
  MANAGER_PATH,
  managerMigrations,
} from './contexts/manager/index.ts';
import {
  defineImageResizer,
  defineMedia,
  defineMediaCache,
  type ImageResizer,
  MEDIA_PREFIX,
  type Media,
  type MediaCache,
  mediaCacheDir,
  mediaMigrations,
  stemOf,
} from './contexts/media/index.ts';
import {
  defineNotify,
  message,
  NOTIFY_TABLES,
  type Notify,
  notifyMigrations,
  type Transports,
} from './contexts/notify/index.ts';
import {
  defineRedirects,
  type RedirectsService,
  redirectsMigrations,
} from './contexts/redirects/index.ts';
import {
  defineReview,
  PREVIEW_PREFIX,
  REVIEW_SERVER_TABLES,
  type Review,
  type ReviewEvent,
  reviewMigrations,
} from './contexts/review/index.ts';
import {
  clearSearchIndex,
  defineSearch,
  SEARCH_PATH,
  SEARCH_TABLES,
  type Search,
  searchMigrations,
} from './contexts/search/index.ts';
import {
  defineSite,
  type SiteService,
  siteMigrations,
} from './contexts/site/index.ts';
import {
  defineStats,
  defineStatsRecorder,
  GOAL_PATH,
  STATS_SERVER_TABLES,
  type Stats,
  type StatsRecorder,
  statsMigrations,
} from './contexts/stats/index.ts';
import {
  defineUpkeep,
  UPKEEP_SERVER_TABLES,
  type Upkeep,
  upkeepMigrations,
} from './contexts/upkeep/index.ts';
import { defineHealth, isHealthRequest } from './health.ts';
import { KIT, KIT_ENGLISH, KIT_GERMAN, kitFor } from './kit/index.ts';
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
import { withAbsoluteUrl } from './platform/request-url.ts';
import { REPOSITORY } from './product.ts';
import { applyScaffold, type Scaffold } from './scaffolds/scaffold.ts';
import { serverChecks } from './server-checks.ts';
import {
  applyServerSettings,
  readServerSettings,
  type ServerSettings,
  type ServerSettingsReport,
} from './server-settings.ts';
import { attempt, fail, rethrow } from './shared/kernel/errors.ts';
import {
  type Localized,
  localized,
  type ManagerLanguage,
} from './shared/kernel/manager-language.ts';
import { errorDetail, errorKey } from './shared/kernel/report.ts';
import { redirectPages, siteFacts } from './site-facts.ts';

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
  /** Журнал почтового шлюза: строка на запрос с письмом; по умолчанию — вывод сервера. */
  readonly mailLog?: (line: string) => void;
  /** Адрес API релизов вместо GitHub: проверенный `CMS_RELEASES_URL` или сервер тестов. */
  readonly releasesUrl?: string;
  /** Проверять обновления; по умолчанию да, если нет CMS_NO_UPDATE_CHECK=1. */
  readonly updateCheck?: boolean;
  /** HTTPS без прокси: сервер сам выпускает и продлевает сертификат Let's Encrypt на эти домены. */
  readonly https?: HttpsOptions;
  /** Каталог кэша медиатеки; по умолчанию `<база>.media-cache` рядом с файлом базы, у базы в памяти кэша нет. */
  readonly mediaCache?: string;
};

/** То, что Bun передаёт в fetch вторым аргументом: по нему узнаём адрес посетителя. */
export type ClientSource = {
  readonly requestIP: (request: Request) => { readonly address: string } | null;
  /** Срок ответа на этот запрос вместо общего (у Bun — 10 с тишины): письмо через SMTP бывает дольше. */
  readonly timeout?: (request: Request, seconds: number) => void;
};

export type App = {
  readonly fetch: (
    request: Request,
    server?: ClientSource
  ) => Promise<Response>;
  readonly content: ContentService;
  readonly design: DesignService;
  readonly site: SiteService;
  readonly identity: Identity;
  readonly extensions: ExtensionsService;
  readonly media: Media;
  readonly assistant: Assistant;
  readonly notify: Notify;
  readonly forms: Forms;
  /** Автокопии по расписанию и проверка обновлений. */
  readonly upkeep: Upkeep;
  readonly search: Search;
  readonly certificates: Certificates;
  readonly redirects: RedirectsService;
  /** Ссылки предпросмотра и проверка правок агентов (ADR 0054). */
  readonly review: Review;
  /** Статистика посещений: счёт без cookie, цели, отчёт. */
  readonly stats: Stats;
  /** Диагностика сайта; другие модули добавляют проверки через `register`. */
  readonly diagnostics: DiagnosticsService;
  /** Копия всего сайта в один файл: база, элементы, медиа. */
  readonly backup: (target: string) => void;
  /** Записи сайта текстом (JSON); сеансов входа в нём нет. */
  readonly archive: () => Archive;
  /** Восстановить сайт из копии — файла .db или JSON. */
  readonly restore: (bytes: Uint8Array) => Promise<RestoreReport>;
  /** Восстановить сайт из временного файла .db (распечатанная копия из хранилища); файл после удаляется. */
  readonly restoreFile: (path: string) => Promise<RestoreReport>;
  /** Настройки этого сервера, которых нет в копии сайта: прочитать для файла настроек и применить привезённые. */
  readonly serverSettings: {
    readonly read: () => ServerSettings;
    /** Одной транзакцией; контексты затем собираются заново. */
    readonly apply: (settings: ServerSettings) => ServerSettingsReport;
  };
  /** MCP от имени пользователя: сообщение JSON-RPC → ответ, у уведомления — null. */
  readonly mcp: (
    message: unknown,
    user: UserView,
    session: AgentSession
  ) => Promise<unknown | null>;
  /** Подхватить то, что записал в базу другой процесс; `fetch` делает это сам. */
  readonly follow: () => void;
  /** Всё или ничего: исключение внутри `run` откатывает каждую запись в базу. */
  readonly transaction: <T>(run: () => T) => T;
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
  ...upkeepMigrations,
  ...searchMigrations,
  ...certificatesMigrations,
  ...redirectsMigrations,
  ...statsMigrations,
  ...reviewMigrations,
];

// Сеансы входа, подключение ИИ (его ключ), каналы уведомлений и их очередь, сертификаты HTTPS и их
// ключи, посетители дня статистики — не содержимое сайта, а этого сервера: в копию не попадают и при
// восстановлении остаются свои. Сводки статистики по дням — сайта: едут с ним в копии.
const _SERVER_ONLY = [
  ...IDENTITY_SERVER_TABLES,
  ASSISTANT_TABLE,
  ...NOTIFY_TABLES,
  ...FORMS_SERVER_TABLES,
  ...UPKEEP_SERVER_TABLES,
  ...CERTIFICATES_TABLES,
  ...STATS_SERVER_TABLES,
  ...REVIEW_SERVER_TABLES,
];

// Индекс поиска выводится из страниц: в JSON-копию не идёт, восстановление его не трогает, а после
// восстановления он строится заново. В копию .db попадает как есть — согласованным.
const _DERIVED = [..._SERVER_ONLY, ...SEARCH_TABLES];

// Копий «до восстановления» рядом с базой — не больше трёх последних.
const _KEEP_BEFORE_RESTORE = 3;

// События, о которых владелец сайта хочет знать, даже если всё работает: кто получил доступ к менеджеру.
const _AUDIT: Readonly<Record<string, Localized>> = {
  'identity.user_created': {
    en: 'A new manager user',
    de: 'Neuer Benutzer im Manager',
    ru: 'В менеджере новый пользователь',
  },
  'identity.role_changed': {
    en: 'A manager user’s role changed',
    de: 'Die Rolle eines Manager-Benutzers wurde geändert',
    ru: 'У пользователя менеджера сменилась роль',
  },
  'identity.password_reset': {
    en: 'A manager user’s password was reset from an email link',
    de: 'Das Passwort eines Manager-Benutzers wurde per E-Mail-Link zurückgesetzt',
    ru: 'Пароль пользователя менеджера сброшен по ссылке из письма',
  },
  'identity.user_removed': {
    en: 'A manager user was removed',
    de: 'Ein Manager-Benutzer wurde gelöscht',
    ru: 'Пользователь менеджера удалён',
  },
  'identity.token_issued': {
    en: 'A new API token for agents and scripts',
    de: 'Neuer API-Schlüssel für Agenten und Skripte',
    ru: 'Выпущен ключ API для агентов и скриптов',
  },
};

const _USER: Localized = { en: 'User', de: 'Benutzer', ru: 'Пользователь' };

// Агент отдал правки на проверку — владельцу тем же каналом, что и о событиях сайта.
const _READY: Readonly<
  Record<
    ManagerLanguage,
    {
      readonly title: string;
      readonly text: (event: ReviewEvent) => string;
      readonly link: string;
    }
  >
> = {
  en: {
    title: 'Agent changes are waiting for review',
    text: (_) =>
      `${_.title || `Change set ${_.changeSetId}`}: ${_.proposals} proposed change(s) from ${_.agent.userName}${_.agent.tokenName ? ` (${_.agent.tokenName})` : ''}. Nothing is on the site until you accept it.`,
    link: 'Review in the manager',
  },
  de: {
    title: 'Änderungen eines Agenten warten auf Prüfung',
    text: (_) =>
      `${_.title || `Änderungssatz ${_.changeSetId}`}: ${_.proposals} vorgeschlagene Änderung(en) von ${_.agent.userName}${_.agent.tokenName ? ` (${_.agent.tokenName})` : ''}. Auf der Website ist nichts davon, bis Sie es annehmen.`,
    link: 'Im Manager prüfen',
  },
  ru: {
    title: 'Правки агента ждут проверки',
    text: (_) =>
      `${_.title || `Набор ${_.changeSetId}`}: предложено правок — ${_.proposals}, от ${_.agent.userName}${_.agent.tokenName ? ` (${_.agent.tokenName})` : ''}. На сайте ничего не изменится, пока вы их не примете.`,
    link: 'Проверить в менеджере',
  },
};

const _isManager = (path: string): boolean =>
  path === MANAGER_PATH || path.startsWith(`${MANAGER_PATH}/`);

// Письмо через почтовый шлюз ждёт ответа SMTP: подключение до 15 с, ответ на команду до 30 с.
const _GATEWAY_SECONDS = 120;

type Parts = Omit<
  App,
  | 'backup'
  | 'archive'
  | 'restore'
  | 'restoreFile'
  | 'serverSettings'
  | 'follow'
  | 'transaction'
  | 'close'
>;

type Backup = {
  readonly database: () => Promise<Uint8Array>;
  readonly archive: () => Archive;
  readonly restore: (bytes: Uint8Array) => Promise<RestoreReport>;
  readonly restoreFile: (path: string) => Promise<RestoreReport>;
};

// Контексты на открытой базе. Восстановление копии собирает их заново: кэши страниц, шаблонов и
// плагинов не переживают замену записей.
const _compose = (
  db: Database,
  options: AppOptions,
  backup: Backup,
  cache: MediaCache,
  recorder: StatsRecorder,
  resize: ImageResizer,
  setup: string | null = null
): Parts => {
  const clock = options.clock ?? (() => new Date());
  const bus = defineEventBus();

  const site = defineSite({ db, bus });
  const settings = site.settings.get;
  const notify = defineNotify({
    db,
    clock,
    site: () =>
      ((_) => ({ name: _.name, url: _.siteUrl, language: _.language }))(
        settings()
      ),
    transports: options.transports,
    ...(options.mailLog ? { log: options.mailLog } : {}),
    // Тело письма шлюза ждёт разбора там же, где тела загрузок медиатеки: на диске рядом с базой.
    spool: cache.spool,
  });
  const report = notify.incidents.report;
  const certificates = defineCertificates({
    db,
    clock,
    report,
    ...(options.https ? { https: options.https } : {}),
  });
  bus.onAny(
    (event) =>
      void (
        _AUDIT[event.type] &&
        report({
          kind: event.type,
          severity: 'info',
          title: _AUDIT[event.type]!,
          detail: ((user) => localized((_) => `${_USER[_]} #${user}`))(
            (event as { userId?: number }).userId ?? '?'
          ),
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
      title: {
        en: 'Scheduled publishing did not run',
        de: 'Geplante Veröffentlichung hat nicht funktioniert',
        ru: 'Не сработало расписание публикаций',
      },
      detail: errorDetail(error),
      key: errorKey('content.schedule_failed', error),
    })
  );
  const content = defineContent({
    db,
    bus,
    clock,
    siteLanguage: () => settings().language,
  });
  const search = defineSearch({
    db,
    bus,
    published: content.published,
    tree: content.drafts.tree,
    site: () =>
      ((_) => ({
        language: _.language,
        notFoundPageId: _.notFoundPageId,
        synonyms: _.searchSynonyms,
      }))(settings()),
  });
  const identity = defineIdentity({ db, bus, clock, setup });
  const scope = defineRenderScope();
  const media = defineMedia({ db, bus, cache, resize, report });
  // Переводы и свои настройки — для `{i18n.key}`, `[@key]`, `t()` и `setting()` в шаблонах и контенте.
  const dictionary = {
    text: site.translations.text,
    value: site.customSettings.value,
  };
  // Скрипты хранит design, а он создаётся ниже и хостит этот рантайм: адрес нужен только при рендере.
  const runtime = defineComponentRuntime(
    content.published,
    settings,
    scope,
    media,
    dictionary,
    search.search,
    { url: (name) => design.scripts.url(name) }
  );
  const searchHandler = search.handler(runtime.link);
  const design = defineDesign({
    db,
    bus,
    runtime,
    builtins: BUILTIN_COMPONENTS,
  });
  const extensions = defineExtensions({ db, bus, runtime, report });
  // Картинка для модели, которая видит: вариант 960 px, иначе сам файл до 4 МБ; SVG и прочее — нет.
  const imageFor = (path: string) =>
    ((found) => found && { data: found.data(), type: found.meta.contentType })(
      [`${stemOf(path)}@960.webp`, path]
        .map((_) =>
          attempt(
            () => media.files.read(_),
            () => null
          )
        )
        .find(
          (_) =>
            _ !== null &&
            /^image\/(png|jpeg|webp|gif)/.test(_.meta.contentType) &&
            _.meta.size <= 4 * 1024 * 1024
        ) ?? null
    );
  const assistant = defineAssistant({
    db,
    images: imageFor,
    site: () =>
      ((_) => ({
        name: _.name,
        language: _.language,
        description: _.description,
        url: _.siteUrl,
      }))(settings()),
  });
  // Статистика: формы создаются ниже, их названия нужны только отчёту.
  const stats = defineStats({
    db,
    bus,
    recorder,
    siteUrl: () => settings().siteUrl,
    forms: () => forms.forms.list(),
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
    mail: (letter, source) =>
      void notify.email.queue(
        letter.to,
        message({
          topic: 'confirmation',
          title: letter.subject,
          text: letter.text,
        }),
        source
      ),
    noticeLanguage: notify.language,
    accepted: (_) => void stats.submission(_.form, _.ip, _.userAgent),
  });
  const redirects = defineRedirects({
    db,
    bus,
    clock,
    pages: redirectPages(content, site),
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
    redirects: {
      match: redirects.match,
      matchQuery: redirects.matchQuery,
      hit: redirects.hit,
    },
    // Менеджер создаётся ниже: полоса понадобится только на запрос, когда он уже есть.
    editBar: (request, page) => manager.editBar(request, page),
    pageViews: stats.view,
    beacon: stats.beacon,
  });
  const review = defineReview({
    db,
    bus,
    clock,
    content,
    design,
    preview: delivery.preview,
    siteLanguage: () => settings().language,
  });
  bus.on<ReviewEvent>(
    'review.change_set_ready',
    (event) =>
      void ((texts, url) =>
        notify.send(
          message({
            topic: 'account',
            title: texts.title,
            text: texts.text(event),
            link: url ? { label: texts.link, url } : null,
          }),
          notify.settings.status().incidents,
          `review:${event.changeSetId}`
        ))(
        _READY[notify.language()],
        settings().siteUrl &&
          `${settings().siteUrl.replace(/\/$/, '')}${MANAGER_PATH}/proposals?set=${event.changeSetId}`
      )
  );
  const diagnostics = defineDiagnostics({
    bus,
    clock,
    facts: siteFacts({
      content,
      site,
      media,
      forms,
      notify,
      design,
      redirects,
    }),
  });

  void (
    options.scaffold &&
    content.isEmpty() &&
    applyScaffold(options.scaffold, {
      content,
      design,
      site,
      forms,
      media,
      extensions,
    })
  );

  const upkeep = defineUpkeep({
    db,
    path: options.databasePath ?? ':memory:',
    without: _SERVER_ONLY,
    clock,
    report,
    version: VERSION,
    repository: REPOSITORY,
    releasesUrl: options.releasesUrl,
    updateCheck: options.updateCheck ?? process.env.CMS_NO_UPDATE_CHECK !== '1',
    tidy: media.cache.sweep,
  });
  serverChecks({
    upkeep,
    https: certificates.status,
    site,
    persistent: options.databasePath !== undefined,
  }).forEach((_) => void diagnostics.register(_));

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
    kit: () =>
      kitFor(settings().language).map((_) => ({
        ..._,
        translations: [KIT, KIT_ENGLISH, KIT_GERMAN].map(
          (kit) => kit.find((entry) => entry.name === _.name)!.source
        ),
      })),
    report,
    notify,
    forms,
    pageCache: delivery.cache,
    upkeep,
    https: certificates.status,
    redirects,
    diagnostics,
    stats,
    review,
    version: VERSION,
    db,
  });

  // Почтовый шлюз — перед сайтом: его адрес перекрывает страницу и переадресацию с тем же адресом.
  // Служебные адреса выше ему недоступны — их не пропускает parseGatewayPath.
  const serve = (
    request: Request,
    client: string,
    server?: ClientSource
  ): Promise<Response> => {
    const path = new URL(request.url).pathname;
    return _isManager(path)
      ? manager.handle(request, client)
      : path === GOAL_PATH
        ? stats.handle(request, client)
        : path.startsWith(FORMS_PREFIX)
          ? forms.handle(request, client)
          : path === SEARCH_PATH
            ? Promise.resolve(searchHandler.handle(request, client))
            : path.startsWith(PREVIEW_PREFIX)
              ? review.preview.handle(request, client)
              : path.startsWith(`${ASSETS_PREFIX}/`)
                ? design.assets(request)
                : path.startsWith(MEDIA_PREFIX)
                  ? Promise.resolve(media.handle(request))
                  : notify.gateway.claims(path)
                    ? (server?.timeout?.(request, _GATEWAY_SECONDS),
                      notify.gateway.handle(request, client))
                    : delivery.handle(request, client);
  };

  return {
    fetch: (request, server) =>
      Promise.resolve()
        .then(content.schedule.runDue)
        .then(undefined, scheduleFailed)
        .then(() =>
          serve(request, server?.requestIP(request)?.address ?? '', server)
        ),
    content,
    design,
    site,
    identity,
    extensions,
    media,
    assistant,
    notify,
    forms,
    upkeep,
    search,
    certificates,
    redirects,
    stats,
    review,
    diagnostics,
    mcp: manager.mcp,
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

/**
 * Файл базы — сайт этой или более старой версии: целостность, журнал миграций, схема доводится до текущей
 * прямо в нём. Чужая база SQLite и база более новой версии — отказ (`backup.foreign`, `backup.newer`).
 */
export var prepareSite = (path: string): void =>
  prepareDatabase(path, _MIGRATIONS);

/** Корень композиции: единственное место, которое знает все контексты. */
export var createApp = (options: AppOptions = {}): App => {
  const db = openDatabase(options.databasePath ?? ':memory:');
  // База из более новой версии — отказ, и файл не остаётся открытым.
  attempt(
    () => migrate(db, _MIGRATIONS),
    (error) => (db.close(), rethrow(error))
  );

  // Копия текущего сайта сохраняется рядом с базой, затем записи заменяются, контексты собираются
  // заново; сеанс того, кто восстанавливал, остаётся, если в копии он тот же человек.
  const restoreFrom = (
    source: string,
    prepared: Promise<unknown>
  ): Promise<RestoreReport> =>
    prepared
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
        // Прибавки статистики до этой минуты — в прежние сводки: восстановление заменит их сводками копии.
        statsRecorder.flush();
        restoreDatabase(db, source, _DERIVED);
        clearSearchIndex(db);
        // В восстановленной базе другие файлы: прежний кэш не нужен, он наберётся заново.
        parts.media.cache.clear();
        recompose();
        parts.identity.sessions.closeChanged(before);
        return { pages: parts.content.drafts.tree().length, savedTo };
      })
      .finally(() =>
        Bun.file(source)
          .delete()
          .then(undefined, () => undefined)
      );

  const restore = (bytes: Uint8Array): Promise<RestoreReport> =>
    ((source) =>
      restoreFrom(
        source,
        isSqlite(bytes)
          ? Bun.write(source, bytes).then(() =>
              prepareDatabase(source, _MIGRATIONS)
            )
          : Promise.resolve(bytes).then((_) =>
              databaseFromArchive(_parseArchive(_), source, _MIGRATIONS)
            )
      ))(tempPath());

  const restoreFile = (path: string): Promise<RestoreReport> =>
    restoreFrom(
      path,
      Promise.resolve(path).then((_) => prepareDatabase(_, _MIGRATIONS))
    );

  const backup: Backup = {
    database: () => snapshot(db, _SERVER_ONLY),
    archive: () => exportArchive(db, _DERIVED),
    restore,
    restoreFile,
  };

  // Кэш медиатеки — один на процесс: пересборка контекстов не теряет его состояние.
  const mediaCache = defineMediaCache({
    dir:
      options.mediaCache ?? mediaCacheDir(options.databasePath ?? ':memory:'),
  });
  // Счётчик статистики — тоже один на процесс: соль дня и буфер не теряются при пересборке.
  const statsRecorder = defineStatsRecorder({
    db,
    clock: options.clock ?? (() => new Date()),
  });
  const stopStats = options.background
    ? statsRecorder.start()
    : statsRecorder.flush;
  // Нарезка картинок — тоже одна на процесс: два декодирования сразу не уместились бы в память VPS.
  const resize = defineImageResizer();
  let parts = _compose(db, options, backup, mediaCache, statsRecorder, resize);
  // Фон — у собранных заново контекстов: восстановление копии останавливает прежний и запускает новый.
  const startBackground = (): (() => void) =>
    options.background
      ? ((notify, forms, upkeep, media, warm) => () => (
          notify(), forms(), upkeep(), media(), clearTimeout(warm)
        ))(
          parts.notify.start(),
          parts.forms.start(),
          parts.upkeep.start(),
          parts.media.start(),
          // Индекс поиска строится вскоре после запуска, а не на первом поиске посетителя.
          setTimeout(
            () =>
              void attempt(parts.search.warm, (error) => console.error(error)),
            1000
          )
        )
      : () => undefined;
  let stopBackground = startBackground();

  const recompose = (): void => {
    stopBackground();
    parts = _compose(
      db,
      { ...options, scaffold: undefined },
      backup,
      mediaCache,
      statsRecorder,
      resize,
      parts.identity.setup.token()
    );
    stopBackground = startBackground();
    seen = version();
  };

  // В ту же базу пишет другой процесс (cms elements push, cms mcp): SQLite меняет data_version, и
  // контексты собираются заново — иначе виды, плагины и кэш страниц остались бы прежними.
  const dataVersion = db.query<{ data_version: number }, []>(
    'PRAGMA data_version'
  );
  const version = (): number => dataVersion.get()!.data_version;
  let seen = version();
  const follow = (): void =>
    void (
      options.databasePath !== undefined &&
      version() !== seen &&
      recompose()
    );

  // Проверка здоровья — мимо всего остального: без расписания публикаций, сборки контекстов и прокси.
  const health = defineHealth({
    db,
    version: VERSION,
    proxied: options.trustProxy === true,
  });

  return {
    // Запрос без Host (сканеры по HTTP/1.0) — 400 до разбора адреса: см. platform/request-url.ts.
    fetch: withAbsoluteUrl((request, server) =>
      isHealthRequest(request.url)
        ? Promise.resolve(
            health(request, server?.requestIP(request)?.address ?? '')
          )
        : (follow(),
          options.trustProxy
            ? parts.fetch(_forwarded(request), {
                requestIP: () => ({
                  address: _forwardedClient(
                    request,
                    server?.requestIP(request)?.address ?? ''
                  ),
                }),
                // Срок ставится исходному запросу: переписанный по X-Forwarded-* Bun не знает.
                timeout: (_request, seconds) =>
                  server?.timeout?.(request, seconds),
              })
            : parts.fetch(request, server))
    ),
    follow,
    mcp: (message, user, session) => (
      follow(), parts.mcp(message, user, session)
    ),
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
    get upkeep() {
      return parts.upkeep;
    },
    get search() {
      return parts.search;
    },
    get certificates() {
      return parts.certificates;
    },
    get redirects() {
      return parts.redirects;
    },
    get stats() {
      return parts.stats;
    },
    get review() {
      return parts.review;
    },
    get diagnostics() {
      return parts.diagnostics;
    },
    backup: (target) => backupDatabase(db, target, _SERVER_ONLY),
    archive: backup.archive,
    restore,
    restoreFile,
    serverSettings: {
      read: () =>
        readServerSettings(
          parts,
          VERSION,
          (options.clock ?? (() => new Date()))()
        ),
      apply: (settings) =>
        ((report) => (recompose(), report))(
          db.transaction(() => applyServerSettings(parts, settings))()
        ),
    },
    transaction: (run) => db.transaction(run)(),
    close: () => (stopBackground(), stopStats(), db.close()),
  };
};

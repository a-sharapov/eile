import type { Archive } from '../../../platform/archive.ts';
import {
  attempt,
  domainError,
  fail,
  isDomainError,
  type SourcePoint,
} from '../../../shared/kernel/errors.ts';
import {
  type ManagerLanguage,
  managerLanguageOf,
  textIn,
} from '../../../shared/kernel/manager-language.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import {
  errorDetail,
  errorKey,
  type Report,
} from '../../../shared/kernel/report.ts';
import { type AssistantService, isCode } from '../../assistant/index.ts';
import type { HttpsStatus } from '../../certificates/index.ts';
import type {
  Author,
  ContentService,
  CreatePageInput,
  Field,
  FieldValue,
  FieldValues,
  NewField,
  Page,
  PageChanges,
  PageView,
} from '../../content/index.ts';
import type { PageCacheStats } from '../../delivery/index.ts';
import type { DesignService } from '../../design/index.ts';
import type { DiagnosticsReport } from '../../diagnostics/index.ts';
import type { ExtensionsService } from '../../extensions/index.ts';
import type {
  FormsService,
  Submission,
  SubmissionStatus,
} from '../../forms/index.ts';
import {
  can,
  type IdentityService,
  type Login,
  type Permission,
  type UserView,
} from '../../identity/index.ts';
import type { MediaService } from '../../media/index.ts';
import {
  type ChannelKind,
  message,
  type NotifyService,
} from '../../notify/index.ts';
import type { RedirectsService } from '../../redirects/index.ts';
import type { SiteService, SiteSettings } from '../../site/index.ts';
import type { UpkeepService } from '../../upkeep/index.ts';
import type { ActivityLog, PageAction } from '../domain/activity.ts';
import {
  type AppearanceRepository,
  DEFAULT_APPEARANCE,
  parseAppearance,
} from '../domain/appearance.ts';
import { inertType, isHtmlType } from '../domain/content-policy.ts';
import { sanitizeHtml } from '../infrastructure/html-sanitizer.ts';

/** Копия сайта: снимок базы, записи текстом и восстановление — их даёт корень приложения. */
export type SiteBackup = {
  readonly database: () => Promise<Uint8Array>;
  readonly archive: () => Archive;
  readonly restore: (bytes: Uint8Array) => Promise<{
    readonly pages: number;
    readonly savedTo: string | null;
  }>;
};

export type ManagerServices = {
  readonly content: ContentService;
  readonly design: DesignService;
  readonly site: SiteService;
  readonly identity: IdentityService;
  readonly extensions: ExtensionsService;
  readonly media: MediaService;
  readonly preview: (
    page: PageView
  ) => Promise<{ body: string; contentType: string }>;
  readonly backup: SiteBackup;
  readonly assistant: AssistantService;
  /** Набор компонентов из бинарника на языке сайта; зависимости — раньше зависящих. */
  readonly kit: () => readonly KitComponent[];
  /** Сообщить о сбое владельцу сайта. */
  readonly report: Report;
  /** Версия программы: менеджер показывает её в меню профиля. */
  readonly version: string;
  readonly notify: NotifyService;
  readonly forms: FormsService;
  /** Кэш страниц сайта: сводка и ручной сброс. */
  readonly pageCache: {
    readonly stats: () => PageCacheStats;
    readonly clear: () => PageCacheStats;
  };
  /** Автокопии по расписанию и проверка обновлений. */
  readonly upkeep: Pick<UpkeepService, 'backups' | 'updates'>;
  /** Сертификат HTTPS, если его выпускает сам сервер; null — HTTPS не его забота. */
  readonly https: () => HttpsStatus | null;
  /** Правила переадресации сайта. */
  readonly redirects: RedirectsService;
  /** Диагностика сайта на языке менеджера; `again` — посчитать заново. */
  readonly diagnostics: {
    readonly report: (
      again: boolean,
      language: ManagerLanguage
    ) => DiagnosticsReport;
  };
};

/** Компонент набора: ставится в элементы сайта вместе с тем, что ему нужно. */
export type KitComponent = {
  readonly name: string;
  readonly source: string;
  readonly requires: readonly string[];
  /** Тот же компонент на других языках набора: после смены языка сайта он не «изменён». */
  readonly translations?: readonly string[];
};

/** missing — не установлен, installed — как в наборе, changed — исходник на сайте другой. */
type KitState = 'missing' | 'installed' | 'changed';

type ApiServices = ManagerServices & {
  readonly appearance: AppearanceRepository;
  readonly activity: ActivityLog;
};

type Context = {
  readonly request: Request;
  /** Адрес посетителя: по нему считаются неудачные входы. */
  readonly client: string;
  readonly params: Readonly<Record<string, string>>;
  readonly user: UserView | null;
  readonly body: () => Promise<any>;
};

type Handler = (context: Context) => Response | Promise<Response>;

/** public — без входа; user — любой вошедший; иначе нужно право роли. */
type Access = 'public' | 'user' | Permission;

type Route = readonly [method: string, pattern: string, Access, Handler];

export var SESSION_COOKIE = 'cms_session';

// По HTTPS cookie — с префиксом __Host-: браузер примет её только с Secure, без Domain и с Path=/,
// поэтому соседний поддомен не подложит свою.
const _cookieName = (request: Request): string =>
  new URL(request.url).protocol === 'https:'
    ? `__Host-${SESSION_COOKIE}`
    : SESSION_COOKIE;

const _SESSION_SECONDS = 30 * 24 * 60 * 60;
const _UNSAFE = ['POST', 'PUT', 'PATCH', 'DELETE'];

// Код DomainError → HTTP-статус по второй части кода (`identity.too_many_attempts`).
const _STATUS: Readonly<Record<string, number>> = {
  invalid_credentials: 401,
  // Ссылка сброса пароля устарела или использована; сброс по почте не настроен.
  reset_invalid: 410,
  reset_unavailable: 409,
  too_many_requests: 429,
  element_in_use: 409,
  element_exists: 409,
  plugin_exists: 409,
  field_exists: 409,
  kit_changed: 409,
  form_exists: 409,
  rule_exists: 409,
  loop: 409,
  chain: 409,
  no_deliveries: 409,
  kit_not_found: 404,
  // Уведомления: канал не настроен — конфликт с настройками; канал отказал при проверке — шлюз.
  not_configured: 409,
  no_chats: 409,
  test_failed: 502,
  setup_closed: 403,
  type_not_allowed: 403,
  busy: 429,
  unavailable: 502,
  own_password: 403,
  bad_path: 400,
  too_large: 413,
  invalid_form: 400,
  too_many_attempts: 429,
  // ИИ: не подключён — конфликт с настройками; сбой, недоступность и таймаут — ошибка шлюза.
  not_connected: 409,
  failed: 502,
  unreachable: 502,
  empty: 502,
  timeout: 504,
  // Обслуживание: копия уже делается — конфликт; страница релизов не ответила — шлюз.
  backup_running: 409,
  releases_unavailable: 502,
  _: 422,
};

const _KB = 1024;
const _MB = 1024 * _KB;

// Потолок тела запроса. Без входа — крохи (вход, первичная настройка), JSON — 2 МБ; файл медиатеки и
// копия сайта — свои потолки, и только тем, кому этот маршрут разрешён.
const _BODY_LIMIT: Readonly<Record<string, number>> = {
  'POST /media': 32 * _MB,
  'POST /backup': 2048 * _MB,
};

const _limitOf = (route: Route): number =>
  _BODY_LIMIT[`${route[0]} ${route[1]}`] ??
  (route[2] === 'public' ? 64 * _KB : 2 * _MB);

const _tooLarge = (limit: number) =>
  domainError('manager.too_large', `Request body is over ${limit} bytes`);

// Счётчик байтов в потоке: ни ложный Content-Length, ни chunked не протащат больше потолка.
const _counting = (limit: number): TransformStream<Uint8Array, Uint8Array> => {
  let size = 0;
  return new TransformStream({
    transform: (chunk, controller) =>
      (size += chunk.byteLength) > limit
        ? controller.error(_tooLarge(limit))
        : controller.enqueue(chunk),
  });
};

/** Тело запроса в памяти — не больше потолка маршрута; читается после проверки прав. */
const _buffered = (request: Request, limit: number): Promise<Request> =>
  Number(request.headers.get('content-length') ?? 0) > limit
    ? Promise.reject(_tooLarge(limit))
    : request.body === null
      ? Promise.resolve(request)
      : new Response(request.body.pipeThrough(_counting(limit)))
          .arrayBuffer()
          .then(
            (body) =>
              new Request(request.url, {
                method: request.method,
                headers: request.headers,
                body,
              })
          );

// Ответы API — личные данные: ни прокси, ни браузер их не хранят.
const _API_HEADERS = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

const _json = (status: number, body: unknown, headers = {}): Response =>
  Response.json(body, { status, headers: { ..._API_HEADERS, ...headers } });

const _error = (
  status: number,
  code: string,
  message: string,
  at?: SourcePoint
) => _json(status, { error: { code, message, at } });

const _statusOf = (code: string): number =>
  code.endsWith('_not_found')
    ? 404
    : (_STATUS[code.slice(code.indexOf('.') + 1)] ?? _STATUS._!);

// Неожиданная ошибка — 500 и сообщение о сбое; перебор пароля — тоже повод знать владельцу.
const _failure =
  (report: Report, request: Request, client: string) =>
  (error: unknown): Response =>
    isDomainError(error)
      ? (void (
          error.code === 'identity.too_many_attempts' &&
          report({
            kind: 'identity.login_throttled',
            severity: 'warning',
            title: {
              en: 'Password guessing on the manager',
              de: 'Passwort-Rateversuche am Manager',
              ru: 'Перебор пароля к менеджеру',
            },
            detail: {
              en: `Too many failed sign-ins${client ? ` from ${client}` : ''}.`,
              de: `Zu viele fehlgeschlagene Anmeldungen${client ? ` von ${client}` : ''}.`,
              ru: `Слишком много неудачных входов${client ? ` с адреса ${client}` : ''}.`,
            },
          })
        ),
        _error(_statusOf(error.code), error.code, error.message, error.at))
      : (console.error(error),
        report({
          kind: 'manager.error',
          severity: 'error',
          title: ((route) => ({
            en: `Manager: error on ${route}`,
            de: `Manager: Fehler bei ${route}`,
            ru: `Менеджер: ошибка на ${route}`,
          }))(`${request.method} ${new URL(request.url).pathname}`),
          detail: errorDetail(error),
          key: errorKey('manager.error', error),
        }),
        _error(500, 'manager.internal', 'Internal Server Error'));

const _cookie = (request: Request, token: string, maxAge: number): string =>
  [
    `${_cookieName(request)}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    ...(new URL(request.url).protocol === 'https:' ? ['Secure'] : []),
  ].join('; ');

const _signedIn = (request: Request) => (login: Login) =>
  _json(
    200,
    { user: login.user },
    { 'set-cookie': _cookie(request, login.token, _SESSION_SECONDS) }
  );

export var sessionToken = (request: Request): string | null =>
  (request.headers.get('cookie') ?? '')
    .split(';')
    .map((_) => _.trim())
    .find((_) => _.startsWith(`${_cookieName(request)}=`))
    ?.slice(_cookieName(request).length + 1) ?? null;

// Битая %-последовательность в пути — ошибка запроса, а не сбой сервера.
const _decoded = (part: string): string =>
  attempt(
    () => decodeURIComponent(part),
    () => fail('manager.bad_path', 'Malformed percent-encoding in the path')
  );

const _match = (
  pattern: string,
  path: string
): Readonly<Record<string, string>> | null => {
  const expected = pattern.split('/');
  const actual = path.split('/');
  const rest = expected.at(-1)?.startsWith('*') ?? false;
  return (
    rest
      ? actual.length < expected.length
      : expected.length !== actual.length
  )
    ? null
    : expected.reduce<Record<string, string> | null>(
        (params, part, index) =>
          params === null
            ? null
            : part.startsWith('*')
              ? {
                  ...params,
                  [part.slice(1)]: actual.slice(index).map(_decoded).join('/'),
                }
              : part.startsWith(':')
                ? {
                    ...params,
                    [part.slice(1)]: _decoded(actual[index]!),
                  }
                : part === actual[index]
                  ? params
                  : null,
        {}
      );
};

const _ELEMENT_KINDS = {
  template: 'templates',
  component: 'components',
} as const;

const _PAGE_ACTIONS = {
  publish: 'publish',
  unpublish: 'unpublish',
  trash: 'trash',
  restore: 'restore',
} as const;

const _LOGGED_ACTIONS: Readonly<Record<string, PageAction>> = {
  publish: 'published',
  unpublish: 'unpublished',
  trash: 'trashed',
  restore: 'restored',
};

const _ACTIVITY_LIMIT = 100;

// Описание компонента набора — его первый комментарий, без метки `@component`.
const _kitDescription = (source: string): string =>
  (/^\s*<!--([\s\S]*?)-->/.exec(source)?.[1] ?? '')
    .replace('@component', '')
    .replace(/\s+/g, ' ')
    .trim();

const _routes = ({
  content,
  design,
  site,
  identity,
  extensions,
  media,
  preview,
  appearance,
  activity,
  backup,
  assistant,
  kit,
  notify,
  forms,
  pageCache,
  report,
  upkeep,
  https,
  redirects,
  diagnostics,
  version,
}: ApiServices): readonly Route[] => {
  const searchOf = (request: Request) => new URL(request.url).searchParams;
  // Сброс пароля по почте — когда почта настроена и задан адрес сайта: ссылка в письме строится от него.
  const resetReady = (): boolean =>
    notify.email.ready() && _originOf(site.settings.get().siteUrl) !== null;
  // Менеджер ставит свой язык первым в Accept-Language: на нём сервер и собирает тексты для него.
  const languageOf = (request: Request): ManagerLanguage =>
    managerLanguageOf(request.headers.get('accept-language'));

  // Фильтры списка заявок из адреса: форма, статус, непрочитанные, поиск, «раньше этой».
  const inboxQuery = (request: Request, limit: number) =>
    ((params) => ({
      form: params.get('form') || undefined,
      status: (params.get('status') || undefined) as
        | SubmissionStatus
        | undefined,
      unread: params.get('unread') === '1',
      text: params.get('q')?.trim() || undefined,
      before: Number(params.get('before')) || undefined,
      limit,
    }))(searchOf(request));

  // Строка списка: превью — первые непустые значения, без снимка целиком.
  const rowOf = (submission: Submission) => ({
    id: submission.id,
    form: submission.form,
    formTitle: submission.formTitle,
    status: submission.status,
    read: submission.readAt !== null,
    createdAt: submission.createdAt,
    preview: submission.values
      .filter((_) => _.kind !== 'hidden' && _.value)
      .slice(0, 3)
      .map((_) => _.value)
      .join(' · ')
      .slice(0, 200),
  });

  // Значение посетителя, которое начинается с = + - @ или табуляции, Excel счёл бы формулой: перед ним
  // апостроф, и ячейка остаётся текстом.
  const _cell = (raw: string): string =>
    ((value) =>
      /[";\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value)(
      /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
    );

  // CSV для Excel: точка с запятой, BOM — кириллица открывается сразу.
  const csvOf = (
    items: readonly Submission[],
    language: ManagerLanguage
  ): string =>
    ((labels, head) =>
      `\uFEFF${[
        [...head.slice(0, 4), ...labels, ...head.slice(4)],
        ...items.map((item) => [
          String(item.id),
          item.createdAt,
          item.formTitle,
          item.status,
          ...labels.map(
            (label) => item.values.find((_) => _.label === label)?.value ?? ''
          ),
          item.context.url,
          new URLSearchParams(item.context.utm).toString(),
          item.ip,
        ]),
      ]
        .map((row) => row.map(_cell).join(';'))
        .join('\r\n')}\r\n`)(
      [...new Set(items.flatMap((_) => _.values.map((value) => value.label)))],
      _CSV_HEAD[language]
    );

  const kitState = (entry: KitComponent): KitState =>
    ((element) =>
      element === null
        ? 'missing'
        : [entry.source, ...(entry.translations ?? [])].includes(element.source)
          ? 'installed'
          : 'changed')(design.elements.get('component', entry.name));

  // Компонент и то, без чего он не работает; зависимости — первыми, каждая один раз.
  const kitClosure = (name: string): KitComponent[] =>
    ((entry) =>
      entry
        ? [
            ...new Map(
              [...entry.requires.flatMap(kitClosure), entry].map((_) => [
                _.name,
                _,
              ])
            ).values(),
          ]
        : fail('manager.kit_not_found', `No kit component "${name}"`))(
      kit().find((_) => _.name === name)
    );

  // Свой исходник на сайте заменяется только по явной просьбе; зависимости, что уже есть, не трогаем.
  const installKit = (name: string, replace: boolean): string[] =>
    ((closure) => {
      const target = closure.at(-1)!;
      const conflict = kitState(target) === 'changed' && !replace;
      const steps = closure.filter(
        (_) =>
          kitState(_) === 'missing' ||
          (_ === target && kitState(_) === 'changed')
      );
      return conflict
        ? fail(
            'manager.kit_changed',
            `Component "${name}" was changed on the site`
          )
        : (steps.forEach((_) => void design.components.save(_.name, _.source)),
          steps.map((_) => _.name));
    })(kitClosure(name));

  // Имя файла копии: название сайта и момент — «Мой сайт 2026-10-30 1205.db»; латиницей — запасное.
  const backupFile = (extension: string): string =>
    ((stamp) =>
      `attachment; filename="site-${stamp.replace(' ', '-')}.${extension}"; filename*=UTF-8''${encodeURIComponent(
        `${site.settings.get().name || 'site'} ${stamp}.${extension}`
      )}`)(
      new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '')
    );

  const richFields = (): ReadonlySet<string> =>
    new Set(
      content.fields
        .list()
        .filter((_) => _.type === 'richtext')
        .map((_) => _.name)
    );

  const cleanFields = (values: FieldValues): FieldValues =>
    ((rich) =>
      Object.fromEntries(
        Object.entries(values).map(({ 0: name, 1: value }) => [
          name,
          rich.has(name) && typeof value === 'string'
            ? sanitizeHtml(value)
            : value,
        ])
      ))(richFields());

  // Без права на код (domain/content-policy.ts): HTML страницы, анонса и полей чистится, а типы, которые
  // браузер исполняет, не выбрать и не править. Сменил тип на HTML — чистится и прежний текст страницы.
  const guardPage = <T extends PageChanges & { fields?: FieldValues }>(
    user: UserView,
    current: { contentType: string; content: string } | null,
    input: T
  ): T =>
    can(user.role, 'design.edit')
      ? input
      : ((type) =>
          !inertType(type) &&
          (input.contentType !== undefined || input.content !== undefined)
            ? fail(
                'manager.type_not_allowed',
                `Content type ${type} needs the design permission`
              )
            : {
                ...input,
                ...(typeof input.introText === 'string' && {
                  introText: sanitizeHtml(input.introText),
                }),
                ...(isHtmlType(type) &&
                  (typeof input.content === 'string' ||
                    (current !== null && !isHtmlType(current.contentType))) && {
                    content: sanitizeHtml(
                      String(input.content ?? current?.content ?? '')
                    ),
                  }),
                ...(input.fields && { fields: cleanFields(input.fields) }),
              })(
          String(input.contentType ?? current?.contentType ?? 'text/html')
        );

  // Генерация тратит ключ владельца: у каждого не больше двух запросов разом и 120 в час.
  const generating = new Map<number, { running: number; recent: number[] }>();
  const _HOUR = 3_600_000;

  const withQuota = <T>(userId: number, run: () => Promise<T>): Promise<T> => {
    const now = Date.now();
    const slot = generating.get(userId) ?? { running: 0, recent: [] };
    const recent = slot.recent.filter((_) => now - _ < _HOUR);
    return slot.running >= 2 || recent.length >= 120
      ? Promise.reject(
          domainError('assistant.busy', 'Too many AI requests, wait a little')
        )
      : (generating.set(userId, {
          running: slot.running + 1,
          recent: [...recent, now],
        }),
        run().finally(
          () =>
            void ((current) =>
              current &&
              generating.set(userId, {
                ...current,
                running: current.running - 1,
              }))(generating.get(userId))
        ));
  };

  // Подробность сбоя ИИ (ответ стороннего сервиса) видит администратор в «Проверить»; остальным — общее.
  const _AI_FAILURES = [
    'assistant.failed',
    'assistant.unreachable',
    'assistant.empty',
  ];

  const aiFailure =
    (user: UserView) =>
    (error: unknown): never => {
      throw !can(user.role, 'site.edit') &&
        isDomainError(error) &&
        _AI_FAILURES.includes(error.code)
        ? (console.error(error),
          domainError('assistant.unavailable', 'The AI service failed'))
        : error;
    };

  // Удачная правка страницы попадает в журнал «Обзора». id новой страницы или копии — из ответа.
  const logged =
    (action: (context: Context) => PageAction | undefined, handler: Handler) =>
    (context: Context): Promise<Response> =>
      Promise.resolve(context)
        .then(handler)
        .then((response) =>
          ((done) =>
            done
              ? (response.status === 201
                  ? response
                      .clone()
                      .json()
                      .then((_) => (_ as { id: number }).id)
                  : Promise.resolve(Number(context.params.id))
                ).then(
                  (pageId) => (
                    activity.record({
                      pageId,
                      action: done,
                      userId: context.user!.id,
                      userName: context.user!.name,
                      at: new Date().toISOString(),
                    }),
                    response
                  )
                )
              : response)(response.ok ? action(context) : undefined)
        );

  const appearanceOf = (userId: number) =>
    appearance.get(userId) ?? DEFAULT_APPEARANCE;

  // Автор правки для истории страницы: имя — на момент правки, как в журнале.
  const authorOf = (user: UserView): Author => ({
    id: user.id,
    name: user.name,
  });

  const fieldsOf = (template: string) =>
    content.fields.list().filter((_) => _.templates.includes(template));

  // Наследуемое поле без своего значения берёт его у ближайшего предка, у которого оно задано.
  const ancestorValue = (
    id: number | null,
    name: string
  ): { value: FieldValue; from: { id: number; title: string } } | null =>
    id === null
      ? null
      : ((parent: Page) =>
          parent.fields[name] === undefined
            ? ancestorValue(parent.parentId, name)
            : {
                value: parent.fields[name]!,
                from: { id: parent.id, title: parent.title },
              })(content.drafts.page(id));

  // Что подставится в пустое наследуемое поле — редактор видит значение и раздел, откуда оно.
  const inheritedOf = (page: Page, fields: readonly Field[]) =>
    Object.fromEntries(
      fields
        .filter((_) => _.inherit && page.fields[_.name] === undefined)
        .map((_) => [_.name, ancestorValue(page.parentId, _.name)] as const)
        .filter((_) => _[1] !== null)
    );

  const pageDetails = (id: number) => {
    const page = content.drafts.page(id);
    const fields = fieldsOf(page.template);
    return {
      page,
      view: content.drafts.view(id),
      fields,
      inherited: inheritedOf(page, fields),
      oldPaths: content.pages.oldPaths(id),
      translations: content.drafts.translations(id),
    };
  };

  const elementSet = (kind: string) =>
    design[_ELEMENT_KINDS[kind as keyof typeof _ELEMENT_KINDS]] ?? null;

  // If-None-Match: * — «только создать»: новый элемент с занятым именем не затрёт существующий.
  const createOnly = (request: Request): boolean =>
    request.headers.get('if-none-match') === '*';

  const refuseExisting = (
    request: Request,
    exists: boolean,
    code: string,
    name: string
  ): void =>
    void (
      createOnly(request) &&
      exists &&
      fail(code, `"${name}" already exists`)
    );

  // Где элемент используется: страницы (шаблон или тег в тексте) и элементы, которые его импортируют.
  const elementUsage = (kind: 'template' | 'component', name: string) => ({
    pages:
      kind === 'template'
        ? content.usage.template(name)
        : content.usage.component(name),
    elements: kind === 'component' ? design.elements.importers(name) : [],
  });

  return [
    [
      'GET',
      '/session',
      'public',
      ({ user }) =>
        _json(200, {
          user,
          setup: identity.setup.token() !== null,
          appearance: user ? appearanceOf(user.id) : null,
          // Подключён ли ИИ: у полей появляется «Сгенерировать с ИИ». Адрес и ключ — только в настройках.
          ai: user !== null && assistant.connection.status().connected,
          // Название сайта видно и до входа: экран входа говорит, куда входишь (оно и так на сайте).
          site: ((settings) => ({
            name: settings.name,
            url: settings.siteUrl,
          }))(site.settings.get()),
          version,
          // «Забыли пароль?» — только когда письмо есть чем отправить.
          passwordReset: resetReady(),
          // Новая версия программы — только тем, кто ведёт сайт: им её и ставить.
          update:
            user && can(user.role, 'site.edit')
              ? upkeep.updates.latest()
              : null,
        }),
    ],
    [
      'POST',
      '/session',
      'public',
      ({ request, body, client }) =>
        body()
          .then((_) =>
            identity.login(
              String(_.email ?? ''),
              String(_.password ?? ''),
              client
            )
          )
          .then(_signedIn(request)),
    ],
    [
      'PUT',
      '/session/password',
      'user',
      ({ request, body, user, client }) =>
        body()
          .then((_) =>
            identity.account.changePassword(
              user!.id,
              String(_.current ?? ''),
              String(_.password ?? ''),
              client
            )
          )
          .then(_signedIn(request)),
    ],
    [
      'DELETE',
      '/session',
      'public',
      ({ request }) => {
        const token = sessionToken(request);
        void (token && identity.logout(token));
        return _json(
          200,
          { user: null },
          { 'set-cookie': _cookie(request, '', 0) }
        );
      },
    ],
    // Сброс пароля: ответ одинаковый, есть такая почта или нет; письмо уходит в фоне, чтобы и время
    // ответа ничего не выдавало. Ссылка — только в письме: ни в очереди, ни в журнале её нет.
    [
      'POST',
      '/password/forgot',
      'public',
      ({ request, body, client }) =>
        body().then((_) =>
          resetReady()
            ? ((link) => (
                void (
                  link &&
                  notify.email
                    .send(
                      link.user.email,
                      _resetLetter(
                        languageOf(request),
                        link.user.name,
                        _managerLink(
                          request,
                          _originOf(site.settings.get().siteUrl)!,
                          `reset?token=${link.token}`
                        )
                      )
                    )
                    .then(undefined, (error) =>
                      report({
                        kind: 'identity.reset_mail_failed',
                        severity: 'warning',
                        title: {
                          en: 'The password reset email was not sent',
                          de: 'Die E-Mail zum Zurücksetzen des Passworts wurde nicht gesendet',
                          ru: 'Не ушло письмо для сброса пароля',
                        },
                        detail: errorDetail(error),
                        key: errorKey('identity.reset_mail_failed', error),
                      })
                    )
                ),
                _json(202, {})
              ))(identity.recovery.request(String(_.email ?? ''), client))
            : fail(
                'manager.reset_unavailable',
                'Password reset by email is not configured'
              )
        ),
    ],
    [
      'POST',
      '/password/check',
      'public',
      ({ body }) =>
        body().then((_) =>
          _json(200, { valid: identity.recovery.check(String(_.token ?? '')) })
        ),
    ],
    [
      'POST',
      '/password/reset',
      'public',
      ({ body }) =>
        body()
          .then((_) =>
            identity.recovery.reset(
              String(_.token ?? ''),
              String(_.password ?? '')
            )
          )
          // Почта — тому, у кого ссылка из её же ящика: вход откроется с ней.
          .then((user) => _json(200, { email: user.email })),
    ],
    [
      'POST',
      '/setup',
      'public',
      ({ request, body }) =>
        body()
          .then((_) =>
            identity.setup.complete(String(_.token ?? ''), {
              email: String(_.email ?? ''),
              name: _.name,
              password: String(_.password ?? ''),
            })
          )
          .then(_signedIn(request)),
    ],
    [
      'PUT',
      '/appearance',
      'user',
      ({ user, body }) =>
        body().then((_) => {
          // Что не прислали — остаётся прежним: язык меняется из меню, не трогая цвета.
          const next = parseAppearance({
            ...appearanceOf(user!.id),
            ...(_ ?? {}),
          });
          appearance.save(user!.id, next);
          return _json(200, next);
        }),
    ],
    [
      'GET',
      '/pages',
      'content.edit',
      // Язык узла — уже с языком сайта: по нему менеджер собирает адрес из заголовка, как сервер.
      () =>
        ((language) =>
          _json(
            200,
            content.drafts
              .tree()
              .map((_) => ({ ..._, language: _.language || language }))
          ))(site.settings.get().language),
    ],
    [
      'GET',
      '/assistant',
      'site.edit',
      () => _json(200, assistant.connection.status()),
    ],
    [
      'PUT',
      '/assistant',
      'site.edit',
      ({ body }) =>
        body().then((_) => _json(200, assistant.connection.save(_ ?? {}))),
    ],
    [
      'DELETE',
      '/assistant',
      'site.edit',
      () => (assistant.connection.remove(), _json(200, {})),
    ],
    [
      'POST',
      '/assistant/test',
      'site.edit',
      () => assistant.connection.test().then((reply) => _json(200, { reply })),
    ],
    [
      'POST',
      '/assistant/generate',
      'content.edit',
      ({ user, body }) =>
        body().then(
          (_: { target?: Record<string, unknown>; request?: unknown }) =>
            // Код шаблонов, компонентов и плагинов генерирует тот, кому можно его править.
            isCode(assistant.target(_.target ?? {}).kind) &&
            !can(user!.role, 'design.edit')
              ? _error(403, 'identity.forbidden', 'Not allowed for your role')
              : withQuota(user!.id, () =>
                  assistant.generate(_.target ?? {}, _.request)
                )
                  .then((text) => _json(200, { text }))
                  .then(undefined, aiFailure(user!))
        ),
    ],
    [
      'GET',
      '/backup',
      'site.edit',
      ({ request }) =>
        new URL(request.url).searchParams.get('format') === 'json'
          ? new Response(JSON.stringify(backup.archive(), null, 2), {
              headers: {
                'content-type': 'application/json; charset=utf-8',
                'content-disposition': backupFile('json'),
                'cache-control': 'no-store',
              },
            })
          : backup.database().then(
              (bytes) =>
                new Response(bytes, {
                  headers: {
                    'content-type': 'application/vnd.sqlite3',
                    'content-disposition': backupFile('db'),
                    'cache-control': 'no-store',
                  },
                })
            ),
    ],
    [
      'POST',
      '/backup',
      'site.edit',
      ({ request }) =>
        request
          .arrayBuffer()
          .then((_) => backup.restore(new Uint8Array(_)))
          .then((_) => _json(200, _)),
    ],
    [
      'GET',
      '/activity',
      'content.edit',
      ({ request }) =>
        _json(
          200,
          activity.recent(
            Math.min(
              Number(new URL(request.url).searchParams.get('limit')) || 20,
              _ACTIVITY_LIMIT
            )
          )
        ),
    ],
    [
      'POST',
      '/pages',
      'content.edit',
      logged(
        () => 'created',
        ({ user, body }) =>
          body().then((_: CreatePageInput) =>
            _json(201, { id: content.pages.create(guardPage(user!, null, _)) })
          )
      ),
    ],
    [
      'GET',
      '/pages/:id',
      'content.edit',
      ({ params }) => _json(200, pageDetails(Number(params.id))),
    ],
    [
      'PATCH',
      '/pages/:id',
      'content.edit',
      logged(
        () => 'edited',
        ({ params, user, body }) =>
          body().then((_: PageChanges) =>
            _json(
              200,
              pageDetails(
                content.pages.edit(
                  Number(params.id),
                  guardPage(user!, content.drafts.page(Number(params.id)), _),
                  authorOf(user!)
                )
              )
            )
          )
      ),
    ],
    [
      'PUT',
      '/pages/:id/fields',
      'content.edit',
      logged(
        () => 'edited',
        ({ params, user, body }) =>
          body().then((_: FieldValues) =>
            _json(
              200,
              pageDetails(
                content.pages.setFields(
                  Number(params.id),
                  can(user!.role, 'design.edit') ? _ : cleanFields(_),
                  authorOf(user!)
                )
              )
            )
          )
      ),
    ],
    [
      'POST',
      '/pages/:id/move',
      'content.edit',
      logged(
        () => 'moved',
        ({ params, body }) =>
          body().then((_: { parentId: number | null }) =>
            _json(
              200,
              pageDetails(
                content.pages.move(Number(params.id), _.parentId ?? null)
              )
            )
          )
      ),
    ],
    [
      'GET',
      '/pages/:id/revisions',
      'content.edit',
      ({ params }) => _json(200, content.revisions.list(Number(params.id))),
    ],
    [
      'GET',
      '/pages/:id/revisions/:revision',
      'content.edit',
      ({ params }) =>
        _json(
          200,
          content.revisions.get(Number(params.id), Number(params.revision))
        ),
    ],
    [
      // Возврат — та же правка: у кого нет права на код, тому HTML версии чистится, как при сохранении.
      'POST',
      '/pages/:id/revisions/:revision/restore',
      'content.edit',
      logged(
        () => 'edited',
        ({ params, user }) =>
          _json(
            200,
            pageDetails(
              content.revisions.restore(
                Number(params.id),
                Number(params.revision),
                {
                  author: authorOf(user!),
                  prepare: (input) =>
                    (({ fields = {}, ...changes }) => ({ changes, fields }))(
                      guardPage(user!, content.drafts.page(Number(params.id)), {
                        ...input.changes,
                        fields: input.fields,
                      })
                    ),
                }
              )
            )
          )
      ),
    ],
    [
      'DELETE',
      '/pages/:id/old-paths',
      'content.edit',
      ({ params, body }) =>
        body().then((_: { path?: string }) =>
          content.pages.movedFrom(String(_.path ?? '')) === Number(params.id)
            ? (content.pages.forgetOldPath(String(_.path ?? '')),
              _json(200, pageDetails(Number(params.id))))
            : _error(
                404,
                'content.old_path_not_found',
                'This page has no such old path'
              )
        ),
    ],
    [
      'POST',
      '/pages/:id/duplicate',
      'content.edit',
      logged(
        () => 'duplicated',
        ({ params, body }) =>
          body().then((_: { title?: string } | null) =>
            _json(201, {
              id: content.pages.duplicate(Number(params.id), _?.title),
            })
          )
      ),
    ],
    [
      'POST',
      '/pages/:id/place',
      'content.edit',
      logged(
        () => 'moved',
        ({ params, body }) =>
          body().then((_: { parentId: number | null; index: number }) =>
            _json(
              200,
              pageDetails(
                content.pages.place(
                  Number(params.id),
                  _.parentId ?? null,
                  Number(_.index)
                )
              )
            )
          )
      ),
    ],
    [
      'POST',
      '/pages/:id/:action',
      'content.edit',
      logged(
        ({ params }) => _LOGGED_ACTIONS[params.action ?? ''],
        ({ params }) => {
          const action =
            _PAGE_ACTIONS[params.action as keyof typeof _PAGE_ACTIONS];
          return action
            ? _json(200, pageDetails(content.pages[action](Number(params.id))))
            : _error(
                404,
                'manager.not_found',
                `Unknown action "${params.action}"`
              );
        }
      ),
    ],
    [
      'GET',
      '/pages/:id/preview',
      'content.edit',
      ({ params }) => {
        const view = content.drafts.view(Number(params.id));
        return view
          ? preview(view).then(
              (_) =>
                new Response(_.body, {
                  headers: {
                    'content-type': _.contentType,
                    'x-content-type-options': 'nosniff',
                    // Песочница без allow-same-origin: скрипт черновика живёт в чужом, пустом origin —
                    // без cookie менеджера и без доступа к его API.
                    'content-security-policy':
                      'sandbox allow-scripts allow-popups allow-forms',
                  },
                })
            )
          : _error(
              404,
              'content.page_not_found',
              `Page ${params.id} not found`
            );
      },
    ],
    [
      'DELETE',
      '/trash',
      'content.purge',
      () => _json(200, { removed: content.trash.empty() }),
    ],
    [
      'GET',
      '/templates',
      'content.edit',
      () =>
        _json(
          200,
          design.elements
            .list()
            .filter((_) => _.kind === 'template')
            .map((_) => _.name)
        ),
    ],
    [
      'GET',
      '/templates/:name/fields',
      'content.edit',
      ({ params }) => _json(200, fieldsOf(params.name!)),
    ],
    [
      'GET',
      '/components',
      'content.edit',
      () => _json(200, design.components.catalog()),
    ],
    [
      'GET',
      '/elements',
      'design.edit',
      () => _json(200, design.elements.list()),
    ],
    [
      'GET',
      '/inbox/summary',
      'inbox.read',
      () =>
        _json(200, {
          ...forms.inbox.stats(),
          latest: forms.inbox.list({ limit: 5 }).map(rowOf),
        }),
    ],
    [
      'GET',
      '/inbox',
      'inbox.read',
      ({ request }) =>
        _json(200, forms.inbox.list(inboxQuery(request, 50)).map(rowOf)),
    ],
    [
      'GET',
      '/inbox.csv',
      'inbox.read',
      ({ request }) =>
        new Response(
          csvOf(
            forms.inbox.list(inboxQuery(request, 10_000)),
            managerLanguageOf(searchOf(request).get('lang'))
          ),
          {
            headers: {
              'content-type': 'text/csv; charset=utf-8',
              'content-disposition': `attachment; filename="submissions-${new Date().toISOString().slice(0, 10)}.csv"`,
              'cache-control': 'no-store',
            },
          }
        ),
    ],
    [
      'GET',
      '/inbox/:id',
      'inbox.read',
      ({ params, user }) =>
        ((submission) =>
          _json(200, {
            ...submission,
            deliveries: notify.outbox
              .bySource(`submission:${submission.id}`)
              .map((_) => ({
                id: _.id,
                channel: _.channel,
                recipient: _.recipient,
                status: _.status,
                attempts: _.attempts,
                lastError: _.lastError,
                sentAt: _.sentAt,
              })),
            files: forms.inbox.files(submission.id),
          }))(forms.inbox.open(Number(params.id), user!.id)),
    ],
    [
      'GET',
      '/inbox/:id/files/:file',
      'inbox.read',
      // Файл посетителя — только скачиванием и как набор байтов: ни HTML, ни SVG не откроются на адресе
      // менеджера.
      ({ params }) =>
        ((file) =>
          new Response(file.bytes, {
            headers: {
              'content-type': 'application/octet-stream',
              'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
              'content-security-policy': "default-src 'none'; sandbox",
              'x-content-type-options': 'nosniff',
              'cache-control': 'private, no-store',
            },
          }))(forms.inbox.file(Number(params.id), Number(params.file))),
    ],
    [
      'PATCH',
      '/inbox/:id',
      'inbox.read',
      ({ params, body }) =>
        body().then((_) =>
          _json(200, forms.inbox.change(Number(params.id), _ ?? {}))
        ),
    ],
    [
      'DELETE',
      '/inbox/:id',
      'inbox.delete',
      ({ params }) => (forms.inbox.remove(Number(params.id)), _json(200, {})),
    ],
    [
      'POST',
      '/inbox/:id/resend',
      'inbox.read',
      ({ params }) =>
        ((deliveries) =>
          deliveries.length === 0
            ? _error(409, 'forms.no_deliveries', 'Nothing was sent for it')
            : (deliveries.forEach((_) => void notify.outbox.retry(_.id)),
              _json(200, { resent: deliveries.length })))(
          notify.outbox.bySource(`submission:${Number(params.id)}`)
        ),
    ],
    ['GET', '/forms', 'inbox.read', () => _json(200, forms.forms.list())],
    [
      'GET',
      '/forms/sources',
      'forms.edit',
      () =>
        _json(200, {
          sources: forms.forms.sources,
          fields: content.fields.list().map((_) => _.name),
        }),
    ],
    [
      'POST',
      '/forms/fields',
      'forms.edit',
      ({ body }) =>
        body().then((_: { source?: unknown }) =>
          _json(200, forms.forms.fieldsOf(String(_?.source ?? '')))
        ),
    ],
    [
      'POST',
      '/forms/preview',
      'forms.edit',
      ({ body }) =>
        body().then((_) =>
          ((rendered) =>
            new Response(
              `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${rendered.head}<style>body{margin:1.5rem;font:16px/1.5 system-ui,sans-serif;color:#1d2430}</style></head><body>${rendered.body}</body></html>`,
              {
                headers: {
                  'content-type': 'text/html; charset=utf-8',
                  'x-content-type-options': 'nosniff',
                  // Предпросмотр без скриптов и без origin менеджера.
                  'content-security-policy': 'sandbox',
                  'cache-control': 'no-store',
                },
              }
            ))(forms.forms.preview(_ ?? {}))
        ),
    ],
    [
      'GET',
      '/forms/:name',
      'forms.edit',
      ({ params }) =>
        ((form) =>
          form
            ? _json(200, form)
            : _error(404, 'forms.form_not_found', `No form "${params.name}"`))(
          forms.forms.get(params.name!)
        ),
    ],
    [
      'PUT',
      '/forms/:name',
      'forms.edit',
      ({ params, body, request }) =>
        body().then(
          (_) => (
            refuseExisting(
              request,
              forms.forms.exists(params.name!),
              'forms.form_exists',
              params.name!
            ),
            _json(200, forms.forms.save(params.name!, _ ?? {}))
          )
        ),
    ],
    [
      'GET',
      '/forms/:name/usage',
      'forms.edit',
      ({ params }) =>
        _json(200, { pages: content.usage.module('Form', params.name!) }),
    ],
    [
      'DELETE',
      '/forms/:name',
      'forms.edit',
      ({ params }) => (forms.forms.remove(params.name!), _json(200, {})),
    ],
    [
      'GET',
      '/upkeep',
      'site.edit',
      () =>
        _json(200, {
          backups: upkeep.backups.status(),
          updates: upkeep.updates.status(),
        }),
    ],
    [
      'PUT',
      '/upkeep/backups',
      'site.edit',
      ({ body }) =>
        body().then((_) => _json(200, upkeep.backups.configure(_ ?? {}))),
    ],
    [
      'POST',
      '/upkeep/backups/run',
      'site.edit',
      () =>
        upkeep.backups
          .run(true)
          .then(() => _json(200, upkeep.backups.status())),
    ],
    [
      'PUT',
      '/upkeep/updates',
      'site.edit',
      ({ body }) =>
        body().then((_) =>
          _json(200, upkeep.updates.configure(_?.enabled === true))
        ),
    ],
    [
      'POST',
      '/upkeep/updates/check',
      'site.edit',
      () => upkeep.updates.check().then((_) => _json(200, _)),
    ],
    ['GET', '/cache', 'site.edit', () => _json(200, pageCache.stats())],
    [
      'GET',
      '/diagnostics',
      'site.edit',
      ({ request }) =>
        _json(
          200,
          diagnostics.report(
            searchOf(request).has('fresh'),
            languageOf(request)
          )
        ),
    ],
    [
      'GET',
      '/redirects',
      'site.edit',
      () =>
        ((titles) =>
          _json(200, {
            rules: redirects.rules.list(),
            // Прежние адреса страниц: с них сайт сам отвечает 301 на новые.
            moved: content.pages.allOldPaths().map((_) => ({
              ..._,
              title: titles.get(_.pageId) ?? '',
            })),
          }))(new Map(content.drafts.tree().map((_) => [_.id, _.title]))),
    ],
    [
      'POST',
      '/redirects',
      'site.edit',
      ({ body }) =>
        body().then((_) => _json(201, redirects.rules.create(_ ?? {}))),
    ],
    [
      'GET',
      '/redirects/export',
      'site.edit',
      () =>
        new Response(redirects.rules.export(), {
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': `attachment; filename="redirects-${new Date().toISOString().slice(0, 10)}.csv"`,
            'cache-control': 'no-store',
          },
        }),
    ],
    [
      'POST',
      '/redirects/import',
      'site.edit',
      ({ body }) =>
        body().then((_) =>
          _json(200, redirects.rules.import(String(_?.csv ?? '')))
        ),
    ],
    [
      'POST',
      '/redirects/forget',
      'site.edit',
      ({ body }) =>
        body().then(
          (_) => (
            content.pages.forgetOldPath(String(_?.path ?? '')), _json(200, {})
          )
        ),
    ],
    [
      'PUT',
      '/redirects/:id',
      'site.edit',
      ({ params, body }) =>
        body().then((_) =>
          _json(200, redirects.rules.edit(Number(params.id), _ ?? {}))
        ),
    ],
    [
      'DELETE',
      '/redirects/:id',
      'site.edit',
      ({ params }) => (
        redirects.rules.remove(Number(params.id)), _json(200, {})
      ),
    ],
    ['DELETE', '/cache', 'site.edit', () => _json(200, pageCache.clear())],
    ['GET', '/https', 'site.edit', () => _json(200, https())],
    ['GET', '/notify', 'site.edit', () => _json(200, notify.settings.status())],
    [
      'PUT',
      '/notify',
      'site.edit',
      ({ body }) =>
        body().then((_) => _json(200, notify.settings.save(_ ?? {}))),
    ],
    [
      'POST',
      '/notify/test',
      'site.edit',
      ({ body }) =>
        body()
          .then((_: { channel?: string }) =>
            notify.test(String(_?.channel ?? '') as ChannelKind)
          )
          .then(() => _json(200, { ok: true })),
    ],
    [
      'POST',
      '/notify/telegram/bot',
      'site.edit',
      ({ body }) =>
        body()
          .then((_) => notify.telegram.me(_ ?? {}))
          .then((bot) => _json(200, { bot })),
    ],
    [
      'POST',
      '/notify/telegram/chats',
      'site.edit',
      ({ body }) =>
        body()
          .then((_) => notify.telegram.chats(_ ?? {}))
          .then((chats) => _json(200, chats)),
    ],
    [
      'GET',
      '/notify/incidents',
      'site.edit',
      // Журнал — на языке того, кто его читает, а не того, на котором ушло уведомление.
      ({ request }) =>
        ((language) =>
          _json(
            200,
            notify.incidents.list().map((_) => ({
              ..._,
              title: textIn(_.title, language),
              detail: textIn(_.detail, language),
            }))
          ))(languageOf(request)),
    ],
    [
      'GET',
      '/notify/outbox',
      'site.edit',
      () => _json(200, notify.outbox.recent()),
    ],
    [
      'POST',
      '/notify/outbox/:id/retry',
      'site.edit',
      ({ params }) => (
        notify.outbox.retry(Number(params.id)), _json(200, { ok: true })
      ),
    ],
    [
      'GET',
      '/kit',
      'design.edit',
      () =>
        _json(
          200,
          kit().map((_) => ({
            name: _.name,
            description: _kitDescription(_.source),
            requires: _.requires,
            state: kitState(_),
          }))
        ),
    ],
    [
      'POST',
      '/kit/:name',
      'design.edit',
      ({ params, body }) =>
        body().then((_: { replace?: boolean } | null) =>
          _json(200, {
            installed: installKit(params.name!, _?.replace === true),
          })
        ),
    ],
    [
      'GET',
      '/elements/:kind/:name',
      'design.edit',
      ({ params }) => {
        const element =
          (params.kind ?? '') in _ELEMENT_KINDS
            ? design.elements.get(params.kind as 'template', params.name!)
            : null;
        return element
          ? _json(200, element)
          : _error(
              404,
              'design.element_not_found',
              `No ${params.kind} "${params.name}"`
            );
      },
    ],
    [
      'GET',
      '/elements/:kind/:name/usage',
      'design.edit',
      ({ params }) =>
        _json(
          200,
          elementUsage(
            design.elements.get(params.kind as 'template', params.name!)
              ?.kind ??
              fail(
                'design.element_not_found',
                `No ${params.kind} "${params.name}"`
              ),
            params.name!
          )
        ),
    ],
    [
      'DELETE',
      '/elements/:kind/:name',
      'design.edit',
      ({ params }) =>
        ((usage) =>
          usage.pages.length > 0
            ? fail(
                'design.element_in_use',
                `Used by pages ${usage.pages.map((_) => _.id).join(', ')}`
              )
            : (design.elements.remove(params.kind as 'template', params.name!),
              _json(200, {})))(
          elementUsage(
            params.kind === 'component' ? 'component' : 'template',
            params.name!
          )
        ),
    ],
    [
      'PUT',
      '/elements/:kind/:name',
      'design.edit',
      ({ params, body, request }) => {
        const set = elementSet(params.kind!);
        return set
          ? body().then(
              (_: { source: string }) => (
                refuseExisting(
                  request,
                  design.elements.get(
                    params.kind as 'template',
                    params.name!
                  ) !== null,
                  'design.element_exists',
                  params.name!
                ),
                set.save(params.name!, String(_.source ?? '')),
                _json(
                  200,
                  design.elements.get(params.kind as 'template', params.name!)
                )
              )
            )
          : _error(
              404,
              'design.element_not_found',
              `Unknown kind "${params.kind}"`
            );
      },
    ],
    [
      'GET',
      '/plugins',
      'design.edit',
      () => _json(200, extensions.plugins.list()),
    ],
    [
      'GET',
      '/plugins/:name',
      'design.edit',
      ({ params }) => _json(200, extensions.plugins.get(params.name!)),
    ],
    [
      'PUT',
      '/plugins/:name',
      'design.edit',
      ({ params, body, request }) =>
        body().then((_: { source?: string; enabled?: boolean }) =>
          _json(
            200,
            _.source === undefined
              ? extensions.plugins.setEnabled(params.name!, _.enabled !== false)
              : (refuseExisting(
                  request,
                  extensions.plugins.list().some((p) => p.name === params.name),
                  'extensions.plugin_exists',
                  params.name!
                ),
                extensions.plugins.save(params.name!, String(_.source)))
          )
        ),
    ],
    [
      'DELETE',
      '/plugins/:name',
      'design.edit',
      ({ params }) => (extensions.plugins.remove(params.name!), _json(200, {})),
    ],
    ['GET', '/media', 'content.edit', () => _json(200, media.files.list())],
    [
      'POST',
      '/media',
      'content.edit',
      ({ request }) =>
        request
          .formData()
          .then(undefined, () =>
            fail('manager.invalid_form', 'Expected a multipart form')
          )
          .then(
            pipe(
              (form) =>
                ((file) =>
                  file instanceof Blob
                    ? file.arrayBuffer().then((buffer) =>
                        media.files.save({
                          path: String(form.get('path') ?? ''),
                          data: new Uint8Array(buffer),
                          width: form.has('width')
                            ? Number(form.get('width'))
                            : null,
                          height: form.has('height')
                            ? Number(form.get('height'))
                            : null,
                        })
                      )
                    : Promise.reject(
                        domainError('media.no_file', 'The form has no file')
                      ))(form.get('file')),
              (_) => _json(201, _)
            )
          ),
    ],
    [
      'GET',
      '/media-usage/*path',
      'content.edit',
      ({ params }) =>
        _json(200, {
          pages: content.usage.media(params.path!),
          site: site.settings.get().socialImage === params.path,
        }),
    ],
    [
      'PATCH',
      '/media/*path',
      'content.edit',
      ({ params, body }) =>
        body().then((_: { alt?: string }) =>
          _json(200, media.files.describe(params.path!, String(_.alt ?? '')))
        ),
    ],
    [
      'DELETE',
      '/media/*path',
      'content.edit',
      ({ params }) => (media.files.remove(params.path!), _json(200, {})),
    ],
    ['GET', '/fields', 'site.edit', () => _json(200, content.fields.list())],
    [
      'PUT',
      '/fields/:name',
      'site.edit',
      ({ params, body, request }) =>
        body().then(
          (_: NewField) => (
            refuseExisting(
              request,
              content.fields.list().some((f) => f.name === params.name),
              'content.field_exists',
              params.name!
            ),
            _json(200, {
              name: content.fields.save({ ..._, name: params.name! }),
            })
          )
        ),
    ],
    [
      'GET',
      '/fields/:name/usage',
      'site.edit',
      ({ params }) => _json(200, { pages: content.fields.usage(params.name!) }),
    ],
    [
      'DELETE',
      '/fields/:name',
      'site.edit',
      ({ params }) => (content.fields.remove(params.name!), _json(200, {})),
    ],
    [
      'GET',
      '/translations',
      'content.edit',
      () => _json(200, site.translations.list()),
    ],
    [
      'PUT',
      '/translations/:key',
      'site.edit',
      ({ params, body }) =>
        body().then(
          (_: { values?: Record<string, unknown> }) => (
            site.translations.save(params.key!, _.values ?? {}),
            _json(200, site.translations.list())
          )
        ),
    ],
    [
      'DELETE',
      '/translations/:key',
      'site.edit',
      ({ params }) => (
        site.translations.remove(params.key!),
        _json(200, site.translations.list())
      ),
    ],
    [
      'GET',
      '/custom-settings',
      'content.edit',
      () => _json(200, site.customSettings.list()),
    ],
    [
      'PUT',
      '/custom-settings/:key',
      'site.edit',
      ({ params, body }) =>
        body().then(
          (_: { value?: unknown }) => (
            site.customSettings.save(params.key!, _.value ?? ''),
            _json(200, site.customSettings.list())
          )
        ),
    ],
    [
      'DELETE',
      '/custom-settings/:key',
      'site.edit',
      ({ params }) => (
        site.customSettings.remove(params.key!),
        _json(200, site.customSettings.list())
      ),
    ],
    ['GET', '/settings', 'user', () => _json(200, site.settings.get())],
    [
      'PATCH',
      '/settings',
      'site.edit',
      ({ body }) =>
        body().then(
          (_: Partial<SiteSettings>) => (
            site.settings.update(_), _json(200, site.settings.get())
          )
        ),
    ],
    ['GET', '/users', 'users.manage', () => _json(200, identity.users.list())],
    [
      'POST',
      '/users',
      'users.manage',
      ({ body }) =>
        body()
          .then((_) =>
            identity.users.create({
              email: String(_.email ?? ''),
              name: _.name,
              role: _.role,
              password: String(_.password ?? ''),
            })
          )
          .then((_) => _json(201, _)),
    ],
    [
      'PATCH',
      '/users/:id',
      'users.manage',
      // Свой пароль — только с текущим, через `PUT /session/password`: угнанный сеанс не меняет его молча.
      ({ params, user, body }) =>
        body()
          .then((_: { role?: string; password?: string }) =>
            _.password === undefined
              ? identity.users.setRole(Number(params.id), String(_.role ?? ''))
              : Number(params.id) === user!.id
                ? fail(
                    'identity.own_password',
                    'Change your own password with the current one'
                  )
                : identity.users.setPassword(Number(params.id), _.password)
          )
          .then((_) => _json(200, _)),
    ],
    [
      'DELETE',
      '/users/:id',
      'users.manage',
      ({ params }) => (
        identity.users.remove(Number(params.id)), _json(200, {})
      ),
    ],
  ];
};

const _allowed = (access: Access, user: UserView | null): boolean =>
  access === 'public' ||
  (user !== null && (access === 'user' || can(user.role, access)));

// Браузер шлёт Origin с изменяющими запросами: чужой Origin — подделка запроса с другого сайта.
// Свой — адрес запроса или адрес сайта из настроек: за TLS-прокси без --trust-proxy запрос приходит
// по http, а браузер шлёт Origin https.
const _foreign = (request: Request, siteUrl: string): boolean => {
  const origin = request.headers.get('origin');
  return (
    _UNSAFE.includes(request.method) &&
    origin !== null &&
    origin !== new URL(request.url).origin &&
    origin !== _originOf(siteUrl)
  );
};

const _originOf = (url: string): string | null =>
  attempt(
    () => (url ? new URL(url).origin : null),
    () => null
  );

/** Ссылка на страницу менеджера для письма: адрес сайта из настроек, иначе адрес запроса. */
// Адрес — только из настроек: Host запроса подделывается, и ссылка с токеном ушла бы на чужой сайт.
const _managerLink = (request: Request, origin: string, page: string): string =>
  `${origin}${new URL(request.url).pathname.replace(/\/api\/.*$/, '')}/${page}`;

// Письмо — на языке страницы, с которой попросили сброс: её человек только что читал.
const _RESET_LETTER: Readonly<
  Record<
    ManagerLanguage,
    {
      readonly title: string;
      readonly text: (name: string) => string;
      readonly link: string;
    }
  >
> = {
  en: {
    title: 'New password for the site manager',
    text: (name) =>
      `Hello, ${name}! Someone — hopefully you — asked to reset the password for the site manager. The link below is valid for 30 minutes and works only once.\n\nIf it wasn’t you, do nothing: your password stays the same.`,
    link: 'Set a new password',
  },
  de: {
    title: 'Neues Passwort für den Website-Manager',
    text: (name) =>
      `Hallo ${name}, jemand – hoffentlich Sie – hat ein neues Passwort für den Manager der Website angefordert. Der Link unten ist 30 Minuten gültig und funktioniert nur einmal.\n\nWenn Sie das nicht waren, müssen Sie nichts tun: Ihr Passwort bleibt unverändert.`,
    link: 'Neues Passwort festlegen',
  },
  ru: {
    title: 'Новый пароль для менеджера',
    text: (name) =>
      `Здравствуйте, ${name}! Кто-то — надеемся, вы — попросил сбросить пароль к менеджеру сайта. Ссылка ниже действует 30 минут и сработает один раз.\n\nЕсли это были не вы, ничего не делайте: пароль останется прежним.`,
    link: 'Задать новый пароль',
  },
};

const _resetLetter = (language: ManagerLanguage, name: string, link: string) =>
  ((letter) =>
    message({
      topic: 'account',
      title: letter.title,
      text: letter.text(name),
      link: { label: letter.link, url: link },
    }))(_RESET_LETTER[language]);

// Заголовки выгрузки заявок; подписи полей встают между статусом и страницей.
const _CSV_HEAD: Readonly<Record<ManagerLanguage, readonly string[]>> = {
  en: ['No.', 'Date', 'Form', 'Status', 'Page', 'UTM', 'IP'],
  de: ['Nr.', 'Datum', 'Formular', 'Status', 'Seite', 'UTM', 'IP'],
  ru: ['№', 'Дата', 'Форма', 'Статус', 'Страница', 'UTM', 'IP'],
};

/** JSON API менеджера под `/manager/api`. */
export var defineManagerApi = (services: ApiServices) => {
  const routes = _routes(services);

  const dispatch = (
    request: Request,
    path: string,
    client: string
  ): Promise<Response> => {
    const user = services.identity.authenticate(sessionToken(request));
    const found = routes
      .filter(({ 0: method }) => method === request.method)
      .map((route) => ({ route, params: _match(route[1], path) }))
      .find((_) => _.params !== null);
    return found === undefined
      ? Promise.resolve(_error(404, 'manager.not_found', 'Unknown endpoint'))
      : !_allowed(found.route[2], user)
        ? Promise.resolve(
            user === null
              ? _error(401, 'identity.unauthorized', 'Sign in first')
              : _error(403, 'identity.forbidden', 'Not allowed for your role')
          )
        : _buffered(request, _limitOf(found.route))
            .then(
              pipe(
                (buffered) => ({
                  request: buffered,
                  client,
                  user,
                  params: found.params!,
                  body: () => buffered.json().catch(() => ({})),
                }),
                found.route[3]
              )
            )
            .then(undefined, _failure(services.report, request, client));
  };

  return (request: Request, path: string, client = ''): Promise<Response> =>
    _foreign(request, services.site.settings.get().siteUrl)
      ? Promise.resolve(
          _error(403, 'manager.foreign_origin', 'Cross-site request')
        )
      : Promise.resolve()
          .then(() => dispatch(request, path, client))
          .then(undefined, _failure(services.report, request, client));
};

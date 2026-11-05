import { fail } from '../../../shared/kernel/errors.ts';
import type {
  ContentService,
  CreatePageInput,
  FieldValues,
  PageChanges,
} from '../../content/index.ts';
import {
  type DesignService,
  type ElementKind,
  parseScriptBatch,
  type ScriptBatch,
} from '../../design/index.ts';
import {
  can,
  type IdentityService,
  type UserView,
} from '../../identity/index.ts';
import type { MediaService } from '../../media/index.ts';
import type {
  Agent,
  Operation,
  Proposal,
  Receipt,
  Review,
  Value,
} from '../../review/index.ts';
import type { ActivityLog, PageAction } from '../domain/activity.ts';
import type { Context, Route } from './api.ts';
import { apiError, json } from './responses.ts';

/** Кто правит: пользователь и агент ли он — HTML агента чистится, как у редактора. */
export type Actor = Pick<Context, 'user' | 'agent'>;

type PageVerb = 'publish' | 'unpublish' | 'trash' | 'restore';

/** Правки страниц и элементов — те же, что за маршрутами API: ими же применяются принятые предложения. */
export type Operations = {
  readonly createPage: (
    actor: Actor,
    input: CreatePageInput,
    reserved?: number
  ) => number;
  readonly editPage: (actor: Actor, id: number, changes: PageChanges) => number;
  readonly setFields: (actor: Actor, id: number, values: FieldValues) => number;
  readonly movePage: (id: number, parentId: number | null) => number;
  readonly pageAction: (id: number, action: PageVerb) => number;
  /** `batch` — скрипты, что сохраняются вместе с этим: на них можно ссылаться как на `./имя.js`. */
  readonly saveElement: (
    kind: ElementKind,
    name: string,
    source: string,
    batch?: ScriptBatch
  ) => void;
  /** Без права на код — HTML чистится, типы, которые браузер исполняет, не выбрать. */
  readonly guardPage: <T extends PageChanges & { fields?: FieldValues }>(
    code: boolean,
    current: { contentType: string; content: string } | null,
    input: T
  ) => T;
  readonly cleanFields: (values: FieldValues) => FieldValues;
};

type Deps = {
  readonly review: Review;
  readonly content: ContentService;
  readonly design: DesignService;
  readonly identity: IdentityService;
  readonly media: MediaService;
  readonly activity: ActivityLog;
  readonly ops: Operations;
};

const _ACTIONS: Readonly<Record<string, PageVerb>> = {
  publish: 'publish',
  unpublish: 'unpublish',
  trash: 'trash',
  restore: 'restore',
};

const _LOGGED: Readonly<Record<PageVerb, PageAction>> = {
  publish: 'published',
  unpublish: 'unpublished',
  trash: 'trashed',
  restore: 'restored',
};

const _KINDS: readonly ElementKind[] = ['template', 'component', 'script'];

const _values = (input: object): Readonly<Record<string, Value>> =>
  Object.fromEntries(
    Object.entries(input).filter(({ 1: value }) => value !== undefined)
  ) as Readonly<Record<string, Value>>;

// Ключи входа, которые не свойства страницы: их сценарий создания читает отдельно.
const _withoutExtras = ({
  parentId: _parentId,
  publish: _publish,
  fields: _fields,
  ...changes
}: CreatePageInput): PageChanges => changes;

/** Ответ агенту при проверке правок: квитанция вместо результата. */
/** Элемент и куски той же сборки, если он скрипт: сам элемент — последним, его исходник главнее. */
const _withScripts = (
  kind: ElementKind,
  name: string,
  source: string,
  scripts: unknown
): ScriptBatch =>
  new Map([
    ...(kind === 'script' && scripts !== undefined
      ? [...parseScriptBatch(scripts)].filter(({ 0: other }) => other !== name)
      : []),
    [name, source],
  ]);

const _receipt = (receipt: Receipt, extra: Record<string, unknown> = {}) =>
  json(202, {
    pending: true,
    ...receipt,
    ...extra,
    message: `Review mode is on: this change is not on the site. It is proposal ${receipt.proposal} in change set ${receipt.changeSet} and waits for a person to accept it. get_page and view_page show the site as it is now. When the change set is complete, call submit_changes with a title and a description; list_proposals shows its state.`,
  });

export var agentOf = (context: Context): Agent | null =>
  context.channel && context.user
    ? {
        userId: context.user.id,
        userName: context.user.name,
        tokenId: context.channel.key?.id ?? null,
        tokenName: context.channel.key?.name ?? '',
        group: context.channel.group,
      }
    : null;

/**
 * Проверка правок агентов (ADR 0054) в API менеджера: правки страниц и элементов от ключа API и MCP —
 * предложения (`gate`), остальное, что меняет сайт, — отказ `review.not_reviewable`; разбор наборов,
 * ссылки предпросмотра и инструменты агента — маршруты (`routes`).
 */
export var reviewApi = ({
  review,
  content,
  design,
  identity,
  media,
  activity,
  ops,
}: Deps) => {
  const propose = (
    context: Context,
    op: Operation,
    batch?: ScriptBatch
  ): Receipt => review.propose(agentOf(context)!, op, batch);

  // Страница, которую агент сам предложил создать, ещё не в базе: её прежний текст — пустой.
  const currentOf = (id: number) =>
    ((page) =>
      page && { contentType: page.contentType, content: page.content })(
      content.drafts.view(id)
    );

  const pageOperation =
    (build: (context: Context, body: any, id: number) => Operation[]) =>
    (context: Context): Promise<Response> =>
      context
        .body()
        .then((body) =>
          ((operations) =>
            operations.length === 0
              ? fail(
                  'review.nothing_to_propose',
                  'This request changes nothing'
                )
              : _receipt(operations.map((_) => propose(context, _)).at(-1)!))(
            build(context, body, Number(context.params.id))
          )
        );

  const created = (context: Context, input: CreatePageInput): Response =>
    ((pageId) =>
      ((clean) =>
        _receipt(
          propose(context, {
            kind: 'page.create',
            pageId,
            changes: _values(_withoutExtras(clean)),
            fields: _values(clean.fields ?? {}),
            parentId: input.parentId ?? null,
            publish: input.publish === true,
          }),
          {
            id: pageId,
            note: `The page gets id ${pageId} when the proposal is accepted. Use this id in this change set: edit or publish it, create pages under it, link to it as [~${pageId}~].`,
          }
        ))(ops.guardPage(false, null, input)))(content.pages.reserveId());

  // Маршрут → предложение. Чего здесь нет и что меняет сайт, при проверке правок не выполняется.
  const gate: Readonly<
    Record<string, (context: Context) => Promise<Response>>
  > = {
    'POST /pages': (context) =>
      context.body().then((input: CreatePageInput) => created(context, input)),
    'PATCH /pages/:id': pageOperation((_context, body: PageChanges, id) => [
      {
        kind: 'page.edit',
        pageId: id,
        changes: _values(ops.guardPage(false, currentOf(id), body ?? {})),
      },
    ]),
    'PUT /pages/:id/fields': pageOperation(
      (_context, body: FieldValues, id) => [
        {
          kind: 'page.fields',
          pageId: id,
          fields: _values(ops.cleanFields(body ?? {})),
        },
      ]
    ),
    'POST /pages/:id/move': pageOperation(
      (_context, body: { parentId?: number | null }, id) => [
        { kind: 'page.move', pageId: id, parentId: body?.parentId ?? null },
      ]
    ),
    'POST /pages/:id/:action': (context) =>
      ((action) =>
        action
          ? Promise.resolve(
              _receipt(
                propose(context, {
                  kind: `page.${action}`,
                  pageId: Number(context.params.id),
                })
              )
            )
          : Promise.resolve(
              apiError(
                404,
                'manager.not_found',
                `Unknown action "${context.params.action}"`
              )
            ))(_ACTIONS[context.params.action ?? '']),
    // Возврат к версии — правка страницы её текстом и полями.
    'POST /pages/:id/revisions/:revision/restore': pageOperation(
      (context, _body, id) =>
        ((input) =>
          ((clean) => [
            {
              kind: 'page.edit' as const,
              pageId: id,
              changes: _values(_withoutExtras(clean as CreatePageInput)),
            },
            {
              kind: 'page.fields' as const,
              pageId: id,
              fields: _values(clean.fields ?? {}),
            },
          ])(
            ops.guardPage(false, currentOf(id), {
              ...input.changes,
              fields: input.fields,
            })
          ))(content.revisions.changes(id, Number(context.params.revision)))
    ),
    // Со скриптом могут прийти куски той же сборки: каждый — своё предложение, ссылки между ними — в любом
    // порядке.
    'PUT /elements/:kind/:name': (context) =>
      context
        .body()
        .then((body: { source?: unknown; scripts?: unknown }) =>
          ((kind) =>
            kind
              ? (void (
                  context.request.headers.get('if-none-match') === '*' &&
                  design.elements.get(kind, context.params.name!) !== null &&
                  fail(
                    'design.element_exists',
                    `"${context.params.name}" already exists`
                  )
                ),
                ((batch) =>
                  _receipt(
                    [...batch]
                      .map(({ 0: name, 1: source }) =>
                        propose(
                          context,
                          { kind: 'element.save', element: kind, name, source },
                          batch
                        )
                      )
                      .at(-1)!
                  ))(
                  _withScripts(
                    kind,
                    context.params.name!,
                    String(body?.source ?? ''),
                    body?.scripts
                  )
                ))
              : apiError(
                  404,
                  'design.element_not_found',
                  `Unknown kind "${context.params.kind}"`
                ))(_KINDS.find((_) => _ === context.params.kind))
        ),
  };

  // Не меняют сайт: чтение по POST и управление своими предложениями. Загрузка в медиатеку проверяет
  // сама, что файл новый.
  const passes: ReadonlySet<string> = new Set([
    'POST /assistant/generate',
    'POST /forms/preview',
    'POST /forms/fields',
    'POST /media',
    'POST /review/mine/submit',
    'POST /review/mine/:id/withdraw',
  ]);

  const refused = (key: string) => (): Response =>
    apiError(
      403,
      'review.not_reviewable',
      `Review mode is on: changes of pages, templates, components and scripts become proposals for a person, but ${key} cannot be proposed (forms, fields, settings, media details, redirects and the rest stay with the people of the site). Tell the person what you would change.`
    );

  /** Обработчик маршрута при проверке правок: предложение, как обычно или отказ. */
  const handlerOf = (key: string, method: string, route: Route[3]): Route[3] =>
    ['GET', 'HEAD'].includes(method) || passes.has(key)
      ? route
      : (gate[key] ?? refused(key));

  const userOf = (id: number): UserView =>
    identity.users.list().find((_) => _.id === id) ??
    fail(
      'review.agent_gone',
      'The user this agent worked for is no longer in the manager'
    );

  const log = (user: UserView, pageId: number, action: PageAction): void =>
    activity.record({
      pageId,
      action,
      userId: user.id,
      userName: user.name,
      at: new Date().toISOString(),
    });

  const _need = (user: UserView, proposal: Proposal): void =>
    void (
      can(
        user.role,
        proposal.kind === 'element' ? 'design.edit' : 'content.edit'
      ) ||
      fail(
        'identity.forbidden',
        `${user.name} may not change ${proposal.kind === 'element' ? 'templates, components and scripts' : 'pages'}`
      )
    );

  // Принятое предложение — те же операции, что у маршрутов, от имени агента: история и журнал правок
  // подписаны им, его HTML чистится.
  const applier =
    (agent: UserView) =>
    (proposal: Proposal, batch: ScriptBatch): void => {
      _need(agent, proposal);
      const actor: Actor = { user: agent, agent: true };
      void (proposal.kind === 'element'
        ? ops.saveElement(
            proposal.element,
            proposal.name,
            proposal.source,
            batch
          )
        : ((delta, id) =>
            delta.created
              ? (ops.createPage(
                  actor,
                  {
                    ...(delta.changes as unknown as CreatePageInput),
                    parentId: delta.parentId ?? null,
                    fields: delta.fields as FieldValues,
                    publish: delta.published === true,
                  },
                  id
                ),
                log(agent, id, 'created'),
                void (
                  delta.trashed === true &&
                  (ops.pageAction(id, 'trash'), log(agent, id, 'trashed'))
                ))
              : (void (
                  delta.trashed === false &&
                  (ops.pageAction(id, 'restore'), log(agent, id, 'restored'))
                ),
                void (
                  Object.keys(delta.changes).length > 0 &&
                  (ops.editPage(actor, id, delta.changes as PageChanges),
                  log(agent, id, 'edited'))
                ),
                void (
                  Object.keys(delta.fields).length > 0 &&
                  (ops.setFields(actor, id, delta.fields as FieldValues),
                  log(agent, id, 'edited'))
                ),
                void (
                  'parentId' in delta &&
                  (ops.movePage(id, delta.parentId ?? null),
                  log(agent, id, 'moved'))
                ),
                void (
                  delta.published !== undefined &&
                  ((verb: PageVerb) => (
                    ops.pageAction(id, verb), log(agent, id, _LOGGED[verb])
                  ))(delta.published ? 'publish' : 'unpublish')
                ),
                void (
                  delta.trashed === true &&
                  (ops.pageAction(id, 'trash'), log(agent, id, 'trashed'))
                )))(proposal.delta, proposal.pageId));
    };

  const numbers = (raw: unknown): number[] | undefined =>
    Array.isArray(raw) ? raw.map(Number) : undefined;

  // Проверяющему — те же права, что для правки: элементы принимает тот, кому можно код.
  const reviewerMay = (user: UserView, setId: number, items?: number[]) =>
    review.changeSets
      .get(setId)
      .items.filter(
        (_) =>
          _.status === 'pending' &&
          (items === undefined || items.includes(_.id))
      )
      .forEach(
        (_) =>
          void (
            _.target.kind === 'element' &&
            !can(user.role, 'design.edit') &&
            fail(
              'identity.forbidden',
              'Accepting templates, components and scripts needs the design permission'
            )
          )
      );

  const origin = (request: Request, siteUrl: string): string =>
    (siteUrl || new URL(request.url).origin).replace(/\/$/, '');

  const routes = (siteUrl: () => string): readonly Route[] => [
    [
      'GET',
      '/review/settings',
      'content.edit',
      () =>
        json(200, {
          ...review.settings.get(),
          pending: review.changeSets.pending(),
        }),
    ],
    [
      'PUT',
      '/review/settings',
      'site.edit',
      ({ body }) =>
        body().then((_) =>
          json(200, {
            ...review.settings.save(_ ?? {}),
            pending: review.changeSets.pending(),
          })
        ),
    ],
    [
      'GET',
      '/review/sets',
      'content.edit',
      ({ request }) =>
        json(
          200,
          review.changeSets.list(
            new URL(request.url).searchParams.get('closed') === '1'
          )
        ),
    ],
    [
      'GET',
      '/review/sets/:id',
      'content.edit',
      ({ params }) => json(200, review.changeSets.get(Number(params.id))),
    ],
    [
      'POST',
      '/review/sets/:id/accept',
      'content.edit',
      ({ params, body, user }) =>
        body().then((_: { items?: unknown; override?: unknown }) =>
          ((id, items) => (
            reviewerMay(user!, id, items),
            json(
              200,
              review.changeSets.accept(
                id,
                {
                  ...(items ? { items } : {}),
                  override: numbers(_?.override) ?? [],
                  reviewer: user!.name,
                },
                applier(userOf(review.changeSets.get(id).agent.userId))
              )
            )
          ))(Number(params.id), numbers(_?.items))
        ),
    ],
    [
      'POST',
      '/review/sets/:id/reject',
      'content.edit',
      ({ params, body, user }) =>
        body().then((_: { items?: unknown }) =>
          ((items) =>
            json(
              200,
              review.changeSets.reject(Number(params.id), {
                ...(items ? { items } : {}),
                reviewer: user!.name,
              })
            ))(numbers(_?.items))
        ),
    ],
    [
      // Предпросмотр набора в менеджере — в песочнице без своего origin, как предпросмотр страницы.
      'GET',
      '/review/sets/:id/preview/:page',
      'content.edit',
      ({ params }) =>
        review.preview
          .render({
            page: Number(params.page),
            changeSet: review.changeSets.get(Number(params.id)).id,
          })
          .then((page) =>
            page
              ? new Response(page.body, {
                  headers: {
                    'content-type': page.contentType,
                    'cache-control': 'no-store',
                    'x-content-type-options': 'nosniff',
                    'x-robots-tag': 'noindex',
                    'content-security-policy':
                      'sandbox allow-scripts allow-popups',
                  },
                })
              : apiError(
                  404,
                  'content.page_not_found',
                  `Page ${params.page} not found`
                )
          ),
    ],
    [
      'GET',
      '/review/links',
      'content.edit',
      ({ request }) =>
        ((query) =>
          json(
            200,
            review.links.list({
              ...(query.get('page') ? { page: Number(query.get('page')) } : {}),
              ...(query.has('set')
                ? {
                    changeSet:
                      query.get('set') === '' ? null : Number(query.get('set')),
                  }
                : {}),
            })
          ))(new URL(request.url).searchParams),
    ],
    [
      'POST',
      '/review/links',
      'content.edit',
      ({ body, user, request }) =>
        body().then(
          (_: {
            page?: unknown;
            changeSet?: unknown;
            label?: unknown;
            days?: unknown;
          }) =>
            ((link) =>
              json(201, {
                ...link,
                url: `${origin(request, siteUrl())}/_cms/preview/${link.token}`,
              }))(
              review.links.create({
                target: {
                  page: Number(_?.page),
                  changeSet:
                    _?.changeSet === undefined || _?.changeSet === null
                      ? null
                      : Number(_.changeSet),
                },
                label: _?.label,
                days: _?.days,
                by: { id: user!.id, name: user!.name },
              })
            )
        ),
    ],
    [
      'DELETE',
      '/review/links/:id',
      'content.edit',
      // Свою ссылку отзывает её создатель: чужую по id не погасить (как со своими ключами API).
      ({ params, user }) => (
        review.links.revoke(Number(params.id), user!.id), json(200, {})
      ),
    ],
    [
      // Наборы самого агента: тот же пользователь и тот же ключ.
      'GET',
      '/review/mine',
      'user',
      (context) =>
        ((agent) =>
          json(200, {
            reviewed: context.reviewed,
            changeSets: agent ? review.changeSets.mine(agent) : [],
          }))(agentOf(context)),
    ],
    [
      'POST',
      '/review/mine/submit',
      'content.edit',
      (context) =>
        context
          .body()
          .then((_) =>
            json(
              200,
              review.changeSets.submit(
                agentOf(context) ??
                  fail(
                    'review.not_agent',
                    'Only an agent submits its change set; people review it'
                  ),
                _ ?? {}
              )
            )
          ),
    ],
    [
      'POST',
      '/review/mine/:id/withdraw',
      'content.edit',
      (context) =>
        context
          .body()
          .then((_: { proposal?: unknown }) =>
            json(
              200,
              review.changeSets.withdraw(
                agentOf(context) ??
                  fail(
                    'review.not_agent',
                    'Only an agent withdraws its proposals'
                  ),
                Number(context.params.id),
                _?.proposal === undefined ? undefined : Number(_.proposal)
              )
            )
          ),
    ],
  ];

  return {
    handlerOf,
    routes,
    /** Загрузка в медиатеку при проверке правок: только новый путь — замена файла изменила бы сайт. */
    assertNewMedia: (context: Context, path: string): void =>
      void (
        context.reviewed &&
        media.files.read(path) !== null &&
        fail(
          'review.not_reviewable',
          `Review mode is on: ${path} exists, and replacing it would change the site at once. Upload under a new path.`
        )
      ),
  };
};

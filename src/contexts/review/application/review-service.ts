import {
  attempt,
  domainError,
  fail,
  isDomainError,
  rethrow,
} from '../../../shared/kernel/errors.ts';
import type { EventBus } from '../../../shared/kernel/events.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import type { PageDraft } from '../../content/index.ts';
import {
  type Agent,
  type ChangeSet,
  isOwn,
  parseDescription,
  parseReviewSettings,
  parseTitle,
  type ReviewSettings,
  statusAfter,
} from '../domain/change-set.ts';
import type { ReviewEvent } from '../domain/events.ts';
import type {
  ChangeSetRepository,
  LinkSecrets,
  ProposalRepository,
  ReviewSettingsRepository,
  ShareLinkRepository,
} from '../domain/ports.ts';
import {
  applyOrder,
  conflictsOf,
  type ElementKind,
  type ElementProposal,
  type ElementState,
  foldElement,
  foldPage,
  type Operation,
  operationsOf,
  operationTarget,
  type PageProposal,
  type PageState,
  type Proposal,
  type ProposalBody,
  type ProposalStatus,
  targetOf,
  type Value,
} from '../domain/proposal.ts';
import {
  expiresAt,
  isLive,
  type LinkTarget,
  parseDays,
  parseLabel,
  type ShareLink,
  splitToken,
} from '../domain/share-link.ts';
import { type DiffLine, textDiff } from '../domain/text-diff.ts';

/** Нынешняя страница для базы, конфликтов и сравнения. */
export type PageFacts = PageState & {
  readonly title: string;
  readonly path: string;
};

/** Что проверка правок читает у content и design: её даёт корень приложения. */
export type ReviewSources = {
  readonly page: (id: number) => PageFacts | null;
  readonly element: (kind: ElementKind, name: string) => ElementState | null;
  /** Страница после правки, без записи: ошибка — та же, что при сохранении. */
  readonly checkPage: (draft: PageDraft) => void;
  /** Имя, циклы импортов и компиляция, без записи. */
  readonly checkElement: (
    kind: ElementKind,
    name: string,
    source: string
  ) => void;
  readonly fieldLabel: (name: string) => string;
};

export type Clock = () => Date;

/** Ответ агенту: правка не применена, а ждёт решения в наборе. */
export type Receipt = {
  readonly changeSet: number;
  readonly proposal: number;
  readonly target: string;
  readonly operations: readonly string[];
};

export type Change = {
  readonly key: string;
  readonly before: Value;
  readonly after: Value;
  /** Конфликт: каким место было, когда агент его увидел. */
  readonly was?: Value;
};

export type PageRef = { readonly id: number; readonly title: string } | null;

export type ItemView = {
  readonly id: number;
  readonly status: ProposalStatus;
  readonly error: string;
  readonly decidedBy: string;
  readonly decidedAt: string | null;
  readonly operations: readonly string[];
  readonly conflicts: readonly string[];
  readonly target:
    | {
        readonly kind: 'page';
        readonly id: number;
        readonly title: string;
        readonly path: string;
        readonly exists: boolean;
      }
    | {
        readonly kind: 'element';
        readonly element: ElementKind;
        readonly name: string;
      };
  readonly changes: readonly Change[];
  readonly fields: readonly (Change & { readonly label: string })[];
  /** Перенос: прежний и новый родитель; null — верхний уровень. */
  readonly tree: { readonly before: PageRef; readonly after: PageRef } | null;
  /** Текст страницы: сейчас → предложено. */
  readonly content: readonly DiffLine[] | null;
  /** Исходник элемента: сейчас → предложено. */
  readonly source: readonly DiffLine[] | null;
};

export type ChangeSetSummary = ChangeSet & {
  readonly counts: Readonly<Record<ProposalStatus, number>>;
  readonly conflicts: number;
  readonly pages: readonly number[];
};

export type ChangeSetView = ChangeSetSummary & {
  readonly items: readonly ItemView[];
};

/** Правки набора для предпросмотра: страницы — как станут, элементы — исходники `kind/name`. */
export type Overlay = {
  readonly pages: ReadonlyMap<number, PageDraft>;
  readonly elements: ReadonlyMap<string, string>;
};

export type LinkView = Omit<ShareLink, 'selector' | 'verifierHash'> & {
  readonly live: boolean;
};

export type IssuedLink = LinkView & { readonly token: string };

export type Decision = {
  /** Какие предложения; без списка — все ждущие. */
  readonly items?: readonly number[];
  /** Принять и эти, хоть цель и правили после предложения. */
  readonly override?: readonly number[];
  readonly reviewer: string;
};

// Поиск по ссылке: с одного адреса — не больше 120 в минуту и 20 неверных за 10 минут.
const _LOOKUPS = { window: 60_000, max: 120 } as const;
const _MISSES = { window: 10 * 60_000, max: 20 } as const;
const _CLIENTS = 5000;

const _STATUSES: readonly ProposalStatus[] = [
  'pending',
  'accepted',
  'rejected',
  'withdrawn',
];

// Свойства страницы, что показываются строкой «сейчас → предложено»; текст — своим сравнением.
const _SHOWN_STATE = ['published', 'trashed'] as const;

// Счёт по адресу в окне: `hit` записывает попытку и говорит, укладываемся ли; `over` — только смотрит.
const _limiter = () => {
  const hits = new Map<string, number[]>();
  const recent = (key: string, window: number, at: number): number[] =>
    (hits.get(key) ?? []).filter((_) => at - _ < window);
  return {
    hit: (key: string, window: number, max: number, at: number): boolean =>
      ((seen) => (
        void (
          hits.size >= _CLIENTS &&
          !hits.has(key) &&
          hits.delete(hits.keys().next().value!)
        ),
        hits.set(key, [...seen, at]),
        seen.length < max
      ))(recent(key, window, at)),
    over: (key: string, window: number, max: number, at: number): boolean =>
      recent(key, window, at).length >= max,
  };
};

export var defineReviewService = ({
  sets,
  proposals,
  links,
  settings,
  secrets,
  sources,
  clock,
  bus,
  transaction,
}: {
  sets: ChangeSetRepository;
  proposals: ProposalRepository;
  links: ShareLinkRepository;
  settings: ReviewSettingsRepository;
  secrets: LinkSecrets;
  sources: ReviewSources;
  clock: Clock;
  bus: EventBus;
  transaction: <T>(run: () => T) => T;
}) => {
  const now = (): string => clock().toISOString();
  const lookups = _limiter();
  const misses = _limiter();

  const publish = (event: ReviewEvent): void => bus.publish(event);

  const load = (id: number): ChangeSet =>
    sets.get(Number(id)) ??
    fail('review.change_set_not_found', `There is no change set ${id}`);

  const stateOf = (body: ProposalBody): PageState | ElementState | null =>
    body.kind === 'page'
      ? sources.page(body.pageId)
      : sources.element(body.element, body.name);

  const validate = (body: ProposalBody): ProposalBody => (
    body.kind === 'page'
      ? sources.checkPage({
          id: body.pageId,
          created: body.delta.created,
          changes: body.delta.changes as PageDraft['changes'],
          fields: body.delta.fields as PageDraft['fields'],
          ...('parentId' in body.delta
            ? { parentId: body.delta.parentId ?? null }
            : {}),
        })
      : sources.checkElement(body.element, body.name, body.source),
    body
  );

  const fold = (op: Operation, previous: Proposal | null): ProposalBody =>
    op.kind === 'element.save'
      ? foldElement(
          op,
          previous as ElementProposal | null,
          sources.element(op.element, op.name)
        )
      : foldPage(op, previous as PageProposal | null, sources.page(op.pageId));

  const summaryOf = (set: ChangeSet): ChangeSetSummary =>
    ((items) => ({
      ...set,
      counts: Object.fromEntries(
        _STATUSES.map((status) => [
          status,
          items.filter((_) => _.status === status).length,
        ])
      ) as Record<ProposalStatus, number>,
      conflicts: items.filter(
        (_) => _.status === 'pending' && conflictsOf(_, stateOf(_)).length > 0
      ).length,
      pages: items.flatMap((_) =>
        _.kind === 'page' && _.status === 'pending' ? [_.pageId] : []
      ),
    }))(proposals.of(set.id));

  const titleOf = (id: number | null, created: readonly Proposal[]): PageRef =>
    id === null
      ? null
      : {
          id,
          title:
            sources.page(id)?.title ??
            ((own) =>
              own?.kind === 'page'
                ? String(own.delta.changes.title ?? '')
                : '')(
              created.find((_) => _.kind === 'page' && _.pageId === id)
            ),
        };

  const pageItem = (
    proposal: Proposal & PageProposal,
    conflicts: readonly string[],
    all: readonly Proposal[]
  ) => {
    const current = sources.page(proposal.pageId);
    const delta = proposal.delta;
    const before = (key: string): Value =>
      (current?.changes[key] as Value | undefined) ?? null;
    const was = (key: string, base: Value | undefined) =>
      conflicts.includes(key) ? { was: base ?? null } : {};
    return {
      target: {
        kind: 'page' as const,
        id: proposal.pageId,
        title: String(
          delta.changes.title ?? current?.title ?? `#${proposal.pageId}`
        ),
        path: current?.path ?? '',
        exists: current !== null,
      },
      changes: [
        ...Object.keys(delta.changes)
          .filter((_) => _ !== 'content')
          .filter(
            (_) =>
              JSON.stringify(before(_)) !==
              JSON.stringify(delta.changes[_] ?? null)
          )
          .map((key) => ({
            key,
            before: current ? before(key) : null,
            after: delta.changes[key] ?? null,
            ...was(key, proposal.base.changes[key]),
          })),
        ..._SHOWN_STATE
          .filter(
            (key) =>
              delta[key] !== undefined &&
              (current === null || current[key] !== delta[key])
          )
          .map((key) => ({
            key,
            before: current ? current[key] : null,
            after: delta[key] ?? null,
            ...was(key, proposal.base[key]),
          })),
      ],
      fields: Object.keys(delta.fields)
        .filter(
          (_) =>
            JSON.stringify(current?.fields[_] ?? null) !==
            JSON.stringify(delta.fields[_] ?? null)
        )
        .map((name) => ({
          key: name,
          label: sources.fieldLabel(name),
          before: current?.fields[name] ?? null,
          after: delta.fields[name] ?? null,
          ...was(`fields.${name}`, proposal.base.fields[name]),
        })),
      tree:
        'parentId' in delta &&
        !delta.created &&
        (delta.parentId ?? null) !== (current?.parentId ?? null)
          ? {
              before: titleOf(current?.parentId ?? null, all),
              after: titleOf(delta.parentId ?? null, all),
            }
          : null,
      content:
        typeof delta.changes.content === 'string' &&
        delta.changes.content !== String(before('content') ?? '')
          ? textDiff(
              String(current ? (before('content') ?? '') : ''),
              delta.changes.content,
              String(
                delta.changes.contentType ??
                  before('contentType') ??
                  'text/html'
              ) === 'text/html'
            )
          : null,
      source: null,
    };
  };

  const elementItem = (proposal: Proposal & ElementProposal) =>
    ((current) => ({
      target: {
        kind: 'element' as const,
        element: proposal.element,
        name: proposal.name,
      },
      changes: [],
      fields: [],
      tree: null,
      content: null,
      source:
        current?.source === proposal.source
          ? []
          : textDiff(current?.source ?? '', proposal.source),
    }))(sources.element(proposal.element, proposal.name));

  const itemOf =
    (all: readonly Proposal[]) =>
    (proposal: Proposal): ItemView =>
      ((conflicts) => ({
        id: proposal.id,
        status: proposal.status,
        error: proposal.error,
        decidedBy: proposal.decidedBy,
        decidedAt: proposal.decidedAt,
        operations: operationsOf(proposal),
        conflicts,
        ...(proposal.kind === 'page'
          ? pageItem(proposal, conflicts, all)
          : elementItem(proposal)),
      }))(
        proposal.status === 'pending'
          ? conflictsOf(proposal, stateOf(proposal))
          : []
      );

  const viewOf = (set: ChangeSet): ChangeSetView =>
    ((all) => ({ ...summaryOf(set), items: all.map(itemOf(all)) }))(
      proposals.of(set.id)
    );

  // После решений: закрыт ли набор и когда.
  const settle = (set: ChangeSet): ChangeSet =>
    ((status) =>
      ((next) => (sets.save(next), next))({
        ...set,
        status,
        updatedAt: now(),
        closedAt: status === 'closed' ? (set.closedAt ?? now()) : null,
      }))(
      statusAfter(
        set,
        proposals.of(set.id).map((_) => _.status)
      )
    );

  const selected = (set: ChangeSet, items?: readonly number[]): Proposal[] =>
    ((pending) =>
      items === undefined
        ? pending
        : items.map(
            (id) =>
              pending.find((_) => _.id === Number(id)) ??
              fail(
                'review.proposal_not_found',
                `Change set ${set.id} has no pending proposal ${id}`
              )
          ))(proposals.of(set.id).filter((_) => _.status === 'pending'));

  const ownSet = (agent: Agent, id: number): ChangeSet =>
    ((set) =>
      isOwn(set, agent)
        ? set
        : fail(
            'review.change_set_not_found',
            `There is no change set ${id} of yours`
          ))(load(id));

  // Отказ при применении — с номером предложения: человек увидит, что не прошло, у самого предложения.
  const failedOn =
    (proposal: Proposal) =>
    (error: unknown): never =>
      rethrow(
        Object.assign(
          domainError(
            'review.apply_failed',
            `Proposal ${proposal.id} (${targetOf(proposal)}): ${isDomainError(error) ? `${error.code}: ${error.message}` : String(error)}`
          ),
          { proposal: proposal.id }
        )
      );

  const applyAll = (
    chosen: readonly Proposal[],
    reviewer: string,
    apply: (proposal: Proposal) => void
  ): void =>
    attempt(
      () =>
        transaction(() =>
          applyOrder(chosen).forEach(
            (_) =>
              void (attempt(() => apply(_), failedOn(_)),
              proposals.decide(_.id, 'accepted', reviewer, now()))
          )
        ),
      (error) =>
        rethrow(
          (void ((failed) =>
            typeof failed === 'number' &&
            proposals.fail(failed, (error as Error).message.slice(0, 1000)))(
            (error as { proposal?: unknown }).proposal
          ),
          error)
        )
    );

  const linkView = (link: ShareLink): LinkView => ({
    id: link.id,
    target: link.target,
    label: link.label,
    createdBy: link.createdBy,
    createdAt: link.createdAt,
    expiresAt: link.expiresAt,
    lastUsedAt: link.lastUsedAt,
    uses: link.uses,
    live: isLive(link, now()),
  });

  // Ссылка на правки набора — на страницу из набора или, если в нём только элементы, на любую.
  const linkTarget = (target: LinkTarget): LinkTarget =>
    target.changeSet === null
      ? ((page) =>
          page === null || page.trashed
            ? fail('content.page_not_found', `Page ${target.page} not found`)
            : page.published
              ? fail(
                  'review.page_published',
                  'The page is on the site already: share its address'
                )
              : target)(sources.page(target.page))
      : ((summary) =>
          summary.pages.includes(target.page) ||
          (summary.pages.length === 0 && sources.page(target.page) !== null)
            ? target
            : fail(
                'review.page_not_in_set',
                `Page ${target.page} is not in change set ${target.changeSet}`
              ))(summaryOf(load(target.changeSet)));

  return {
    settings: {
      get: (): ReviewSettings => settings.get(),
      save: (input: Readonly<Record<string, unknown>>): ReviewSettings =>
        ((next) => (settings.save(next), next))(
          parseReviewSettings(input ?? {}, settings.get())
        ),
    },
    /** Ждут ли правки агента проверки: всех агентов — по настройке, ключа — по его отметке. */
    required: (tokenReview: boolean): boolean =>
      settings.get().agents || tokenReview,
    /** Правка агента → предложение в его открытом наборе; та же цель в наборе — сливается. */
    propose: (agent: Agent, op: Operation): Receipt =>
      transaction(() =>
        ((set) =>
          ((previous) =>
            pipe(
              (_: Operation) => validate(fold(_, previous)),
              (body: ProposalBody) => ({
                body,
                id: previous
                  ? (proposals.update(previous.id, body, now()), previous.id)
                  : proposals.add(set.id, body, now()),
              }),
              ({ body, id }) => (
                sets.save({ ...set, updatedAt: now() }),
                {
                  changeSet: set.id,
                  proposal: id,
                  target: operationTarget(op),
                  operations: operationsOf(body),
                }
              )
            )(op))(proposals.pending(set.id, operationTarget(op))))(
          sets.openOf(agent) ?? load(sets.create(agent, now()))
        )
      ),
    changeSets: {
      list: (closed = false, limit = 100): ChangeSetSummary[] =>
        sets.list(closed, limit).map(summaryOf),
      get: (id: number): ChangeSetView => viewOf(load(id)),
      /** Наборы агента: его пользователь и его ключ. */
      mine: (agent: Agent): ChangeSetSummary[] =>
        sets.of(agent.userId, agent.tokenId).slice(0, 20).map(summaryOf),
      /** Агент отдаёт набор на проверку: заголовок, описание и уведомление владельцу. */
      submit: (
        agent: Agent,
        input: { title?: unknown; description?: unknown; changeSet?: unknown }
      ): ChangeSetSummary =>
        ((set) =>
          set.status !== 'open'
            ? fail(
                'review.not_open',
                `Change set ${set.id} was submitted already`
              )
            : ((next) => (
                sets.save(next),
                publish({
                  type: 'review.change_set_ready',
                  changeSetId: next.id,
                  title: next.title,
                  agent: next.agent,
                  proposals: summaryOf(next).counts.pending,
                }),
                summaryOf(next)
              ))({
                ...set,
                title: parseTitle(input.title) || set.title,
                description:
                  parseDescription(input.description) || set.description,
                status: 'ready' as const,
                submittedAt: now(),
                updatedAt: now(),
              }))(
          input.changeSet === undefined || input.changeSet === null
            ? (sets.openOf(agent) ??
                fail(
                  'review.nothing_open',
                  'There are no proposals to submit in this session'
                ))
            : ownSet(agent, Number(input.changeSet))
        ),
      /** Агент забирает своё: всё ждущее в наборе или одно предложение. */
      withdraw: (
        agent: Agent,
        id: number,
        proposal?: number
      ): ChangeSetSummary =>
        ((set) =>
          transaction(
            () => (
              selected(
                set,
                proposal === undefined ? undefined : [proposal]
              ).forEach(
                (_) => void proposals.decide(_.id, 'withdrawn', '', now())
              ),
              summaryOf(settle(set))
            )
          ))(ownSet(agent, id)),
      /**
       * Принять: каждое предложение — через `apply` (тот же путь, что правка человека, от имени агента),
       * всё в одной транзакции. Цель правили после предложения — отказ `review.conflict`, если её не
       * отметили в `override`.
       */
      accept: (
        id: number,
        decision: Decision,
        apply: (proposal: Proposal) => void
      ): ChangeSetView =>
        ((set) =>
          ((chosen) =>
            ((conflicted) =>
              conflicted.length > 0
                ? fail(
                    'review.conflict',
                    `Proposals ${conflicted.map((_) => _.id).join(', ')} were changed on the site since: override or reject them`
                  )
                : (applyAll(chosen, decision.reviewer, apply),
                  viewOf(settle(load(set.id)))))(
              chosen.filter(
                (_) =>
                  !(decision.override ?? []).map(Number).includes(_.id) &&
                  conflictsOf(_, stateOf(_)).length > 0
              )
            ))(selected(set, decision.items)))(load(id)),
      reject: (id: number, decision: Decision): ChangeSetView =>
        ((set) =>
          transaction(
            () => (
              selected(set, decision.items).forEach(
                (_) =>
                  void proposals.decide(
                    _.id,
                    'rejected',
                    decision.reviewer,
                    now()
                  )
              ),
              viewOf(settle(set))
            )
          ))(load(id)),
      overlay: (id: number): Overlay =>
        ((pending) => ({
          pages: new Map(
            pending.flatMap((_) =>
              _.kind === 'page'
                ? [
                    [
                      _.pageId,
                      {
                        id: _.pageId,
                        created: _.delta.created,
                        changes: _.delta.changes as PageDraft['changes'],
                        fields: _.delta.fields as PageDraft['fields'],
                        ...('parentId' in _.delta
                          ? { parentId: _.delta.parentId ?? null }
                          : {}),
                      },
                    ] as const,
                  ]
                : []
            )
          ),
          elements: new Map(
            pending.flatMap((_) =>
              _.kind === 'element' && _.element !== 'script'
                ? [[`${_.element}/${_.name}`, _.source] as const]
                : []
            )
          ),
        }))(proposals.of(load(id).id).filter((_) => _.status === 'pending')),
      pending: (): number => proposals.pendingCount(),
    },
    links: {
      create: (input: {
        readonly target: LinkTarget;
        readonly label?: unknown;
        readonly days?: unknown;
        readonly by: { readonly id: number; readonly name: string };
      }): IssuedLink =>
        ((target, days, secret) =>
          ((id) => ({
            ...linkView(links.get(id)!),
            token: `${secret.selector}${secret.verifier}`,
          }))(
            (links.removeExpired(now()),
            links.add({
              selector: secret.selector,
              verifierHash: secrets.hash(secret.verifier),
              target,
              label: parseLabel(input.label),
              createdBy: input.by,
              createdAt: now(),
              expiresAt: expiresAt(clock(), days),
            }))
          ))(
          linkTarget(input.target),
          parseDays(input.days, settings.get().linkDays),
          secrets.issue()
        ),
      list: (target: Partial<LinkTarget> = {}): LinkView[] =>
        links.of(target).map(linkView),
      revoke: (id: number): void =>
        void (
          links.remove(Number(id)) ||
          fail('review.link_not_found', `There is no preview link ${id}`)
        ),
      /**
       * Ссылка по токену из адреса. Секрет сравнивается за постоянное время; частые и неверные поиски с
       * одного адреса — отказ `review.too_many_requests`. Нет, истекла, отозвана — null.
       */
      resolve: (token: string, client: string): LinkTarget | null =>
        ((at) =>
          !lookups.hit(client, _LOOKUPS.window, _LOOKUPS.max, at) ||
          misses.over(client, _MISSES.window, _MISSES.max, at)
            ? fail('review.too_many_requests', 'Too many preview requests')
            : ((parts) =>
                ((link) =>
                  // Неизвестный selector сравнивается с пустым хэшем: время ответа то же.
                  secrets.same(
                    secrets.hash(parts?.verifier ?? ''),
                    link?.verifierHash ?? ''
                  ) &&
                  link !== null &&
                  isLive(link, now())
                    ? (links.touch(link.id, now()), link.target)
                    : (misses.hit(client, _MISSES.window, _MISSES.max, at),
                      null))(parts ? links.bySelector(parts.selector) : null))(
                splitToken(token)
              ))(clock().getTime()),
    },
  };
};

export type ReviewService = ReturnType<typeof defineReviewService>;

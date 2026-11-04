import { fail } from '../../../shared/kernel/errors.ts';

/** Значение свойства страницы или поля в предложении: всё, что приходит в JSON правки. */
export type Value = string | number | boolean | null;

export type ElementKind = 'template' | 'component' | 'script';

/**
 * Что агент хочет сделать со страницей — итог всех его правок этой страницы в наборе. `created` —
 * страницы ещё нет: она появится с занятым впрок id, когда предложение примут.
 */
export type PageDelta = {
  readonly created: boolean;
  /** Свойства страницы: заголовки, адрес, шаблон, текст, вид… */
  readonly changes: Readonly<Record<string, Value>>;
  /** Значения полей; null снимает своё значение. */
  readonly fields: Readonly<Record<string, Value>>;
  /** Новый родитель; нет ключа — место в дереве прежнее. */
  readonly parentId?: number | null;
  readonly published?: boolean;
  readonly trashed?: boolean;
};

/**
 * Как было, когда агент впервые тронул каждое место страницы. Сравнение с нынешним говорит, правил ли
 * его кто-то с тех пор: это конфликт.
 */
export type PageBase = {
  readonly changes: Readonly<Record<string, Value>>;
  readonly fields: Readonly<Record<string, Value>>;
  readonly parentId?: number | null;
  readonly published?: boolean;
  readonly trashed?: boolean;
};

/** Нынешняя страница глазами предложения; null — её нет. */
export type PageState = {
  readonly changes: Readonly<Record<string, Value>>;
  readonly fields: Readonly<Record<string, Value>>;
  readonly parentId: number | null;
  readonly published: boolean;
  readonly trashed: boolean;
};

/** Нынешний элемент; null — такого нет. */
export type ElementState = {
  readonly revision: number;
  readonly source: string;
};

export type ElementBase = {
  /** null — элемента не было, предложение его создаёт. */
  readonly revision: number | null;
  readonly source: string | null;
};

export type PageProposal = {
  readonly kind: 'page';
  readonly pageId: number;
  readonly base: PageBase;
  readonly delta: PageDelta;
};

export type ElementProposal = {
  readonly kind: 'element';
  readonly element: ElementKind;
  readonly name: string;
  readonly base: ElementBase;
  readonly source: string;
};

export type ProposalBody = PageProposal | ElementProposal;

/** pending — ждёт решения; accepted, rejected — решил человек; withdrawn — агент забрал своё. */
export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

export type Proposal = ProposalBody & {
  readonly id: number;
  readonly setId: number;
  readonly status: ProposalStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly decidedAt: string | null;
  /** Кто решил; у отозванного — пусто. */
  readonly decidedBy: string;
  /** Последний отказ при попытке принять: виден человеку у предложения. */
  readonly error: string;
};

/** Вызов инструмента или API, который при проверке правок не применяется, а предлагается. */
export type Operation =
  | {
      readonly kind: 'page.create';
      readonly pageId: number;
      readonly changes: Readonly<Record<string, Value>>;
      readonly fields: Readonly<Record<string, Value>>;
      readonly parentId: number | null;
      readonly publish: boolean;
    }
  | {
      readonly kind: 'page.edit';
      readonly pageId: number;
      readonly changes: Readonly<Record<string, Value>>;
    }
  | {
      readonly kind: 'page.fields';
      readonly pageId: number;
      readonly fields: Readonly<Record<string, Value>>;
    }
  | {
      readonly kind: 'page.move';
      readonly pageId: number;
      readonly parentId: number | null;
    }
  | {
      readonly kind:
        | 'page.publish'
        | 'page.unpublish'
        | 'page.trash'
        | 'page.restore';
      readonly pageId: number;
    }
  | {
      readonly kind: 'element.save';
      readonly element: ElementKind;
      readonly name: string;
      readonly source: string;
    };

/** Цель предложения строкой: `page:5`, `element:component/Hero`. Одна цель — одно предложение в наборе. */
export var targetOf = (
  body: Pick<ProposalBody, 'kind'> & {
    readonly pageId?: number;
    readonly element?: ElementKind;
    readonly name?: string;
  }
): string =>
  body.kind === 'page'
    ? `page:${body.pageId}`
    : `element:${body.element}/${body.name}`;

export var operationTarget = (op: Operation): string =>
  op.kind === 'element.save'
    ? `element:${op.element}/${op.name}`
    : `page:${op.pageId}`;

const _same = (a: Value | undefined, b: Value | undefined): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Ключи, которых в базе ещё нет, — из нынешнего состояния: прежние остаются такими, какими агент их увидел.
const _remembered = (
  base: Readonly<Record<string, Value>>,
  keys: readonly string[],
  current: Readonly<Record<string, Value>> | undefined
): Readonly<Record<string, Value>> => ({
  ...Object.fromEntries(keys.map((_) => [_, current?.[_] ?? null] as const)),
  ...base,
});

const _EMPTY_BASE: PageBase = { changes: {}, fields: {} };

const _fresh = (pageId: number): PageProposal => ({
  kind: 'page',
  pageId,
  base: _EMPTY_BASE,
  delta: { created: false, changes: {}, fields: {} },
});

const _state =
  <K extends 'parentId' | 'published' | 'trashed'>(
    key: K,
    value: NonNullable<PageDelta[K]> | null
  ) =>
  (proposal: PageProposal, current: PageState | null): PageProposal => ({
    ...proposal,
    base:
      proposal.delta.created || key in proposal.base
        ? proposal.base
        : { ...proposal.base, [key]: current?.[key] ?? null },
    delta: { ...proposal.delta, [key]: value },
  });

type _PageOperation = Exclude<Operation, { kind: 'element.save' }>;

// Как каждая операция ложится на предложение страницы: правки сливаются, база запоминает первое.
const _FOLD: {
  readonly [K in _PageOperation['kind']]: (
    op: Extract<_PageOperation, { kind: K }>,
    proposal: PageProposal,
    current: PageState | null
  ) => PageProposal;
} = {
  'page.create': (op) => ({
    kind: 'page',
    pageId: op.pageId,
    base: _EMPTY_BASE,
    delta: {
      created: true,
      changes: op.changes,
      fields: op.fields,
      parentId: op.parentId,
      published: op.publish,
    },
  }),
  'page.edit': (op, proposal, current) => ({
    ...proposal,
    base: proposal.delta.created
      ? proposal.base
      : {
          ...proposal.base,
          changes: _remembered(
            proposal.base.changes,
            Object.keys(op.changes),
            current?.changes
          ),
        },
    delta: {
      ...proposal.delta,
      changes: { ...proposal.delta.changes, ...op.changes },
    },
  }),
  'page.fields': (op, proposal, current) => ({
    ...proposal,
    base: proposal.delta.created
      ? proposal.base
      : {
          ...proposal.base,
          fields: _remembered(
            proposal.base.fields,
            Object.keys(op.fields),
            current?.fields
          ),
        },
    delta: {
      ...proposal.delta,
      fields: { ...proposal.delta.fields, ...op.fields },
    },
  }),
  'page.move': (op, proposal, current) =>
    _state('parentId', op.parentId)(proposal, current),
  'page.publish': (_op, proposal, current) =>
    _state('published', true)(proposal, current),
  'page.unpublish': (_op, proposal, current) =>
    _state('published', false)(proposal, current),
  'page.trash': (_op, proposal, current) =>
    _state('trashed', true)(proposal, current),
  'page.restore': (_op, proposal, current) =>
    _state('trashed', false)(proposal, current),
};

/**
 * Операция агента поверх его прежнего предложения той же цели (или с нуля). Правка страницы, которой
 * нет и которую не предложили создать, — отказ: агент ошибся в id.
 */
export var foldPage = (
  op: _PageOperation,
  previous: PageProposal | null,
  current: PageState | null
): PageProposal =>
  op.kind !== 'page.create' && previous === null && current === null
    ? fail('content.page_not_found', `Page ${op.pageId} not found`)
    : _FOLD[op.kind](op as never, previous ?? _fresh(op.pageId), current);

export var foldElement = (
  op: Extract<Operation, { kind: 'element.save' }>,
  previous: ElementProposal | null,
  current: ElementState | null
): ElementProposal => ({
  kind: 'element',
  element: op.element,
  name: op.name,
  base: previous?.base ?? {
    revision: current?.revision ?? null,
    source: current?.source ?? null,
  },
  source: op.source,
});

// Конфликт — место правили после того, как агент его увидел, и не так, как предлагает он сам.
const _clash = (
  base: Value | undefined,
  current: Value | undefined,
  proposed: Value | undefined
): boolean => !_same(base, current) && !_same(current, proposed);

const _STATE_KEYS = ['parentId', 'published', 'trashed'] as const;

/** Что в предложении столкнулось с правками после него: ключи страницы, `fields.имя`, `source`, `missing`. */
export var conflictsOf = (
  proposal: ProposalBody,
  current: PageState | ElementState | null
): string[] =>
  proposal.kind === 'element'
    ? ((now) =>
        (now?.revision ?? null) !== proposal.base.revision &&
        (now?.source ?? null) !== proposal.source
          ? ['source']
          : [])(current as ElementState | null)
    : proposal.delta.created
      ? []
      : ((now) =>
          now === null
            ? ['missing']
            : [
                ...Object.keys(proposal.delta.changes).filter((_) =>
                  _clash(
                    proposal.base.changes[_],
                    now.changes[_],
                    proposal.delta.changes[_]
                  )
                ),
                ...Object.keys(proposal.delta.fields)
                  .filter((_) =>
                    _clash(
                      proposal.base.fields[_],
                      now.fields[_],
                      proposal.delta.fields[_]
                    )
                  )
                  .map((_) => `fields.${_}`),
                ..._STATE_KEYS.filter(
                  (_) =>
                    _ in proposal.delta &&
                    _clash(proposal.base[_], now[_], proposal.delta[_])
                ),
              ])(current as PageState | null);

/** Что предложение делает — метки для списка: created, edited, fields, moved, published… */
export var operationsOf = (proposal: ProposalBody): string[] =>
  proposal.kind === 'element'
    ? [proposal.base.revision === null ? 'created' : 'changed']
    : [
        ...(proposal.delta.created ? ['created'] : []),
        ...(!proposal.delta.created &&
        Object.keys(proposal.delta.changes).length > 0
          ? ['edited']
          : []),
        ...(!proposal.delta.created &&
        Object.keys(proposal.delta.fields).length > 0
          ? ['fields']
          : []),
        ...(!proposal.delta.created && 'parentId' in proposal.delta
          ? ['moved']
          : []),
        ...(proposal.delta.published === true ? ['published'] : []),
        ...(proposal.delta.published === false && !proposal.delta.created
          ? ['unpublished']
          : []),
        ...(proposal.delta.trashed === true ? ['trashed'] : []),
        ...(proposal.delta.trashed === false ? ['restored'] : []),
      ];

/**
 * Порядок применения: элементы раньше страниц (компонент — раньше шаблона, который его импортирует),
 * новые страницы — раньше правок, родитель — раньше детей.
 */
export var applyOrder = <T extends ProposalBody & { readonly id: number }>(
  proposals: readonly T[]
): T[] => {
  const created = new Map(
    proposals.flatMap((_) =>
      _.kind === 'page' && _.delta.created ? [[_.pageId, _] as const] : []
    )
  );
  const depth = (proposal: T, seen = 0): number =>
    proposal.kind !== 'page' || seen > created.size
      ? 0
      : ((parent) => (parent ? 1 + depth(parent, seen + 1) : 0))(
          created.get(Number(proposal.delta.parentId))
        );
  const _RANK: Readonly<Record<string, number>> = {
    script: 0,
    component: 1,
    template: 2,
  };
  const rank = (proposal: T): number =>
    proposal.kind === 'element'
      ? (_RANK[proposal.element] ?? 0)
      : proposal.delta.created
        ? 10 + depth(proposal)
        : 1000;
  return proposals.toSorted((a, b) => rank(a) - rank(b) || a.id - b.id);
};

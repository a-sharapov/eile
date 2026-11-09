import { type Changed, chain } from '../../../shared/kernel/changed.ts';
import { attempt, fail } from '../../../shared/kernel/errors.ts';
import type { EventBus } from '../../../shared/kernel/events.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import {
  type Address,
  type AddressNode,
  type AddressStyle,
  addressClash,
  addressEnding,
  branchAddresses,
  PLAIN_ADDRESS,
  rivalAliases,
} from '../domain/address.ts';
import { aliasFromTitle, parseAlias } from '../domain/alias.ts';
import type { ContentEvent } from '../domain/events.ts';
import {
  createField,
  type Field,
  type FieldName,
  type NewField,
  parseFieldName,
  removeField,
} from '../domain/field.ts';
import type { FieldRepository } from '../domain/field-repository.ts';
import { mediaReferences } from '../domain/media-references.ts';
import type { OldPathRepository } from '../domain/old-path-repository.ts';
import {
  applySchedule,
  createPage,
  editPage,
  type FieldValues,
  type Moment,
  movePage,
  type NewPage,
  type Page,
  type PageChange,
  type PageChanges,
  type PageId,
  parsePageId,
  publishPage,
  restorePage,
  setFields,
  trashPage,
  unpublishPage,
} from '../domain/page.ts';
import type { PageRepository } from '../domain/page-repository.ts';
import {
  type Author,
  changesBetween,
  type Edit,
  planRevision,
  type Revision,
  type RevisionAction,
  type RevisionPlan,
  restoreChanges,
  retained,
  snapshotOf,
} from '../domain/revision.ts';
import type {
  RevisionRepository,
  RevisionSummary,
} from '../domain/revision-repository.ts';
import type {
  DraftContent,
  PageView,
  PublishedContent,
} from './published-content.ts';

export type CreatePageInput = Omit<NewPage, 'parentId'> & {
  readonly parentId?: number | null;
  readonly publish?: boolean;
  readonly fields?: FieldValues;
};

export type Clock = () => Date;

/**
 * Страница, какой она станет после предложенной правки, — без записи и событий (ADR 0054). `created` —
 * страницы ещё нет: id занят впрок, всё о ней — в `changes`, `parentId` и `fields`.
 */
export type PageDraft = {
  readonly id: number;
  readonly created?: boolean;
  readonly changes?: PageChanges;
  readonly fields?: FieldValues;
  readonly parentId?: number | null;
};

/** Что вернуть из версии: поля страницы и значения полей; менеджер может их поправить (чистка HTML). */
export type RestoreInput = {
  readonly changes: PageChanges;
  readonly fields: FieldValues;
};

export type RestoreOptions = {
  readonly author?: Author | null;
  readonly prepare?: (input: RestoreInput) => RestoreInput;
};

// Правки, после которых у страницы или её ветки другой адрес: прежний запоминается для 301.
const _ADDRESS_KEYS = ['alias', 'folder', 'aliasInPath'] as const;

const _removed = (pageId: PageId, parentId: PageId | null): ContentEvent => ({
  type: 'content.page_removed',
  pageId,
  parentId,
});

/** Ссылка на страницу в ответах «где используется»; страница из корзины тоже держит элемент. */
export type PageRef = {
  readonly id: number;
  readonly title: string;
  readonly trashed: boolean;
};

const _ref = (page: Page): PageRef => ({
  id: page.id,
  title: page.title,
  trashed: page.trashedAt !== null,
});

const _escaped = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Дата публикации из другой CMS: только настоящая дата, в ISO UTC; иначе — момент переноса.
const _published = (raw: string | null | undefined): string | null =>
  raw && !Number.isNaN(new Date(raw).getTime())
    ? new Date(raw).toISOString()
    : null;

// Тег компонента в тексте: [[Name]] или [[Name параметры]], но не [[NameOther]].
const _componentTag = (name: string): RegExp =>
  new RegExp(`\\[\\[${_escaped(name)}(?![A-Za-z0-9])`);

// Скрытый тег `[#Form:name hidden]` — тоже место формы: блок лежит в тексте.
const _moduleTag = (module: string, name: string): RegExp =>
  new RegExp(`\\[#${_escaped(module)}:${_escaped(name)}(?:\\s+hidden)?\\]`);

export var defineContentService = ({
  pages,
  fields,
  oldPaths,
  revisions,
  published,
  drafts,
  bus,
  clock,
  siteLanguage = () => '',
  addressStyle = () => PLAIN_ADDRESS,
}: {
  pages: PageRepository;
  fields: FieldRepository;
  oldPaths: OldPathRepository;
  revisions: RevisionRepository;
  published: PublishedContent;
  drafts: DraftContent;
  bus: EventBus;
  clock: Clock;
  /** Язык сайта — язык веток без своего: по нему алиас из заголовка. */
  siteLanguage?: () => string;
  /** Стиль адресов сайта: окончание адреса папки и документа (ADR 0063). */
  addressStyle?: () => AddressStyle;
}) => {
  // undefined — ближайший момент расписания ещё не считан из базы.
  let nextScheduled: Moment | null | undefined;

  const now = (): Moment => clock().toISOString();

  const publishEvents = <S>(change: Changed<S, ContentEvent>): S => (
    change.events.forEach(bus.publish), change.state
  );

  const load = (id: number): Page =>
    pages.get(parsePageId(id)) ??
    fail('content.page_not_found', `Page ${id} not found`);

  /** Язык ветки под этим родителем: ближайший предок со своим языком, иначе язык сайта. */
  const branchLanguage = (parentId: number | null): string =>
    parentId === null
      ? siteLanguage()
      : ((parent) => parent.language || branchLanguage(parent.parentId))(
          load(parentId)
        );

  const lineage = (parentId: number | null): PageId[] =>
    parentId === null
      ? []
      : [load(parentId).id, ...pages.ancestors(parsePageId(parentId))];

  const assertAliasFree = (change: PageChange): PageChange => {
    const sibling = pages.findSibling(
      change.state.parentId,
      change.state.alias
    );
    return sibling && sibling.id !== change.state.id
      ? fail(
          'content.alias_taken',
          `Alias "${change.state.alias}" is already used by page ${sibling.id}`
        )
      : change;
  };

  // Адрес страницы и ветки под ней меняют алиас, родитель, флаг алиаса в адресе и возврат из корзины;
  // флаг папки — только окончание её собственного адреса.
  const _MOVES_BRANCH = [
    'alias',
    'parentId',
    'aliasInPath',
    'trashedAt',
  ] as const;

  const addressedNode = (page: Page): AddressNode => ({
    id: page.id,
    parentId: page.parentId,
    alias: page.alias,
    folder: page.folder,
    aliasInPath: page.aliasInPath,
  });

  // Чужие страницы, чей адрес может совпасть с адресами ветки: те же алиасы и их варианты с суффиксом.
  const rivalsOf = (mine: readonly AddressNode[]): Address[] =>
    ((style, own) =>
      pages
        .withAliases([
          ...new Set(mine.flatMap((_) => rivalAliases(_.alias, style))),
        ])
        .filter((_) => !own.has(_.node.id))
        .map((_) => ({
          id: _.node.id,
          key: _.key,
          url: `${_.key}${addressEnding(_.node, style)}`,
        })))(addressStyle(), new Set(mine.map((_) => _.id)));

  /**
   * Адрес страницы и её ветки не должен совпасть с чужим ни ключом, ни самим адресом: со скрытым из адреса
   * алиасом (`aliasInPath`) соседями по адресу становятся страницы из разных веток.
   */
  const assertAddressFree = (change: PageChange): PageChange => {
    const page = change.state;
    const before = pages.get(page.id);
    const trail = page.parentId === null ? '' : pages.trail(page.parentId);
    const moved =
      before === null ||
      before.folder !== page.folder ||
      _MOVES_BRANCH.some((_) => before[_] !== page[_]);
    const nodes =
      before !== null && _MOVES_BRANCH.some((_) => before[_] !== page[_])
        ? [addressedNode(page), ...pages.descendants(page.id)]
        : [addressedNode(page)];
    const clash =
      page.trashedAt !== null || trail === null || !moved
        ? null
        : addressClash(
            branchAddresses(nodes[0]!, nodes.slice(1), trail, addressStyle()),
            rivalsOf(nodes)
          );
    return clash === null
      ? change
      : fail(
          'content.address_taken',
          clash.page === page.id
            ? `Address "${clash.url}" is already used by page ${clash.other}`
            : `Address "${clash.url}" of page ${clash.page} is already used by page ${clash.other}`
        );
  };

  /**
   * Связь с исходной страницей: перевод перевода указывает на ту же исходную, а страница со своими
   * переводами сама переводом не становится — иначе набор распался бы на цепочку.
   */
  const linkTranslation = <T extends PageChanges>(
    changes: T,
    pageId: number | null
  ): T =>
    changes.translationOf === undefined || changes.translationOf === null
      ? changes
      : ((target) =>
          target === null
            ? fail(
                'content.translation_not_found',
                `Page ${changes.translationOf} not found`
              )
            : ((hub) =>
                hub === pageId
                  ? fail(
                      'content.invalid_translation',
                      'A page cannot be a translation of itself'
                    )
                  : pageId !== null &&
                      pages.translationsOf(parsePageId(pageId)).length > 0
                    ? fail(
                        'content.translation_has_translations',
                        'This page has translations of its own: link them to the other page'
                      )
                    : { ...changes, translationOf: hub })(
                target.translationOf ?? target.id
              ))(pages.get(parsePageId(changes.translationOf)));

  const store = pipe(
    (_: PageChange) => (_.state.trashedAt === null ? assertAliasFree(_) : _),
    assertAddressFree,
    (_: PageChange) => (pages.save(_.state), (nextScheduled = undefined), _),
    publishEvents,
    (_: Page) => _.id
  );

  // План истории → запись; после добавления или слияния — только версии, что влезают в бюджет.
  const _RECORD: {
    readonly [K in RevisionPlan['kind']]: (
      plan: Extract<RevisionPlan, { kind: K }>
    ) => PageId | null;
  } = {
    none: () => null,
    add: (_) => (revisions.add(_.revision), _.revision.pageId),
    merge: (_) => (revisions.update(_.revision), _.revision.pageId),
    drop: (_) => (revisions.remove(_.id), null),
  };

  const record = (plan: RevisionPlan): void =>
    ((pageId) =>
      void (
        pageId !== null &&
        revisions.keepOnly(pageId, retained(revisions.list(pageId)))
      ))(_RECORD[plan.kind](plan as never));

  // Публикация, перенос, порядок в меню историю не трогают — и не стоят ни одного запроса к ней.
  const remember = (edit: Omit<Edit, 'createdAt'>): void =>
    void (
      changesBetween(snapshotOf(edit.before), snapshotOf(edit.after)).length >
        0 &&
      record(
        planRevision(revisions.latest(edit.before.id), {
          ...edit,
          createdAt: pages.createdAt(edit.before.id),
        })
      )
    );

  /**
   * Переход над страницей и запись: прежнее состояние уходит в историю, если изменилось то, что она
   * помнит (текст, заголовки, адрес, шаблон, поля), — а не публикация, место в дереве или расписание.
   */
  const apply =
    (
      transition: (page: Page) => PageChange,
      author: Author | null = null,
      action: RevisionAction = 'edited',
      restoredFrom: Moment | null = null
    ) =>
    (id: number): PageId =>
      ((before: Page) =>
        ((change: PageChange) =>
          ((saved: PageId) => (
            remember({
              before,
              after: change.state,
              action,
              author,
              at: now(),
              restoredFrom,
            }),
            saved
          ))(store(change)))(transition(before)))(load(id));

  const withFields = (values: FieldValues | undefined) =>
    values === undefined
      ? (_: PageChange) => _
      : chain(setFields(fields.all(), values));

  // Занятый впрок id (предложение агента) — только свободный и не новее последнего выданного.
  const reservedId = (id: number): PageId =>
    ((parsed) =>
      pages.get(parsed) || parsed > pages.lastId()
        ? fail('content.invalid_page_id', `Page id ${id} is not reserved`)
        : parsed)(parsePageId(id));

  /**
   * Как в Evo: у страницы появилась дочерняя — она становится папкой. Флаг сам не снимается: у папки
   * может не быть детей (разделы-города Evo). Прежний адрес (`/o-nas.html` → `/o-nas/`) ведёт на новый.
   */
  const asFolder = (parentId: PageId | null): void =>
    void (
      parentId !== null &&
      !load(parentId).folder &&
      keepingOldPaths(parentId, () =>
        apply(editPage({ folder: true }))(parentId)
      )
    );

  /** `reserved` — id, занятый `reserveId` для предложенной агентом страницы. */
  const create = (input: CreatePageInput, reserved?: number): PageId =>
    pipe(
      (_: CreatePageInput) =>
        ((parentId) =>
          createPage(
            reserved === undefined ? pages.nextId() : reservedId(reserved),
            { ...linkTranslation(_, null), parentId },
            branchLanguage(parentId)
          ))((_.parentId ?? null) === null ? null : load(_.parentId!).id),
      withFields(input.fields),
      (_: PageChange) => (input.publish ? chain(publishPage(now()))(_) : _),
      store,
      (_: PageId) => (asFolder(load(_).parentId), _)
    )(input);

  // Перенос с другой CMS: id сохраняются, чтобы старые ссылки `[~5~]` вели туда же; дата публикации —
  // прежняя, иначе лента записей встала бы по дате переноса.
  const importPage = (
    id: number,
    input: CreatePageInput & {
      readonly trashed?: boolean;
      readonly publishedAt?: string | null;
    }
  ): PageId =>
    pipe(
      (_: number) =>
        pages.get(parsePageId(_))
          ? fail('content.page_exists', `Page ${_} already exists`)
          : parsePageId(_),
      (_: PageId) =>
        createPage(_, {
          ...input,
          parentId:
            (input.parentId ?? null) === null ? null : load(input.parentId!).id,
        }),
      withFields(input.fields),
      (_: PageChange) =>
        input.publish
          ? chain(publishPage(_published(input.publishedAt) ?? now()))(_)
          : _,
      (_: PageChange) => (input.trashed ? chain(trashPage(now()))(_) : _),
      store
    )(id);

  // Свободный у соседей алиас: `o-proekte-kopiya`, затем `-2`, `-3`… — копия не должна падать на занятом.
  const freeAlias = (parentId: PageId | null, base: string, n = 1): string =>
    ((alias) =>
      pages.findSibling(parentId, parseAlias(alias)) && n < 1000
        ? freeAlias(parentId, base, n + 1)
        : alias)(n === 1 ? base : `${base.slice(0, 120)}-${n}`);

  /** Копия страницы рядом с оригиналом: неопубликованная, со своими значениями полей, без ветки. */
  const duplicate = (id: number, title?: string): PageId => {
    const page = load(id);
    const copyTitle = title?.trim() || page.title;
    return create({
      parentId: page.parentId,
      kind: page.kind,
      title: copyTitle,
      longTitle: page.longTitle,
      menuTitle: page.menuTitle,
      description: page.description,
      introText: page.introText,
      alias: freeAlias(
        page.parentId,
        aliasFromTitle(
          copyTitle,
          page.language || branchLanguage(page.parentId)
        )
      ),
      folder: page.folder,
      aliasInPath: page.aliasInPath,
      template: page.template,
      contentType: page.contentType,
      content: page.content,
      linkTo: page.linkTo,
      menuIndex: page.menuIndex,
      hiddenFromMenu: page.hiddenFromMenu,
      cacheable: page.cacheable,
      fields: page.fields,
    });
  };

  const move = (id: number, parentId: number | null): PageId =>
    ((moved) => (asFolder(load(moved).parentId), moved))(
      keepingOldPaths(id, () =>
        apply(
          movePage(
            parentId === null ? null : parsePageId(parentId),
            lineage(parentId)
          )
        )(id)
      )
    );

  const siblingsOf = (parentId: number | null): number[] =>
    drafts
      .tree()
      .filter((_) => _.parentId === parentId && !_.trashed)
      .map((_) => _.id);

  // Порядок в меню — позиция среди соседей; меняются только те, чей номер сдвинулся.
  const reorder = (ids: readonly number[]): void =>
    ids.forEach(
      (id, index) =>
        void (
          load(id).menuIndex === index ||
          apply(editPage({ menuIndex: index }))(id)
        )
    );

  /** Ставит страницу к родителю на место `index` среди соседей — перетаскивание в дереве. */
  const place = (
    id: number,
    parentId: number | null,
    index: number
  ): PageId => {
    const page = load(id);
    void (
      page.parentId === (parentId === null ? null : parsePageId(parentId)) ||
      move(id, parentId)
    );
    const others = siblingsOf(parentId).filter((_) => _ !== page.id);
    const at = Math.max(0, Math.min(index, others.length));
    reorder([...others.slice(0, at), page.id, ...others.slice(at)]);
    return page.id;
  };

  // Ветка страницы и её адреса — до и после правки, которая может их сменить.
  const branchOf = (id: number): number[] =>
    ((nodes) => {
      const walk = (at: number): number[] => [
        at,
        ...nodes.filter((_) => _.parentId === at).flatMap((_) => walk(_.id)),
      ];
      return walk(id);
    })(drafts.tree());

  const pathsOf = (ids: readonly number[]): ReadonlyMap<number, string> =>
    new Map(
      ids
        .map((_) => [_, drafts.view(_)?.path ?? null] as const)
        .filter((_): _ is readonly [number, string] => _[1] !== null)
    );

  /** Смена алиаса или родителя: прежние адреса ветки запоминаются и ведут на страницы 301-й переадресацией. */
  const keepingOldPaths = (id: number, run: () => PageId): PageId => {
    const ids = branchOf(id);
    const before = pathsOf(ids);
    const result = run();
    const after = pathsOf(ids);
    const at = now();
    after.forEach((path) => void oldPaths.remove(path));
    before.forEach(
      (path, pageId) =>
        void (
          after.has(pageId) &&
          after.get(pageId) !== path &&
          oldPaths.save(path, parsePageId(pageId), at)
        )
    );
    return result;
  };

  const remove = (id: PageId): void => {
    const parentId = pages.get(id)?.parentId ?? null;
    branchOf(id).forEach((_) => void oldPaths.removeOf(parsePageId(_)));
    pages.remove(id);
    bus.publish(_removed(id, parentId));
  };

  const applyDue = (at: Moment): number =>
    pages.due(at).map((_) => apply(applySchedule(at))(_)).length;

  const revisionOf = (pageId: number, revisionId: number): Revision =>
    ((revision) =>
      revision && revision.pageId === load(pageId).id
        ? revision
        : fail(
            'content.revision_not_found',
            `Page ${pageId} has no revision ${revisionId}`
          ))(revisions.get(revisionId));

  /**
   * Возврат к версии одной правкой: нынешнее состояние уходит в историю новой версией (а не сливается с
   * прежней), страница получает текст, адрес, шаблон и поля версии; события сбрасывают кэш как обычно.
   */
  const restoreRevision = (
    pageId: number,
    revisionId: number,
    { author = null, prepare = (_) => _ }: RestoreOptions = {}
  ): PageId =>
    ((revision) =>
      ((input) =>
        keepingOldPaths(pageId, () =>
          apply(
            (page: Page) =>
              chain(setFields(fields.all(), input.fields))(
                editPage(input.changes)(page)
              ),
            author,
            'restored',
            revision.at
          )(pageId)
        ))(
        prepare(restoreChanges(revision.snapshot, load(pageId), fields.all()))
      ))(revisionOf(pageId, revisionId));

  // Язык ветки предпросмотра: родителя может ещё не быть — он сам предложен в том же наборе.
  const draftLanguage = (parentId: number | null): string =>
    attempt(
      () => branchLanguage(parentId),
      () => siteLanguage()
    );

  const simulate = (draft: PageDraft): PageView =>
    ((parentId) =>
      pipe(
        (_: PageDraft) =>
          _.created
            ? createPage(
                parsePageId(_.id),
                {
                  ...(_.changes as NewPage),
                  parentId: parentId === null ? null : parsePageId(parentId),
                },
                draftLanguage(parentId)
              )
            : editPage(_.changes ?? {}, draftLanguage(parentId))(load(_.id)),
        withFields(draft.fields),
        (_: PageChange) =>
          drafts.viewOf({
            ..._.state,
            parentId: parentId === null ? null : parsePageId(parentId),
          })
      )(draft))(
      draft.parentId !== undefined
        ? draft.parentId
        : draft.created
          ? null
          : load(draft.id).parentId
    );

  const runDue = (): number => {
    const at = now();
    nextScheduled =
      nextScheduled === undefined ? pages.nextScheduledAt() : nextScheduled;
    return nextScheduled !== null && nextScheduled <= at ? applyDue(at) : 0;
  };

  return {
    pages: {
      create,
      /** Занять id для страницы, которую предложил агент: её создадут с ним, когда примут. */
      reserveId: (): PageId => pages.reserve(),
      simulate,
      /** `author` — кто правит: его имя увидит история; без него правка — от сайта. */
      edit: (
        id: number,
        changes: PageChanges,
        author: Author | null = null
      ): PageId =>
        ((linked) =>
          ((transition) =>
            _ADDRESS_KEYS.every((_) => linked[_] === undefined)
              ? apply(transition, author)(id)
              : keepingOldPaths(id, () => apply(transition, author)(id)))(
            (page: Page) =>
              editPage(linked, branchLanguage(page.parentId))(page)
          ))(linkTranslation(changes, id)),
      publish: (id: number): PageId => apply(publishPage(now()))(id),
      unpublish: apply(unpublishPage),
      move,
      setFields: (
        id: number,
        values: FieldValues,
        author: Author | null = null
      ): PageId => apply(setFields(fields.all(), values), author)(id),
      trash: (id: number): PageId => apply(trashPage(now()))(id),
      restore: apply(restorePage),
      duplicate,
      place,
      /** Прежние адреса страницы — для менеджера. */
      oldPaths: (id: number): string[] => oldPaths.of(parsePageId(id)),
      forgetOldPath: (path: string): void => oldPaths.remove(path),
      /** Прежние адреса всех страниц: с них сайт сам отвечает 301 на новые. */
      allOldPaths: () => oldPaths.all(),
      /** Страница, которая раньше жила по этому адресу; null — такого адреса не было. */
      movedFrom: (path: string): number | null => oldPaths.pageFor(path),
      import: importPage,
    },
    trash: {
      /** Удаляет навсегда страницы из корзины вместе с их ветками; id не освобождаются. */
      empty: (): number =>
        pipe(
          () => pages.trashed(),
          (_: PageId[]) => (
            _.forEach(remove), (nextScheduled = undefined), _.length
          )
        )(),
    },
    schedule: {
      /** Применяет наступившие публикации и снятия; без них стоит одно сравнение строк. */
      runDue,
    },
    revisions: {
      /** История страницы без снимков, новые первыми. */
      list: (pageId: number): RevisionSummary[] =>
        revisions.list(load(pageId).id),
      get: revisionOf,
      restore: restoreRevision,
      /** Что вернёт возврат к версии — для предложения агента, без записи. */
      changes: (pageId: number, revisionId: number): RestoreInput =>
        restoreChanges(
          revisionOf(pageId, revisionId).snapshot,
          load(pageId),
          fields.all()
        ),
    },
    fields: {
      save: (input: NewField): FieldName =>
        pipe(
          createField,
          (_: Changed<Field, ContentEvent>) => (fields.save(_.state), _),
          publishEvents,
          (_: Field) => _.name
        )(input),
      list: (): readonly Field[] => fields.all(),
      /** Сколько страниц хранят своё значение: столько потеряют его при удалении. */
      usage: (name: string): number => fields.usage(parseFieldName(name)),
      remove: (name: string): void =>
        pipe(
          parseFieldName,
          (_: FieldName) =>
            fields.get(_) ??
            fail('content.field_not_found', `There is no field "${_}"`),
          removeField,
          (_: Changed<Field, ContentEvent>) => (fields.remove(_.state.name), _),
          (_: Changed<Field, ContentEvent>) => void publishEvents(_)
        )(name),
    },
    usage: {
      /** Страницы с шаблоном: пока они есть, шаблон не удалить. */
      template: (name: string): PageRef[] =>
        pages.withTemplate(name).map(load).map(_ref),
      /** Страницы, в тексте которых есть тег [[Name …]]. */
      component: (name: string): PageRef[] =>
        pages
          .mentioning(`[[${name}`)
          .map(load)
          .filter((_) => _componentTag(name).test(_.content))
          .map(_ref),
      /** Страницы, в тексте которых есть тег модуля [#Module:name] — например, форма. */
      module: (module: string, name: string): PageRef[] =>
        pages
          .mentioning(`[#${module}:${name}`)
          .map(load)
          .filter((_) => _moduleTag(module, name).test(_.content))
          .map(_ref),
      /**
       * Страницы, где лежит файл медиатеки: в тексте, в полях или картинкой для соцсетей. `original` — исходный
       * путь файла связанной папки (`assets/images/4a_(5).jpg`): перенесённый текст ссылается на него.
       */
      media: (path: string, original?: string): PageRef[] =>
        pages.referencingMedia(path, original).map(load).map(_ref),
      /** Пути файлов, что встречаются в текстах и полях страниц, — для проверки тысяч файлов разом. */
      mediaReferences: (): ReadonlySet<string> =>
        mediaReferences(pages.texts()),
    },
    published,
    drafts: {
      tree: drafts.tree,
      view: drafts.view,
      translations: drafts.translations,
      page: (id: number): Page => load(id),
    },
    isEmpty: (): boolean => pages.count() === 0,
  };
};

export type ContentService = ReturnType<typeof defineContentService>;

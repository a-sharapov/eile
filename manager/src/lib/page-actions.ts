import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { api } from './api.ts';
import { isHtml } from './content-types.ts';
import { ask, askValue } from './dialog.svelte.ts';
import { moment } from './format.ts';
import { quoted, t } from './i18n.ts';
import { failed, notify } from './notices.svelte.ts';
import {
  branchOrder,
  childrenOf,
  clearSelection,
  descendantsOf,
  isWithin,
  loadTree,
  markChanged,
} from './tree.svelte.ts';
import type { PageNode } from './types.ts';

// Действия над страницей из дерева и его меню; каждое необратимое на вид — с «Вернуть».

const _place = (id: number, parentId: number | null, index: number) =>
  api.send('POST', `/pages/${id}/place`, { parentId, index });

const _done = (id: number) => loadTree().then(() => markChanged(id));

const _positionOf = (node: PageNode): number =>
  childrenOf(node.parentId).findIndex((_) => _.id === node.id);

const _move = (
  node: PageNode,
  parentId: number | null,
  index: number,
  from: { parentId: number | null; index: number }
): Promise<void> =>
  _place(node.id, parentId, index)
    .then(() => _done(node.id))
    .then(() =>
      notify(`${t('tree.moved')}: ${quoted(node.title)}`, 'ok', {
        label: t('common.undo'),
        run: () =>
          _place(node.id, from.parentId, from.index)
            .then(() => _done(node.id))
            .then(undefined, failed),
      })
    )
    .then(undefined, failed);

/** Ставит страницу к родителю на место `index` среди остальных соседей. */
export var placePage = (
  node: PageNode,
  parentId: number | null,
  index: number
): Promise<void> => {
  const from = { parentId: node.parentId, index: _positionOf(node) };
  // Бросили туда же, где страница и была: ничего не переносим и не сообщаем о переносе.
  return parentId === from.parentId && index === from.index
    ? Promise.resolve()
    : _move(node, parentId, index, from);
};

/** Выше или ниже среди соседей. */
export var shiftPage = (node: PageNode, by: -1 | 1): Promise<void> =>
  placePage(node, node.parentId, _positionOf(node) + by);

export var duplicatePage = (node: PageNode): Promise<void> =>
  api
    .send<{ id: number }>('POST', `/pages/${node.id}/duplicate`, {
      title: `${node.title} ${t('tree.copySuffix')}`,
    })
    .then((_) =>
      loadTree().then(() =>
        goto(resolve('/(app)/pages/[id]', { id: String(_.id) }), {
          state: { focusTitle: true },
        })
      )
    )
    .then(() => notify(t('tree.duplicated')))
    .then(undefined, failed);

/** Публикация впереди по расписанию: «Опубликовать» выпустит страницу раньше срока. */
export var isScheduledAhead = (node: PageNode): boolean =>
  !node.published &&
  node.publishAt !== null &&
  Date.parse(node.publishAt) > Date.now();

// Как в редакторе: раньше срока — только после вопроса с исходной датой.
const _confirmPublish = (
  node: PageNode,
  published: boolean
): Promise<boolean> =>
  published && isScheduledAhead(node)
    ? ask({
        title: t('page.publishNowTitle'),
        body: t('page.publishNowBody', { when: moment(node.publishAt!) }),
        confirm: t('page.publishNow'),
      })
    : Promise.resolve(true);

export var setPublished = (node: PageNode, published: boolean): Promise<void> =>
  _confirmPublish(node, published)
    .then((confirmed) =>
      confirmed
        ? api
            .send(
              'POST',
              `/pages/${node.id}/${published ? 'publish' : 'unpublish'}`
            )
            .then(() => _done(node.id))
            .then(() =>
              notify(
                t(published ? 'page.publishedNotice' : 'page.unpublishedNotice')
              )
            )
        : undefined
    )
    .then(undefined, failed);

/** Раздел уходит в корзину целой веткой: если вложенные есть, сначала спрашиваем и перечисляем их. */
export var confirmBranchTrash = (node: PageNode): Promise<boolean> =>
  ((branch) =>
    branch.length === 0
      ? Promise.resolve(true)
      : ask({
          title: t('page.trashBranchTitle'),
          body: t('page.trashBranchBody', { n: branch.length }),
          items: [
            node.title,
            ...branch.slice(0, 8).map((_) => `↳ ${_.title} (${_.id})`),
            ...(branch.length > 8
              ? [t('common.andMore', { n: branch.length - 8 })]
              : []),
          ],
          confirm: t('page.toTrash'),
          tone: 'danger',
        }))(descendantsOf(node.id).filter((_) => !_.trashed));

const trashNow = (node: PageNode): Promise<void> =>
  api
    .send('POST', `/pages/${node.id}/trash`)
    .then(() => _done(node.id))
    .then(() =>
      notify(t('page.trashedNotice'), 'ok', {
        label: t('common.undo'),
        run: () =>
          api
            .send('POST', `/pages/${node.id}/restore`)
            .then(() => _done(node.id))
            .then(undefined, failed),
      })
    )
    .then(undefined, failed);

export var trashPage = (node: PageNode): Promise<void> =>
  confirmBranchTrash(node).then((confirmed) =>
    confirmed ? trashNow(node) : undefined
  );

// Действия с выбранными страницами — по одной, по порядку: сервер проверяет каждую как обычно.
const _each = <T>(
  items: readonly T[],
  run: (item: T) => Promise<unknown>
): Promise<unknown> =>
  items.reduce<Promise<unknown>>(
    (done, item) => done.then(() => run(item)),
    Promise.resolve()
  );

// Ветка переносится и уходит в корзину целиком: выбранные внутри выбранной ветки — вместе с ней.
const _tops = (nodes: readonly PageNode[]): PageNode[] =>
  nodes.filter(
    (node) =>
      !nodes.some(
        (other) => other.id !== node.id && isWithin(node.id, other.id)
      )
  );

const _finish = (text: string, undo?: () => Promise<unknown>) =>
  loadTree().then(
    () => (
      clearSelection(),
      notify(
        text,
        'ok',
        undo && {
          label: t('common.undo'),
          run: () => undo().then(loadTree).then(undefined, failed),
        }
      )
    )
  );

const _titles = (nodes: readonly PageNode[]): string[] => [
  ...nodes.slice(0, 8).map((_) => `${_.title} (${_.id})`),
  ...(nodes.length > 8 ? [t('common.andMore', { n: nodes.length - 8 })] : []),
];

/** Опубликовать или снять разом; запланированные на будущее — только после вопроса. */
export var publishMany = (
  nodes: readonly PageNode[],
  published: boolean
): Promise<void> =>
  ((changing) =>
    (published && changing.some(isScheduledAhead)
      ? ask({
          title: t('page.publishNowTitle'),
          body: t('bulk.publishNowBody'),
          items: _titles(changing.filter(isScheduledAhead)),
          confirm: t('page.publishNow'),
        })
      : Promise.resolve(true)
    )
      .then((confirmed) =>
        confirmed
          ? _each(changing, (node) =>
              api.send(
                'POST',
                `/pages/${node.id}/${published ? 'publish' : 'unpublish'}`
              )
            ).then(() =>
              _finish(
                `${t(published ? 'bulk.published' : 'bulk.unpublished')} ${changing.length}`
              )
            )
          : undefined
      )
      .then(undefined, failed))(nodes.filter((_) => _.published !== published));

/** В корзину разом — с вопросом и списком; «Вернуть» восстанавливает все. */
export var trashMany = (nodes: readonly PageNode[]): Promise<void> =>
  ((tops) =>
    ask({
      title: t('bulk.trashTitle'),
      body: t('bulk.trashBody', {
        n: tops.reduce(
          (sum, _) =>
            sum + descendantsOf(_.id).filter((child) => !child.trashed).length,
          0
        ),
      }),
      items: _titles(tops),
      confirm: t('page.toTrash'),
      tone: 'danger',
    })
      .then((confirmed) =>
        confirmed
          ? _each(tops, (node) =>
              api.send('POST', `/pages/${node.id}/trash`)
            ).then(() =>
              _finish(`${t('bulk.trashed')} ${tops.length}`, () =>
                _each(tops, (node) =>
                  api.send('POST', `/pages/${node.id}/restore`)
                )
              )
            )
          : undefined
      )
      .then(undefined, failed))(_tops(nodes));

const _ROOT = 'root';

/** Перенести разом к одному родителю — в конец его списка; «Вернуть» ставит каждую на прежнее место. */
export var moveMany = (nodes: readonly PageNode[]): Promise<void> =>
  ((tops) =>
    askValue({
      title: t('bulk.moveTitle'),
      items: _titles(tops),
      input: {
        label: t('tree.parent'),
        type: 'text',
        value: _ROOT,
        options: [
          { value: _ROOT, label: t('pages.root') },
          ...branchOrder(null)
            .filter(({ node }) => !tops.some((_) => isWithin(node.id, _.id)))
            .map(({ node, depth }) => ({
              value: String(node.id),
              label: `${' '.repeat(depth)}${node.title} (${node.id})`,
            })),
        ],
      },
      confirm: t('tree.moveConfirm'),
    })
      .then((value) =>
        value === null
          ? undefined
          : ((parentId, from) =>
              _each(tops, (node) =>
                _place(node.id, parentId, childrenOf(parentId).length)
              ).then(() =>
                _finish(`${t('bulk.moved')} ${tops.length}`, () =>
                  // Обратно — с конца: каждая встаёт на свой индекс, пока соседи ещё на местах.
                  _each(from.toReversed(), (_) =>
                    _place(_.id, _.parentId, _.index)
                  )
                )
              ))(
              value === _ROOT ? null : Number(value),
              tops.map((_) => ({
                id: _.id,
                parentId: _.parentId,
                index: _positionOf(_),
              }))
            )
      )
      .then(undefined, failed))(_tops(nodes));

// Шаблон и меню есть у страниц с текстом: у ссылки шаблона нет, файл (robots.txt, ленты) в меню не попадает.
const _withTemplate = (node: PageNode): boolean =>
  node.kind === 'page' && isHtml(node.contentType);

const _inMenu = (node: PageNode): boolean =>
  node.kind !== 'page' || isHtml(node.contentType);

const _patch = (node: PageNode, changes: Record<string, unknown>) =>
  api.send('PATCH', `/pages/${node.id}`, changes);

/** Шаблон разом — выбором из списка; «Вернуть» ставит каждой странице её прежний. */
export var templateMany = (
  nodes: readonly PageNode[],
  templates: readonly string[]
): Promise<void> =>
  ((pages) =>
    pages.length === 0
      ? Promise.resolve()
      : askValue({
          title: t('bulk.templateTitle'),
          items: _titles(pages),
          input: {
            label: t('page.template'),
            type: 'text',
            value: pages[0]!.template,
            options: [...new Set([...templates, pages[0]!.template])].map(
              (name) => ({ value: name, label: name })
            ),
          },
          confirm: t('bulk.templateConfirm'),
        })
          .then((template) =>
            template === null
              ? undefined
              : ((changing) =>
                  _each(changing, (node) => _patch(node, { template })).then(
                    () =>
                      _finish(`${t('bulk.templated')} ${changing.length}`, () =>
                        _each(changing, (node) =>
                          _patch(node, { template: node.template })
                        )
                      )
                  ))(pages.filter((_) => _.template !== template))
          )
          .then(undefined, failed))(nodes.filter(_withTemplate));

/** Показать в меню или скрыть разом; «Вернуть» возвращает каждой прежнее. */
export var menuMany = (
  nodes: readonly PageNode[],
  shown: boolean
): Promise<void> =>
  ((changing) =>
    _each(changing, (node) => _patch(node, { hiddenFromMenu: !shown }))
      .then(() =>
        _finish(
          `${t(shown ? 'bulk.menuShown' : 'bulk.menuHidden')} ${changing.length}`,
          () =>
            _each(changing, (node) =>
              _patch(node, { hiddenFromMenu: node.hiddenFromMenu })
            )
        )
      )
      .then(undefined, failed))(
    nodes.filter((_) => _inMenu(_) && _.hiddenFromMenu === shown)
  );

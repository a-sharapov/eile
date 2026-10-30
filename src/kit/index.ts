import breadcrumbs from './Breadcrumbs.svelte' with { type: 'text' };
import menu from './Menu.svelte' with { type: 'text' };
import menuKeys from './MenuKeys.svelte' with { type: 'text' };
import modal from './Modal.svelte' with { type: 'text' };
import modalButton from './ModalButton.svelte' with { type: 'text' };
import modalLinks from './ModalLinks.svelte' with { type: 'text' };
import pagination from './Pagination.svelte' with { type: 'text' };
import postList from './PostList.svelte' with { type: 'text' };
import postMeta from './PostMeta.svelte' with { type: 'text' };

/** Компонент набора: исходник и что ставится вместе с ним. */
export type KitEntry = {
  readonly name: string;
  readonly source: string;
  /** Компоненты, без которых этот не работает: импорт или остров. */
  readonly requires: readonly string[];
};

// Импорт текстом; собственные типы Svelte для `*.svelte` описывают компонент.
const _text = (source: unknown): string => source as string;

/** Набор компонентов: ставится в элементы сайта и дальше правится там. Зависимости — раньше зависящих. */
export var KIT: readonly KitEntry[] = [
  { name: 'MenuKeys', source: _text(menuKeys), requires: [] },
  { name: 'Menu', source: _text(menu), requires: ['MenuKeys'] },
  { name: 'Breadcrumbs', source: _text(breadcrumbs), requires: [] },
  { name: 'Pagination', source: _text(pagination), requires: [] },
  { name: 'PostList', source: _text(postList), requires: ['Pagination'] },
  { name: 'PostMeta', source: _text(postMeta), requires: [] },
  { name: 'ModalLinks', source: _text(modalLinks), requires: [] },
  { name: 'Modal', source: _text(modal), requires: ['ModalLinks'] },
  { name: 'ModalButton', source: _text(modalButton), requires: ['ModalLinks'] },
];

/** Что поставить ради компонента: он сам и всё, что ему нужно, зависимости первыми. */
export var kitClosure = (name: string): KitEntry[] =>
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
      : [])(KIT.find((_) => _.name === name));

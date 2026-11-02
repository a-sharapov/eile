import breadcrumbs from './Breadcrumbs.svelte' with { type: 'text' };
import { KIT_DE } from './de.ts';
import { KIT_EN } from './en.ts';
import menu from './Menu.svelte' with { type: 'text' };
import menuKeys from './MenuKeys.svelte' with { type: 'text' };
import modal from './Modal.svelte' with { type: 'text' };
import modalButton from './ModalButton.svelte' with { type: 'text' };
import modalLinks from './ModalLinks.svelte' with { type: 'text' };
import pagination from './Pagination.svelte' with { type: 'text' };
import postList from './PostList.svelte' with { type: 'text' };
import postMeta from './PostMeta.svelte' with { type: 'text' };
import searchForm from './SearchForm.svelte' with { type: 'text' };
import searchResults from './SearchResults.svelte' with { type: 'text' };
import { russian, translated } from './translated.ts';

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
  { name: 'SearchForm', source: _text(searchForm), requires: [] },
  {
    name: 'SearchResults',
    source: _text(searchResults),
    requires: ['Pagination'],
  },
  { name: 'ModalLinks', source: _text(modalLinks), requires: [] },
  { name: 'Modal', source: _text(modal), requires: ['ModalLinks'] },
  { name: 'ModalButton', source: _text(modalButton), requires: ['ModalLinks'] },
];

/** Набор по-английски: исходники с переводом подписей, описаний и комментариев. */
export var KIT_ENGLISH: readonly KitEntry[] = KIT.map((_) => ({
  ..._,
  source: translated(_.source, KIT_EN[_.name] ?? []),
}));

/** Набор по-немецки: английский набор, где всё, что видит посетитель, — по-немецки. */
export var KIT_GERMAN: readonly KitEntry[] = KIT_ENGLISH.map((_) => ({
  ..._,
  source: translated(_.source, KIT_DE[_.name] ?? []),
}));

/** Набор на языке сайта: русский — как в исходниках, немецкий — свой, любой другой — английский. */
export var kitFor = (language: string): readonly KitEntry[] =>
  russian(language)
    ? KIT
    : /^de(?:-|$)/i.test(language)
      ? KIT_GERMAN
      : KIT_ENGLISH;

/** Что поставить ради компонента: он сам и всё, что ему нужно, зависимости первыми. */
export var kitClosure = (name: string, language = 'ru'): KitEntry[] =>
  ((kit) =>
    ((entry) =>
      entry
        ? [
            ...new Map(
              [
                ...entry.requires.flatMap((_) => kitClosure(_, language)),
                entry,
              ].map((_) => [_.name, _])
            ).values(),
          ]
        : [])(kit.find((_) => _.name === name)))(kitFor(language));

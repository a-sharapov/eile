import type { Translation } from './translated.ts';

// Набор по-немецки — поверх английского: посетитель видит подписи и тексты по умолчанию на немецком, а
// описания и комментарии для того, кто правит компонент, остаются английскими.

/** Пары перевода английского набора на немецкий: только то, что видит посетитель сайта. */
export var KIT_DE: Readonly<Record<string, Translation>> = {
  Menu: [
    ["label = 'Main menu',", "label = 'Hauptmenü',"],
    ["burgerLabel = 'Menu',", "burgerLabel = 'Menü',"],
    ['aria-label="Close"', 'aria-label="Schließen"'],
  ],
  Breadcrumbs: [["label = 'Breadcrumb',", "label = 'Brotkrumennavigation',"]],
  Pagination: [
    ["label = 'Pagination',", "label = 'Seitennavigation',"],
    ["prevLabel = 'Previous',", "prevLabel = 'Zurück',"],
    ["nextLabel = 'Next',", "nextLabel = 'Weiter',"],
  ],
  PostList: [
    ["empty = 'Nothing here yet.',", "empty = 'Hier gibt es noch nichts.',"],
  ],
  PostMeta: [
    // Немецкие слова длиннее английских: читают их медленнее.
    ['speed = 230,', 'speed = 200,'],
    ["readingLabel = '{n} min read',", "readingLabel = '{n} Min. Lesezeit',"],
  ],
  SearchForm: [
    ["placeholder = 'Search',", "placeholder = 'Suche',"],
    ["label = 'Search the site',", "label = 'Website durchsuchen',"],
    ["button = 'Search',", "button = 'Suchen',"],
  ],
  SearchResults: [
    ["label = 'Search the site',", "label = 'Website durchsuchen',"],
    [
      "placeholder = 'What are you looking for?',",
      "placeholder = 'Wonach suchen Sie?',",
    ],
    ["button = 'Search',", "button = 'Suchen',"],
    ["found = 'Results: {n}',", "found = 'Ergebnisse: {n}',"],
    [
      "empty = 'Nothing found. Try different words or a shorter query.',",
      "empty = 'Nichts gefunden. Versuchen Sie es mit anderen Wörtern oder einer kürzeren Suchanfrage.',",
    ],
    [
      "corrected = 'No results for your search. Showing results for “{q}” instead.',",
      "corrected = 'Für Ihre Suche gibt es keine Ergebnisse. Stattdessen werden Ergebnisse für „{q}“ angezeigt.',",
    ],
    [
      "hint = 'Enter a word or phrase: search finds its other forms too. Put a phrase in quotes to match it exactly.',",
      "hint = 'Geben Sie ein Wort oder eine Wortgruppe ein: Die Suche findet auch andere Wortformen. Setzen Sie eine Wortgruppe in Anführungszeichen, um genau danach zu suchen.',",
    ],
  ],
  Modal: [["closeLabel = 'Close',", "closeLabel = 'Schließen',"]],
  ModalButton: [["text = 'Open',", "text = 'Öffnen',"]],
};

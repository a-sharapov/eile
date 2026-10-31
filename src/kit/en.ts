import type { Translation } from './translated.ts';

// Набор по-английски: разметка, стили и логика — те же исходники, что у русского; описания, подписи свойств,
// тексты по умолчанию и комментарии — парами перевода.

/** Набор компонентов по-английски: пары перевода для каждого компонента (`translated`). */
export var KIT_EN: Readonly<Record<string, Translation>> = {
  MenuKeys: [
    [
      `Остров меню: Esc закрывает подменю, открытое наведением или фокусом; без мыши первое касание пункта
с подменю открывает его, второе ведёт по ссылке; ссылка в панели закрывает панель.`,
      `Menu island: Esc closes a submenu opened by hover or focus; without a mouse, the first tap on an item
with a submenu opens it and the second follows the link; a link in the panel closes the panel.`,
    ],
    [
      '// Один обработчик на страницу, сколько бы меню на ней ни было.',
      '// One handler per page, however many menus it has.',
    ],
    [
      '// Подменю закрыто, пока мышь не уйдёт с пункта или фокус не покинет его целиком.',
      '// The submenu stays closed until the mouse leaves the item or focus leaves it entirely.',
    ],
    [
      '// В выезжающей панели ссылка на ту же страницу (#якорь) иначе оставила бы её открытой.',
      '// Otherwise a link to the same page (#anchor) would leave the slide-out panel open.',
    ],
    [
      '// Без наведения подменю не увидеть: первое касание раскрывает пункт, касание мимо — сворачивает.',
      "// Without hover a submenu can't be seen: the first tap opens the item, a tap elsewhere closes it.",
    ],
    [
      '// В панели узкого экрана подменю и так раскрыты — касание сразу ведёт по ссылке.',
      '// In the narrow-screen panel submenus are already open, so a tap follows the link at once.',
    ],
  ],
  Menu: [
    [
      `Меню сайта: страницы дерева на несколько уровней. Подменю открывается при наведении, с клавиатуры и
первым касанием; на узком экране меню прячется за кнопку.`,
      `Site menu: pages of the tree, several levels deep. A submenu opens on hover, from the keyboard and on
the first tap; on a narrow screen the menu hides behind a button.`,
    ],
    [
      '/** Родитель: id страницы; пусто — верхний уровень */',
      '/** Parent: page id; empty means the top level */',
    ],
    ['/** Уровней, от 1 до 4 */', '/** Levels, from 1 to 4 */'],
    [
      '/** Вид: bar=Строка с подменю, list=Столбиком */',
      '/** Layout: bar=Row with submenus, list=Column */',
    ],
    [
      '/** Название меню для читалок экрана */',
      '/** Menu name for screen readers */',
    ],
    ["label = 'Основное меню',", "label = 'Main menu',"],
    [
      '/** Прятать меню за кнопку на телефоне */',
      '/** Hide the menu behind a button on phones */',
    ],
    ['/** Подпись кнопки меню */', '/** Menu button label */'],
    ["burgerLabel = 'Меню',", "burgerLabel = 'Menu',"],
    [
      '// Активная ветка: текущая страница и её предки — по дереву, а не по началу адреса.',
      '// The active branch: the current page and its ancestors, taken from the tree, not from the URL prefix.',
    ],
    [
      '// Остров нужен только подменю: Esc закрывает их. Меню в один уровень обходится без JS.',
      '// Only submenus need the island: Esc closes them. A one-level menu works without JS.',
    ],
    ['aria-label="Закрыть"', 'aria-label="Close"'],
    [
      '/* Столбиком: все уровни раскрыты лесенкой. */',
      '/* Column: all levels open, each indented under its parent. */',
    ],
    [
      '/* Строка: верхний уровень в ряд, подменю — выпадающие. */',
      '/* Row: the top level in a line, submenus drop down. */',
    ],
    [
      '/* Закрывается с задержкой: косое движение мыши к подменю его не схлопывает. */',
      "/* Closes with a delay, so moving the mouse diagonally toward a submenu doesn't collapse it. */",
    ],
    [
      '/* Esc закрывает подменю, пока мышь или фокус не уйдут: так его можно убрать, не двигаясь. */',
      '/* Esc keeps the submenu closed until the mouse or focus leaves, so it can be dismissed without moving. */',
    ],
    [
      '/* Касание на широком экране: первое открывает подменю (остров), второе ведёт по ссылке. */',
      '/* Touch on a wide screen: the first tap opens the submenu (the island), the second follows the link. */',
    ],
    [
      '/* Узкий экран — кнопка и выезжающая панель, уровни раскрыты. */',
      '/* Narrow screen: a button and a slide-out panel with all levels open. */',
    ],
    [
      '/* На широком экране панель — обычный блок: кнопка спрятана, popover не открывается. */',
      '/* On a wide screen the panel is an ordinary block: the button is hidden and the popover never opens. */',
    ],
  ],
  Breadcrumbs: [
    [
      `Хлебные крошки: путь от главной до текущей страницы. На главной не выводятся. Разметку для поисковиков
(BreadcrumbList) сайт добавляет сам.`,
      `Breadcrumbs: the path from the home page to the current page. Hidden on the home page. The site adds the
markup for search engines (BreadcrumbList) on its own.`,
    ],
    ['/** Главная первым пунктом */', '/** Home page as the first item */'],
    [
      '/** Подпись главной; пусто — её заголовок в меню */',
      '/** Home page label; empty means its menu title */',
    ],
    [
      '/** Текущая страница последним пунктом */',
      '/** Current page as the last item */',
    ],
    ['/** Название для читалок экрана */', '/** Name for screen readers */'],
    // Так называют навигацию крошек в образцах WAI-ARIA.
    ["label = 'Вы здесь',", "label = 'Breadcrumb',"],
    [
      '/* Разделитель читалка не произносит: пустой альтернативный текст. */',
      '/* Screen readers skip the separator: its alternative text is empty. */',
    ],
  ],
  Pagination: [
    [
      'Пейджер ленты: номера ссылками, без JS. Пункты даёт `listing().pager()` из $core.',
      'Feed pager: page numbers as links, no JS. The items come from `listing().pager()` in $core.',
    ],
    ["label = 'Страницы',", "label = 'Pagination',"],
    ["prevLabel = 'Назад',", "prevLabel = 'Previous',"],
    ["nextLabel = 'Вперёд',", "nextLabel = 'Next',"],
  ],
  PostList: [
    [
      `Лента постов: дети раздела порциями — картинка, дата, заголовок и анонс, ниже пейджер. Порции живут по
адресам /раздел/page-2, /раздел/page-3.`,
      `Post feed: the children of a section in pages, each post with a picture, date, title and summary, and a
pager below. Further pages live at /section/page-2, /section/page-3.`,
    ],
    [
      '/** Раздел с постами: id страницы; пусто — текущая */',
      '/** Section with posts: page id; empty means the current page */',
    ],
    ['/** Постов в порции */', '/** Posts per page */'],
    [
      '/** Порядок: published=Сначала новые, created=По дате создания, title=По алфавиту, menu=Как в меню */',
      '/** Order: published=Newest first, created=By creation date, title=Alphabetical, menu=As in the menu */',
    ],
    [
      '/** Вид: list=Списком, grid=Плиткой */',
      '/** Layout: list=List, grid=Grid */',
    ],
    [
      '/** Поле с картинкой поста; пусто или не задано — картинка для соцсетей */',
      '/** Field with the post image; when empty or unset, the social media image */',
    ],
    ['/** Показывать анонс */', '/** Show the summary */'],
    ['/** Текст, если постов нет */', '/** Text when there are no posts */'],
    ["empty = 'Пока ничего нет.',", "empty = 'Nothing here yet.',"],
    [
      '// Дата в UTC: одна и та же на сервере в любом поясе.',
      '// The date in UTC: the same on a server in any time zone.',
    ],
    [
      '/* Одна ссылка на карточку, но кликается вся карточка. */',
      '/* One link per card, but the whole card is clickable. */',
    ],
  ],
  PostMeta: [
    [
      'Подпись поста: дата публикации и время чтения.',
      'Post details: the publishing date and reading time.',
    ],
    ['/** Показывать время чтения */', '/** Show reading time */'],
    [
      '/** Слов в минуту для времени чтения */',
      '/** Words per minute for reading time */',
    ],
    // По-английски читают быстрее: слова короче, чем русские.
    ['speed = 180,', 'speed = 230,'],
    [
      '/** Шаблон времени чтения: {n} — минуты */',
      '/** Reading time template: {n} is the minutes */',
    ],
    ["readingLabel = '{n} мин чтения',", "readingLabel = '{n} min read',"],
    [
      '// Слова текста без разметки и тегов компонентов.',
      '// Words of the text, without markup and component tags.',
    ],
  ],
  SearchForm: [
    [
      `Поле поиска по сайту для шапки: обычная форма без JS, ведёт на страницу выдачи с запросом в адресе. Где
места меньше 7rem, остаётся одна кнопка-лупа — поле ждёт на странице выдачи.`,
      `Site search field for the header: a plain form without JS that goes to the results page with the query
in the URL. With less than 7rem of room only the magnifier button is left, and the field waits on the
results page.`,
    ],
    [
      '/** Страница выдачи: id страницы, где стоит SearchResults */',
      '/** Results page: id of the page with SearchResults */',
    ],
    ['/** Подсказка в поле */', '/** Placeholder text */'],
    ["placeholder = 'Поиск',", "placeholder = 'Search',"],
    [
      '/** Подпись поля для читалок экрана */',
      '/** Field label for screen readers */',
    ],
    ["label = 'Поиск по сайту',", "label = 'Search the site',"],
    [
      '/** Подпись кнопки для читалок экрана */',
      '/** Button label for screen readers */',
    ],
    ["button = 'Найти',", "button = 'Search',"],
    [
      '// Номер страницы может прийти строкой из своей настройки; нет страницы — форма уйдёт на текущий адрес.',
      '// The page id may come as a string from a custom setting; with no page the form submits to the current URL.',
    ],
    [
      '/* Своя кнопка справа: системный крестик очистки лёг бы на неё. */',
      "/* Our own button sits on the right: the browser's clear button would cover it. */",
    ],
    [
      '/* Тесно — только лупа: пустой запрос откроет страницу выдачи с полем. */',
      '/* Short on room: only the magnifier. An empty query opens the results page with the field. */',
    ],
  ],
  SearchResults: [
    [
      `Выдача поиска по сайту: поле с запросом, найденные страницы с отрывком и номера страниц. Читает запрос
посетителя, поэтому ставится некэшируемым регионом: <Uncached name="SearchResults" />.`,
      `Site search results: the query field, the pages found with a snippet each, and page numbers. It reads
the visitor's request, so it goes in as an uncached region: <Uncached name="SearchResults" />.`,
    ],
    ['/** Найденных на странице */', '/** Results per page */'],
    [
      '/** Искать только в разделе: id страницы; пусто — по всему сайту */',
      '/** Search only within a section: page id; empty means the whole site */',
    ],
    [
      '/** Подпись поля для читалок экрана */',
      '/** Field label for screen readers */',
    ],
    ["label = 'Поиск по сайту',", "label = 'Search the site',"],
    ['/** Подсказка в поле */', '/** Placeholder text */'],
    [
      "placeholder = 'Что найти?',",
      "placeholder = 'What are you looking for?',",
    ],
    ['/** Надпись кнопки */', '/** Button text */'],
    ["button = 'Найти',", "button = 'Search',"],
    [
      '/** Сколько нашлось: {n} — число */',
      '/** Result count: {n} is the number */',
    ],
    // Число — после двоеточия: не нужно выбирать между result и results.
    ["found = 'Найдено: {n}',", "found = 'Results: {n}',"],
    [
      '/** Текст, если ничего не нашлось */',
      '/** Text when nothing is found */',
    ],
    [
      "empty = 'Ничего не нашлось. Попробуйте другие слова или более короткий запрос.',",
      "empty = 'Nothing found. Try different words or a shorter query.',",
    ],
    [
      '/** Выдача по запросу с исправленной опечаткой: {q} — исправленный запрос */',
      '/** Results for a query with a typo fixed: {q} is the corrected query */',
    ],
    [
      "corrected = 'По вашему запросу ничего нет. Показаны результаты по запросу «{q}».',",
      "corrected = 'No results for your search. Showing results for “{q}” instead.',",
    ],
    ['/** Текст до запроса */', '/** Text before a search */'],
    [
      "hint = 'Введите слово или фразу — поиск найдёт и другие их формы. Точную фразу возьмите в кавычки.',",
      "hint = 'Enter a word or phrase: search finds its other forms too. Put a phrase in quotes to match it exactly.',",
    ],
    [
      '/* Отрывок приходит HTML-строкой: найденные слова отмечены <mark>. */',
      '/* The snippet comes as an HTML string with the matched words in <mark>. */',
    ],
  ],
  ModalLinks: [
    [
      `Остров окон: ссылки #адрес открывают окно, окно из адреса страницы открывается при загрузке.
Где браузер ещё не знает commandfor и closedby, их работу делает этот остров.`,
      `Modal island: #id links open a modal, and the modal named in the page URL opens on load.
Where the browser doesn't support commandfor and closedby yet, this island does their job.`,
    ],
    [
      '// Один обработчик на страницу, сколько бы окон и кнопок на ней ни было.',
      '// One handler per page, however many modals and buttons it has.',
    ],
    [
      '// Битый адрес вроде #%E0 — просто не окно.',
      '// A malformed hash like #%E0 is simply not a modal.',
    ],
    [
      '// Щелчок по подложке приходит в сам dialog, но за пределами его рамки.',
      '// A click on the backdrop lands on the dialog itself, but outside its box.',
    ],
  ],
  Modal: [
    [
      `Окно поверх страницы: текст или текст другой страницы. Открывается «Кнопкой окна» или ссылкой #адрес в
тексте, закрывается крестиком, Esc и щелчком мимо окна.`,
      `A modal over the page: its own text or the text of another page. Opens with a ModalButton or a #id link
in the text; closes with the close button, Esc or a click outside.`,
    ],
    [
      '/** Адрес окна латиницей: его открывают кнопка и ссылка #адрес */',
      '/** Modal id in Latin letters: the button and #id links open the modal by it */',
    ],
    ['/** Заголовок */', '/** Title */'],
    ['/** Текст окна */', '/** Modal text */'],
    [
      '/** Страница, чей текст показать в окне: id */',
      '/** Page whose text to show in the modal: id */',
    ],
    [
      '/** Ширина: sm=Узкое, md=Среднее, lg=Широкое */',
      '/** Width: sm=Narrow, md=Medium, lg=Wide */',
    ],
    [
      '/** Подпись крестика для читалок экрана */',
      '/** Close button label for screen readers */',
    ],
    ["closeLabel = 'Закрыть',", "closeLabel = 'Close',"],
    [
      '/* Появление без JS: @starting-style задаёт, откуда окно выезжает. */',
      '/* Entry animation without JS: @starting-style sets where the modal slides in from. */',
    ],
    [
      '/* Страница под окном не прокручивается; ширина полосы прокрутки сохраняется — без прыжка. */',
      "/* The page under the modal doesn't scroll; the scrollbar width is kept, so nothing jumps. */",
    ],
  ],
  ModalButton: [
    ['Кнопка, которая открывает окно.', 'A button that opens a modal.'],
    ['/** Адрес окна, которое открыть */', '/** Id of the modal to open */'],
    ['/** Надпись */', '/** Text */'],
    ["text = 'Открыть',", "text = 'Open',"],
    [
      '/** Вид: primary=Главная, secondary=Обычная, link=Ссылкой */',
      '/** Style: primary=Primary, secondary=Secondary, link=Link */',
    ],
  ],
};

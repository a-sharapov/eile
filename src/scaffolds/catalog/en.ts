import type { NewField } from '../../contexts/content/index.ts';
import { type Translation, translated } from '../../kit/translated.ts';
import { CATALOG_COMPONENTS } from './index.ts';

// Каталог по-английски: компоненты — парами перевода, поля товара и образец политики — свои.

const _PAIRS: Readonly<Record<string, Translation>> = {
  CategoryList: [
    [
      'Разделы каталога плитками: обложка из поля cover или плашка, название и сколько в разделе товаров.',
      'Catalog sections as tiles: a cover from the cover field or a color plate, the name and how many products are inside.',
    ],
    [
      '/** Каталог: id страницы; пусто — текущая */',
      '/** Catalog: page id; empty means the current page */',
    ],
    ['/** Заголовок над плитками */', '/** Heading above the tiles */'],
    [
      `\`\${n} \${
    n % 10 === 1 && n % 100 !== 11
      ? 'товар'
      : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)
        ? 'товара'
        : 'товаров'
  }\``,
      "`${n} ${n === 1 ? 'product' : 'products'}`",
    ],
  ],
  Cover: [
    [
      `Обложка товара или раздела: картинка из медиатеки, а без неё — плашка в тон сайта с названием крупно.
Тон плашки выбирается по названию: у каждого товара свой и не меняется. Шесть тонов задаёт рамка сайта
переменными \`--plate-0…5\` и \`--plate-ink-0…5\`.`,
      `The cover of a product or section: a picture from the media library or, without one, a plate in the
site's colors with the name in large type. The plate's tone follows the name, so every product keeps its
own. The site frame sets the six tones with the \`--plate-0…5\` and \`--plate-ink-0…5\` variables.`,
    ],
    [
      '/** Название: подпись картинки и текст плашки */',
      '/** Name: the picture caption and the plate text */',
    ],
    [
      '/** Картинка из медиатеки; пусто — плашка */',
      '/** Picture from the media library; empty means a plate */',
    ],
    [
      '/** Пропорции: 4/5=Портрет, 1/1=Квадрат, 4/3=Пейзаж */',
      '/** Proportions: 4/5=Portrait, 1/1=Square, 4/3=Landscape */',
    ],
    [
      '/** Ширина на странице для выбора размера картинки */',
      '/** Width on the page, to pick the picture size */',
    ],
    [
      '/** Грузить сразу, а не при прокрутке: для первого экрана */',
      '/** Load at once, not on scroll: for the first screen */',
    ],
    [
      '/* Название растёт с плашкой: единицы контейнера, а не окна. */',
      '/* The name grows with the plate: container units, not window units. */',
    ],
  ],
  Price: [
    [
      `Цена товара. Валюта — своя настройка сайта \`currency\`; старая цена, если она больше, зачёркнута. Без цены —
подпись «по запросу».`,
      `The product price. The currency is the custom site setting \`currency\`; an old price, when higher, is
struck through. Without a price, an "on request" label.`,
    ],
    ['/** Цена */', '/** Price */'],
    [
      '/** Старая цена: показывается зачёркнутой, если больше цены */',
      '/** Old price: shown struck through when higher than the price */',
    ],
    [
      '/** Размер: md=Обычный, lg=Крупный */',
      '/** Size: md=Regular, lg=Large */',
    ],
    ['/** Подпись, если цены нет */', '/** Label when there is no price */'],
    ["missing = 'Цена по запросу',", "missing = 'Price on request',"],
    ["settings.language || 'ru'", "settings.language || 'en'"],
    // Доллары — с центами, если они есть: $12.49, но $12.
    [
      'maximumFractionDigits: 0,',
      "minimumFractionDigits: 2,\n  maximumFractionDigits: 2,\n  trailingZeroDisplay: 'stripIfInteger',",
    ],
    // По-английски знак валюты — перед числом: $1,200.
    [
      '`${money.format(amount)} ${settings.custom.currency}`',
      '`${settings.custom.currency}${money.format(amount)}`',
    ],
    [
      '<span class="hidden">{\'Было \'}</span>',
      '<span class="hidden">{\'Was \'}</span>',
    ],
  ],
  ProductCard: [
    [
      'Карточка товара: обложка, отметка, название, цена и наличие. Вся карточка — ссылка на товар.',
      'A product card: cover, badge, name, price and stock. The whole card links to the product.',
    ],
    [
      '/** Товар: страница с полями price, oldPrice, cover, inStock, badge */',
      '/** Product: a page with the price, oldPrice, cover, inStock and badge fields */',
    ],
    [
      '/** Тег заголовка: h2 в разделе, h3 под заголовком блока */',
      '/** Heading tag: h2 in a section, h3 under a block heading */',
    ],
    [
      '/** Пропорции обложки: 4/5=Портрет, 1/1=Квадрат, 4/3=Пейзаж */',
      '/** Cover proportions: 4/5=Portrait, 1/1=Square, 4/3=Landscape */',
    ],
    [
      '/** Подпись товара, которого нет в наличии */',
      '/** Label of a product that is out of stock */',
    ],
    ["unavailable = 'Нет в наличии',", "unavailable = 'Out of stock',"],
    [
      '/* Одна ссылка, но кликается вся карточка. */',
      '/* One link, but the whole card is clickable. */',
    ],
  ],
  ProductGrid: [
    [
      `Товары плиткой. Для раздела — порциями с пейджером (/раздел/page-2). С глубиной 2 и больше — товары
подразделов одним списком, без порций: для главной («Новинки», «Хиты»). Товар — страница с полем price.`,
      `Products as tiles. For a section, in pages with a pager (/section/page-2). With a depth of 2 or more, the
products of subsections in one list without pages: for the home page (New, Bestsellers). A product is a
page with the price field.`,
    ],
    [
      '/** Раздел: id страницы; пусто — текущая */',
      '/** Section: page id; empty means the current page */',
    ],
    ['/** Товаров в порции */', '/** Products per page */'],
    [
      '/** Уровней вниз: 1 — товары раздела, 2 — и его подразделов */',
      '/** Levels down: 1 is the section products, 2 adds its subsections */',
    ],
    [
      '/** Порядок: menu=Как в дереве, published=Сначала новые, title=По алфавиту */',
      '/** Order: menu=As in the tree, published=Newest first, title=Alphabetical */',
    ],
    ['/** Заголовок над плиткой */', '/** Heading above the tiles */'],
    [
      '/** Колонок на широком экране, от 2 до 4 */',
      '/** Columns on a wide screen, from 2 to 4 */',
    ],
    [
      '/** Текст, если товаров нет */',
      '/** Text when there are no products */',
    ],
    ["empty = 'Здесь пока нет товаров.',", "empty = 'No products here yet.',"],
    [
      '/** Подпись товара, которого нет в наличии */',
      '/** Label of a product that is out of stock */',
    ],
    ["unavailable = 'Нет в наличии',", "unavailable = 'Out of stock',"],
    [
      '// В глубоком списке есть и сами подразделы: у них нет поля цены.',
      '// A deep list holds the subsections too: they have no price field.',
    ],
  ],
};

/** Компоненты каталога по-английски — для витрины и магазина. */
export var CATALOG_COMPONENTS_EN: Readonly<Record<string, string>> =
  Object.fromEntries(
    Object.entries(CATALOG_COMPONENTS).map(({ 0: name, 1: source }) => [
      name,
      translated(source, _PAIRS[name] ?? []),
    ])
  );

/** Поля товара по-английски; обложка — и у раздела. Имена полей те же, что у русского каталога. */
export var catalogFieldsEn = (
  product: string,
  category: string
): readonly NewField[] => [
  { name: 'price', label: 'Price', type: 'number', templates: [product] },
  {
    name: 'oldPrice',
    label: 'Old price',
    type: 'number',
    templates: [product],
  },
  { name: 'sku', label: 'SKU', type: 'text', templates: [product] },
  {
    name: 'inStock',
    label: 'In stock',
    type: 'boolean',
    defaultValue: true,
    templates: [product],
  },
  {
    name: 'badge',
    label: 'Badge',
    type: 'select',
    options: ['New', 'Bestseller', 'Sale'],
    templates: [product],
  },
  {
    name: 'cover',
    label: 'Cover',
    type: 'image',
    templates: [product, category],
  },
];

/** Политика конфиденциальности — образец, который владелец сайта дописывает под себя. */
export var policyEn = (
  operator: string
): string => `<p>This is a sample policy. Fill in your own details and check the text with a lawyer: the requirements depend on your country and on the data you collect.</p>
<h2>Who processes the data</h2>
<p>The data controller is ${operator}. Company details and the address for requests are on the contacts page.</p>
<h2>What data and why</h2>
<p>Name, phone, email, delivery address and the message text, only to answer a request and to process and deliver an order. The data is not shared with third parties, except the delivery service if you chose delivery.</p>
<h2>How long it is kept</h2>
<p>Requests are kept as long as needed to answer them and fulfil the order, then deleted.</p>
<h2>Your rights</h2>
<p>You can find out what data about you is stored, correct it or ask for it to be deleted: write to the email on the contacts page.</p>`;

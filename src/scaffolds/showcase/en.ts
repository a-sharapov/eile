import { type Translation, translated } from '../../kit/translated.ts';
import {
  CATALOG_COMPONENTS_EN,
  catalogFieldsEn,
  policyEn,
} from '../catalog/en.ts';
import { specs } from '../catalog/index.ts';
import { consent, formSource, hidden, input, textarea } from '../form-html.ts';
import type { Scaffold, ScaffoldPage } from '../scaffold.ts';
import { SHOWCASE } from './index.ts';

// Витрина по-английски: разметка и стили — те же исходники, что у русской, подписи и комментарии — парами
// перевода; товары, тексты страниц, форма и настройки — свои.

const _PAIRS: Readonly<Record<string, Translation>> = {
  Layout: [
    [
      `Рамка страницы витрины: шапка с названием, меню и телефоном, страница, подвал с контактами. Здесь же
цвета и шрифты сайта: переменные \`--t-*\` подхватывают компоненты набора, \`--plate-*\` — плашки товаров.`,
      `The showcase page frame: a header with the name, menu and phone, the page, a footer with contacts. Site
colors and fonts live here too: kit components pick up the \`--t-*\` variables, product plates the \`--plate-*\` ones.`,
    ],
    ['/** Страница шаблона */', '/** The template page */'],
    ['>К содержимому</a>', '>Skip to content</a>'],
    ['>Политика конфиденциальности</a>', '>Privacy policy</a>'],
    [
      '/* Глазури: песок, терракота, селадон, кобальт, охра, зола. */',
      '/* Glazes: sand, terracotta, celadon, cobalt, ochre, ash. */',
    ],
    [
      '/* Подвал прижат к низу и на короткой странице. */',
      '/* The footer stays at the bottom even on a short page. */',
    ],
    [
      '/* Текст страницы: нулевая специфичность — стили компонентов внутри текста сильнее. */',
      '/* Page text: zero specificity, so component styles inside the text win. */',
    ],
    [
      '/* Меню и телефон занимают шапку: поле — на широком экране, иначе лупа поближе к меню. */',
      '/* The menu and phone fill the header: the search field shows on a wide screen, otherwise a magnifier sits next to the menu. */',
    ],
  ],
  Home: [['>Смотреть каталог</a>', '>Browse the catalog</a>']],
  Category: [['unavailable="Под заказ"', 'unavailable="Made to order"']],
  Product: [
    [
      '// Окно заказа показывает текст скрытой страницы «Запрос»: в нём форма, её правят в менеджере.',
      '// The order window shows the text of the hidden Request page: it holds the form, edited in the manager.',
    ],
    ['>Артикул {fields.sku}</p>', '>SKU {fields.sku}</p>'],
    [
      "'Под заказ — от двух недель' : 'Есть в мастерской'",
      "'Made to order, takes at least two weeks' : 'In stock at the studio'",
    ],
    ["'Заказать' : 'Узнать цену'", "'Order' : 'Ask for a price'"],
    [
      '>Оставьте телефон — мастер перезвонит и расскажет о сроках и доставке.</p>',
      '>Leave your phone number and we will call you back about timing and delivery.</p>',
    ],
  ],
};

const _sources = (
  sources: Readonly<Record<string, string>>
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(sources).map(({ 0: name, 1: source }) => [
      name,
      translated(source, _PAIRS[name] ?? []),
    ])
  );

type Item = {
  readonly title: string;
  readonly intro: string;
  readonly text: string;
  readonly specs: readonly (readonly [string, string])[];
  readonly price?: number;
  readonly old?: number;
  readonly sku: string;
  readonly badge?: string;
  readonly made?: boolean;
};

const _CARE =
  '<p>All glazes are food safe. Pieces can go in the dishwasher and the microwave, but avoid sudden changes in temperature: clay does not like them.</p>';

const _product = (item: Item): ScaffoldPage => ({
  title: item.title,
  template: 'Product',
  introText: item.intro,
  description: item.intro,
  content: `<p>${item.text}</p>\n${specs(item.specs)}\n${_CARE}`,
  hiddenFromMenu: true,
  fields: {
    sku: item.sku,
    inStock: !item.made,
    ...(item.price ? { price: item.price } : {}),
    ...(item.old ? { oldPrice: item.old } : {}),
    ...(item.badge ? { badge: item.badge } : {}),
  },
});

// Адреса разделов — английские слова вместо транслита русской витрины.
const _CATEGORIES: readonly {
  readonly title: string;
  readonly alias: string;
  readonly intro: string;
  readonly items: readonly Item[];
}[] = [
  {
    title: 'Tableware',
    alias: 'tableware',
    intro:
      'Mugs, plates and bowls for everyday use, made from stoneware that handles hot food with ease.',
    items: [
      {
        title: 'Morning Mug',
        intro:
          'Thick walls keep your coffee warm, and the handle fits three fingers.',
        text: 'We throw each mug on the wheel, then pull the handle separately and attach it by hand, so no two are quite alike. The outside has a matte sand glaze, the inside a pale gloss.',
        specs: [
          ['Capacity', '12 oz'],
          ['Height', '3.5 in'],
          ['Clay', 'stoneware'],
          ['Glaze', 'matte outside, glossy inside'],
        ],
        price: 32,
        sku: 'KL-101',
        badge: 'Bestseller',
      },
      {
        title: 'Linen Plate',
        intro:
          "A dinner plate with an uneven rim and the potter's fingerprints.",
        text: 'We never trim the rim to a template, so it stays the way the hand left it. The gray linen glaze looks just as good under soup as under dessert.',
        specs: [
          ['Diameter', '10 in'],
          ['Clay', 'stoneware'],
          ['Glaze', 'satin, gray linen'],
        ],
        price: 38,
        sku: 'KL-102',
      },
      {
        title: 'Mist Bowl',
        intro: 'For tea, rice and morning oatmeal.',
        text: 'The glaze runs down the walls and pools at the bottom like a thick cloud, so every bowl has a pattern of its own.',
        specs: [
          ['Capacity', '8 oz'],
          ['Diameter', '4.3 in'],
          ['Glaze', 'blue celadon'],
        ],
        price: 22,
        sku: 'KL-103',
        badge: 'New',
      },
      {
        title: 'Noon Salad Bowl',
        intro: 'A large serving bowl for the whole family.',
        text: 'We make these to order in small batches. Drying and two firings take about two weeks.',
        specs: [
          ['Capacity', '40 oz'],
          ['Diameter', '9.5 in'],
          ['Glaze', 'ochre with a dark rim'],
        ],
        price: 58,
        sku: 'KL-104',
        made: true,
      },
    ],
  },
  {
    title: 'Vases and pitchers',
    alias: 'vases',
    intro: 'For dried flowers, branches, or a single bloom from the garden.',
    items: [
      {
        title: 'Wheat Vase',
        intro: 'A tall vase for dried grasses and branches.',
        text: 'The narrow neck holds stems upright, and the heavy base keeps the vase from tipping over.',
        specs: [
          ['Height', '12.5 in'],
          ['Clay', 'grogged stoneware'],
          ['Glaze', 'none outside, bare terracotta'],
        ],
        price: 96,
        sku: 'KL-201',
      },
      {
        title: 'Spring Pitcher',
        intro: 'For water, lemonade and wildflowers.',
        text: 'We pull the spout with our fingers while the clay is still wet, so water pours in a thin stream and does not drip.',
        specs: [
          ['Capacity', '34 oz'],
          ['Height', '8.5 in'],
          ['Glaze', 'cobalt with a white rim'],
        ],
        price: 68,
        old: 78,
        sku: 'KL-202',
        badge: 'Sale',
      },
      {
        title: 'Night Vase',
        intro: 'A dark bottle vase with a metallic sheen.',
        text: 'A manganese glaze fires to a deep black that turns bronze where the light hits it.',
        specs: [
          ['Height', '10 in'],
          ['Glaze', 'metallic black'],
        ],
        price: 62,
        sku: 'KL-203',
        badge: 'New',
      },
    ],
  },
  {
    title: 'For the home',
    alias: 'home-goods',
    intro:
      'Candle holders, planters and small things that make a home feel warmer.',
    items: [
      {
        title: 'Evening Candle Holder',
        intro: 'For one thick candle or three small ones.',
        text: 'A wide saucer catches the wax, so you can set the holder right on a wooden table.',
        specs: [
          ['Diameter', '5.5 in'],
          ['Glaze', 'milk white'],
        ],
        price: 26,
        sku: 'KL-301',
      },
      {
        title: 'Roots Planter',
        intro:
          'With a drainage hole and a saucer, for a plant in a pot up to 6 in across.',
        text: 'We will match the size and color to your plant. Tell us what it is and send a photo of the spot where the planter will stand.',
        specs: [
          ['Size', 'made to your measurements'],
          ['Lead time', 'two weeks or more'],
        ],
        sku: 'KL-302',
        made: true,
      },
      {
        title: 'Pebble Trivets',
        intro: 'A set of four trivets that look like river stones.',
        text: 'The undersides are left unglazed, so the trivets stay put on the table.',
        specs: [
          ['In the set', '4 pieces'],
          ['Diameter', '4 to 4.75 in'],
        ],
        price: 30,
        sku: 'KL-303',
      },
    ],
  },
];

const _HOME = `[[CategoryList parent=@{catalog} title="Catalog"]]
[[ProductGrid parent=@{catalog} depth=2 perPage=4 sort="published" columns=4 title="New arrivals" unavailable="Made to order"]]
<h2>The studio</h2>
<p>We are two potters who share one studio. We throw on the wheel and build by hand, fire every piece twice, and no two pieces come out the same. Everything in the catalog can be seen and held in person.</p>
<p><a href="[~@{about}~]">How we work</a></p>`;

/** Витрина по-английски: та же структура, ключи страниц и элементы, что у русской. */
export var SHOWCASE_EN: Scaffold = {
  ...SHOWCASE,
  title: 'Showcase',
  summary: 'a catalog with sections and a price request on every product',
  siteName: 'Kiln Lane Pottery',
  language: 'en',
  description: 'Handmade dishes and pieces for the home',
  // Компоненты каталога — уже переведённые, Layout — своими парами; порядок ключей — как у русской.
  components: {
    ..._sources(SHOWCASE.components ?? {}),
    ...CATALOG_COMPONENTS_EN,
  },
  templates: _sources(SHOWCASE.templates),
  fields: catalogFieldsEn('Product', 'Category'),
  forms: {
    request: {
      title: 'Product inquiry',
      source: formSource(
        input('text', 'name', 'Name', { required: true, maxLength: 100 }),
        input('tel', 'phone', 'Phone', {
          required: true,
          placeholder: '+1 212 555 0100',
          pattern: '\\+?[0-9 .\\(\\)\\-]{10,}',
          message: 'Enter a phone number, for example +1 212 555 0100',
        }),
        textarea('comment', 'Comment', {
          maxLength: 2000,
          hint: 'Color, quantity, and when you need it',
        }),
        hidden('product', 'Product', 'page.title'),
        hidden('url', 'Page URL', 'page.url'),
        consent('consent', 'I agree to the {privacy policy}', 'policy')
      ),
      submitLabel: 'Send',
      successText:
        'Thank you! We will call you back within a day about availability and timing.',
      subject: 'Inquiry: {product}',
    },
  },
  settings: {
    searchPage: '@{search}',
    phone: '+1 212 555 0142',
    email: 'hello@example.com',
    address: '27 Kiln Lane, Springfield, side entrance',
    hours: 'Mon–Sat, 11 am to 7 pm',
    currency: '$',
    catalog: '@{catalog}',
    request: '@{request}',
    policy: '@{policy}',
  },
  pages: [
    {
      key: 'home',
      title: 'Home',
      longTitle: 'Handmade dishes for every day',
      introText:
        'We shape, fire and glaze everything in a small studio. Each piece is one of a kind or part of a small batch.',
      template: 'Home',
      content: _HOME,
    },
    {
      key: 'catalog',
      title: 'Catalog',
      alias: 'catalog',
      template: 'Catalog',
      content:
        '<p>Everything we have at the studio right now, plus the pieces we make to order.</p>',
      description: 'Handmade tableware, vases and pieces for the home',
      children: _CATEGORIES.map((_) => ({
        title: _.title,
        alias: _.alias,
        template: 'Category',
        content: `<p>${_.intro}</p>`,
        description: _.intro,
        children: _.items.map(_product),
      })),
    },
    {
      key: 'about',
      title: 'About the studio',
      alias: 'about',
      template: 'Page',
      content: `<p>The studio has been open since 2015. There are two of us: one throws on the wheel, the other looks after the glazes and the kiln.</p>
<h2>How a piece is made</h2>
<ol>
<li>The form is shaped on the potter's wheel or by hand.</li>
<li>A week of drying, then the first firing at about 1650 °F.</li>
<li>Glazing and a second firing at about 2260 °F. After that the piece holds water and is fine in the dishwasher.</li>
</ol>
<p>Replace this text with the story of your own studio. Product photos go into the Cover field of each product, and you can add more to the text from the media library.</p>`,
    },
    {
      title: 'Shipping and payment',
      alias: 'delivery',
      template: 'Page',
      content: `<p>The site does not take online payments. After you send a request, we call you back, confirm the order and send you the payment details.</p>
<h2>Shipping</h2>
<ul>
<li>Pickup at the studio: free, during opening hours.</li>
<li>Local courier: $10, next day.</li>
<li>Shipping anywhere in the country: carrier rates apply. Every piece is packed in a box with corrugated cardboard.</li>
</ul>
<h2>Payment</h2>
<p>By bank transfer, or by card when you pick up or receive the order. Made-to-order pieces need a 50% deposit.</p>`,
    },
    {
      title: 'Contact',
      alias: 'contacts',
      template: 'Page',
      content: `<p>The studio is open to visitors. Come by and see the pieces in person.</p>
<table><tbody>
<tr><th>Address</th><td>[@address]</td></tr>
<tr><th>Hours</th><td>[@hours]</td></tr>
<tr><th>Phone</th><td>[@phone]</td></tr>
<tr><th>Email</th><td>[@email]</td></tr>
</tbody></table>
<h2>Send us a message</h2>
[#Form:request]`,
    },
    {
      key: 'policy',
      title: 'Privacy policy',
      alias: 'privacy',
      template: 'Page',
      content: policyEn('the studio named on this site'),
      hiddenFromMenu: true,
      searchable: false,
    },
    {
      key: 'request',
      title: 'Request',
      alias: 'request',
      template: 'Page',
      content:
        '<p>Leave your phone number and we will call you back about availability, timing and delivery.</p>\n[#Form:request]',
      hiddenFromMenu: true,
      searchable: false,
    },
    {
      key: 'not-found',
      title: 'Page not found',
      alias: '404',
      template: 'Page',
      content:
        '<p>There is no such page here. Perhaps the piece has already sold. Have a look at the <a href="[~@{catalog}~]">catalog</a> or go back <a href="/">home</a>.</p>',
      hiddenFromMenu: true,
      searchable: false,
    },
    {
      key: 'search',
      title: 'Search',
      alias: 'search',
      template: 'Page',
      content: '[[SearchResults]]',
      hiddenFromMenu: true,
      searchable: false,
    },
  ],
};

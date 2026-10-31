import { type Translation, translated } from '../../kit/translated.ts';
import {
  CATALOG_COMPONENTS_EN,
  catalogFieldsEn,
  policyEn,
} from '../catalog/en.ts';
import { specs } from '../catalog/index.ts';
import { consent, formSource, input, select, textarea } from '../form-html.ts';
import type { Scaffold, ScaffoldPage } from '../scaffold.ts';
import { SHOP } from './index.ts';

// Магазин по-английски: разметка и стили — те же исходники, что у русского, подписи и комментарии — парами
// перевода; компоненты каталога — из catalog/en.ts, тексты страниц, формы и поля — свои.

const _PAIRS: Readonly<Record<string, Translation>> = {
  CartStore: [
    [
      `Корзина в браузере: строки заказа в localStorage, событие \`cart:change\` между островами на странице и
событие \`storage\` между вкладками. Ничего не выводит — его функции берут острова AddToCart, CartLink и Cart.`,
      `The cart in the browser: order lines in localStorage, the \`cart:change\` event between islands on a page
and the \`storage\` event between tabs. It renders nothing: the AddToCart, CartLink and Cart islands use its functions.`,
    ],
    [
      '/** Строки корзины; битые и чужие записи пропускаются. */',
      '/** Cart lines; broken and foreign entries are skipped. */',
    ],
    [
      '/** Подписка на перемены корзины здесь и в других вкладках; возвращает отписку. */',
      '/** Subscribes to cart changes here and in other tabs; returns the unsubscribe function. */',
    ],
    [
      '/** Добавить или изменить количество; ноль убирает строку. */',
      '/** Adds a line or changes its quantity; zero removes the line. */',
    ],
    // По-английски знак валюты — перед числом: $1,200.
    [
      `\`\${new Intl.NumberFormat('ru', { maximumFractionDigits: 0 }).format(amount)} \${currency}\``,
      // Доллары — с центами, если они есть: $12.49, но $12.
      `\`\${currency}\${new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2, trailingZeroDisplay: 'stripIfInteger' }).format(amount)}\``,
    ],
  ],
  AddToCart: [
    [
      `Кнопка «В корзину» на странице товара — остров: корзина живёт в браузере покупателя. Под кнопкой —
сколько этого товара уже в корзине и ссылка на неё.`,
      `The "Add to cart" button on a product page. It is an island: the cart lives in the shopper's browser.
Under the button, how many of this product are already in the cart and a link to it.`,
    ],
    ['/** Товар: id страницы */', '/** Product: page id */'],
    ['/** Название в корзине */', '/** Name in the cart */'],
    ['/** Цена за штуку */', '/** Price per item */'],
    ['/** Адрес товара */', '/** Product URL */'],
    ['/** Адрес корзины */', '/** Cart URL */'],
    ['/** Товар в наличии */', '/** The product is in stock */'],
    ['/** Надпись кнопки */', '/** Button label */'],
    ["label = 'В корзину',", "label = 'Add to cart',"],
    [
      '/** Надпись, когда товара нет */',
      '/** Label when the product is out of stock */',
    ],
    ["unavailable = 'Нет в наличии',", "unavailable = 'Out of stock',"],
    [
      'В корзине: {inCart} шт. · <a href={cartUrl}>Оформить заказ</a>',
      'In your cart: {inCart} · <a href={cartUrl}>Check out</a>',
    ],
  ],
  CartLink: [
    [
      'Ссылка на корзину в шапке с числом товаров — остров: число берётся из корзины в браузере.',
      'The cart link in the header with the item count. It is an island: the count comes from the cart in the browser.',
    ],
    ['/** Адрес корзины */', '/** Cart URL */'],
    ['/** Подпись */', '/** Label */'],
    ["label = 'Корзина',", "label = 'Cart',"],
  ],
  Cart: [
    [
      `Корзина на странице оформления — остров: строки с количеством и итог. Состав заказа текстом кладётся
в поле \`items\` формы заказа на той же странице; блок \`[data-checkout]\` с формой виден, пока корзина не
пуста. После отправки формы корзина очищается.`,
      `The cart on the checkout page, an island: lines with quantities and the total. The order goes as text into
the \`items\` field of the order form on the same page; the \`[data-checkout]\` block with the form is visible
while the cart is not empty. Once the form is sent, the cart is cleared.`,
    ],
    ['/** Валюта */', '/** Currency */'],
    ["currency = '₽',", "currency = '$',"],
    [
      '/** Адрес каталога для пустой корзины */',
      '/** Catalog URL for an empty cart */',
    ],
    ['/** Имя формы заказа */', '/** Order form name */'],
    ['/** Текст пустой корзины */', '/** Text of an empty cart */'],
    ["empty = 'В корзине пока пусто.',", "empty = 'Your cart is empty.',"],
    [
      '/** Текст после отправки заказа */',
      '/** Text after the order is sent */',
    ],
    [
      "done = 'Заказ отправлен, корзина очищена.',",
      "done = 'Your order has been sent and the cart is now empty.',",
    ],
    [
      `\`Итого: \${money(totalOf(all), currency)}\``,
      `\`Total: \${money(totalOf(all), currency)}\``,
    ],
    [
      '// Форма заказа — разметка страницы, а не острова: её поле и блок находятся по имени.',
      '// The order form is page markup, not part of the island: its field and block are found by name.',
    ],
    ['>Загружаем корзину…</p>', '>Loading your cart…</p>'],
    ['>Вернуться в каталог</a>', '>Back to the catalog</a>'],
    [
      'aria-label="Количество: {line.title}"',
      'aria-label="Quantity: {line.title}"',
    ],
    ['aria-label="Меньше"', 'aria-label="Decrease quantity"'],
    ['aria-label="Больше"', 'aria-label="Increase quantity"'],
    ['aria-label="Убрать «{line.title}»"', 'aria-label="Remove {line.title}"'],
    ['<p class="total">Итого <strong>', '<p class="total">Total <strong>'],
    ['>Перейти в каталог</a>', '>Browse the catalog</a>'],
  ],
  Layout: [
    [
      `Рамка страницы магазина: шапка с названием, меню и корзиной, страница, подвал с контактами. Здесь же
цвета и шрифты сайта: переменные \`--t-*\` подхватывают компоненты набора, \`--plate-*\` — плашки товаров.`,
      `The store page frame: a header with the name, menu and cart, the page, a footer with contacts. Site colors
and fonts live here too: kit components pick up the \`--t-*\` variables, product plates the \`--plate-*\` ones.`,
    ],
    ['/** Страница шаблона */', '/** The template page */'],
    ['>К содержимому</a>', '>Skip to content</a>'],
    ['>Политика конфиденциальности</a>', '>Privacy policy</a>'],
    [
      '/* Чаи: зелёный, улун, красный, жасмин, пуэр, травы. */',
      '/* Teas: green, oolong, red, jasmine, pu-erh, herbal. */',
    ],
    [
      '/* Подвал прижат к низу и на короткой странице. */',
      '/* The footer stays at the bottom even on a short page. */',
    ],
    [
      '/* Текст страницы: нулевая специфичность — стили компонентов внутри текста сильнее. */',
      '/* Page text: zero specificity, so component styles inside the text win. */',
    ],
  ],
  Home: [['>Выбрать чай</a>', '>Browse our teas</a>']],
  Catalog: [['title="Весь чай"', 'title="All teas"']],
  Product: [
    [
      "'Нет в наличии' : 'В наличии, отправим за 1–2 дня'",
      "'Out of stock' : 'In stock, ships in 1–2 days'",
    ],
    ['>Артикул {fields.sku}</p>', '>SKU {fields.sku}</p>'],
  ],
  CartPage: [
    ['aria-label="Товары в корзине"', 'aria-label="Items in your cart"'],
    [
      '<!-- Остров Cart прячет этот блок, пока корзина пуста, и пишет состав заказа в поле формы. -->',
      '<!-- The Cart island hides this block while the cart is empty and writes the order into the form field. -->',
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

type Tea = {
  readonly title: string;
  readonly intro: string;
  readonly text: string;
  readonly weight: string;
  readonly region: string;
  readonly brew: string;
  readonly price: number;
  readonly old?: number;
  readonly sku: string;
  readonly badge?: string;
  readonly out?: boolean;
};

const _product = (tea: Tea): ScaffoldPage => ({
  title: tea.title,
  template: 'Product',
  introText: tea.intro,
  description: tea.intro,
  content: `<p>${tea.text}</p>\n${specs([
    ['Weight', tea.weight],
    ['Origin', tea.region],
    ['Brewing', tea.brew],
  ])}`,
  hiddenFromMenu: true,
  fields: {
    price: tea.price,
    sku: tea.sku,
    inStock: !tea.out,
    ...(tea.old ? { oldPrice: tea.old } : {}),
    ...(tea.badge ? { badge: tea.badge } : {}),
  },
});

const _CATEGORIES: readonly {
  readonly title: string;
  readonly alias: string;
  readonly intro: string;
  readonly teas: readonly Tea[];
}[] = [
  {
    title: 'Green tea',
    alias: 'green',
    intro:
      'Fresh, grassy and a little sweet. Brew it with water no hotter than 175 °F.',
    teas: [
      {
        title: 'Dragon Well',
        intro: 'Flat leaves with notes of roasted chestnut and fresh greens.',
        text: 'The best-known green tea in China, also sold as Longjing. The leaves are pan-fired by hand in large woks, which is why they come out flat and smooth, and the cup is pale with a nutty sweetness.',
        weight: '2 oz',
        region: 'Zhejiang, China',
        brew: '175 °F, 2–3 minutes',
        price: 18,
        sku: 'T-101',
        badge: 'Bestseller',
      },
      {
        title: 'Bi Luo Chun',
        intro: 'Tightly curled buds with a fruity aroma.',
        text: 'The tea bushes grow among apricot and peach trees, and you can taste it in the cup. Brew it in a glass: watching the spirals unfurl is half the pleasure.',
        weight: '2 oz',
        region: 'Jiangsu, China',
        brew: '165 °F, 2 minutes',
        price: 16,
        sku: 'T-102',
      },
      {
        title: 'Sencha',
        intro:
          'An everyday Japanese tea: bright and fresh, with a slight bitter edge.',
        text: 'The leaves are steamed rather than pan-fired. That gives sencha its savory, slightly grassy taste with a hint of the sea, and a deep green cup.',
        weight: '4 oz',
        region: 'Shizuoka, Japan',
        brew: '160 °F, 1 minute',
        price: 12,
        old: 15,
        sku: 'T-103',
        badge: 'Sale',
      },
    ],
  },
  {
    title: 'Oolong',
    alias: 'oolong',
    intro:
      'Somewhere between green and red tea, from floral to deeply roasted.',
    teas: [
      {
        title: 'Tie Guan Yin',
        intro: 'A floral oolong with a lilac aroma and a creamy finish.',
        text: 'Light oxidation and tightly rolled leaves. The same leaves hold up for five or six infusions, and each one tastes a little different.',
        weight: '2 oz',
        region: 'Fujian, China',
        brew: '195 °F, 30-second infusions',
        price: 19,
        sku: 'T-201',
        badge: 'Bestseller',
      },
      {
        title: 'Da Hong Pao',
        intro: 'A rock oolong: roasted and mineral, with a long, sweet finish.',
        text: 'It grows on the cliffs of the Wuyi Mountains, and after picking the leaves are slowly roasted over charcoal. A warm, deep tea for a cold evening.',
        weight: '2 oz',
        region: 'Wuyi Mountains, China',
        brew: '205 °F, 20-second infusions',
        price: 26,
        sku: 'T-202',
      },
      {
        title: 'Milk Oolong',
        intro:
          'Soft and creamy, a favorite with people who are new to loose-leaf tea.',
        text: 'The creamy taste comes from the tea cultivar and the weather at harvest time. It is just as good in a teapot as in a big mug.',
        weight: '4 oz',
        region: 'Taiwan',
        brew: '185 °F, 3 minutes',
        price: 14,
        sku: 'T-203',
      },
      {
        title: 'GABA Oolong',
        intro: 'Rich and honeyed, with notes of dried fruit.',
        text: 'The fresh leaves rest without oxygen before processing, which gives the tea its full, fruity flavor. A new batch arrives next month.',
        weight: '2 oz',
        region: 'Taiwan',
        brew: '195 °F, 2 minutes',
        price: 22,
        sku: 'T-204',
        out: true,
      },
    ],
  },
  {
    title: 'Red tea',
    alias: 'red',
    intro: 'What the West calls black tea: honeyed, bready and warming.',
    teas: [
      {
        title: 'Dian Hong',
        intro: 'Golden buds with flavors of honey and fresh-baked bread.',
        text: 'A red tea from Yunnan that never turns bitter, even after a long steep. Good with milk.',
        weight: '4 oz',
        region: 'Yunnan, China',
        brew: '195 °F, 3–4 minutes',
        price: 16,
        sku: 'T-301',
        badge: 'New',
      },
      {
        title: 'Jin Jun Mei',
        intro:
          'A rare tea made only of buds: chocolate, dried fruit and a long finish.',
        text: 'Each 2 oz pack takes several thousand buds, picked by hand in early spring.',
        weight: '2 oz',
        region: 'Fujian, China',
        brew: '185 °F, 30-second infusions',
        price: 30,
        sku: 'T-302',
      },
      {
        title: 'Assam',
        intro: 'Strong and malty, for breakfast and for tea with milk.',
        text: 'The classic Indian tea: a rich, dark cup that keeps you going all morning.',
        weight: '4 oz',
        region: 'Assam, India',
        brew: '205 °F, 4 minutes',
        price: 11,
        sku: 'T-303',
      },
    ],
  },
];

const _HOME = `[[CategoryList parent=@{catalog} title="Catalog"]]
[[ProductGrid parent=@{catalog} depth=2 perPage=4 columns=4 title="Bestsellers"]]
<h2>How to order</h2>
<ol>
<li><b>Fill your cart.</b> Prices are per pack, and every tea lists its weight.</li>
<li><b>Place your order.</b> There is no online payment: just leave your phone number and address.</li>
<li><b>We call you back</b> within an hour during business hours to confirm the order and delivery.</li>
</ol>`;

const _CHECKOUT = `<h2>Checkout</h2>
<p>There is no online payment on this site. Once you order, we call you to confirm the items and delivery. You pay when you get your tea, by card or cash.</p>
[#Form:order]`;

/** Магазин по-английски: та же структура, ключи страниц и элементы, что у русского. */
export var SHOP_EN: Scaffold = {
  ...SHOP,
  title: 'Online store',
  summary: 'a catalog, a cart and checkout',
  siteName: 'Little Leaf Tea',
  language: 'en',
  description: 'Loose-leaf tea from small farms',
  // Компоненты каталога переведены в catalog/en.ts; порядок ключей остаётся русским.
  components: { ..._sources(SHOP.components ?? {}), ...CATALOG_COMPONENTS_EN },
  templates: _sources(SHOP.templates),
  fields: catalogFieldsEn('Product', 'Category'),
  forms: {
    order: {
      title: 'Order',
      source: formSource(
        input('text', 'name', 'Name', { required: true, maxLength: 100 }),
        input('tel', 'phone', 'Phone', {
          required: true,
          placeholder: '+1 202 555-0100',
          pattern: '\\+?[0-9 .\\(\\)\\-]{10,}',
          message: 'Enter a phone number, like +1 202 555-0100',
        }),
        input('email', 'email', 'Email', {
          hint: 'We will send your order confirmation here',
        }),
        select(
          'delivery',
          'Delivery',
          ['Local delivery', 'Store pickup', 'Shipping'],
          { required: true, placeholder: 'Choose…' }
        ),
        input('text', 'address', 'Address', {
          maxLength: 300,
          hint: 'For local delivery and shipping',
        }),
        textarea('comment', 'Comments', { maxLength: 2000 }),
        textarea('items', 'Your order', {
          required: true,
          maxLength: 5000,
          hint: 'Filled in from your cart',
        }),
        consent('consent', 'I agree to the {privacy policy}', 'policy')
      ),
      submitLabel: 'Place order',
      successText:
        'Thank you, we have your order! We will call you within an hour during business hours to confirm the items and delivery.',
      subject: 'Order: {name}',
    },
  },
  settings: {
    ...SHOP.settings,
    phone: '+1 202 555-0100',
    email: 'shop@example.com',
    address: '214 Maple Street, Springfield',
    hours: 'Daily, 10 AM to 8 PM',
    currency: '$',
  },
  pages: [
    {
      key: 'home',
      title: 'Home',
      longTitle: 'Tea worth brewing every day',
      introText:
        'We bring in loose-leaf tea from small farms in China, Taiwan, India and Japan. We taste every batch ourselves and tell you plainly how to brew it.',
      template: 'Home',
      content: _HOME,
    },
    {
      key: 'catalog',
      title: 'Catalog',
      alias: 'catalog',
      template: 'Catalog',
      content: '<p>All the tea we have in the shop right now.</p>',
      description: 'Green, oolong and red loose-leaf tea',
      children: _CATEGORIES.map((_) => ({
        title: _.title,
        alias: _.alias,
        template: 'Category',
        content: `<p>${_.intro}</p>`,
        description: _.intro,
        children: _.teas.map(_product),
      })),
    },
    {
      title: 'Shipping and payment',
      alias: 'delivery',
      template: 'Page',
      content: `<p>There is no online payment on this site. After you order, we call you to confirm the items and a delivery time that works for you.</p>
<h2>Delivery</h2>
<ul>
<li>Local delivery in town: $5, free on orders over $50. Arrives the next day.</li>
<li>Store pickup: free, during opening hours.</li>
<li>Shipping anywhere in the US: carrier rates, 3–7 business days.</li>
</ul>
<h2>Payment</h2>
<p>Pay the courier or pay at the shop, by card or cash. For orders we ship, we email you an invoice after the call.</p>`,
    },
    {
      title: 'About us',
      alias: 'about',
      template: 'Page',
      content: `<p>Little Leaf Tea is a small loose-leaf tea shop. We buy in small batches, taste each one ourselves and put brewing notes on every tea's page.</p>
<h2>How this store works</h2>
<p>Products are child pages of the catalog sections and use the Product template. The price, old price, SKU, stock and badge are page fields. The cart lives in the shopper's browser, and each order arrives in Forms as a submission, where you can set its status and add notes. To hear about new orders, turn on notifications in Settings → Notifications.</p>
<p>The phone, email, address, hours and currency are in Settings → Custom settings. Change them there, and the footer, the Contact page and the prices follow.</p>
<p>Replace this text with the story of your own store.</p>`,
    },
    {
      title: 'Contact',
      alias: 'contacts',
      template: 'Page',
      content: `<table><tbody>
<tr><th>Shop address</th><td>[@address]</td></tr>
<tr><th>Hours</th><td>[@hours]</td></tr>
<tr><th>Phone</th><td>[@phone]</td></tr>
<tr><th>Email</th><td>[@email]</td></tr>
</tbody></table>
<p>Stop by and taste before you buy: we will brew any tea from the catalog for you.</p>`,
    },
    {
      key: 'cart',
      title: 'Cart',
      alias: 'cart',
      template: 'CartPage',
      content: _CHECKOUT,
      hiddenFromMenu: true,
      searchable: false,
    },
    {
      key: 'policy',
      title: 'Privacy policy',
      alias: 'privacy',
      template: 'Page',
      content: policyEn('the store named on this site'),
      hiddenFromMenu: true,
      searchable: false,
    },
    {
      key: 'not-found',
      title: 'Page not found',
      alias: '404',
      template: 'Page',
      content:
        '<p>There is no such page here. Maybe this tea has sold out. Have a look at the <a href="[~@{catalog}~]">catalog</a> or go back to the <a href="/">home page</a>.</p>',
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

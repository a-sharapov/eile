import {
  CATALOG_COMPONENTS,
  catalogFields,
  policy,
  specs,
} from '../catalog/index.ts';
import { consent, formSource, input, select, textarea } from '../form-html.ts';
import type { Scaffold, ScaffoldPage } from '../scaffold.ts';
import addToCart from './AddToCart.svelte' with { type: 'text' };
import cart from './Cart.svelte' with { type: 'text' };
import cartLink from './CartLink.svelte' with { type: 'text' };
import cartPage from './CartPage.svelte' with { type: 'text' };
import cartStore from './CartStore.svelte' with { type: 'text' };
import catalog from './Catalog.svelte' with { type: 'text' };
import category from './Category.svelte' with { type: 'text' };
import home from './Home.svelte' with { type: 'text' };
import layout from './Layout.svelte' with { type: 'text' };
import page from './Page.svelte' with { type: 'text' };
import product from './Product.svelte' with { type: 'text' };

// Импорт текстом; собственные типы Svelte для `*.svelte` описывают компонент.
const _text = (source: unknown): string => source as string;

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
    ['Вес', tea.weight],
    ['Откуда', tea.region],
    ['Заваривание', tea.brew],
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
    title: 'Зелёный чай',
    alias: 'green',
    intro:
      'Свежий, травянистый и сладковатый — заваривать водой не горячее 80 °C.',
    teas: [
      {
        title: 'Лунцзин',
        intro: 'Плоский лист, вкус жареного каштана и свежей зелени.',
        text: 'Самый известный зелёный чай Китая. Лист обжаривают вручную в котлах, поэтому он плоский и гладкий, а настой — светлый, с ореховой сладостью.',
        weight: '50 г',
        region: 'Чжэцзян, Китай',
        brew: '80 °C, 2–3 минуты',
        price: 890,
        sku: 'Ч-101',
        badge: 'Хит',
      },
      {
        title: 'Би Ло Чунь',
        intro: 'Скрученные спиралью почки с фруктовым ароматом.',
        text: 'Чайные кусты растут между абрикосовыми и персиковыми деревьями — и это слышно во вкусе. Заваривайте в стакане: смотреть, как раскрываются спирали, отдельное удовольствие.',
        weight: '50 г',
        region: 'Цзянсу, Китай',
        brew: '75 °C, 2 минуты',
        price: 760,
        sku: 'Ч-102',
      },
      {
        title: 'Сенча',
        intro:
          'Японский чай на каждый день: яркий, свежий, с лёгкой горчинкой.',
        text: 'Лист пропаривают, а не обжаривают, поэтому у сенчи морской, чуть травянистый вкус и изумрудный настой.',
        weight: '100 г',
        region: 'Сидзуока, Япония',
        brew: '70 °C, 1 минута',
        price: 650,
        old: 790,
        sku: 'Ч-103',
        badge: 'Скидка',
      },
    ],
  },
  {
    title: 'Улун',
    alias: 'oolong',
    intro: 'Между зелёным и красным: от цветочных до глубоких обжаренных.',
    teas: [
      {
        title: 'Те Гуань Инь',
        intro: 'Цветочный улун с ароматом сирени и сливочным послевкусием.',
        text: 'Лёгкая ферментация и плотные шарики листа: один и тот же чай выдерживает пять-шесть проливов, и каждый звучит по-своему.',
        weight: '50 г',
        region: 'Фуцзянь, Китай',
        brew: '90 °C, проливами по 30 секунд',
        price: 950,
        sku: 'Ч-201',
        badge: 'Хит',
      },
      {
        title: 'Да Хун Пао',
        intro: 'Утёсный улун: обжарка, минеральность и долгий сладкий финал.',
        text: 'Растёт на скалах гор Уишань и после сбора долго томится над углями. Тёплый, глубокий чай для холодного вечера.',
        weight: '50 г',
        region: 'Уишань, Китай',
        brew: '95 °C, проливами по 20 секунд',
        price: 1250,
        sku: 'Ч-202',
      },
      {
        title: 'Молочный улун',
        intro: 'Мягкий и сливочный — любимый чай тех, кто только начинает.',
        text: 'Сливочный вкус дают сорт куста и погода во время сбора. Хорош и в чайнике, и в большой кружке.',
        weight: '100 г',
        region: 'Тайвань',
        brew: '85 °C, 3 минуты',
        price: 690,
        sku: 'Ч-203',
      },
      {
        title: 'Габа улун',
        intro: 'Плотный, медовый, с нотами сухофруктов.',
        text: 'Ферментируют без кислорода, поэтому вкус получается фруктовым и насыщенным. Новая партия приедет в следующем месяце.',
        weight: '50 г',
        region: 'Тайвань',
        brew: '90 °C, 2 минуты',
        price: 1100,
        sku: 'Ч-204',
        out: true,
      },
    ],
  },
  {
    title: 'Красный чай',
    alias: 'red',
    intro: 'Тот, что в Европе зовут чёрным: медовый, хлебный, согревающий.',
    teas: [
      {
        title: 'Дянь Хун',
        intro: 'Золотистые почки, вкус мёда и печёного хлеба.',
        text: 'Юньнаньский красный чай, который не горчит даже после долгого заваривания. Можно с молоком.',
        weight: '100 г',
        region: 'Юньнань, Китай',
        brew: '90 °C, 3–4 минуты',
        price: 780,
        sku: 'Ч-301',
        badge: 'Новинка',
      },
      {
        title: 'Цзинь Цзюнь Мэй',
        intro: 'Редкий чай из одних почек: шоколад, сухофрукты, долгий финал.',
        text: 'На 50 граммов уходит несколько тысяч почек, собранных вручную ранней весной.',
        weight: '50 г',
        region: 'Фуцзянь, Китай',
        brew: '85 °C, проливами по 30 секунд',
        price: 1450,
        sku: 'Ч-302',
      },
      {
        title: 'Ассам',
        intro: 'Крепкий, солодовый — для завтрака и чая с молоком.',
        text: 'Классический индийский чай: насыщенный настой и бодрость на всё утро.',
        weight: '100 г',
        region: 'Ассам, Индия',
        brew: '95 °C, 4 минуты',
        price: 520,
        sku: 'Ч-303',
      },
    ],
  },
];

const _HOME = `[[CategoryList parent=@{catalog} title="Каталог"]]
[[ProductGrid parent=@{catalog} depth=2 perPage=4 columns=4 title="Хиты"]]
<h2>Как заказать</h2>
<ol>
<li><b>Соберите корзину.</b> Цена — за пачку, вес указан у каждого чая.</li>
<li><b>Оформите заказ.</b> Онлайн-оплаты нет: оставьте телефон и адрес.</li>
<li><b>Мы перезвоним</b> в течение часа в рабочее время, подтвердим состав и доставку.</li>
</ol>`;

const _CHECKOUT = `<h2>Оформление заказа</h2>
<p>Онлайн-оплаты на сайте нет: после заказа мы перезвоним, подтвердим состав и доставку. Оплата — при получении, картой или наличными.</p>
[#Form:order]`;

/** Интернет-магазин: каталог, корзина в браузере и заказ формой — заявки приходят в «Формы». */
export var SHOP: Scaffold = {
  name: 'shop',
  title: 'Интернет-магазин',
  summary: 'каталог, корзина и оформление заказа',
  siteName: 'Чайная лавка',
  description: 'Листовой чай от небольших хозяйств',
  kit: ['Menu', 'Breadcrumbs', 'Pagination', 'SearchForm', 'SearchResults'],
  components: {
    ...CATALOG_COMPONENTS,
    CartStore: _text(cartStore),
    AddToCart: _text(addToCart),
    CartLink: _text(cartLink),
    Cart: _text(cart),
    Layout: _text(layout),
  },
  templates: {
    Home: _text(home),
    Page: _text(page),
    Catalog: _text(catalog),
    Category: _text(category),
    Product: _text(product),
    CartPage: _text(cartPage),
  },
  fields: catalogFields('Product', 'Category'),
  forms: {
    order: {
      title: 'Заказ',
      source: formSource(
        input('text', 'name', 'Имя', { required: true, maxLength: 100 }),
        input('tel', 'phone', 'Телефон', {
          required: true,
          placeholder: '+7 900 000-00-00',
          pattern: '\\+?[0-9 \\(\\)\\-]{10,}',
          message: 'Нужен телефон: +7 900 000-00-00',
        }),
        input('email', 'email', 'Почта', {
          hint: 'Пришлём на неё подтверждение',
        }),
        select('delivery', 'Доставка', ['Курьер', 'Самовывоз', 'Почта'], {
          required: true,
        }),
        input('text', 'address', 'Адрес', {
          maxLength: 300,
          hint: 'Для курьера и почты',
        }),
        textarea('comment', 'Комментарий', { maxLength: 2000 }),
        textarea('items', 'Состав заказа', {
          required: true,
          maxLength: 5000,
          hint: 'Заполняется из корзины',
        }),
        consent(
          'consent',
          'Согласен на {обработку персональных данных}',
          'policy'
        )
      ),
      submitLabel: 'Отправить заказ',
      successText:
        'Спасибо! Заказ принят. Позвоним в течение часа в рабочее время, чтобы подтвердить состав и доставку.',
      subject: 'Заказ: {name}',
    },
  },
  settings: {
    searchPage: '@{search}',
    phone: '+7 900 000-00-00',
    email: 'shop@example.com',
    address: 'ул. Чайная, 12',
    hours: 'Ежедневно, 10:00–20:00',
    currency: '₽',
    catalog: '@{catalog}',
    cart: '@{cart}',
    policy: '@{policy}',
  },
  pages: [
    {
      key: 'home',
      title: 'Главная',
      longTitle: 'Чай, который хочется заваривать каждый день',
      introText:
        'Привозим листовой чай от небольших хозяйств Китая, Индии и Японии. Пробуем каждую партию сами — и честно пишем, как её заваривать.',
      template: 'Home',
      content: _HOME,
    },
    {
      key: 'catalog',
      title: 'Каталог',
      alias: 'catalog',
      template: 'Catalog',
      content: '<p>Весь чай, который сейчас есть в лавке.</p>',
      description: 'Зелёный, улун и красный листовой чай',
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
      title: 'Доставка и оплата',
      alias: 'delivery',
      template: 'Page',
      content: `<p>Онлайн-оплаты на сайте нет. После заказа мы перезвоним, подтвердим состав и удобное время доставки.</p>
<h2>Доставка</h2>
<ul>
<li>Курьером по городу — 300 ₽, бесплатно от 3000 ₽. На следующий день.</li>
<li>Самовывоз из лавки — бесплатно, в часы работы.</li>
<li>Почтой по стране — по тарифу, 3–10 дней.</li>
</ul>
<h2>Оплата</h2>
<p>Курьеру и в лавке — картой или наличными. Заказы почтой — переводом после звонка.</p>`,
    },
    {
      title: 'О магазине',
      alias: 'about',
      template: 'Page',
      content: `<p>Чайная лавка — маленький магазин листового чая. Мы привозим небольшие партии, пробуем каждую сами и пишем на странице чая, как его заваривать.</p>
<h2>Как устроен этот магазин</h2>
<p>Товары — дочерние страницы разделов каталога с шаблоном Product; цена, старая цена, артикул, наличие и отметка — поля страницы. Корзина живёт в браузере покупателя, а заказ приходит в «Формы» как заявка: там у него статус и заметки. Уведомления о заказах включаются в «Настройки → Уведомления».</p>
<p>Замените этот текст рассказом о своём магазине.</p>`,
    },
    {
      title: 'Контакты',
      alias: 'contacts',
      template: 'Page',
      content: `<table><tbody>
<tr><th>Адрес лавки</th><td>[@address]</td></tr>
<tr><th>Часы</th><td>[@hours]</td></tr>
<tr><th>Телефон</th><td>[@phone]</td></tr>
<tr><th>Почта</th><td>[@email]</td></tr>
</tbody></table>
<p>Приходите попробовать чай перед покупкой — заварим любой из каталога.</p>`,
    },
    {
      key: 'cart',
      title: 'Корзина',
      alias: 'cart',
      template: 'CartPage',
      content: _CHECKOUT,
      hiddenFromMenu: true,
      searchable: false,
    },
    {
      key: 'policy',
      title: 'Политика конфиденциальности',
      alias: 'privacy',
      template: 'Page',
      content: policy('магазин, указанный на этом сайте'),
      hiddenFromMenu: true,
      searchable: false,
    },
    {
      key: 'not-found',
      title: 'Страница не найдена',
      alias: '404',
      template: 'Page',
      content:
        '<p>Такой страницы нет — возможно, этот чай закончился. Загляните в <a href="[~@{catalog}~]">каталог</a> или вернитесь <a href="/">на главную</a>.</p>',
      hiddenFromMenu: true,
      searchable: false,
    },
    {
      key: 'search',
      title: 'Поиск',
      alias: 'search',
      template: 'Page',
      content: '[[SearchResults]]',
      hiddenFromMenu: true,
      searchable: false,
    },
  ],
  home: 'home',
  notFound: 'not-found',
};

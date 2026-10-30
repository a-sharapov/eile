import {
  CATALOG_COMPONENTS,
  catalogFields,
  policy,
  specs,
} from '../catalog/index.ts';
import { consent, formSource, hidden, input, textarea } from '../form-html.ts';
import type { Scaffold, ScaffoldPage } from '../scaffold.ts';
import catalog from './Catalog.svelte' with { type: 'text' };
import category from './Category.svelte' with { type: 'text' };
import home from './Home.svelte' with { type: 'text' };
import layout from './Layout.svelte' with { type: 'text' };
import page from './Page.svelte' with { type: 'text' };
import product from './Product.svelte' with { type: 'text' };

// Импорт текстом; собственные типы Svelte для `*.svelte` описывают компонент.
const _text = (source: unknown): string => source as string;

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
  '<p>Глазурь пищевая. Посуду можно мыть в посудомоечной машине и ставить в микроволновку; резких перепадов температуры глина не любит.</p>';

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

const _CATEGORIES: readonly {
  readonly title: string;
  readonly alias: string;
  readonly intro: string;
  readonly items: readonly Item[];
}[] = [
  {
    title: 'Посуда',
    alias: 'posuda',
    intro:
      'Кружки, тарелки и пиалы на каждый день: из каменной массы, которая не боится горячего.',
    items: [
      {
        title: 'Кружка «Утро»',
        intro: 'Толстые стенки держат тепло, ручка — под три пальца.',
        text: 'Кружку вытягиваем на круге, ручку лепим отдельно и приставляем вручную, поэтому каждая чуть-чуть своя. Снаружи — матовая песочная глазурь, внутри — светлая глянцевая.',
        specs: [
          ['Объём', '350 мл'],
          ['Высота', '9 см'],
          ['Глина', 'каменная масса'],
          ['Глазурь', 'матовая снаружи, глянцевая внутри'],
        ],
        price: 1900,
        sku: 'ГМ-101',
        badge: 'Хит',
      },
      {
        title: 'Тарелка «Лён»',
        intro: 'Обеденная тарелка с неровным краем и следами пальцев мастера.',
        text: 'Край тарелки не обрезаем по шаблону — он остаётся таким, каким его оставила рука. Серо-льняная глазурь хорошо выглядит и с супом, и с десертом.',
        specs: [
          ['Диаметр', '26 см'],
          ['Глина', 'каменная масса'],
          ['Глазурь', 'полуматовая, серо-льняная'],
        ],
        price: 2400,
        sku: 'ГМ-102',
      },
      {
        title: 'Пиала «Туман»',
        intro: 'Для чая, риса и утренней каши.',
        text: 'Глазурь стекает по стенкам и собирается у дна густым облаком — рисунок у каждой пиалы свой.',
        specs: [
          ['Объём', '250 мл'],
          ['Диаметр', '11 см'],
          ['Глазурь', 'голубой селадон'],
        ],
        price: 1200,
        sku: 'ГМ-103',
        badge: 'Новинка',
      },
      {
        title: 'Салатник «Полдень»',
        intro: 'Большая чаша на всю семью.',
        text: 'Делаем под заказ небольшими партиями: сушка и два обжига занимают около двух недель.',
        specs: [
          ['Объём', '1,2 л'],
          ['Диаметр', '24 см'],
          ['Глазурь', 'охра с тёмным краем'],
        ],
        price: 3600,
        sku: 'ГМ-104',
        made: true,
      },
    ],
  },
  {
    title: 'Вазы и кувшины',
    alias: 'vazy',
    intro: 'Для сухоцветов, веток и одного цветка из сада.',
    items: [
      {
        title: 'Ваза «Колос»',
        intro: 'Высокая ваза для сухих трав и веток.',
        text: 'Узкое горло держит стебли ровно, тяжёлое дно — не даёт вазе опрокинуться.',
        specs: [
          ['Высота', '32 см'],
          ['Глина', 'шамотная масса'],
          ['Глазурь', 'терракота, без глазури снаружи'],
        ],
        price: 6800,
        sku: 'ГМ-201',
      },
      {
        title: 'Кувшин «Родник»',
        intro: 'Для воды, морса и полевых цветов.',
        text: 'Носик вытягиваем пальцами, пока глина сырая, — вода льётся тонкой струйкой и не капает.',
        specs: [
          ['Объём', '1 л'],
          ['Высота', '22 см'],
          ['Глазурь', 'кобальт с белым краем'],
        ],
        price: 4500,
        old: 5200,
        sku: 'ГМ-202',
        badge: 'Скидка',
      },
      {
        title: 'Ваза «Ночь»',
        intro: 'Тёмная ваза-бутылка с металлическим отливом.',
        text: 'Глазурь с марганцем после обжига даёт глубокий чёрный цвет, который на свету отливает бронзой.',
        specs: [
          ['Высота', '26 см'],
          ['Глазурь', 'чёрная металлизированная'],
        ],
        price: 3900,
        sku: 'ГМ-203',
        badge: 'Новинка',
      },
    ],
  },
  {
    title: 'Для дома',
    alias: 'dlya-doma',
    intro: 'Подсвечники, кашпо и мелочи, с которыми дома становится теплее.',
    items: [
      {
        title: 'Подсвечник «Вечер»',
        intro: 'Под толстую свечу или три маленьких.',
        text: 'Широкое блюдце собирает воск, поэтому подсвечник можно ставить прямо на деревянный стол.',
        specs: [
          ['Диаметр', '14 см'],
          ['Глазурь', 'молочная'],
        ],
        price: 1500,
        sku: 'ГМ-301',
      },
      {
        title: 'Кашпо «Корни»',
        intro: 'С отверстием и поддоном, под растение в горшке до 15 см.',
        text: 'Размер и цвет подберём под ваше растение — напишите, какое оно, и пришлите фото места, где будет стоять кашпо.',
        specs: [
          ['Размер', 'по вашим меркам'],
          ['Срок', 'от двух недель'],
        ],
        sku: 'ГМ-302',
        made: true,
      },
      {
        title: 'Подставки «Камешки»',
        intro: 'Четыре подставки под горячее, похожие на речную гальку.',
        text: 'Снизу подставки не покрыты глазурью и не скользят по столу.',
        specs: [
          ['В наборе', '4 шт.'],
          ['Диаметр', '10–12 см'],
        ],
        price: 1800,
        sku: 'ГМ-303',
      },
    ],
  },
];

const _HOME = `[[CategoryList parent=@{catalog} title="Каталог"]]
[[ProductGrid parent=@{catalog} depth=2 perPage=4 sort="published" columns=4 title="Новинки" unavailable="Под заказ"]]
<h2>Мастерская</h2>
<p>Мы — две гончарные мастерские под одной крышей. Лепим на круге и руками, обжигаем дважды и не делаем двух одинаковых вещей. Всё, что есть в каталоге, можно посмотреть и потрогать вживую.</p>
<p><a href="[~@{about}~]">Как мы работаем</a></p>`;

/** Витрина мастерской: каталог с разделами, страница товара с запросом цены в окне, контакты с формой. */
export var SHOWCASE: Scaffold = {
  name: 'showcase',
  title: 'Витрина',
  summary: 'каталог с разделами и запрос цены у товара',
  siteName: 'Гончарная мастерская',
  description: 'Посуда и вещи для дома ручной работы',
  kit: ['Menu', 'Breadcrumbs', 'Pagination', 'Modal', 'ModalButton'],
  components: { ...CATALOG_COMPONENTS, Layout: _text(layout) },
  templates: {
    Home: _text(home),
    Page: _text(page),
    Catalog: _text(catalog),
    Category: _text(category),
    Product: _text(product),
  },
  fields: catalogFields('Product', 'Category'),
  forms: {
    request: {
      title: 'Запрос с витрины',
      source: formSource(
        input('text', 'name', 'Имя', { required: true, maxLength: 100 }),
        input('tel', 'phone', 'Телефон', {
          required: true,
          placeholder: '+7 900 000-00-00',
          pattern: '\\+?[0-9 \\(\\)\\-]{10,}',
          message: 'Нужен телефон: +7 900 000-00-00',
        }),
        textarea('comment', 'Комментарий', {
          maxLength: 2000,
          hint: 'Цвет, количество, к какому сроку',
        }),
        hidden('product', 'Товар', 'page.title'),
        hidden('url', 'Адрес страницы', 'page.url'),
        consent(
          'consent',
          'Согласен на {обработку персональных данных}',
          'policy'
        )
      ),
      submitLabel: 'Отправить',
      successText:
        'Спасибо! Мастер перезвонит в течение дня и расскажет о наличии и сроках.',
      subject: 'Запрос: {product}',
    },
  },
  settings: {
    phone: '+7 900 000-00-00',
    email: 'hello@example.com',
    address: 'ул. Глиняная, 7, вход со двора',
    hours: 'Пн–Сб, 11:00–19:00',
    currency: '₽',
    catalog: '@{catalog}',
    request: '@{request}',
    policy: '@{policy}',
  },
  pages: [
    {
      key: 'home',
      title: 'Главная',
      longTitle: 'Посуда ручной работы для каждого дня',
      introText:
        'Лепим, обжигаем и глазуруем в маленькой мастерской. Каждая вещь — в единственном экземпляре или небольшой серией.',
      template: 'Home',
      content: _HOME,
    },
    {
      key: 'catalog',
      title: 'Каталог',
      alias: 'catalog',
      template: 'Catalog',
      content:
        '<p>Всё, что сейчас есть в мастерской, и то, что делаем под заказ.</p>',
      description: 'Посуда, вазы и вещи для дома ручной работы',
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
      title: 'О мастерской',
      alias: 'about',
      template: 'Page',
      content: `<p>Мастерская работает с 2015 года. Нас двое: один лепит на круге, другой отвечает за глазури и обжиг.</p>
<h2>Как рождается вещь</h2>
<ol>
<li>Форма — на гончарном круге или в руках.</li>
<li>Неделя сушки и первый обжиг при 900 °C.</li>
<li>Глазурь и второй обжиг при 1240 °C: после него посуда не пропускает воду и не боится посудомойки.</li>
</ol>
<p>Замените этот текст рассказом о своей мастерской. Фотографии вещей добавляются в поле «Обложка» товара и в текст из медиатеки.</p>`,
    },
    {
      title: 'Доставка и оплата',
      alias: 'delivery',
      template: 'Page',
      content: `<p>Онлайн-оплаты на сайте нет: после заявки мастер перезвонит, уточнит заказ и пришлёт реквизиты.</p>
<h2>Доставка</h2>
<ul>
<li>Самовывоз из мастерской — бесплатно, в часы работы.</li>
<li>Курьером по городу — 500 ₽, на следующий день.</li>
<li>Транспортной компанией по стране — по тарифу перевозчика; упаковываем в коробку с гофрокартоном.</li>
</ul>
<h2>Оплата</h2>
<p>Переводом по реквизитам или картой при получении. Вещи под заказ — по предоплате 50%.</p>`,
    },
    {
      title: 'Контакты',
      alias: 'contacts',
      template: 'Page',
      content: `<p>Мастерская открыта для гостей — заходите посмотреть вещи вживую.</p>
<table><tbody>
<tr><th>Адрес</th><td>[@address]</td></tr>
<tr><th>Часы</th><td>[@hours]</td></tr>
<tr><th>Телефон</th><td>[@phone]</td></tr>
<tr><th>Почта</th><td>[@email]</td></tr>
</tbody></table>
<h2>Написать нам</h2>
[#Form:request]`,
    },
    {
      key: 'policy',
      title: 'Политика конфиденциальности',
      alias: 'privacy',
      template: 'Page',
      content: policy('мастерская, указанная на этом сайте'),
      hiddenFromMenu: true,
      searchable: false,
    },
    {
      key: 'request',
      title: 'Запрос',
      alias: 'request',
      template: 'Page',
      content:
        '<p>Оставьте телефон — мастер перезвонит, расскажет о наличии, сроках и доставке.</p>\n[#Form:request]',
      hiddenFromMenu: true,
      searchable: false,
    },
    {
      key: 'not-found',
      title: 'Страница не найдена',
      alias: '404',
      template: 'Page',
      content:
        '<p>Такой страницы нет — возможно, вещь уже продана. Загляните в <a href="[~@{catalog}~]">каталог</a> или вернитесь <a href="/">на главную</a>.</p>',
      hiddenFromMenu: true,
      searchable: false,
    },
  ],
  home: 'home',
  notFound: 'not-found',
};

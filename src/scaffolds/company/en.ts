import { type Translation, translated } from '../../kit/translated.ts';
import { consent, formSource, hidden, input, textarea } from '../form-html.ts';
import type { Scaffold } from '../scaffold.ts';
import { COMPANY } from './index.ts';

// Сайт компании по-английски: разметка и стили — те же исходники, что у русского, подписи, комментарии
// и формат цены — парами перевода; тексты страниц, формы, поля и настройки — свои.

const _PAIRS: Readonly<Record<string, Translation>> = {
  Layout: [
    [
      `Рамка страницы сайта компании: шапка с меню, телефоном и кнопкой «Заказать звонок», подвал с контактами.
Окно звонка показывает текст страницы из своей настройки callbackPage. Здесь же цвета и шрифты сайта —
переменные \`--t-*\` подхватывают компоненты набора и формы.`,
      `The company site page frame: a header with the menu, the phone and a "Request a call" button, a footer
with contacts. The call window shows the text of the page set in the custom setting callbackPage. Site colors
and fonts live here too: kit components and forms pick up the \`--t-*\` variables.`,
    ],
    ['/** Страница шаблона */', '/** The template page */'],
    [
      '// Форма звонка уже в тексте страницы — окно с ней же не нужно: кнопка ведёт к форме на странице.',
      '// The page text already has the call form, so no window is needed: the button leads to that form.',
    ],
    ['>К содержанию</a>', '>Skip to content</a>'],
    ['>Заказать звонок</a>', '>Request a call</a>'],
    ['text="Заказать звонок"', 'text="Request a call"'],
    ['title="Заказать звонок"', 'title="Request a call"'],
    ['<dt>Телефон</dt>', '<dt>Phone</dt>'],
    ['<dt>Почта</dt>', '<dt>Email</dt>'],
    ['<dt>Адрес</dt>', '<dt>Address</dt>'],
    ['<dt>Часы</dt>', '<dt>Hours</dt>'],
    ['>Поиск по сайту</a>', '>Search the site</a>'],
    ['>Политика конфиденциальности</a>', '>Privacy policy</a>'],
    [
      '/* Текст страницы: нулевая специфичность — стили компонентов внутри текста сильнее. */',
      '/* Page text: zero specificity, so component styles inside the text win. */',
    ],
    [
      '/* Согласие — галочка и текст строкой, перенос — под текст, а не под галочку. */',
      '/* Consent: the checkbox and the text on one line, wrapped lines align with the text. */',
    ],
    [
      '/* Шапка плотная: поле — на широком экране, иначе лупа; на телефоне поиск — ссылкой в подвале. */',
      '/* The header is tight: a search field on wide screens, a magnifier otherwise; on phones, a footer link. */',
    ],
    [
      '/* Страница кончается цветной полосой — подвал сразу под ней. */',
      '/* When the page ends with a colored band, the footer sits right below it. */',
    ],
    [
      '/* Тесно для строки меню — телефон уходит в подвал, кнопка звонка остаётся. */',
      '/* Too tight for the menu row: the phone moves to the footer, the call button stays. */',
    ],
  ],
  PageHead: [
    [
      'Шапка внутренней страницы: хлебные крошки, заголовок и подзаголовок на светлой полосе.',
      'The head of an inner page: breadcrumbs, a heading and a subheading on a light band.',
    ],
    ['/** Заголовок */', '/** Heading */'],
    [
      '/** Подзаголовок под заголовком */',
      '/** Subheading under the heading */',
    ],
  ],
  ServiceRows: [
    [
      'Услуги строками: название и анонс слева, цена «от» и срок справа. Строка целиком ведёт на страницу услуги.',
      'Services as rows: the name and summary on the left, the starting price and timeline on the right. The whole row links to the service page.',
    ],
    [
      '/** Раздел услуг: id страницы; пусто — текущая */',
      '/** Services section: page id; empty means the current page */',
    ],
    ['/** Подпись цены перед суммой */', '/** Label before the price */'],
    ["from = 'от',", "from = 'from',"],
    ['/** Знак валюты */', '/** Currency sign */'],
    ["currency = '₽',", "currency = '$',"],
    ["new Intl.NumberFormat('ru-RU')", "new Intl.NumberFormat('en-US')"],
    [
      '`${from} ${money.format(value)} ${currency}`',
      '`${from} ${currency}${money.format(value)}`',
    ],
    [
      '/* Одна ссылка на строку, но кликается вся строка. */',
      '/* One link per row, yet the whole row is clickable. */',
    ],
  ],
  LatestNews: [
    [
      'Последние новости раздела: дата, заголовок и анонс, ниже ссылка на все новости.',
      'The latest news of a section: the date, title and summary, with a link to all news below.',
    ],
    ['/** Раздел новостей: id страницы */', '/** News section: page id */'],
    ['/** Сколько новостей */', '/** How many news items */'],
    [
      '/** Подпись ссылки на раздел; пусто — без ссылки */',
      '/** Label of the link to the section; empty means no link */',
    ],
    ["more = 'Все новости',", "more = 'All news',"],
  ],
  Home: [
    ['text="Заказать звонок"', 'text="Request a call"'],
    ['>Услуги и цены</a>', '>Services and prices</a>'],
    ['aria-label="Связаться"', 'aria-label="Get in touch"'],
    [
      '<p>Позвоните — ответит инженер, а не колл-центр</p>',
      '<p>Call us and an engineer picks up, not a call center</p>',
    ],
    [
      '<h2>Расскажите о задаче — перезвоним</h2>',
      "<h2>Tell us about the job, and we'll call you back</h2>",
    ],
    [
      '<p>Уточним, что за объект и что нужно сделать, назовём сроки и стоимость выезда инженера.</p>',
      '<p>We will ask about the building and the work it needs, then give you a timeline and the cost of an engineer visit.</p>',
    ],
    [
      '/* Разделы главной — в тексте страницы: заголовок раздела отделён воздухом. */',
      '/* Home page sections live in the page text: each section heading gets room above it. */',
    ],
  ],
  Service: [
    ["new Intl.NumberFormat('ru-RU')", "new Intl.NumberFormat('en-US')"],
    [
      '`от ${money.format(page.fields.priceFrom)} ₽`',
      '`from $${money.format(page.fields.priceFrom)}`',
    ],
    ['<dt>Стоимость</dt>', '<dt>Price</dt>'],
    ['<dt>Сроки</dt>', '<dt>Timeline</dt>'],
    ['>Заявка на услугу</h2>', '>Service request</h2>'],
    [
      '<p>Опишите объект в паре фраз — инженер перезвонит и уточнит детали.</p>',
      '<p>Describe the building in a sentence or two, and an engineer will call you back to go over the details.</p>',
    ],
    ['Удобнее голосом?', 'Prefer to talk?'],
    ['text="Заказать звонок"', 'text="Request a call"'],
  ],
  News: [['empty="Новостей пока нет."', 'empty="No news yet."']],
  Article: [['>← Все новости</a>', '>← All news</a>']],
  Contacts: [
    ['<dt>Телефон</dt>', '<dt>Phone</dt>'],
    ['<dt>Почта</dt>', '<dt>Email</dt>'],
    ['<dt>Адрес</dt>', '<dt>Address</dt>'],
    ['<dt>Часы работы</dt>', '<dt>Business hours</dt>'],
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

const _NAME = input('text', 'name', 'Name', { required: true, maxLength: 100 });
const _PHONE = input('tel', 'phone', 'Phone', {
  required: true,
  placeholder: '(555) 555-0100',
  pattern: '\\+?[0-9 .\\(\\)\\-]{10,}',
  message: 'Please enter a phone number, like (555) 555-0100',
});
const _CONSENT = consent(
  'consent',
  'I agree to the {privacy policy}',
  'privacy'
);

const _PRICES =
  'We take on a whole building or a single system. Prices are a starting point: we give an exact quote after an engineer visits the site.';

const _HOME = `<h2 id="services">Services</h2>
<p>${_PRICES}</p>
[[ServiceRows parent=@{services}]]
<h2>About us</h2>
<p>We are a small engineering firm with designers, installers and service engineers on one team. The engineer who designed your system comes out for the installation, and the same person looks after it once the job is done.</p>
<p>We work with houses, apartments, offices and small workshops. The estimate is fixed in the contract, and all our work carries a three-year warranty.</p>
<p><a href="[~@{about}~]">More about the company →</a></p>
<h2>News</h2>
[[LatestNews parent=@{news} count=3]]`;

const _SERVICES = [
  {
    title: 'System design',
    introText:
      'Heating, ventilation, plumbing and electrical designs, with calculations and an equipment schedule.',
    fields: { priceFrom: 2500, term: 'from 2 weeks' },
    content: `<p>A good design is the set of calculations your system will run on for years. We start by surveying the building and asking how you use it.</p>
<h2>What's included</h2>
<ul>
<li>A site survey and a written scope of work.</li>
<li>Heat loss and airflow calculations.</li>
<li>Schematics, layout plans and an equipment schedule.</li>
<li>An installation estimate you can hand to any contractor.</li>
</ul>
<h2>What you get</h2>
<p>A full set of drawings in PDF and DWG, a clear estimate and an engineer to answer your questions during installation.</p>`,
  },
  {
    title: 'Heating and plumbing',
    introText:
      'Boilers, radiators, radiant floors and water lines, installed from start to finish.',
    fields: { priceFrom: 6000, term: 'from 5 business days' },
    content: `<p>We install to a design, ours or yours. Before work starts, we agree on a schedule and where the equipment will go. After each stage, we send you a photo report.</p>
<h2>What's included</h2>
<ul>
<li>Mechanical room: boiler, water heater, pump station and controls.</li>
<li>Radiator heating and radiant floors.</li>
<li>Water supply, drains and water treatment.</li>
<li>Pressure testing, startup and a walkthrough on running the system.</li>
</ul>`,
  },
  {
    title: 'Ventilation and air conditioning',
    introText:
      'Balanced ventilation and air conditioning, sized by an airflow calculation.',
    fields: { priceFrom: 4000, term: 'from 3 business days' },
    content: `<p>Fresh air without drafts or noise. We size equipment from the calculations rather than from a catalog, and we route the ductwork where you will never see it.</p>
<h2>What's included</h2>
<ul>
<li>An airflow calculation for each room.</li>
<li>Supply units with heat recovery.</li>
<li>Air conditioners and multi-zone systems.</li>
<li>Measurements after startup: airflow and noise levels.</li>
</ul>`,
  },
  {
    title: 'Service and maintenance',
    introText: 'Scheduled inspections, emergency calls and seasonal tune-ups.',
    fields: { priceFrom: 150, term: 'per month, one-year contract' },
    content: `<p>Systems that someone keeps an eye on don't break down in a cold snap. Under a service contract, we visit on schedule, keep a log of all work and reach an emergency within two hours.</p>
<h2>What's included</h2>
<ul>
<li>A scheduled inspection once a month or once a quarter.</li>
<li>Cleaning, plus new filters and other consumables.</li>
<li>Emergency calls around the clock.</li>
<li>Getting the system ready for the heating season.</li>
</ul>`,
  },
];

const _NEWS = [
  {
    title: 'A house design in two weeks',
    introText:
      'We rebuilt our design process, and a typical house now takes half the time.',
    content: `<p>Designing the systems for a single-family house used to take us a month: survey, calculations, client review, revisions. We looked at where the time went, and most of it went to waiting for answers.</p>
<p>Now we put the scope of work together in one meeting on site. The client sees each draft decision in a shared folder and approves it with one click. A typical house of up to 2,700 sq ft now takes us two weeks.</p>`,
  },
  {
    title: 'A service crew on the south side',
    introText: 'Emergency calls to the south side now take less than an hour.',
    content: `<p>We have opened a second service location. An on-call engineer with a stock of parts is now closer to the south side of town, so an emergency call there takes less than an hour.</p>
<p>Nothing changes for customers with a service contract: call the same number, and the dispatcher will send the nearest engineer.</p>`,
  },
  {
    title: 'How to get your heating ready for winter',
    introText: 'Five checks worth doing before the first cold snap.',
    content: `<p>Most winter breakdowns can be prevented with one evening of work in the fall. Here is what we check on a scheduled visit, and you can do much of it yourself.</p>
<ol>
<li>System pressure: read the boiler gauge and make sure it is in the range given in the manual.</li>
<li>Air in the radiators: open the bleed valves until water comes out.</li>
<li>Strainers: flush the strainers on the return line.</li>
<li>Flue and draft: make sure nothing blocks the exhaust.</li>
<li>Backup power: make sure the boiler and pumps will keep running through a power outage.</li>
</ol>
<p>If anything looks off, give us a call. An engineer will talk you through it over the phone or come out.</p>`,
  },
];

/** Сайт компании по-английски: та же структура, ключи страниц и элементы, что у русского. */
export var COMPANY_EN: Scaffold = {
  ...COMPANY,
  title: 'Company site',
  summary: 'services, news, contacts and a callback request',
  siteName: 'Northfield Engineering',
  language: 'en',
  description:
    'Heating, ventilation and electrical systems for homes and offices: design, installation and service.',
  components: _sources(COMPANY.components ?? {}),
  templates: _sources(COMPANY.templates),
  fields: [
    {
      name: 'priceFrom',
      label: 'Price from, $',
      type: 'number',
      templates: ['Service'],
    },
    { name: 'term', label: 'Timeline', type: 'text', templates: ['Service'] },
  ],
  forms: {
    callback: {
      title: 'Callback request',
      source: formSource(_NAME, _PHONE, _CONSENT),
      submitLabel: 'Call me back',
      successText:
        'Thank you! We will call you back during business hours, usually within an hour.',
      subject: 'Callback: {name}',
    },
    request: {
      title: 'Service request',
      source: formSource(
        _NAME,
        _PHONE,
        input('email', 'email', 'Email', {
          hint: 'If you would rather get the estimate by email',
        }),
        textarea(
          'comment',
          'Tell us about the building and the work it needs',
          {
            maxLength: 2000,
          }
        ),
        hidden('service', 'Service', 'page.title'),
        _CONSENT
      ),
      submitLabel: 'Send request',
      successText:
        'Thank you! Your request is with an engineer, and we will call you back within one business day.',
      subject: 'Request: {service}',
    },
  },
  settings: {
    searchPage: '@{search}',
    phone: '+1 (555) 555-0100',
    email: 'info@example.com',
    address: '12 Elm Street, Suite 3, Springfield',
    hours: 'Mon–Fri, 9 AM to 6 PM',
    callbackPage: '@{callback}',
    policyPage: '@{privacy}',
  },
  pages: [
    {
      key: 'home',
      title: 'Home',
      longTitle:
        'Building systems for homes and offices, from design to service',
      introText:
        'Heating, plumbing, ventilation and electrical work. One contractor for the whole cycle: design, installation, startup and service, all under warranty.',
      template: 'Home',
      content: _HOME,
    },
    {
      key: 'services',
      title: 'Services',
      alias: 'services',
      template: 'Services',
      introText: _PRICES,
      content: `<h2>How we work</h2>
<ol>
<li>An engineer visits the site on a day that suits you.</li>
<li>We prepare an estimate and a fixed-price contract.</li>
<li>We work to a schedule and send a photo report after each stage.</li>
<li>We start up the system, hand over the documentation and give you a three-year warranty.</li>
</ol>`,
      children: _SERVICES.map((_) => ({ ..._, template: 'Service' })),
    },
    {
      key: 'about',
      title: 'About',
      alias: 'about',
      template: 'Page',
      introText: 'Engineers who design, install and stand behind their work.',
      content: `<p>The firm started with two engineers who were tired of fixing other people's designs on job sites. Today the team includes designers, installers and a service crew, and one engineer leads each project from the first visit through warranty service.</p>
<h2>What sets us apart</h2>
<ul>
<li><b>A fixed estimate.</b> The price in the contract stays the same while the work goes on.</li>
<li><b>One point of contact.</b> You know whom to call, and that person knows your building.</li>
<li><b>Documentation.</b> At handover, you get as-built drawings and the equipment manuals.</li>
<li><b>A three-year warranty</b> on all our work, on top of the manufacturer's warranty on equipment.</li>
</ul>
<h2>Company details</h2>
<p>Northfield Engineering LLC · Contractor license No. 000000 · EIN 00-0000000. Replace these with your own details in the text of this page.</p>`,
    },
    {
      key: 'news',
      title: 'News',
      alias: 'news',
      template: 'News',
      introText: 'Company news and useful notes on building systems.',
      children: _NEWS.map((_) => ({
        ..._,
        template: 'Article',
        hiddenFromMenu: true,
      })),
    },
    {
      title: 'Contact',
      alias: 'contacts',
      template: 'Contacts',
      introText:
        'Call, email or leave your number, and we will call you back during business hours.',
      content: `<h2>We'll call you back</h2>
<p>Leave your name and phone number, and an engineer will call you during business hours, usually within an hour.</p>
[#Form:callback]
<h2>Getting here</h2>
<p>The office is a five-minute walk from the train station. Use the back entrance: we are on the second floor, and client parking is right by the door. Please call before you come: our engineers are often out on job sites.</p>`,
    },
    {
      key: 'callback',
      title: 'Callback request',
      alias: 'callback',
      template: 'Page',
      content: `<p>Leave your name and phone number, and an engineer will call you back during business hours, usually within an hour.</p>
[#Form:callback]`,
      hiddenFromMenu: true,
      searchable: false,
    },
    {
      key: 'privacy',
      title: 'Privacy policy',
      alias: 'privacy',
      template: 'Page',
      introText: 'A sample: replace it with text prepared by your lawyer.',
      content: `<p>This policy describes what personal data this site collects and how it is used.</p>
<h2>What data we receive</h2>
<p>The name, phone number and email you enter in the site's forms, plus technical data: the page address and ad campaign tags.</p>
<h2>Why we need it</h2>
<p>To contact you about your request, prepare an estimate and carry out the contract. We do not share your data with third parties, except where the law requires it.</p>
<h2>How long we keep it</h2>
<p>We keep requests only as long as we need them to do the work. To withdraw your consent or have your data deleted, write to the email address on the contact page.</p>`,
      hiddenFromMenu: true,
      searchable: false,
    },
    {
      key: 'not-found',
      title: 'Page not found',
      alias: '404',
      template: 'Page',
      introText: 'There is no such page. It may have been renamed.',
      content:
        '<p>Start from the <a href="/">home page</a> or have a look at our <a href="[~@{services}~]">services and prices</a>.</p>',
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

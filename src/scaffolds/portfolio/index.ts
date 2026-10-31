import { formSource, input, select, textarea } from '../form-html.ts';
import type { Scaffold } from '../scaffold.ts';
import contactLinks from './ContactLinks.svelte' with { type: 'text' };
import cover from './Cover.svelte' with { type: 'text' };
import home from './Home.svelte' with { type: 'text' };
import layout from './Layout.svelte' with { type: 'text' };
import nextWork from './NextWork.svelte' with { type: 'text' };
import page from './Page.svelte' with { type: 'text' };
import project from './Project.svelte' with { type: 'text' };
import workGrid from './WorkGrid.svelte' with { type: 'text' };
import works from './Works.svelte' with { type: 'text' };

// Импорт текстом; собственные типы Svelte для `*.svelte` описывают компонент.
const _text = (source: unknown): string => source as string;

const _HOME = `<p>Небольшая независимая мастерская: я и пара проверенных подрядчиков. Беру три-четыре проекта в год и веду каждый от первого разговора до запуска.</p>
[[WorkGrid parent=@{work} count=4 more="Все работы"]]`;

const _ABOUT = `<p>Я дизайнер и фотограф. Двенадцать лет делаю айдентику, сайты и съёмки для кафе, издательств, архитектурных бюро и тех, кто только открывает своё дело.</p>
<p>Замените этот текст рассказом о себе: где учились, что любите делать и почему с вами легко работать. Портрет можно вставить из медиатеки.</p>
<h2>Что я делаю</h2>
<ul>
<li>Айдентика: знак, шрифты, цвета и правила, по которым всё это живёт.</li>
<li>Сайты: от структуры и текстов до вёрстки в этой CMS.</li>
<li>Фотография: предметная, интерьерная и репортажная.</li>
<li>Иллюстрация и навигация для городских проектов.</li>
</ul>
<h2>С кем работал</h2>
<p>Пекарня «Утро», бюро «Линия», кофейня «Угол», издательство «Полка», фестиваль городских садов и ещё два десятка небольших команд.</p>
<blockquote>Хороший проект начинается с честного брифа: что болит, сколько есть времени и денег.</blockquote>`;

const _CONTACTS = `<p>Расскажите о задаче — отвечу в течение двух рабочих дней. Если удобнее голосом, напишите в Telegram, договоримся о звонке.</p>
[[ContactLinks]]
<h2>Бриф</h2>
<p>Пары предложений достаточно: что нужно, к какому сроку и на какой бюджет вы рассчитываете.</p>
[#Form:brief]`;

type Work = {
  readonly title: string;
  readonly introText: string;
  readonly client: string;
  readonly year: string;
  readonly role: string;
  readonly url?: string;
  readonly task: string;
  readonly solution: string;
  readonly result: string;
};

const _WORKS: readonly Work[] = [
  {
    title: 'Пекарня «Утро»',
    introText:
      'Знак, упаковка и вывеска для семейной пекарни, которая открывается в шесть утра.',
    client: 'Пекарня «Утро»',
    year: '2025',
    role: 'Айдентика, упаковка',
    task: 'Пекарня переезжала из подвала на главную улицу района и хотела, чтобы её узнавали издалека — по вывеске и по пакету в руках прохожих.',
    solution:
      'Знак — круг, который читается и как солнце, и как каравай. Один тёплый цвет, один шрифт и крафтовая бумага: упаковка стоит недорого и печатается в местной типографии.',
    result:
      'Через полгода после открытия очередь по утрам начинается на улице. Пакеты с кругом носят на работу половина соседних офисов.',
  },
  {
    title: 'Северный ветер',
    introText: 'Фотосерия о посёлках на берегу Белого моря зимой.',
    client: 'Личный проект',
    year: '2024',
    role: 'Фотография',
    task: 'Снять места, куда зимой не доезжают туристы, и людей, которые там живут круглый год.',
    solution:
      'Две недели, один объектив и плёночная камера как запасная. Серия из сорока кадров без постановки: дома, лодки во льду, утренний хлеб на подоконнике.',
    result:
      'Серия показана на выставке в Архангельске и вышла книжкой небольшим тиражом.',
  },
  {
    title: 'Бюро «Линия»',
    introText: 'Сайт архитектурного бюро, где проекты говорят сами за себя.',
    client: 'Архитектурное бюро «Линия»',
    year: '2024',
    role: 'Сайт, арт-дирекция',
    url: 'https://example.com',
    task: 'Старый сайт бюро был собран из шаблона и прятал проекты за слайдерами. Новым клиентам было трудно понять, что именно бюро строит.',
    solution:
      'Простая сетка проектов с большими фотографиями, страница проекта с фактами и чертежами, никаких анимаций ради анимаций. Сайт собран в этой CMS, тексты бюро правит само.',
    result:
      'Заявок с сайта стало втрое больше, а время на обновление портфолио сократилось с недели до вечера.',
  },
  {
    title: 'Карта городских садов',
    introText:
      'Рисованная карта для фестиваля: сорок садов в одном городе за выходные.',
    client: 'Фестиваль городских садов',
    year: '2023',
    role: 'Иллюстрация, карта',
    task: 'Гостям фестиваля нужна была карта, по которой можно пройти маршрут пешком и не потеряться между дворами.',
    solution:
      'Карта нарисована от руки и упрощена до улиц, садов и кафе по пути. Три маршрута разного цвета и номера садов, которые совпадают с табличками на воротах.',
    result:
      'Тираж в пять тысяч экземпляров разобрали в первый день, ещё столько же скачали с сайта.',
  },
  {
    title: 'Кофейня «Угол»',
    introText: 'Вывески и навигация для кофейни на перекрёстке двух улиц.',
    client: 'Кофейня «Угол»',
    year: '2023',
    role: 'Навигация, вывески',
    task: 'Кофейня стоит на углу, и вход с одной улицы люди не замечали.',
    solution:
      'Вывеска огибает угол здания и читается с обеих сторон, а стрелки на тротуаре ведут к двери. Меню на стене — тем же шрифтом.',
    result: 'Утренняя выручка выросла на треть уже в первый месяц.',
  },
  {
    title: 'Книга рецептов',
    introText: 'Семейные рецепты трёх поколений — в одной книге.',
    client: 'Издательство «Полка»',
    year: '2022',
    role: 'Вёрстка, обложка, фотография',
    task: 'Собрать рецепты из тетрадей, открыток и записей на полях так, чтобы по книге хотелось готовить, а не только её листать.',
    solution:
      'Рецепт — на развороте: слева история и фотография, справа список и шаги крупным кеглем, чтобы читать с расстояния вытянутой руки.',
    result:
      'Первый тираж разошёлся за два месяца, книга вошла в шорт-лист конкурса книжного дизайна.',
  },
];

const _work = (work: Work) => ({
  title: work.title,
  introText: work.introText,
  description: work.introText,
  template: 'Project',
  hiddenFromMenu: true,
  fields: {
    client: work.client,
    year: work.year,
    role: work.role,
    ...(work.url ? { url: work.url } : {}),
  },
  content: `<h2>Задача</h2>
<p>${work.task}</p>
<h2>Решение</h2>
<p>${work.solution}</p>
<h2>Результат</h2>
<p>${work.result}</p>`,
});

/** Портфолио: главная с избранными работами, сетка работ, страница проекта, «Обо мне», контакты с брифом. */
export var PORTFOLIO: Scaffold = {
  name: 'portfolio',
  title: 'Портфолио',
  summary: 'работы с обложками, страница проекта, обо мне и форма брифа',
  siteName: 'Своя линия',
  description: 'Дизайн, фотография и иллюстрация',
  kit: ['Menu', 'SearchForm', 'SearchResults'],
  components: {
    Layout: _text(layout),
    Cover: _text(cover),
    WorkGrid: _text(workGrid),
    NextWork: _text(nextWork),
    ContactLinks: _text(contactLinks),
  },
  templates: {
    Home: _text(home),
    Works: _text(works),
    Project: _text(project),
    Page: _text(page),
  },
  fields: [
    { name: 'cover', label: 'Обложка', type: 'image', templates: ['Project'] },
    { name: 'client', label: 'Клиент', type: 'text', templates: ['Project'] },
    { name: 'year', label: 'Год', type: 'text', templates: ['Project'] },
    { name: 'role', label: 'Роль', type: 'text', templates: ['Project'] },
    {
      name: 'url',
      label: 'Ссылка на проект',
      type: 'text',
      templates: ['Project'],
    },
  ],
  forms: {
    brief: {
      title: 'Бриф',
      source: formSource(
        input('text', 'name', 'Имя', { required: true, maxLength: 100 }),
        input('email', 'email', 'Почта', {
          required: true,
          hint: 'На неё придёт ответ',
        }),
        select(
          'type',
          'Что нужно',
          ['Айдентика', 'Сайт', 'Фотосъёмка', 'Иллюстрация', 'Другое'],
          { required: true }
        ),
        select('budget', 'Бюджет', [
          'До 100 тысяч ₽',
          '100–300 тысяч ₽',
          '300–700 тысяч ₽',
          'Больше 700 тысяч ₽',
          'Пока не знаю',
        ]),
        textarea('message', 'О проекте', {
          required: true,
          maxLength: 5000,
          hint: 'Ссылки на примеры, которые нравятся, — тоже сюда',
        })
      ),
      submitLabel: 'Отправить бриф',
      successText: 'Спасибо! Бриф у меня — отвечу в течение двух рабочих дней.',
      subject: 'Бриф: {name}',
      allowLinks: true,
    },
  },
  settings: {
    searchPage: '@{search}',
    email: 'hello@example.com',
    telegram: 'my_portfolio',
  },
  pages: [
    {
      key: 'home',
      title: 'Главная',
      longTitle:
        'Айдентика, сайты и\u00a0фотография для небольших команд с\u00a0характером',
      template: 'Home',
      content: _HOME,
    },
    {
      key: 'work',
      title: 'Работы',
      alias: 'work',
      template: 'Works',
      content:
        '<p>Избранные проекты последних лет — от упаковки для пекарни до книги рецептов.</p>',
      description: 'Избранные проекты',
      children: _WORKS.map(_work),
    },
    {
      title: 'Обо мне',
      alias: 'about',
      template: 'Page',
      content: _ABOUT,
    },
    {
      title: 'Контакты',
      alias: 'contacts',
      template: 'Page',
      longTitle: 'Давайте сделаем что-нибудь хорошее',
      content: _CONTACTS,
    },
    {
      key: 'not-found',
      title: 'Страница не найдена',
      alias: '404',
      template: 'Page',
      content:
        '<p>Такой страницы здесь нет — возможно, работу переименовали. Загляните во <a href="[~@{work}~]">все работы</a> или вернитесь <a href="/">на главную</a>.</p>',
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

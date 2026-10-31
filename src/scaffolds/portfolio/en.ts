import { type Translation, translated } from '../../kit/translated.ts';
import { formSource, input, select, textarea } from '../form-html.ts';
import type { Scaffold } from '../scaffold.ts';
import { PORTFOLIO } from './index.ts';

// Портфолио по-английски: разметка и стили — те же исходники, что у русского, подписи и комментарии —
// парами перевода; тексты страниц, работы, форма и поля — свои.

const _PAIRS: Readonly<Record<string, Translation>> = {
  Layout: [
    [
      `Рамка страницы портфолио: шапка с именем и меню, широкое поле для работ, подвал с почтой и Telegram.
Здесь же цвета и шрифты сайта — переменные \`--t-*\` подхватывают и компоненты набора.`,
      `The portfolio page frame: a header with the name and menu, a wide area for the work, a footer with
the email and Telegram. Site colors and fonts live here too: kit components pick up the \`--t-*\` variables.`,
    ],
    ['/** Страница шаблона */', '/** The template page */'],
    ['>К содержимому</a>', '>Skip to content</a>'],
    [
      `/* Текст страницы: нулевая специфичность — стили компонентов внутри текста сильнее. Строка — не
     длиннее 40rem, а сетка работ в тексте занимает всю ширину. */`,
      `/* Page text: zero specificity, so component styles inside the text win. Lines stay within 40rem,
     while a work grid in the text takes the full width. */`,
    ],
    [
      '/* Меню уходит в бургер — поле сжимается до лупы рядом с ним. */',
      '/* The menu folds into a burger, and the search field shrinks to a magnifier next to it. */',
    ],
  ],
  Cover: [
    [
      `Обложка работы: картинка из поля, а пока её нет — цветная плашка с названием. Цвет плашки постоянный у
каждой работы.`,
      `The cover of a work: the picture from the field or, until there is one, a color plate with the title.
Each work keeps the same plate color.`,
    ],
    [
      '/** Работа: страница с полем cover */',
      '/** The work: a page with the cover field */',
    ],
    [
      '/** Пропорции: wide=Широкая 16:9, card=Карточка 4:3 */',
      '/** Proportions: wide=Wide 16:9, card=Card 4:3 */',
    ],
    [
      '/** Ширина картинки на странице для srcset */',
      '/** Picture width on the page, for srcset */',
    ],
    [
      '// Тона плашек: тёплые и приглушённые, текст на каждом — свой, контрастный.',
      '// Plate tones: warm and muted, each with its own contrasting text color.',
    ],
  ],
  WorkGrid: [
    [
      'Сетка работ: обложка, название, год и роль. Работы — дети раздела, порядок — как в меню.',
      'A grid of works: cover, title, year and role. Works are children of the section, in menu order.',
    ],
    [
      '/** Раздел с работами: id страницы; пусто — текущая */',
      '/** Section with works: page id; empty means the current page */',
    ],
    ['/** Сколько работ показать */', '/** How many works to show */'],
    [
      '/** Подпись ссылки на все работы; пусто — без ссылки */',
      '/** Label of the link to all work; empty means no link */',
    ],
    [
      '/* Вторая колонка — ниже: сетка дышит, как развеска на стене. */',
      '/* The second column sits lower, so the grid breathes like pictures hung on a wall. */',
    ],
    [
      '/* Одна ссылка на работу, но кликается вся карточка. */',
      '/* One link per work, yet the whole card is clickable. */',
    ],
  ],
  NextWork: [
    [
      'Ссылка на следующую работу раздела крупным планом; после последней — снова первая.',
      'A large link to the next work in the section; after the last one comes the first again.',
    ],
    ['/** Подпись над названием */', '/** Label above the title */'],
    ["label = 'Следующая работа',", "label = 'Next project',"],
  ],
  ContactLinks: [
    [
      'Почта и Telegram крупно — из своих настроек сайта email и telegram.',
      'Email and Telegram in large type, taken from the custom site settings email and telegram.',
    ],
    ['/** Подпись над почтой */', '/** Label above the email */'],
    ["emailLabel = 'Почта',", "emailLabel = 'Email',"],
    ['/** Подпись над Telegram */', '/** Label above Telegram */'],
  ],
  Project: [
    ["['Клиент', page.fields.client],", "['Client', page.fields.client],"],
    ["['Год', page.fields.year],", "['Year', page.fields.year],"],
    ["['Роль', page.fields.role],", "['Role', page.fields.role],"],
    ['>← Все работы</a>', '>← All work</a>'],
    ['<dt>Ссылка</dt>', '<dt>Link</dt>'],
    [
      '/* Справа текст, слева — факты о работе; на телефоне — друг под другом. */',
      '/* Text on the right, facts about the work on the left; stacked on a phone. */',
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

const _HOME = `<p>A small independent studio: me and a couple of trusted contractors. I take on three or four projects a year and see each one through from the first conversation to launch.</p>
[[WorkGrid parent=@{work} count=4 more="All work"]]`;

const _ABOUT = `<p>I am a designer and photographer. For twelve years I have made brand identities, websites and photo shoots for cafes, publishers, architecture firms and people opening their first business.</p>
<p>Replace this text with your own story: where you trained, what you love to work on and why clients find you easy to work with. You can insert a portrait from the media library.</p>
<h2>What I do</h2>
<ul>
<li>Brand identity: the mark, typefaces, colors and the rules they follow.</li>
<li>Websites: from structure and copy to building the site in this CMS.</li>
<li>Photography: product, interiors and documentary.</li>
<li>Illustration and wayfinding for city projects.</li>
</ul>
<h2>Clients</h2>
<p>Daybreak Bakery, Linea Architects, Corner Coffee, Shelf Press, the Open Gardens Festival and about twenty other small teams.</p>
<blockquote>A good project starts with an honest brief: what the problem is, how much time there is and what the budget allows.</blockquote>`;

const _CONTACTS = `<p>Tell me about your project and I will reply within two business days. If you would rather talk, message me on Telegram and we will set up a call.</p>
[[ContactLinks]]
<h2>Brief</h2>
<p>A couple of sentences is enough: what you need, by when, and the budget you have in mind.</p>
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
    title: 'Daybreak Bakery',
    introText:
      'A logo, packaging and a storefront sign for a family bakery that opens at six in the morning.',
    client: 'Daybreak Bakery',
    year: '2025',
    role: 'Brand identity, packaging',
    task: 'The bakery was moving from a basement to the main street of the neighborhood and wanted people to recognize it from a block away, by the sign and by the bags people carry down the street.',
    solution:
      'The mark is a circle that reads as both the sun and a round loaf. One warm color, one typeface and kraft paper keep the packaging inexpensive, and a local shop prints it.',
    result:
      'Six months after the opening, the morning line starts out on the sidewalk. Half the offices nearby carry the bags with the circle to work.',
  },
  {
    title: 'North Wind',
    introText:
      'A photo series about fishing villages on a northern coast in winter.',
    client: 'Personal project',
    year: '2024',
    role: 'Photography',
    task: 'Photograph the places tourists never reach in winter, and the people who live there all year.',
    solution:
      'Two weeks, one lens and a film camera as a backup. A series of forty unstaged frames: houses, boats frozen in the ice, morning bread on a windowsill.',
    result:
      'The series was shown at a gallery in a harbor town and came out as a small-run photo book.',
  },
  {
    title: 'Linea Architects',
    introText:
      'A website for an architecture firm that lets the projects speak for themselves.',
    client: 'Linea Architects',
    year: '2024',
    role: 'Website, art direction',
    url: 'https://example.com',
    task: 'The firm’s old site was built from a template and hid the projects behind sliders. New clients had a hard time telling what the firm actually builds.',
    solution:
      'A simple grid of projects with large photos and a project page with facts and drawings. No animation for its own sake. The site runs on this CMS, and the firm edits its own copy.',
    result:
      'Inquiries through the site tripled, and updating the portfolio went from a week of work to one evening.',
  },
  {
    title: 'Open Gardens Map',
    introText:
      'A hand-drawn map for a festival: forty gardens in one city over a single weekend.',
    client: 'Open Gardens Festival',
    year: '2023',
    role: 'Illustration, map',
    task: 'Festival visitors needed a map they could follow on foot without getting lost among the backyards.',
    solution:
      'The map is drawn by hand and pared down to streets, gardens and the cafes along the way. Three routes in different colors, and garden numbers that match the signs on the gates.',
    result:
      'All five thousand printed copies were gone on the first day, and as many again were downloaded from the festival website.',
  },
  {
    title: 'Corner Coffee',
    introText: 'Signs and wayfinding for a coffee shop where two streets meet.',
    client: 'Corner Coffee',
    year: '2023',
    role: 'Wayfinding, signage',
    task: 'The coffee shop sits on a corner, and people coming down one of the streets never noticed the entrance.',
    solution:
      'The sign wraps around the corner of the building and reads from both streets, and arrows on the sidewalk lead to the door. The menu on the wall is set in the same typeface.',
    result: 'Morning sales were up by a third in the first month.',
  },
  {
    title: 'The Family Cookbook',
    introText: 'Three generations of family recipes in one book.',
    client: 'Shelf Press',
    year: '2022',
    role: 'Layout, cover, photography',
    task: 'Gather recipes from notebooks, postcards and notes in the margins into a book people would actually cook from.',
    solution:
      'Each recipe gets a spread: the story and a photo on the left, the ingredients and steps on the right in large type that you can read at arm’s length.',
    result:
      'The first print run sold out in two months, and the book made the shortlist of a book design competition.',
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
  content: `<h2>The challenge</h2>
<p>${work.task}</p>
<h2>The solution</h2>
<p>${work.solution}</p>
<h2>The result</h2>
<p>${work.result}</p>`,
});

/** Портфолио по-английски: та же структура, ключи страниц, элементы и свои настройки, что у русского. */
export var PORTFOLIO_EN: Scaffold = {
  ...PORTFOLIO,
  title: 'Portfolio',
  summary: 'work with covers, a project page, an about page and a brief form',
  siteName: 'Own Line Studio',
  language: 'en',
  description: 'Design, photography and illustration',
  components: _sources(PORTFOLIO.components ?? {}),
  templates: _sources(PORTFOLIO.templates),
  fields: [
    { name: 'cover', label: 'Cover', type: 'image', templates: ['Project'] },
    { name: 'client', label: 'Client', type: 'text', templates: ['Project'] },
    { name: 'year', label: 'Year', type: 'text', templates: ['Project'] },
    { name: 'role', label: 'Role', type: 'text', templates: ['Project'] },
    {
      name: 'url',
      label: 'Project link',
      type: 'text',
      templates: ['Project'],
    },
  ],
  forms: {
    brief: {
      title: 'Project brief',
      source: formSource(
        input('text', 'name', 'Name', { required: true, maxLength: 100 }),
        input('email', 'email', 'Email', {
          required: true,
          hint: 'My reply will go here',
        }),
        select(
          'type',
          'What you need',
          [
            'Brand identity',
            'Website',
            'Photo shoot',
            'Illustration',
            'Something else',
          ],
          { required: true, placeholder: 'Choose…' }
        ),
        select(
          'budget',
          'Budget',
          [
            'Under $5,000',
            '$5,000–$15,000',
            '$15,000–$35,000',
            'Over $35,000',
            'Not sure yet',
          ],
          { placeholder: 'Choose…' }
        ),
        textarea('message', 'About the project', {
          required: true,
          maxLength: 5000,
          hint: 'Links to examples you like can go here too',
        })
      ),
      submitLabel: 'Send the brief',
      successText:
        'Thank you! I have your brief and will reply within two business days.',
      subject: 'Brief: {name}',
      allowLinks: true,
    },
  },
  pages: [
    {
      key: 'home',
      title: 'Home',
      longTitle:
        'Brand identity, websites and photography for small teams with character',
      template: 'Home',
      content: _HOME,
    },
    {
      key: 'work',
      title: 'Work',
      alias: 'work',
      template: 'Works',
      content:
        '<p>Selected projects from recent years, from packaging for a bakery to a family cookbook.</p>',
      description: 'Selected projects',
      children: _WORKS.map(_work),
    },
    {
      title: 'About',
      alias: 'about',
      template: 'Page',
      content: _ABOUT,
    },
    {
      title: 'Contact',
      alias: 'contacts',
      template: 'Page',
      longTitle: 'Let’s make something good together',
      content: _CONTACTS,
    },
    {
      key: 'not-found',
      title: 'Page not found',
      alias: '404',
      template: 'Page',
      content:
        '<p>There is no such page here; perhaps the project was renamed. Have a look at <a href="[~@{work}~]">all work</a> or go back <a href="/">home</a>.</p>',
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

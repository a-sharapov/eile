import { type Translation, translated } from '../../kit/translated.ts';
import { formSource, input, textarea } from '../form-html.ts';
import type { Scaffold } from '../scaffold.ts';
import { BLOG } from './index.ts';

// Блог по-английски: разметка и стили — те же исходники, что у русского, подписи и комментарии — парами
// перевода; тексты страниц, формы и поля — свои.

const _PAIRS: Readonly<Record<string, Translation>> = {
  Blog: [['empty="Записей пока нет."', 'empty="No posts yet."']],
  Layout: [
    [
      `Рамка страницы блога: шапка с названием и меню, колонка текста, подвал. Шаблоны кладут в неё свою
разметку. Здесь же цвета и шрифты сайта — переменные \`--t-*\` подхватывают и компоненты набора.`,
      `The blog page frame: a header with the site name and menu, a text column, a footer. Templates put
their own markup inside it. Site colors and fonts live here too: kit components pick up the \`--t-*\` variables.`,
    ],
    ['/** Страница шаблона */', '/** The template page */'],
    ['>К тексту</a>', '>Skip to text</a>'],
    [
      '/* Читают и ночью: та же бумага, только тёмная. */',
      '/* People read at night too: the same paper, only dark. */',
    ],
    [
      '/* Текст страницы: нулевая специфичность — стили компонентов внутри текста сильнее. */',
      '/* Page text: zero specificity, so component styles inside the text win. */',
    ],
  ],
  PostNav: [
    [
      'Соседние записи под текстом: предыдущая и следующая по дате публикации.',
      'Neighboring posts under the text: the previous and the next by publishing date.',
    ],
    ['/** Подпись более новой записи */', '/** Label of the newer post */'],
    ["newer = 'Новее',", "newer = 'Newer',"],
    ['/** Подпись более старой записи */', '/** Label of the older post */'],
    ["older = 'Раньше',", "older = 'Older',"],
    ['aria-label="Другие записи"', 'aria-label="More posts"'],
  ],
  Post: [['>← Все записи</a>', '>← All posts</a>']],
  RecentPosts: [
    [
      `Последние записи раздела строками «дата — заголовок» и ссылка на весь раздел. Для главной: ленту целиком
показывает шаблон раздела.`,
      `The latest posts of a section as "date — title" lines and a link to the whole section. Made for the
home page: the full feed is drawn by the section template.`,
    ],
    [
      '/** Раздел с записями: id страницы */',
      '/** Section with posts: page id */',
    ],
    ['/** Сколько записей */', '/** How many posts */'],
    ['/** Заголовок над списком */', '/** Heading above the list */'],
    ["title = 'Новые записи',", "title = 'Latest posts',"],
    [
      '/** Подпись ссылки на раздел; пусто — без ссылки */',
      '/** Label of the link to the section; empty means no link */',
    ],
    ["more = 'Все записи',", "more = 'All posts',"],
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

const _HOME = `<p>Notes on books, working with my hands and small experiments with habits. I write once every week or two, without hurrying.</p>
<p>If you have just set up this starter, begin with the post "<a href="[~@{how}~]">How this blog works</a>": it covers the templates, fields and form, and what to change first.</p>
[[RecentPosts parent=@{blog} count=5]]`;

const _ABOUT = `<p>I write this blog for myself and for anyone who cares about the same things: books, craft and the habits that make life calmer.</p>
<p>Replace this text with your own story: who you are, what you write about and why people should read you. You can add a photo to the text from the media library.</p>
<h2>Write to me</h2>
<p>The reply will come to the email you give.</p>
[#Form:feedback]`;

const _POSTS = [
  {
    title: 'Why I keep a site of my own',
    introText: 'Why my writing lives here and not only on social media.',
    content: `<p>Social feeds forget everything within a day. A site of your own remembers: every post has a permanent address, you can find it a year later and link to it.</p>
<p>There are also no one else's layout rules, no recommendations and no ads between paragraphs. Just the text, with as much room as it needs.</p>`,
  },
  {
    title: 'Slow reading',
    introText: 'One book at a time, a pencil and notes in the margins.',
    content: `<p>I used to read three books at once and remember none of them. Now I read one, slowly, with a pencil.</p>
<p>The rule is simple: if I want to underline a sentence, I underline it and write in the margin why. A year later these notes turn out to be worth more than the book itself.</p>
<blockquote>Reading is a conversation with the author. The margins are where you answer.</blockquote>
<p>This blog grew out of those notes.</p>`,
  },
  {
    title: 'The notebook I have used for ten years',
    introText: 'On paper, pens and a system that is barely a system.',
    content: `<p>Every year I buy the same squared notebook. No templates, sections or colored tabs: just the date in the margin and whatever comes to mind.</p>
<p>Once a month I reread the pages and copy what still matters into a new list. Whatever I did not need for a month stays on the old pages, and that is fine.</p>
<h2>Why paper</h2>
<p>Paper has no other tab to wander off to. And it never needs charging.</p>`,
  },
  {
    title: 'A week without notifications',
    introText:
      'What happened when my phone stopped calling me every five minutes.',
    content: `<p>On Monday I turned off every notification except calls. Not a quiet mode for the evening, but for good, for seven days.</p>
<p>For the first two days my hand kept reaching for the phone to check whether I had missed something. I had not: everything important waited for me in email and messengers until I looked there myself.</p>
<h2>What changed</h2>
<ul>
<li>I started finishing articles.</li>
<li>Email takes two sittings a day instead of twenty.</li>
<li>Evenings got longer, though they have the same number of hours.</li>
</ul>
<blockquote>There was far less urgent stuff than it seemed.</blockquote>
<p>I never turned the notifications back on. Only the calendar: unlike the rest, it reminds me of things I decided on myself.</p>`,
  },
  {
    key: 'how',
    title: 'How this blog works',
    introText:
      'The templates, fields and form of this starter, and what to change first.',
    content: `<p>This blog was set up from a starter. Everything you see is ordinary pages, templates and components: you edit them in the manager like your own code.</p>
<h2>Pages</h2>
<p>Posts are child pages of the Posts section with the Post template. They stay out of the menu: the feed shows them. The feed is drawn by the PostList component from the kit, six posts at a time, then at /blog/page-2, /blog/page-3.</p>
<h2>Templates</h2>
<ul>
<li><b>Home</b>: the home page with a big heading and text; the text holds the Latest posts block.</li>
<li><b>Blog</b>: the section with the feed.</li>
<li><b>Post</b>: a post with the date, reading time, a cover from the <code>cover</code> field and the neighboring posts.</li>
<li><b>Page</b>: a simple page like About.</li>
</ul>
<p>The common frame (header, menu, footer, colors and fonts) is the Layout component. Change the variables at the top of its styles and the whole site changes color, kit components included. The dark theme turns on by itself when the reader has it on.</p>
<h2>What to do first</h2>
<ol>
<li>Set the site name and description in Settings.</li>
<li>Rewrite the home page and About.</li>
<li>Turn on notifications about messages from the form: Settings → Notifications. The messages themselves are in Forms.</li>
<li>Delete these posts, or keep one as a sample.</li>
</ol>`,
  },
];

/** Блог по-английски: та же структура, ключи страниц и элементы, что у русского. */
export var BLOG_EN: Scaffold = {
  ...BLOG,
  title: 'Blog',
  summary: 'posts in pages, an author page and a contact form',
  siteName: 'Margin Notes',
  language: 'en',
  description: 'Notes on books, craft and habits',
  components: _sources(BLOG.components ?? {}),
  templates: _sources(BLOG.templates),
  fields: [
    { name: 'cover', label: 'Cover', type: 'image', templates: ['Post'] },
  ],
  forms: {
    feedback: {
      title: 'Write to the author',
      source: formSource(
        input('text', 'name', 'Name', { required: true, maxLength: 100 }),
        input('email', 'email', 'Email', {
          required: true,
          hint: 'The reply will come here',
        }),
        textarea('message', 'Message', { required: true, maxLength: 3000 })
      ),
      submitLabel: 'Send',
      successText:
        'Thank you! Your message has arrived, and I will reply to your email.',
      subject: 'Message from the site: {name}',
      allowLinks: true,
    },
  },
  pages: [
    {
      key: 'home',
      title: 'Home',
      longTitle: 'I write about what I read, make and notice',
      template: 'Home',
      content: _HOME,
    },
    {
      key: 'blog',
      title: 'Posts',
      alias: 'blog',
      template: 'Blog',
      content: '<p>All posts, newest first.</p>',
      description: 'All posts of the blog',
      children: _POSTS.map((_) => ({
        ..._,
        template: 'Post',
        hiddenFromMenu: true,
      })),
    },
    {
      title: 'About',
      alias: 'about',
      template: 'Page',
      content: _ABOUT,
    },
    {
      key: 'not-found',
      title: 'Page not found',
      alias: '404',
      template: 'Page',
      content:
        '<p>There is no such page here; perhaps it was renamed. Have a look at the <a href="[~@{blog}~]">posts</a> or go back <a href="/">home</a>.</p>',
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

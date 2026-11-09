import type { Scaffold } from '../src/scaffolds/scaffold.ts';
import aiAssist from './AiAssist.svelte' with { type: 'text' };
import buildIn from './BuiltIn.svelte' with { type: 'text' };
import chapter from './Chapter.svelte' with { type: 'text' };
import closing from './Closing.svelte' with { type: 'text' };
import cookbook from './Cookbook.svelte' with { type: 'text' };
import cookShot from './CookShot.svelte' with { type: 'text' };
import copyButton from './CopyButton.svelte' with { type: 'text' };
import { CHAPTERS_EN } from './cookbook/en/index.ts';
import type { Chapter } from './cookbook/markup.ts';
import { CHAPTERS_RU } from './cookbook/ru/index.ts';
import demoVideo from './DemoVideo.svelte' with { type: 'text' };
import home from './Home.svelte' with { type: 'text' };
import icon from './Icon.svelte' with { type: 'text' };
import install from './Install.svelte' with { type: 'text' };
import layout from './Layout.svelte' with { type: 'text' };
import logo from './Logo.svelte' with { type: 'text' };
import managerTour from './ManagerTour.svelte' with { type: 'text' };
import onServer from './OnServer.svelte' with { type: 'text' };
import page from './Page.svelte' with { type: 'text' };
import pageProof from './PageProof.svelte' with { type: 'text' };
import pains from './Pains.svelte' with { type: 'text' };
import quickStart from './QuickStart.svelte' with { type: 'text' };
import rich from './Rich.svelte' with { type: 'text' };
import shot from './Shot.svelte' with { type: 'text' };
import speedScale from './SpeedScale.svelte' with { type: 'text' };
import stackCompare from './StackCompare.svelte' with { type: 'text' };
import templateCode from './TemplateCode.svelte' with { type: 'text' };
import windowFrame from './Window.svelte' with { type: 'text' };
import wordPressCompare from './WordPressCompare.svelte' with { type: 'text' };

// Импорт текстом; собственные типы Svelte для `*.svelte` описывают компонент.
const _text = (source: unknown): string => source as string;

const _REPO = 'https://github.com/a-sharapov/eile';
// Адрес сайта: короткие команды установки ведут на него, а он — ссылками на последний релиз.
const _SITE = 'https://eile.site';

// Числа не рвутся по строкам: тысячи — узким неразрывным пробелом (11 334), число и единица — неразрывным
// (330 МБ, 0,3 с, 91 %). Только где за единицей не продолжается слово: «6 страниц» остаётся как было.
const _UNIT =
  /(?<=\d) (?=(?:МБ|ГБ|КБ|ГиБ|МиБ|мс|с|мин|px|MB|GB|KB|GiB|MiB|ms|s|%)(?![\p{L}\d]))/gu;
const _THOUSANDS = /(?<=\d) (?=\d{3}(?!\d))/g;
const _typeset = (text: string): string =>
  text.replace(_THOUSANDS, '\u202f').replace(_UNIT, '\u00a0');

/** Разделы главной: заголовок и вводный абзац — текст ветки языка, наглядная часть — компонент. */
const _home = (
  sections: readonly (readonly [string, string, string, string])[]
): string =>
  [
    ...sections.map(
      ({ 0: id, 1: title, 2: lead, 3: block }) =>
        `<h2 id="${id}">${_typeset(title)}</h2>\n<p>${_typeset(lead)}</p>\n[[${block}]]`
    ),
    '[[Closing]]',
  ].join('\n');

const _RU = _home([
  [
    'pains',
    'Где обычно уходит время',
    'Сам сайт делается быстро. Время уходит на всё вокруг: сервер, плагины, переезды и правки по звонку пользователя. Вот что Eile берёт на себя.',
    'Pains',
  ],
  [
    'stack',
    'Что заменяют два файла',
    'Обычный сайт держится на веб-сервере, PHP, базе данных и десятке плагинов, и у каждого свои обновления и поломки. В Eile весь сайт — это исполняемый файл и база SQLite. Только их и нужно обновлять, переносить и копировать.',
    'StackCompare',
  ],
  [
    'speed',
    'Быстрый сайт без плагина кэша',
    'Не нужно подбирать кэш, CDN и сжатие. Страницу сервер отдаёт готовым HTML из памяти, кэш сбрасывается ровно там, где что-то изменилось, а JavaScript попадает на страницу, только если без него не обойтись.',
    'SpeedScale',
  ],
  [
    'server',
    'Хватает VPS с одним ядром и 512 МБ',
    'Под нагрузкой сервер держит до 93 МБ: замеры выше сняты с пределом в 330 МБ, столько остаётся сайту на таком VPS. Swap на 1 ГБ — с запасом, <code>cms service install</code> подскажет, как его сделать. На сервер Eile ставится одной командой, службой systemd в песочнице.',
    'OnServer',
  ],
  [
    'manager',
    'Пользователь правит сам, а любую правку можно откатить',
    'Весь сайт виден деревом, как он вложен. Текст собирается из блоков, картинки берутся из медиатеки, страница выходит сразу или по расписанию. Если правка не удалась, история вернёт любую версию одной кнопкой, а черновик можно показать клиенту ссылкой.',
    'ManagerTour',
  ],
  [
    'templates',
    'Вёрстка без сборки и деплоя',
    'Шаблоны пишутся на обычном Svelte и правятся прямо в браузере. Сохранили, и сайт уже другой: без npm, сборщика и выкладки. Шаблон с ошибкой не сохранится, поэтому опечатка не положит сайт.',
    'TemplateCode',
  ],
  [
    'ai',
    'Черновик текста по паре слов',
    'Пустое поле больше не держит работу. Палочка у поля пишет черновик заголовка, описания, текста страницы или даже шаблона на Svelte. Напишите, что нужно, посмотрите вариант и вставьте его или попросите другой. Агенты вроде Claude и Cursor подключаются по MCP, и их правки могут ждать вашей проверки.',
    'AiAssist',
  ],
  [
    'inside',
    'Всё, ради чего ставят плагины, уже внутри',
    'SEO и находимость для ИИ, формы с защитой от спама, поиск, статистика без cookie, копии вне сервера, картинки под любой экран и переводы. Их не нужно подбирать, совмещать и обновлять по отдельности: они приходят и обновляются вместе с Eile.',
    'BuiltIn',
  ],
  [
    'wordpress',
    'Eile или WordPress',
    'WordPress — самая распространённая CMS, поэтому сравнивать стоит с ним. Вот разница на деле: что держать на сервере, что уже внутри, как обновляться и как переехать. И отдельно о том, где сильнее WordPress.',
    'WordPressCompare',
  ],
  [
    'start',
    'Первый сайт уже сегодня',
    'Готовый сайт разворачивается одной командой: блог, портфолио, сайт компании, витрина, магазин или сайт кухонной студии для Германии.',
    'QuickStart',
  ],
]);

const _EN = _home([
  [
    'pains',
    'Where the time usually goes',
    'The site itself comes together quickly. The time goes on everything around it: servers, plugins, moves and edits the user asks for by phone. Here is what Eile takes off your hands.',
    'Pains',
  ],
  [
    'stack',
    'What the two files replace',
    'A usual site rests on a web server, PHP, a database and a dozen plugins, each with its own updates and failures. In Eile the whole site is an executable and an SQLite database. Those two are all you update, move and back up.',
    'StackCompare',
  ],
  [
    'speed',
    'A fast site without a cache plugin',
    'No cache, CDN or compression to tune. The server sends a page as ready HTML from memory, the cache clears exactly where something changed, and JavaScript reaches the page only when it has to.',
    'SpeedScale',
  ],
  [
    'server',
    'A 1-core, 512 MB VPS is enough',
    'Under load the server stays within 93 MB: the measurements above ran under a 330 MB cap, which is what a site gets on such a VPS. A 1 GB swap file leaves room to spare, and <code>cms service install</code> tells you how to add one. Eile goes onto a server with one command, as a sandboxed systemd service.',
    'OnServer',
  ],
  [
    'manager',
    'Users edit on their own, and any edit can be undone',
    'The whole site shows as a tree, the way it nests. Text is built from blocks, pictures come from the media library, and a page goes live at once or on a schedule. If an edit goes wrong, the history brings back any version with one click, and a draft can go to the client as a link.',
    'ManagerTour',
  ],
  [
    'templates',
    'Layouts with no build and no deploy',
    'Templates are plain Svelte, edited right in the browser. Save, and the site has changed: no npm, no bundler, no upload. A template with an error won’t save, so a typo can’t take the site down.',
    'TemplateCode',
  ],
  [
    'ai',
    'A first draft from a few words',
    'An empty field no longer holds up the work. The wand by a field drafts a title, a description, page text or even a Svelte template. Say what you need, look at the draft, then insert it or ask for another. Agents such as Claude and Cursor connect over MCP, and their edits can wait for your review.',
    'AiAssist',
  ],
  [
    'inside',
    'Everything you’d install plugins for is built in',
    'SEO and AI discoverability, forms with spam protection, search, cookieless statistics, copies off the server, pictures for every screen and translations. Nothing to pick, combine and update one by one: they come and update together with Eile.',
    'BuiltIn',
  ],
  [
    'wordpress',
    'Eile or WordPress',
    'WordPress is the most widely used CMS, so that is the fair comparison. Here is the difference in practice: what you keep on the server, what is built in, how you update and how you move. And, separately, where WordPress is stronger.',
    'WordPressCompare',
  ],
  [
    'start',
    'Your first site today',
    'One command sets up a ready site: a blog, a portfolio, a company site, a showcase, a shop or a kitchen studio site for Germany.',
    'QuickStart',
  ],
]);

/** Главы кукбука — дочерние страницы его оглавления, на шаблоне Chapter; ключ — для ссылок вида `@{…}`. */
const _chapters = (chapters: readonly Chapter[], prefix: string) =>
  chapters.map((_) => ({
    key: `${prefix}-${_.alias}`,
    title: _.title,
    ...(_.menuTitle ? { menuTitle: _.menuTitle } : {}),
    alias: _.alias,
    template: 'Chapter',
    introText: _.lead,
    description: _.description,
    content: _.content,
  }));

/** Подписи компонентов на двух языках: в менеджере — «Настройки → Переводы». */
export var TEXTS: Readonly<Record<string, readonly [string, string]>> = {
  skip: ['К содержимому', 'Skip to content'],
  toHome: ['на главную', 'home'],
  navLabel: ['Разделы', 'Sections'],
  navSpeed: ['Скорость', 'Speed'],
  navManager: ['Менеджер', 'Manager'],
  navTemplates: ['Шаблоны', 'Templates'],
  navInside: ['Возможности', 'Features'],
  footerMigrate: ['Переезд с Evo', 'Moving from Evo'],
  footerMigrateWp: ['Переезд с WordPress', 'Moving from WordPress'],
  navCookbook: ['Кукбук', 'Cookbook'],
  navAi: ['ИИ', 'AI'],
  navWordPress: ['WordPress', 'WordPress'],
  pain1: [
    'Чтобы показать пользователю сайт, сначала нужно поднять веб-сервер, PHP и MySQL.',
    'Before a user sees anything, you set up a web server, PHP and MySQL.',
  ],
  relief1: [
    'Eile ставится одной командой и запускает сайт с менеджером ещё одной.',
    'Eile installs with one command and runs the site and its manager with another.',
  ],
  pain2: [
    'Обновили плагин, и поехала вёрстка или легла админка.',
    'A plugin update breaks the layout or takes the admin down.',
  ],
  relief2: [
    'SEO, формы, поиск, статистика, копии и HTTPS уже внутри, и обновление у них одно: `cms update`.',
    'SEO, forms, search, statistics, backups and HTTPS are built in, and they share one update: `cms update`.',
  ],
  pain3: [
    'Переезд на другой хостинг съедает вечер: дамп базы, файлы, конфиги.',
    'Moving to another host eats an evening: a database dump, files, configs.',
  ],
  relief3: [
    'Весь сайт — программа и база SQLite. На новом сервере его поднимает одна команда, а `cms diagnose domain` заранее скажет, что сломается в DNS.',
    'The whole site is the program and an SQLite database. One command brings it up on the new server, and `cms diagnose domain` tells you beforehand what would break in DNS.',
  ],
  pain4: [
    'Одна опечатка в шаблоне, и вместо сайта ошибка.',
    'One typo in a template, and visitors get an error instead of the site.',
  ],
  relief4: [
    'Шаблон с ошибкой не сохранится: менеджер покажет строку, а сайт продолжит работать на прежней версии.',
    'A template with an error won’t save: the manager points at the line, and the site keeps the previous version.',
  ],
  pain5: [
    'Пользователь боится трогать админку и звонит вам по каждой запятой.',
    'The user is afraid to touch the admin and calls you about every comma.',
  ],
  relief5: [
    'Понятное дерево страниц, текст блоками и история правок: любую версию можно вернуть одной кнопкой.',
    'A clear page tree, text in blocks and revision history: any version comes back with one click.',
  ],
  pain6: [
    'Заявки с сайта теряются в почте.',
    'Leads from the site get lost in email.',
  ],
  relief6: [
    'Заявки приходят в менеджер со статусами и сразу уведомляют в Telegram или на почту, даже если хостинг закрыл SMTP.',
    'Form entries land in the manager with statuses and ping you in Telegram or by email, even when the host blocks SMTP.',
  ],
  aiShot: [
    'Окно «Сгенерировать с ИИ» в редакторе шаблона: просьба добавить кнопку записи на замер',
    'The “Generate with AI” box in the template editor with a request to add a booking button',
  ],
  aiStep1: [
    'Нажмите палочку у поля или Alt+I.',
    'Click the wand by a field or press Alt+I.',
  ],
  aiStep2: [
    'Напишите пару слов: «короче», «анонс в одно предложение», «добавь кнопку записи».',
    'Write a few words: “shorter”, “a one-line summary”, “add a booking button”.',
  ],
  aiStep3: [
    'Посмотрите вариант и нажмите «Вставить» или «Ещё вариант».',
    'Look at the draft, then click Insert or Another one.',
  ],
  aiWrites: ['Тексты и код', 'Text and code'],
  aiWritesText: [
    'Заголовки, описания, текст страницы, а ещё шаблоны, компоненты и плагины.',
    'Titles, descriptions, page text, and also templates, components and plugins.',
  ],
  aiKnows: ['Знает ваш сайт', 'Knows your site'],
  aiKnowsText: [
    'С просьбой уходят название и язык сайта, поле и где оно стоит, поэтому хватает пары слов.',
    'The request carries the site name and language, the field and where it sits, so a few words are enough.',
  ],
  aiModel: ['Ваша модель', 'Your model'],
  aiModelText: [
    'DeepSeek, OpenAI или любая модель с таким же API, хоть локальная. Ключ хранится только на сервере и в копию сайта не попадает.',
    'DeepSeek, OpenAI or any model with the same API, even a local one. The key stays on the server and never goes into a site backup.',
  ],
  aiAgents: ['Агенты с проверкой', 'Agents, reviewed'],
  aiAgentsText: [
    'Claude, Cursor и Codex подключаются по MCP. Их правки страниц и шаблонов могут ждать проверки: набором, с разницей и предпросмотром, как pull request.',
    'Claude, Cursor and Codex connect over MCP. Their edits to pages and templates can wait for review: as a set, with a diff and a preview, like a pull request.',
  ],
  heroCookbook: ['Кукбук', 'Cookbook'],
  themeToggle: ['Тёмная тема', 'Dark theme'],
  winManager: ['Eile — Менеджер', 'Eile — Manager'],
  winStudio: ['Фасад — сайт студии', 'Facade — studio site'],
  cookAll: ['Все главы', 'All chapters'],
  cookOnPage: ['В этой главе', 'In this chapter'],
  cookPrev: ['Назад', 'Previous'],
  cookNext: ['Дальше', 'Next'],
  cookChapterOf: ['Глава {n} из {total}', 'Chapter {n} of {total}'],
  cookMinutes: [
    'минута чтения|минуты чтения|минут чтения',
    'min read|min read',
  ],
  cookChapters: ['глава|главы|глав', 'chapter|chapters'],
  cookStart: ['Начать с первой главы', 'Start with chapter one'],
  cookChaptersTitle: ['Главы', 'Chapters'],
  cookSiteAlt: [
    'Сайт кухонной студии «Фасад», каким он станет к концу кукбука',
    'The kitchen studio site as it will look by the end of the cookbook',
  ],
  startCookbook: [
    'Подробно и по шагам, от пустой папки до сайта в интернете:',
    'Step by step, from an empty folder to a site online:',
  ],
  footerMotto: ['«Eile mit Weile»', '“Eile mit Weile”'],
  footerProduct: ['Продукт', 'Product'],
  footerDownload: ['Скачать', 'Download'],
  footerStart: ['Быстрый старт', 'Quick start'],
  footerDocs: ['Документация', 'Docs'],
  footerGlossary: ['Глоссарий и API', 'Glossary and API'],
  footerInside: ['Как устроено', 'How it works'],
  footerProject: ['Проект', 'Project'],
  footerIssues: ['Сообщить об ошибке', 'Report an issue'],
  footerMadeWith: ['Этот сайт сделан на Eile:', 'This site runs on Eile:'],
  footerSource: ['исходник', 'source'],
  copy: ['Копировать', 'Copy'],
  copied: ['Скопировано', 'Copied'],
  download: ['Скачать', 'Download'],
  github: ['GitHub', 'GitHub'],
  platforms: [
    'Linux, macOS и Windows, x64 и arm64',
    'Linux, macOS and Windows, x64 and arm64',
  ],
  heroKicker: ['CMS', 'CMS'],
  viewScript: ['посмотреть скрипт', 'view the script'],
  checksSha: ['проверяет SHA256', 'verifies SHA256'],
  shotEditor: [
    'Менеджер Eile: слева дерево страниц, справа редактор страницы проекта кухонной студии с заголовком, адресом, анонсом и текстом',
    'The Eile manager: the page tree on the left, a kitchen studio project page with title, address, summary and text on the right',
  ],
  demoPlay: ['Что умеет Eile · ролик 1:21', 'What Eile does · 1:21 video'],
  demoClose: ['Закрыть ролик', 'Close the video'],
  demoTitle: [
    'Ролик: Eile 0.1.0 от установки до сервера',
    'Video: Eile 0.1.0 from install to server',
  ],
  shotOverview: [
    'Обзор сайта в менеджере: все страницы в таблице, где адрес, шаблон, меню и публикацию можно править прямо в строке',
    'Site overview in the manager: every page in one table, with address, template, menu and publishing edited right in the row',
  ],
  stackUsual: ['Обычно', 'Usually'],
  stackUsualNote: ['типичный сайт на PHP-CMS', 'a typical PHP CMS site'],
  stackPile: [
    'Веб-сервер и его настройка|PHP с расширениями|Сервер базы данных|Сама CMS|Плагин кэша|Плагин SEO и карты сайта|Плагин форм|Плагин резервных копий|Cron для фоновых задач|Certbot для HTTPS',
    'Web server and its config|PHP with extensions|Database server|The CMS itself|Cache plugin|SEO and sitemap plugin|Forms plugin|Backup plugin|Cron for background jobs|Certbot for HTTPS',
  ],
  stackUsualFoot: [
    'У каждого слоя свои обновления, настройки и способы сломаться.',
    'Every layer brings its own updates, settings and ways to break.',
  ],
  stackEileNote: ['весь сайт', 'the whole site'],
  stackBinary: ['исполняемый файл', 'executable'],
  stackBinaryHas: [
    'сервер, менеджер, компилятор Svelte, миграции, HTTPS, статистика',
    'server, manager, Svelte compiler, migrations, HTTPS, statistics',
  ],
  stackDb: ['база SQLite', 'SQLite database'],
  stackDbHas: [
    'страницы, шаблоны, медиа, пользователи, заявки, статистика',
    'pages, templates, media, users, form entries, statistics',
  ],
  stackBackup: [
    'делает копию всего сайта одним файлом, а на новом сервере её поднимает',
    'backs up the whole site into one file, and on a new server',
  ],
  stackBackupEnd: ['.', ' brings it up.'],
  speedAria: [
    'Логарифмическая шкала от 0,1 миллисекунды до 1 секунды. Ответ из кэша Eile стоит около 0,5 мс времени одного ядра, первая отрисовка страницы, которой нет в кэше, — 3,1 мс, от запуска сервера до первой страницы — 0,66 с. Для сравнения: до 100 мс отклик кажется мгновенным.',
    'Logarithmic scale from 0.1 millisecond to 1 second. A reply from the Eile cache costs about 0.5 ms of one core, the first render of a page not yet in cache 3.1 ms, and server start to the first page 0.66 s. For comparison: below 100 ms a response feels instant.',
  ],
  speedTick01: ['0,1 мс', '0.1 ms'],
  speedTick1: ['1 мс', '1 ms'],
  speedTick10: ['10 мс', '10 ms'],
  speedTick100: ['100 мс', '100 ms'],
  speedTick1000: ['1 с', '1 s'],
  speedHitValue: ['≈0,5 мс', '≈0.5 ms'],
  speedHit: ['ответ из кэша, время ядра', 'a cached reply, core time'],
  speedColdValue: ['3,1 мс', '3.1 ms'],
  speedCold: [
    'первая отрисовка страницы, которой нет в кэше',
    'first render of a page not yet in cache',
  ],
  speedInstantValue: ['100 мс', '100 ms'],
  speedInstant: [
    'до этого порога отклик кажется мгновенным',
    'below this a response feels instant',
  ],
  speedBootValue: ['0,66 с', '0.66 s'],
  speedBoot: [
    'от запуска сервера до первой страницы',
    'from server start to the first page',
  ],
  speedNote: [
    'Бинарник Eile 0.1.0 на этом сайте, одно ядро. 0,5 мс — время ядра на ответ при 1 900 запросах в секунду; 3,1 мс — медиана 48 первых отрисовок 16 страниц (три запуска), с сетью localhost. Шкала логарифмическая.',
    'The Eile 0.1.0 binary serving this site on one core. 0.5 ms is core time per reply at 1,900 requests per second; 3.1 ms is the median of 48 first renders of 16 pages (three starts), over localhost. Logarithmic scale.',
  ],
  speedFact1: ['Двухфазный кэш', 'Two-phase cache'],
  speedFact1Text: [
    'Страница целиком лежит в памяти, а живые места (формы, корзина) дорисовываются на каждом запросе.',
    'The whole page sits in memory, while live parts such as forms or a cart are drawn on every request.',
  ],
  speedFact2: ['Точный сброс', 'Precise invalidation'],
  speedFact2Text: [
    'Правка страницы или компонента сбрасывает только те страницы, которые от них зависят.',
    'Editing a page or a component clears only the pages that depend on it.',
  ],
  speedFact3: ['ETag, br и стили файлами', 'ETag, br and styles as files'],
  speedFact3Text: [
    'Сжатые копии готовятся заранее, повторный визит получает 304 без тела, а CSS шаблонов приходит файлами с хэшем — на этой странице 10 КБ в brotli — и дальше берётся из кэша браузера.',
    'Compressed copies are prepared ahead, a repeat visit gets a 304 with no body, and template CSS arrives as hashed files (10 KB in brotli on this page) that the browser then keeps in its cache.',
  ],
  speedFact4: ['JavaScript только у островов', 'JavaScript only in islands'],
  speedFact4Text: [
    'Страница без островов уходит без единого скрипта. Здесь три острова (копирование, ролик и замер выше) и строка в шапке: она помнит тему и закрывает меню.',
    'A page without islands ships no script at all. This one has three islands (copy, the video and the probe above) and one line in the head that remembers your theme and closes the menu.',
  ],
  proofLead: ['Эта страница тоже на Eile', 'This page runs on Eile too'],
  proofNote: [
    'Замер вашего браузера, прямо сейчас.',
    'Measured by your browser, right now.',
  ],
  proofHtml: ['HTML', 'HTML'],
  proofJs: ['скрипты островов', 'island scripts'],
  proofReply: ['ответ сервера с учётом сети', 'server reply incl. network'],
  unitKb: ['КБ', 'KB'],
  unitMs: ['мс', 'ms'],
  tourTree: ['Дерево страниц', 'Page tree'],
  tourTreeText: [
    'id у каждой страницы, перетаскивание мышью и курсив у черновиков.',
    'An id on every page, drag and drop, and drafts in italics.',
  ],
  tourBlocks: ['Текст блоками', 'Text in blocks'],
  tourBlocksText: [
    'Абзацы, заголовки и картинки вперемешку с компонентами; форма параметров строится сама.',
    'Paragraphs, headings and images mixed with components; the parameter form builds itself.',
  ],
  tourSchedule: ['Публикация по расписанию', 'Scheduled publishing'],
  tourScheduleText: [
    'Страница выйдет и снимется сама в назначенный час.',
    'A page goes live and comes down on its own at the set time.',
  ],
  tourHistory: ['История правок', 'Revision history'],
  tourHistoryText: [
    'Сравнение версий по словам и возврат любой из них одной кнопкой.',
    'Word-level diffs between versions and a one-click restore.',
  ],
  tourShare: ['Ссылка клиенту', 'A link for the client'],
  tourShareText: [
    'Черновик открывается по ссылке без входа в менеджер: со сроком, отзывом и плашкой «не опубликовано».',
    'A draft opens from a link with no manager login: with an expiry date, revocation and a “not published” label.',
  ],
  tourMedia: ['Медиатека', 'Media library'],
  tourMediaText: [
    'Копии картинок для разных экранов сервер делает сам, откуда бы картинка ни пришла, а описание для alt подставляется при вставке.',
    'The server makes smaller copies of every picture for different screens, wherever it came from, and the alt text fills in when you insert it.',
  ],
  codeKind: ['шаблон', 'template'],
  codeLive: ['Правка видна сразу', 'Edits go live at once'],
  codeLiveText: [
    'Шаблоны и компоненты компилируются при сохранении, без сборки и деплоя.',
    'Templates and components compile on save, with no build and no deploy.',
  ],
  codeSafe: ['Ошибка не роняет сайт', 'A mistake can’t take the site down'],
  codeSafeText: [
    'Если код не компилируется, сохранение отклоняется с указанием места ошибки, а сайт работает на прежней версии.',
    'If it doesn’t compile, the save is rejected with the error’s location and the site keeps the previous version.',
  ],
  codeIslands: ['JavaScript по требованию', 'JavaScript on demand'],
  codeIslandsText: [
    'Страница уходит чистым HTML. Компонент-остров гидрируется в браузере, только если его так подключили.',
    'Pages go out as plain HTML. An island component hydrates in the browser only when included as one.',
  ],
  inAria: [
    'Что обычно ставят отдельно и что уже есть в Eile',
    'What is usually installed separately and what Eile already has',
  ],
  inUsual: ['Обычно ставят', 'Usually installed'],
  inEile: ['В Eile', 'In Eile'],
  inNone: ['обычно этого нет', 'usually not there at all'],
  inFind: ['Находимость', 'Discoverability'],
  inFindRows: [
    'плагин SEO :: canonical, Open Graph и JSON-LD без настройки|плагин карты сайта :: sitemap.xml и robots.txt с правилами для ИИ-ботов| :: llms.txt и Markdown-версия каждой страницы для ИИ|плагин редиректов :: старые адреса сами ведут на новые после переименования, а правила переадресации понимают и /?p=12',
    'an SEO plugin :: canonical, Open Graph and JSON-LD with no setup|a sitemap plugin :: sitemap.xml and robots.txt with rules for AI bots| :: llms.txt and a Markdown version of every page for AI|a redirects plugin :: old addresses redirect to new ones automatically after a rename, and redirect rules match /?p=12 too',
  ],
  inForms: ['Формы и заявки', 'Forms and inbox'],
  inFormsRows: [
    'плагин форм :: форма пишется обычной HTML5-разметкой, ошибки видны прямо у поля, заявки приходят в менеджер со статусами|SMTP-плагин и бот :: уведомления в Telegram и на почту: по SMTP или через HTTP API Brevo, Postmark, Mailgun, Resend и Amazon SES, если хостинг закрыл SMTP|капча :: защита от спама без капчи и cookie: браузер незаметно решает задачу, а ловушка, печать и лимит ловят остальное',
    'a forms plugin :: a form is plain HTML5 markup, errors show right at the field, entries land in the manager with statuses|an SMTP plugin and a bot :: notifications to Telegram and email: over SMTP or the HTTP API of Brevo, Postmark, Mailgun, Resend or Amazon SES when the host blocks SMTP|a CAPTCHA :: spam protection with no CAPTCHA and no cookies: the browser quietly solves a puzzle, and a honeypot, a stamp and a rate limit catch the rest',
  ],
  inStats: ['Статистика', 'Statistics'],
  inStatsRows: [
    'счётчик на чужом сервере и баннер согласия :: посетители, источники, UTM и цели считает сам сервер, без cookie; образец абзаца для политики конфиденциальности лежит в настройках',
    'a third-party counter and a consent banner :: the server itself counts visitors, sources, UTM tags and goals, with no cookies; a sample privacy-policy paragraph comes with the settings',
  ],
  inSearch: ['Поиск по сайту', 'Site search'],
  inSearchRows: [
    'плагин поиска или внешний сервис :: поиск понимает русские окончания («книги» находят «книгу») и подсвечивает отрывки',
    'a search plugin or an external service :: search that knows Russian word forms («книги» finds «книгу»), with highlighted snippets',
  ],
  inMedia: ['Картинки и стили', 'Images and styles'],
  inMediaRows: [
    'плагин оптимизации картинок :: копии 480, 960 и 1920 px в WebP сервер делает сам для каждой загрузки, даже от агента по MCP|плагин сборки CSS :: стили шаблонов уходят файлами с хэшем, и браузер держит их в кэше',
    'an image optimisation plugin :: the server makes 480, 960 and 1920 px WebP copies of every upload, even one from an agent over MCP|a CSS bundling plugin :: template styles go out as hashed files that the browser keeps in its cache',
  ],
  inCalm: ['Спокойствие владельца', 'Peace of mind'],
  inCalmRows: [
    'плагин версий :: история правок со сравнением и возвратом версии|плагин копий и cron :: автокопии по расписанию и зашифрованные копии вне сервера, в хранилище S3|проверка ссылок вручную :: диагностика: битые ссылки, страницы без описания, картинки без alt',
    'a revisions plugin :: revision history with diffs and restore|a backup plugin and cron :: scheduled backups and encrypted copies off the server, in S3 storage|checking links by hand :: diagnostics: broken links, pages without a description, images without alt',
  ],
  inLang: ['Языки', 'Languages'],
  inLangRows: [
    'плагин мультиязычности :: ветки сайта на разных языках и словари переводов в менеджере',
    'a multilingual plugin :: site branches in different languages and translation dictionaries in the manager',
  ],
  startInstall: ['Установить', 'Install'],
  startInstallText: [
    'Скрипт выберет сборку под систему, сверит SHA256 и положит `cms` в PATH. На Windows — `irm https://eile.site/install.ps1 | iex` в PowerShell.',
    'The script picks the build for your system, checks SHA256 and puts `cms` on your PATH. On Windows: `irm https://eile.site/install.ps1 | iex` in PowerShell.',
  ],
  startNew: ['Развернуть сайт', 'Create a site'],
  startNewText: [
    'Каркасы: blog, portfolio, company, showcase, shop. kuechenstudio — официальный пакет: сайт кухонной студии для Германии. Свой пакет ставится из файла .zip или папки. Без каркаса получится пустая база с приветствием.',
    'Starters: blog, portfolio, company, showcase, shop. kuechenstudio is an official package: a kitchen studio site for Germany. Your own package installs from a .zip file or a folder. Without one you get an empty database with a welcome page.',
  ],
  startRun: ['Запустить', 'Run'],
  startRunText: [
    'Сайт и менеджер откроются на localhost:8080. При первом запуске сервер напечатает ссылку, чтобы создать администратора.',
    'The site and manager open on localhost:8080. On first start the server prints a link to create the admin.',
  ],
  benchAria: [
    'Замер Eile 0.1.0 на одном ядре и 330 МБ памяти',
    'Eile 0.1.0 measured on one core and 330 MB of memory',
  ],
  benchWhat: ['Что происходит', 'What happens'],
  benchResult: ['Результат', 'Result'],
  benchDetails: ['Подробности', 'Details'],
  benchRows: [
    '20 человек одновременно открывают страницы :: 1 900 страниц в секунду :: на одном ядре, из кэша; главная, самая тяжёлая страница, — 1 040|Сколько памяти берёт сайт :: 59 МБ в покое, до 93 МБ под этой нагрузкой :: после прогрева и в пике за 20 секунд|Вы загружаете видео на 21 МБ, пока идёт нагрузка :: загрузилось за 0,3 с, памяти — не больше 118 МБ :: три раза из трёх, сайт не падал; страницы в это время — около 1 700 в секунду',
    '20 people open pages at the same time :: 1,900 pages per second :: on one core, from cache; the home page, the heaviest one, at 1,040|How much memory the site takes :: 59 MB at rest, up to 93 MB under that load :: after warm-up and at the peak over 20 seconds|You upload a 21 MB video while that load runs :: done in 0.3 s, at most 118 MB of memory :: three times out of three, the site stayed up; pages meanwhile at about 1,700 per second',
  ],
  benchNote: [
    'Бинарник Eile 0.1.0 с этим сайтом, 4 ноября 2026: systemd-run с CPUQuota=100 % и MemoryMax=330M без подкачки, 20 клиентов с keep-alive, во время загрузки — ещё 8 скачиваний ролика. Память — anon из memory.stat. Процессор настольный (Ryzen 7 5700X3D), ядро VPS обычно медленнее: это верхняя оценка.',
    'The Eile 0.1.0 binary with this site, 4 November 2026: systemd-run with CPUQuota=100% and MemoryMax=330M, no swap, 20 keep-alive clients, plus 8 video downloads during the upload. Memory is anon from memory.stat. The CPU is a desktop one (Ryzen 7 5700X3D), and a VPS core is usually slower: treat this as an upper bound.',
  ],
  benchHow: ['Как мерили', 'How we measured'],
  srvInstall: ['Служба одной командой', 'A service in one command'],
  srvInstallText: [
    '`cms service install` проверит DNS, порты и память, поставит службу systemd в песочнице с HTTPS и дождётся ответа сайта.',
    '`cms service install` checks DNS, ports and memory, sets up a sandboxed systemd service with HTTPS and waits for the site to answer.',
  ],
  srvUpdate: ['Обновление с откатом', 'Updates that roll back'],
  srvUpdateText: [
    '`cms update` сверяет SHA256, снимает копию базы и перезапускает службу; не поднялась — возвращаются программа и база.',
    '`cms update` checks SHA256, snapshots the database and restarts the service; if it doesn’t come up, the program and database go back.',
  ],
  srvHealth: ['Мониторинг', 'Monitoring'],
  srvHealthText: [
    'Адрес `/_cms/health` отвечает монитору 200 или 503, а о сбоях сайт сам пишет в Telegram и на почту.',
    'The `/_cms/health` address answers a monitor with 200 or 503, and the site reports failures to Telegram and email itself.',
  ],
  srvOffsite: ['Копии вне сервера', 'Copies off the server'],
  srvOffsiteText: [
    'Автокопии уходят зашифрованными в хранилище S3, а ночью сервер сжимает базу. На новой машине копию откроет ключ восстановления.',
    'Scheduled copies go encrypted to S3 storage, and the server compacts the database at night. On a new machine the recovery key opens a copy.',
  ],
  srvMove: ['Переезд', 'Moving'],
  srvMoveText: [
    'Файл настроек под паролем переносит почту, Telegram и ключи, а `cms diagnose domain` до правки DNS скажет, что сломается.',
    'A passphrase-sealed settings file carries email, Telegram and keys over, and `cms diagnose domain` tells you what would break before you touch DNS.',
  ],
  srvWindows: ['И на Windows', 'On Windows too'],
  srvWindowsText: [
    '`install.ps1` ставит `cms.exe` без прав администратора, и `cms update` работает и здесь. Запущенным сайт держит планировщик заданий или обёртка вроде WinSW.',
    '`install.ps1` installs `cms.exe` with no admin rights, and `cms update` works there too. Task Scheduler or a wrapper such as WinSW keeps the site running.',
  ],
  vsAria: ['Eile и WordPress по темам', 'Eile and WordPress by topic'],
  vsTopic: ['Тема', 'Topic'],
  vsStack: [
    'Что держать на сервере :: Веб-сервер (Apache или Nginx), PHP, MySQL или MariaDB, сам WordPress и плагины. Рекомендуются PHP 8.3 и MySQL 8.0 или MariaDB 10.11; на PHP 7.4 он тоже работает, но такие версии уже без поддержки [1]. Обычно всё это держит хостинг. :: Один исполняемый файл и файл SQLite; HTTPS, кэш и фоновые задачи внутри. [Как он живёт на сервере](#server)',
    'What runs on the server :: A web server (Apache or Nginx), PHP, MySQL or MariaDB, WordPress itself and plugins. PHP 8.3 and MySQL 8.0 or MariaDB 10.11 are recommended; it also runs on PHP 7.4, but such versions are past end of life [1]. A host usually keeps all of it running. :: One executable and one SQLite file; HTTPS, caching and background jobs are built in. [How it runs on a server](#server)',
  ],
  vsBuilt: [
    'Встроено или плагин :: В ядре есть карта сайта [2], уменьшенные копии картинок для srcset [3] и поиск по сайту. SEO-разметку, формы, защиту от спама, копии, кэш страниц, статистику, мультиязычность и редиректы обычно ставят плагинами, MCP для агентов — официальным плагином MCP Adapter [4]. :: Всё это уже внутри и обновляется вместе с Eile: [раздел «Возможности»](#inside).',
    'Built in or a plugin :: Core has a sitemap [2], smaller image copies for srcset [3] and site search. SEO markup, forms, spam protection, backups, a page cache, statistics, multilingual content and redirects usually come from plugins, and MCP for agents from the official MCP Adapter plugin [4]. :: All of it is built in and updates with Eile: [see Features](#inside).',
  ],
  vsUpdates: [
    'Обновления и откат :: Неудачное обновление ядра откатывается с версии 3.7, а плагин, который уронил сайт при автообновлении, возвращается к прежней версии с 6.6 [5]. Ядро, тема и каждый плагин обновляются отдельно, у каждого свой автор. :: Одно обновление на всё: `cms update` откатывает и программу, и базу. [Подробнее](#server)',
    'Updates and rollback :: A failed core update rolls back since version 3.7, and a plugin whose auto-update crashes the site returns to its previous version since 6.6 [5]. Core, the theme and each plugin update separately, each from its own author. :: One update for everything: `cms update` rolls back both the program and the database. [More](#server)',
  ],
  vsSurface: [
    'Поверхность атаки :: Каждый плагин сайта — PHP-код с доступом ко всему сайту, и уязвимость плагина — уязвимость сайта. Именно в плагинах их и находят: в 2025 году там было 91 % новых уязвимостей WordPress, в темах — 9 %, в ядре — 6 штук [6]. :: На сайте — программа и ваши шаблоны; чужого кода нет, пока вы его не поставили, а служба работает в песочнице systemd. Но код Eile молод.',
    'Attack surface :: Every plugin on a site is PHP code with access to the whole site, so a plugin’s vulnerability is the site’s. That is where they turn up: in 2025, 91% of new WordPress vulnerabilities were in plugins, 9% in themes and 6 in core [6]. :: A site is the program plus your templates; no third-party code runs until you add it, and the service runs in a systemd sandbox. But Eile’s code is young.',
  ],
  vsPrivacy: [
    'Приватность по умолчанию :: Зависит от темы и плагинов: счётчик, капча и шрифты могут приходить с чужих серверов, и тогда о них нужно написать в политике конфиденциальности, а иногда и спросить согласие. :: Статистика выключена и считает без cookie, формы защищены без капчи, а сам Eile не грузит на страницу ничего с чужих серверов.',
    'Privacy by default :: Depends on the theme and plugins: a counter, a CAPTCHA or fonts may come from third-party servers, and then the privacy policy has to say so, sometimes with a consent prompt. :: Statistics are off and count without cookies, forms are protected without a CAPTCHA, and Eile itself loads nothing onto the page from third-party servers.',
  ],
  vsMove: [
    'Переезд :: Экспорт есть в админке («Инструменты → Экспорт», файл WXR), подойдёт и дамп MySQL. :: `cms import-wp` переносит страницы, записи, картинки, меню, SEO-поля и старые адреса; вёрстку конструкторов — нет. [Как переехать](/cookbook/dalshe#wordpress)',
    'Moving over :: The admin has an export (Tools → Export, a WXR file), and a MySQL dump works too. :: `cms import-wp` moves pages, posts, images, menus, SEO fields and old addresses; page-builder layouts it can’t. [How to move](/en/cookbook/next#wordpress)',
  ],
  vsEvo: [
    'С MODX Evo — `cms import-evo`: дерево с id, шаблоны, чанки и TV. [Как переехать](/cookbook/dalshe#evo)',
    'From MODX Evo: `cms import-evo` moves the tree with its ids, templates, chunks and TVs. [How to move](/en/cookbook/next#evo)',
  ],
  vsStrongTitle: ['Где сильнее WordPress', 'Where WordPress is stronger'],
  vsStrong: [
    'Плагины и темы :: 73 917 бесплатных плагинов [7] и 8 877 тем [8] в каталоге WordPress.org.|Хостинг :: WordPress запускается почти на любом хостинге с PHP. Eile нужен VPS или свой компьютер, где можно запустить программу.|Привычность :: На WordPress работают 39,5 % всех сайтов [9]: его редактор знают многие, агентство найти легко.|Зрелость :: WordPress развивается с 2003 года [10], у него огромное сообщество.',
    'Plugins and themes :: 73,917 free plugins [7] and 8,877 themes [8] in the WordPress.org directory.|Hosting :: WordPress runs on almost any host with PHP. Eile needs a VPS or your own machine where you can run a program.|Familiarity :: WordPress runs 39.5% of all websites [9]: many people know its editor, and an agency is easy to find.|Maturity :: WordPress has been developed since 2003 [10] and has a huge community.',
  ],
  vsLimitsTitle: ['Где Eile пока уступает', 'Where Eile falls short for now'],
  vsLimits: [
    'Молодость :: Версия 0.1.6: до 1.0 возможны несовместимые изменения.|Один сервер :: Один процесс и одна база SQLite: сайт растёт вверх, а не вширь, реплик нет.|Svelte :: Шаблоны пишутся на Svelte: для своей вёрстки нужен разработчик, который его знает или готов выучить.|Готовое :: Каталога плагинов и тем нет: пять каркасов, пакет кухонной студии и набор компонентов, остальное пишется самому.',
    'Youth :: Version 0.1.6: breaking changes may land before 1.0.|One server :: One process and one SQLite database: the site scales up, not out, with no replicas.|Svelte :: Templates are written in Svelte: custom layouts need a developer who knows it or is willing to learn.|Ready-made parts :: There is no plugin or theme directory: five starters, a kitchen studio package and a component kit, the rest you write yourself.',
  ],
  vsSourcesTitle: ['Источники', 'Sources'],
  vsChecked: [
    'Данные о WordPress проверены 4 ноября 2026.',
    'WordPress facts checked on 4 November 2026.',
  ],
  vsSources: [
    'Требования WordPress, wordpress.org :: https://wordpress.org/about/requirements/|XML-карты сайта в WordPress 5.5, make.wordpress.org :: https://make.wordpress.org/core/2020/07/22/new-xml-sitemaps-functionality-in-wordpress-5-5/|Адаптивные картинки в WordPress 4.4, make.wordpress.org :: https://make.wordpress.org/core/2015/11/10/responsive-images-in-wordpress-4-4/|Плагин MCP Adapter, нужен WordPress 6.9+ :: https://wordpress.org/plugins/mcp-adapter/|Откат автообновлений плагинов, make.wordpress.org :: https://make.wordpress.org/core/2024/04/19/merge-proposal-rollback-auto-update/|Patchstack, State of WordPress Security in 2026 :: https://patchstack.com/whitepaper/state-of-wordpress-security-in-2026/|Число плагинов, api.wordpress.org, 4.11.2026 :: https://api.wordpress.org/plugins/info/1.2/?action=query_plugins&request%5Bper_page%5D=1|Число тем, api.wordpress.org, 4.11.2026 :: https://api.wordpress.org/themes/info/1.2/?action=query_themes&request%5Bper_page%5D=1|W3Techs, доля WordPress, 4.11.2026 :: https://w3techs.com/technologies/details/cm-wordpress|История выпусков WordPress :: https://wordpress.org/about/history/',
    'WordPress requirements, wordpress.org :: https://wordpress.org/about/requirements/|XML sitemaps in WordPress 5.5, make.wordpress.org :: https://make.wordpress.org/core/2020/07/22/new-xml-sitemaps-functionality-in-wordpress-5-5/|Responsive images in WordPress 4.4, make.wordpress.org :: https://make.wordpress.org/core/2015/11/10/responsive-images-in-wordpress-4-4/|The MCP Adapter plugin, needs WordPress 6.9+ :: https://wordpress.org/plugins/mcp-adapter/|Rollback for plugin auto-updates, make.wordpress.org :: https://make.wordpress.org/core/2024/04/19/merge-proposal-rollback-auto-update/|Patchstack, State of WordPress Security in 2026 :: https://patchstack.com/whitepaper/state-of-wordpress-security-in-2026/|Plugin count, api.wordpress.org, 4 Nov 2026 :: https://api.wordpress.org/plugins/info/1.2/?action=query_plugins&request%5Bper_page%5D=1|Theme count, api.wordpress.org, 4 Nov 2026 :: https://api.wordpress.org/themes/info/1.2/?action=query_themes&request%5Bper_page%5D=1|W3Techs, WordPress usage, 4 Nov 2026 :: https://w3techs.com/technologies/details/cm-wordpress|WordPress release history :: https://wordpress.org/about/history/',
  ],
  vsSourceRef: ['Источник {n}', 'Source {n}'],
  vsSourceBack: ['Вернуться к тексту', 'Back to the text'],
  closeTitle: ['Попробуйте на своём компьютере', 'Try it on your own computer'],
  closeRecap: [
    'Одна команда ставит Eile, вторая запускает сайт с менеджером. PHP, базу данных и веб-сервер ставить не нужно.',
    'One command installs Eile, a second runs the site and its manager. No PHP, database server or web server to set up.',
  ],
};

/** Промо-сайт Eile на самой Eile: две ветки языка, 404 и подписи компонентов в переводах. */
export var SITE: Scaffold = {
  name: 'eile',
  title: 'Сайт Eile',
  summary: 'промо-сайт самой CMS на русском и английском',
  siteName: 'Eile',
  description:
    'Eile умещает весь сайт в один исполняемый файл и одну базу SQLite. Шаблоны на Svelte правятся в браузере, страницы отдаются готовым HTML из кэша.',
  components: {
    Icon: _text(icon),
    Window: _text(windowFrame),
    Logo: _text(logo),
    CopyButton: _text(copyButton),
    DemoVideo: _text(demoVideo),
    PageProof: _text(pageProof),
    Install: _text(install),
    Shot: _text(shot),
    Layout: _text(layout),
    Rich: _text(rich),
    Pains: _text(pains),
    StackCompare: _text(stackCompare),
    SpeedScale: _text(speedScale),
    ManagerTour: _text(managerTour),
    TemplateCode: _text(templateCode),
    BuiltIn: _text(buildIn),
    OnServer: _text(onServer),
    WordPressCompare: _text(wordPressCompare),
    AiAssist: _text(aiAssist),
    QuickStart: _text(quickStart),
    Closing: _text(closing),
    CookShot: _text(cookShot),
  },
  templates: {
    Home: _text(home),
    Page: _text(page),
    Cookbook: _text(cookbook),
    Chapter: _text(chapter),
  },
  settings: {
    ruHome: '@{home}',
    enHome: '@{en}',
    ruCookbook: '@{cookbook}',
    enCookbook: '@{cookbook-en}',
    // Как переехать с WordPress и Evo: глава «Что дальше», разделы #wordpress и #evo.
    ruMoving: '@{cookbook-dalshe}',
    enMoving: '@{cookbook-en-next}',
    repo: _REPO,
    download: `${_REPO}/releases/latest`,
    install: `curl -fsSL ${_SITE}/install.sh | bash`,
    installSource: `${_REPO}/blob/HEAD/install.sh`,
  },
  pages: [
    {
      key: 'home',
      title: 'Eile',
      longTitle: 'Весь сайт в двух файлах',
      alias: 'eile',
      template: 'Home',
      introText:
        'Без возни с сервером и плагинами: только программа Eile и база SQLite. PHP и MySQL ставить не нужно, а сайт с менеджером запускается одной командой.',
      description:
        'Eile умещает весь сайт в один исполняемый файл и одну базу SQLite. Шаблоны на Svelte правятся в браузере, страницы отдаются готовым HTML из кэша.',
      content: _RU,
    },
    {
      key: 'cookbook',
      title: 'Кукбук',
      longTitle: 'Сайт кухонной студии с нуля',
      alias: 'cookbook',
      template: 'Cookbook',
      introText:
        'Тринадцать глав о первом сайте: ставим Eile, пишем шаблоны, заводим каталог кухонь с ценами и заявку на замер, а в конце выкладываем сайт в интернет с HTTPS.',
      description:
        'Кукбук Eile для начинающих: по шагам и с примерами собираем сайт кухонной студии, от установки до сайта в интернете.',
      content:
        '<p>Опыт программирования не нужен. Каждый пример кода можно скопировать целиком, а под ним разобрано, что делает каждая строка. Все примеры проверяет тест: он проходит главы по порядку на настоящей Eile.</p>',
      children: _chapters(CHAPTERS_RU, 'cookbook'),
    },
    {
      key: 'en',
      title: 'Eile',
      longTitle: 'The whole site in two files',
      alias: 'en',
      language: 'en',
      template: 'Home',
      introText:
        'No server or plugin chores: just the Eile program and an SQLite database. There’s no PHP or MySQL to install, and one command runs the site and its manager.',
      description:
        'Eile fits the whole site into one executable and one SQLite database. Svelte templates are edited in the browser, and pages are served as ready HTML from cache.',
      content: _EN,
      children: [
        {
          key: 'cookbook-en',
          title: 'Cookbook',
          longTitle: 'A kitchen studio site from scratch',
          alias: 'cookbook',
          template: 'Cookbook',
          introText:
            'Thirteen chapters about your first site: install Eile, write templates, add a kitchen catalog with prices and a measuring visit request, and finally put the site on the internet with HTTPS.',
          description:
            'The Eile cookbook for beginners: step by step and with examples, we build a kitchen studio site, from installation to a site on the internet.',
          content:
            '<p>No programming experience needed. You can copy every code example whole, and below each one we go through what every line does. A test checks all the examples: it walks through the chapters in order on a real Eile.</p>',
          children: _chapters(CHAPTERS_EN, 'cookbook-en'),
        },
      ],
    },
    // Короткие адреса скриптов установки: ресурсы-ссылки (weblink в Evo), 301 на файл последнего релиза.
    ...(['install.sh', 'install.ps1'] as const).map((name) => ({
      key: name,
      title: name,
      alias: name,
      kind: 'link' as const,
      linkTo: `${_REPO}/releases/latest/download/${name}`,
      template: 'Page',
      hiddenFromMenu: true,
      searchable: false,
    })),
    {
      key: 'not-found',
      title: 'Страница не найдена',
      alias: '404',
      template: 'Page',
      hiddenFromMenu: true,
      searchable: false,
      introText: 'Такой страницы нет. Возможно, адрес изменился.',
      content:
        '<p><a href="[~@{home}~]">На главную</a></p>\n<p lang="en">This page doesn’t exist. <a href="[~@{en}~]">Go to the English home page</a></p>',
    },
  ],
  home: 'home',
  notFound: 'not-found',
};

/** Переводы для `site.translations.save`: колонка на язык. */
export var translations = (): readonly (readonly [
  string,
  Readonly<Record<string, string>>,
])[] =>
  Object.entries(TEXTS).map(({ 0: key, 1: { 0: ru, 1: en } }) => [
    key,
    { ru: _typeset(ru), en: _typeset(en) },
  ]);

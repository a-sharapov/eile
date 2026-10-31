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
import page from './Page.svelte' with { type: 'text' };
import pageProof from './PageProof.svelte' with { type: 'text' };
import pains from './Pains.svelte' with { type: 'text' };
import quickStart from './QuickStart.svelte' with { type: 'text' };
import shot from './Shot.svelte' with { type: 'text' };
import speedScale from './SpeedScale.svelte' with { type: 'text' };
import stackCompare from './StackCompare.svelte' with { type: 'text' };
import templateCode from './TemplateCode.svelte' with { type: 'text' };

// Импорт текстом; собственные типы Svelte для `*.svelte` описывают компонент.
const _text = (source: unknown): string => source as string;

const _REPO = 'https://github.com/a-sharapov/eile';

/** Разделы главной: заголовок и вводный абзац — текст ветки языка, наглядная часть — компонент. */
const _home = (
  sections: readonly (readonly [string, string, string, string])[]
): string =>
  [
    ...sections.map(
      ({ 0: id, 1: title, 2: lead, 3: block }) =>
        `<h2 id="${id}">${title}</h2>\n<p>${lead}</p>\n[[${block}]]`
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
    'Обычный сайт держится на веб-сервере, PHP, базе данных и десятке плагинов, и у каждого свои обновления и поломки. В Eile весь сайт это исполняемый файл и база SQLite. Только их и нужно обновлять, переносить и копировать.',
    'StackCompare',
  ],
  [
    'speed',
    'Быстрый сайт без плагина кэша',
    'Не нужно подбирать кэш, CDN и сжатие. Страницу сервер отдаёт готовым HTML из памяти, кэш сбрасывается ровно там, где что-то изменилось, а JavaScript попадает на страницу, только если без него не обойтись.',
    'SpeedScale',
  ],
  [
    'manager',
    'Пользователь правит сам, а любую правку можно откатить',
    'Весь сайт виден деревом, как он вложен. Текст собирается из блоков, картинки берутся из медиатеки, страница выходит сразу или по расписанию. Если правка не удалась, история вернёт любую версию одной кнопкой.',
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
    'Пустое поле больше не держит работу. Палочка у поля пишет черновик заголовка, описания, текста страницы или даже шаблона на Svelte. Напишите, что нужно, посмотрите вариант и вставьте его или попросите другой.',
    'AiAssist',
  ],
  [
    'inside',
    'Всё, ради чего ставят плагины, уже внутри',
    'SEO и находимость для ИИ, формы с заявками, поиск, резервные копии, HTTPS и переводы. Их не нужно подбирать, совмещать и обновлять по отдельности: они приходят и обновляются вместе с Eile.',
    'BuiltIn',
  ],
  [
    'start',
    'Первый сайт уже сегодня',
    'Готовый сайт разворачивается одной командой: блог, портфолио, сайт компании, витрина или магазин.',
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
    'manager',
    'Users edit on their own, and any edit can be undone',
    'The whole site shows as a tree, the way it nests. Text is built from blocks, pictures come from the media library, and a page goes live at once or on a schedule. If an edit goes wrong, the history brings back any version with one click.',
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
    'An empty field no longer holds up the work. The wand by a field drafts a title, a description, page text or even a Svelte template. Say what you need, look at the draft, then insert it or ask for another.',
    'AiAssist',
  ],
  [
    'inside',
    'Everything you’d install plugins for is built in',
    'SEO and AI discoverability, forms with an inbox, search, backups, HTTPS and translations. Nothing to pick, combine and update one by one: they come and update together with Eile.',
    'BuiltIn',
  ],
  [
    'start',
    'Your first site today',
    'One command sets up a ready site: a blog, a portfolio, a company site, a showcase or a shop.',
    'QuickStart',
  ],
]);

/** Главы кукбука — дочерние страницы его оглавления, на шаблоне Chapter. */
const _chapters = (chapters: readonly Chapter[]) =>
  chapters.map((_) => ({
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
  navCookbook: ['Кукбук', 'Cookbook'],
  navAi: ['ИИ', 'AI'],
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
    'SEO, формы, поиск, копии и HTTPS уже внутри. Обновление одно, cms update, и новую версию оно сначала проверяет.',
    'SEO, forms, search, backups and HTTPS are built in. There is one update, cms update, and it checks the new version first.',
  ],
  pain3: [
    'Переезд на другой хостинг съедает вечер: дамп базы, файлы, конфиги.',
    'Moving to another host eats an evening: a database dump, files, configs.',
  ],
  relief3: [
    'Весь сайт лежит в двух файлах, программе и базе SQLite. Скопировали их, и сайт работает на новом сервере.',
    'The whole site is two files, the program and an SQLite database. Copy them, and the site runs on the new server.',
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
    'Заявки приходят в менеджер со статусами и сразу уведомляют в Telegram или на почту.',
    'Form entries land in the manager with statuses and ping you in Telegram or by email.',
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
  aiRules: ['Ваши правила', 'Your rules'],
  aiRulesText: [
    'Тон и правила текстов задаются один раз в настройках и уходят с каждой просьбой.',
    'Set the tone and writing rules once in settings, and they go with every request.',
  ],
  heroCookbook: ['Кукбук', 'Cookbook'],
  themeToggle: ['Светлая или тёмная тема', 'Light or dark theme'],
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
  platforms: ['Linux и macOS, x64 и arm64', 'Linux and macOS, x64 and arm64'],
  alpha: ['альфа', 'alpha'],
  shotEditor: [
    'Менеджер Eile: слева дерево страниц, справа редактор записи блога с заголовком, адресом, анонсом и текстом',
    'The Eile manager: the page tree on the left, a kitchen studio project page with title, address, summary and text on the right',
  ],
  demoPlay: [
    'Как сделать сайт · ролик 1:23',
    'How to build a site · 1:24 video',
  ],
  demoClose: ['Закрыть ролик', 'Close the video'],
  demoTitle: [
    'Ролик: сайт кухонной студии на Eile по шагам кукбука',
    'Video: a kitchen studio site on Eile, step by step',
  ],
  shotDemo: [
    'На снимках демо-блог из каркаса blog (cms new blog).',
    'Screenshots show the kitchen studio site from the cookbook.',
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
    'сервер, менеджер, компилятор Svelte, миграции, HTTPS',
    'server, manager, Svelte compiler, migrations, HTTPS',
  ],
  stackDb: ['база SQLite', 'SQLite database'],
  stackDbHas: [
    'страницы, шаблоны, медиа, пользователи, заявки',
    'pages, templates, media, users, form entries',
  ],
  stackBackup: [
    'делает копию всего сайта одним файлом. Для переезда нужно скопировать два файла.',
    'backs up the whole site into one file. To move, copy two files.',
  ],
  speedAria: [
    'Логарифмическая шкала от 0,1 миллисекунды до 1 секунды. Страница из кэша Eile отдаётся за 0,23 мс, первая сборка занимает около 0,5 мс, один кадр экрана 60 Гц длится 16,7 мс, а до 100 мс отклик кажется мгновенным.',
    'Logarithmic scale from 0.1 millisecond to 1 second. A cached Eile page takes 0.23 ms, a first render about 0.5 ms; one frame of a 60 Hz screen is 16.7 ms; below 100 ms a response feels instant.',
  ],
  speedTick01: ['0,1 мс', '0.1 ms'],
  speedTick1: ['1 мс', '1 ms'],
  speedTick10: ['10 мс', '10 ms'],
  speedTick100: ['100 мс', '100 ms'],
  speedTick1000: ['1 с', '1 s'],
  speedHitValue: ['0,23 мс', '0.23 ms'],
  speedHit: ['страница из кэша', 'a page from cache'],
  speedColdValue: ['≈0,5 мс', '≈0.5 ms'],
  speedCold: [
    'первая сборка страницы, время процессора',
    'first render of a page, CPU time',
  ],
  speedFrameValue: ['16,7 мс', '16.7 ms'],
  speedFrame: ['один кадр экрана 60 Гц', 'one frame of a 60 Hz screen'],
  speedInstantValue: ['100 мс', '100 ms'],
  speedInstant: [
    'до этого порога отклик кажется мгновенным',
    'below this a response feels instant',
  ],
  speedNote: [
    'Замер на сайте из 3000 страниц: медиана (p50), время сервера без сети. Шкала логарифмическая.',
    'Measured on a 3,000-page site: median (p50), server time without network. Logarithmic scale.',
  ],
  speedSource: [
    'Как мерили: docs/roadmap.md',
    'How it was measured: docs/roadmap.md',
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
  speedFact3: ['ETag, br и gzip', 'ETag, br and gzip'],
  speedFact3Text: [
    'Сжатые копии готовятся заранее, а повторный визит получает 304 без тела.',
    'Compressed copies are prepared ahead; a repeat visit gets a 304 with no body.',
  ],
  speedFact4: ['JavaScript только у островов', 'JavaScript only in islands'],
  speedFact4Text: [
    'Страница без островов уходит без единого скрипта. Здесь четыре острова (копирование, меню, ролик и замер выше) и строка в шапке, которая помнит выбранную тему.',
    'A page without islands ships no script at all. This one has three islands (copy, menu and the probe above) and one line in the head that remembers your theme.',
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
  tourJump: ['Быстрый переход', 'Quick jump'],
  tourJumpText: [
    'Ctrl K ведёт к любой странице, элементу или файлу в пару нажатий.',
    'Ctrl K takes you to any page, element or file in a couple of keystrokes.',
  ],
  tourMedia: ['Медиатека', 'Media library'],
  tourMediaText: [
    'Уменьшенные копии картинок для разных экранов делаются сами, а описание для alt подставляется при вставке.',
    'Smaller copies of each picture for different screens are made for you, and the alt text fills in when you insert it.',
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
    'плагин SEO :: canonical, Open Graph и JSON-LD без настройки|плагин карты сайта :: sitemap.xml и robots.txt с правилами для ИИ-ботов| :: llms.txt и Markdown-версия каждой страницы для ИИ|плагин редиректов :: старые адреса сами ведут на новые после переименования',
    'an SEO plugin :: canonical, Open Graph and JSON-LD with no setup|a sitemap plugin :: sitemap.xml and robots.txt with rules for AI bots| :: llms.txt and a Markdown version of every page for AI|a redirects plugin :: old addresses redirect to new ones automatically after a rename',
  ],
  inForms: ['Формы и заявки', 'Forms and inbox'],
  inFormsRows: [
    'плагин форм :: форма пишется обычной HTML5-разметкой, заявки приходят в менеджер со статусами|SMTP-плагин и бот :: уведомления в Telegram и на почту|капча :: защита от спама без капчи: ловушка, печать и лимит',
    'a forms plugin :: a form is plain HTML5 markup, entries land in the manager with statuses|an SMTP plugin and a bot :: notifications to Telegram and email|a CAPTCHA :: spam protection without a CAPTCHA: honeypot, stamp and rate limit',
  ],
  inSearch: ['Поиск по сайту', 'Site search'],
  inSearchRows: [
    'плагин поиска или внешний сервис :: поиск понимает русские окончания («книги» находят «книгу») и подсвечивает отрывки',
    'a search plugin or an external service :: search that knows Russian word forms («книги» finds «книгу»), with highlighted snippets',
  ],
  inCalm: ['Спокойствие владельца', 'Peace of mind'],
  inCalmRows: [
    'плагин версий :: история правок со сравнением и возвратом версии|плагин копий и cron :: автокопии всего сайта по расписанию|проверка ссылок вручную :: диагностика: битые ссылки, страницы без описания, картинки без alt',
    'a revisions plugin :: revision history with diffs and restore|a backup plugin and cron :: scheduled backups of the whole site|checking links by hand :: diagnostics: broken links, pages without a description, images without alt',
  ],
  inServer: ['Сервер', 'Server'],
  inServerRows: [
    'Certbot и прокси :: HTTPS сам, через Let’s Encrypt и без прокси|обновление файлов по FTP :: cms update скачивает новую версию и сверяет SHA256|сервис мониторинга :: сообщения о сбоях приходят в Telegram и на почту',
    'Certbot and a proxy :: HTTPS on its own through Let’s Encrypt, no proxy needed|updating files over FTP :: cms update fetches a new version and checks SHA256|a monitoring service :: failure alerts to Telegram and email',
  ],
  inLang: ['Языки', 'Languages'],
  inLangRows: [
    'плагин мультиязычности :: ветки сайта на разных языках и словари переводов в менеджере',
    'a multilingual plugin :: site branches in different languages and translation dictionaries in the manager',
  ],
  startInstall: ['Установить', 'Install'],
  startInstallText: [
    'Скрипт выберет сборку под систему, сверит SHA256 и положит cms в PATH.',
    'The script picks the build for your system, checks SHA256 and puts cms on your PATH.',
  ],
  startNew: ['Развернуть сайт', 'Create a site'],
  startNewText: [
    'Каркасы: blog, portfolio, company, showcase, shop. Без каркаса получится пустая база с приветствием.',
    'Starters: blog, portfolio, company, showcase, shop. Without one you get an empty database with a welcome page.',
  ],
  startRun: ['Запустить', 'Run'],
  startRunText: [
    'Сайт и менеджер откроются на localhost:8080. При первом запуске сервер напечатает ссылку, чтобы создать администратора.',
    'The site and manager open on localhost:8080. On first start the server prints a link to create the admin.',
  ],
  closeAlpha: [
    'Это альфа-версия: делать сайты уже можно, но до 1.0 возможны несовместимые изменения. Перед обновлением сделайте cms backup.',
    'This is an alpha: you can build sites today, but breaking changes may land before 1.0. Run cms backup before updating.',
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
  kit: ['MenuKeys'],
  components: {
    Icon: _text(icon),
    Logo: _text(logo),
    CopyButton: _text(copyButton),
    DemoVideo: _text(demoVideo),
    PageProof: _text(pageProof),
    Install: _text(install),
    Shot: _text(shot),
    Layout: _text(layout),
    Pains: _text(pains),
    StackCompare: _text(stackCompare),
    SpeedScale: _text(speedScale),
    ManagerTour: _text(managerTour),
    TemplateCode: _text(templateCode),
    BuiltIn: _text(buildIn),
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
    repo: _REPO,
    download: `${_REPO}/releases/latest`,
    install: `curl -fsSL ${_REPO}/releases/latest/download/install.sh | bash`,
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
      children: _chapters(CHAPTERS_RU),
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
          children: _chapters(CHAPTERS_EN),
        },
      ],
    },
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
    { ru, en },
  ]);

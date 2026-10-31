import { PRODUCT } from '../product.ts';
import { SCAFFOLDS } from '../scaffolds/index.ts';
import type { Language } from './language.ts';
import { tagline } from './motd.ts';
import { type Paint, padEnd } from './paint.ts';
import { VERSION } from './version.ts';

/** Команда в справке: как вызвать, что делает, параметры и примеры «комментарий → строка». */
export type CommandHelp = {
  readonly name: string;
  readonly summary: string;
  readonly usage: readonly string[];
  readonly details: readonly string[];
  readonly options: readonly (readonly [string, string])[];
  readonly examples: readonly (readonly [string, string])[];
};

const _DB = ['--db <файл>', 'Файл базы SQLite: site.db или $CMS_DB'] as const;
const _PASSWORD_STDIN = [
  '--password-stdin',
  'Прочитать пароль из stdin (для скриптов)',
] as const;

const _RU: readonly CommandHelp[] = [
  {
    name: 'serve',
    summary: 'Запустить сайт и менеджер (команда по умолчанию)',
    usage: [
      'cms [serve] [--port <порт>] [--db <файл>] [--trust-proxy]',
      'cms [serve] --domain <домены> [--email <почта>] [--https-port <порт>]',
    ],
    details: [
      'Сайт и менеджер (/manager) отдаются одним процессом. На пустой базе создаются страница приветствия и пустой шаблон Minimal; готовый сайт — cms new.',
      'Пока пользователей нет, при запуске печатается ссылка первичной настройки — по ней создаётся администратор.',
      'Остановить — Ctrl+C или SIGTERM: база закрывается аккуратно.',
      'За nginx или Caddy с HTTPS — --trust-proxy: протокол и адрес посетителя берутся из X-Forwarded-*, cookie входа получает Secure. Без прокси этот флаг не включайте: заголовки подделает любой.',
      "HTTPS без прокси — --domain: сервер сам получает сертификат Let's Encrypt и продлевает его за 30 дней до конца. HTTP (порт 80) отвечает на проверку домена и ведёт на HTTPS (443); пока сертификата нет, сайт открывается по HTTP. DNS доменов должен указывать на этот сервер.",
      'Порты 80 и 443 — от root или с правом на них: sudo setcap cap_net_bind_service=+ep $(which cms), в systemd — AmbientCapabilities=CAP_NET_BIND_SERVICE.',
    ],
    options: [
      ['--port <порт>', 'Порт: 8080 или $PORT'],
      _DB,
      ['--trust-proxy', 'Доверять X-Forwarded-*: только за своим прокси'],
      ['--domain <домены>', 'HTTPS без прокси: example.com,www.example.com'],
      ['--email <почта>', "Почта для писем Let's Encrypt о сертификате"],
      ['--https-port <порт>', 'Порт HTTPS: 443 или $CMS_HTTPS_PORT'],
      ['--acme-staging', "Тестовый центр Let's Encrypt — для пробы"],
    ],
    examples: [
      ['Сайт на :8080 из site.db в текущем каталоге', 'cms'],
      ['Свой порт и база', 'cms serve --port 3000 --db site.db'],
      [
        'Через окружение — для systemd и Docker',
        'PORT=80 CMS_DB=/var/lib/cms/site.db cms',
      ],
      [
        'HTTPS без nginx на своём сервере',
        'cms --domain example.com --email you@example.com',
      ],
    ],
  },
  {
    name: 'new',
    summary: 'Готовый сайт из каркаса: блог, портфолио, магазин…',
    usage: ['cms new', 'cms new <каркас> [--name <название>] [--db <файл>]'],
    details: [
      'Каркас — готовый сайт для старта: шаблоны, компоненты, поля, формы и страницы с примерами текста. Дальше всё правится в менеджере, как свой код.',
      `Каркасы: ${SCAFFOLDS.map((_) => `${_.name} — ${_.title.toLowerCase()}`).join(', ')}. Без имени — список с описаниями.`,
      'Ложится на новую базу или на нетронутое приветствие первого запуска. Пользователи остаются. Сайт, где уже есть своя работа, каркас не трогает.',
      'Сервер на этой базе перезапустите после команды.',
    ],
    options: [
      ['--name <название>', 'Название сайта; по умолчанию — из каркаса'],
      _DB,
    ],
    examples: [
      ['Какие есть каркасы', 'cms new'],
      [
        'Блог в новой базе и запуск',
        'cms new blog --db blog.db && cms --db blog.db',
      ],
      [
        'Магазин со своим названием',
        'cms new shop --name "Чайная лавка" --db shop.db',
      ],
    ],
  },
  {
    name: 'info',
    summary: 'Сводка по базе: страницы, элементы, файлы, пользователи',
    usage: ['cms info [--db <файл>]'],
    details: [
      'Размер файла, версия схемы, сколько страниц опубликовано и лежит в корзине, сколько шаблонов, компонентов, плагинов, полей, файлов медиатеки и пользователей.',
      'База открывается так же, как при запуске сервера: если бинарник новее, сначала применяются миграции.',
    ],
    options: [_DB],
    examples: [['Что лежит в базе сайта', 'cms info --db site.db']],
  },
  {
    name: 'users',
    summary: 'Пользователи менеджера: список, новый, смена пароля',
    usage: [
      'cms users [--db <файл>]',
      'cms users add <почта> [--name <имя>] [--role admin|editor]',
      'cms users password <почта> [--password-stdin]',
    ],
    details: [
      'Без подкоманды — список: id, почта, имя и роль.',
      'add — новый пользователь. Роль по умолчанию — admin, если пользователей ещё нет, иначе editor.',
      'password — новый пароль; все сеансы пользователя закрываются. Это спасение, если администратор забыл пароль. Блокировку после пяти неудачных входов снимает перезапуск сервера.',
      'Пароль — не короче 10 символов. В терминале он вводится скрыто и дважды, в скриптах — через --password-stdin.',
    ],
    options: [
      ['--name <имя>', 'Имя в менеджере; по умолчанию — часть почты до @'],
      ['--role <роль>', 'admin — всё, editor — страницы и медиатека'],
      _PASSWORD_STDIN,
      _DB,
    ],
    examples: [
      ['Кто может войти в менеджер', 'cms users --db site.db'],
      [
        'Администратор без браузера',
        'cms users add anna@example.com --name "Анна" --role admin',
      ],
      ['Забытый пароль', 'cms users password anna@example.com'],
      [
        'Пароль из переменной в скрипте',
        'printf %s "$PASS" | cms users password a@b.ru --password-stdin',
      ],
    ],
  },
  {
    name: 'backup',
    summary: 'Копия всего сайта в один файл',
    usage: ['cms backup [<файл>] [--db <файл>]'],
    details: [
      'База, шаблоны, компоненты и медиатека — в одном файле SQLite. Можно на работающем сайте: копия согласованная (VACUUM INTO).',
      'Имя с .json — те же записи текстом: можно открыть, сравнить две копии, перенести. Сеансов входа в копии нет.',
      'Без имени файла — cms-ГГГГ-ММ-ДД.db в текущем каталоге. Существующий файл не перезаписывается.',
      'Восстановление — cms restore или раздел «Копии» в менеджере.',
    ],
    options: [_DB],
    examples: [
      ['Копия рядом, с датой в имени', 'cms backup --db site.db'],
      [
        'В каталог бэкапов',
        'cms backup /backups/site-$(date +%F).db --db site.db',
      ],
      ['Записи текстом', 'cms backup site.json --db site.db'],
    ],
  },
  {
    name: 'restore',
    summary: 'Восстановить сайт из копии .db или JSON',
    usage: ['cms restore <файл> [--db <файл>]'],
    details: [
      'Сайт в базе становится таким, каким был в копии: страницы, элементы, медиатека, настройки, пользователи. Копия из более старой версии сначала доводится до текущей схемы.',
      'Если база уже есть, её прежнее состояние сохраняется рядом: site.before-restore-ГГГГММДД-ЧЧММСС.db. Новой базы не было — она создаётся: так сайт переезжает на другой сервер.',
      'Остановите сервер перед восстановлением из командной строки или восстанавливайте в менеджере: раздел «Копии».',
    ],
    options: [_DB],
    examples: [
      [
        'Вернуть вчерашнюю копию',
        'cms restore /backups/site-2026-10-29.db --db site.db',
      ],
      ['Перенести сайт на новый сервер', 'cms restore site.json --db site.db'],
    ],
  },
  {
    name: 'import-evo',
    summary: 'Перенос сайта Evolution CMS из дампа MySQL',
    usage: ['cms import-evo <dump.sql> [--db <файл>]'],
    details: [
      'Читает дамп mysqldump сайта Evo и переносит в пустую базу дерево страниц с прежними id (ссылки [~5~] ведут туда же), TV с значениями — в поля, шаблоны и чанки — в Svelte, настройки site_name, site_start и error_page.',
      'Сниппеты PHP не переносятся: их вызовы остаются комментариями, а список имён попадает в отчёт. Ошибка одной записи не останавливает перенос — она тоже в отчёте.',
    ],
    options: [_DB],
    examples: [
      ['Дамп старого сайта', 'mysqldump -u evo -p evo_db > evo.sql'],
      ['Перенос в новую базу', 'cms import-evo evo.sql --db site.db'],
      ['Посмотреть, что получилось', 'cms --db site.db'],
    ],
  },
  {
    name: 'update',
    summary: 'Обновить cms до новой версии одной командой',
    usage: ['cms update [--check]'],
    details: [
      'Берёт новую версию со страницы релизов: сборку под эту систему, сверяет её с SHA256SUMS, пробует запустить и атомарно заменяет бинарник. Прежний остаётся рядом: cms.old.',
      'Работающий сервер продолжает на старой версии — перезапустите его. Сайт и база не меняются.',
      'С альфы и беты обновление идёт и на следующие пре-релизы, со стабильной версии — только на стабильные.',
      'В менеджере о новой версии говорит меню профиля; проверку выключают в настройках или CMS_NO_UPDATE_CHECK=1.',
    ],
    options: [['--check', 'Только проверить, есть ли новая версия']],
    examples: [
      ['Есть ли новая версия', 'cms update --check'],
      ['Обновить cms в /usr/local/bin', 'sudo cms update'],
    ],
  },
  {
    name: 'help',
    summary: 'Эта справка; help <команда> — подробно',
    usage: ['cms help [<команда>]', 'cms <команда> --help'],
    details: [
      'Список команд или подробная справка по одной: что делает, параметры и примеры.',
    ],
    options: [],
    examples: [['Всё о пользователях', 'cms help users']],
  },
  {
    name: 'version',
    summary: `Версия ${PRODUCT}`,
    usage: ['cms version', 'cms --version'],
    details: [
      'Печатает номер версии — его удобно указать в сообщении об ошибке.',
    ],
    options: [],
    examples: [['Версия бинарника', 'cms --version']],
  },
];

const _DB_EN = [
  '--db <file>',
  'SQLite database file: site.db or $CMS_DB',
] as const;

const _EN: readonly CommandHelp[] = [
  {
    name: 'serve',
    summary: 'Run the site and the manager (the default command)',
    usage: [
      'cms [serve] [--port <port>] [--db <file>] [--trust-proxy]',
      'cms [serve] --domain <domains> [--email <email>] [--https-port <port>]',
    ],
    details: [
      'One process serves the site and the manager (/manager). An empty database gets a welcome page and a blank Minimal template; for a ready-made site, run cms new.',
      'While there are no users, startup prints a setup link: open it to create the administrator.',
      'Stop with Ctrl+C or SIGTERM: the database closes cleanly.',
      'Behind nginx or Caddy with HTTPS, use --trust-proxy: the protocol and the visitor address come from X-Forwarded-*, and the sign-in cookie gets Secure. Do not turn it on without a proxy: anyone can forge those headers.',
      "HTTPS without a proxy: --domain. The server gets a Let's Encrypt certificate itself and renews it 30 days before it expires. HTTP (port 80) answers the domain check and redirects to HTTPS (443); until the certificate arrives, the site opens over HTTP. The DNS of the domains must point at this server.",
      'Ports 80 and 443 need root or the right to bind them: sudo setcap cap_net_bind_service=+ep $(which cms), or AmbientCapabilities=CAP_NET_BIND_SERVICE in systemd.',
    ],
    options: [
      ['--port <port>', 'Port: 8080 or $PORT'],
      _DB_EN,
      ['--trust-proxy', 'Trust X-Forwarded-*: only behind your own proxy'],
      [
        '--domain <domains>',
        'HTTPS without a proxy: example.com,www.example.com',
      ],
      ['--email <email>', "Email for Let's Encrypt certificate notices"],
      ['--https-port <port>', 'HTTPS port: 443 or $CMS_HTTPS_PORT'],
      ['--acme-staging', "Let's Encrypt staging CA, for a trial run"],
    ],
    examples: [
      ['Site on :8080 from site.db in the current directory', 'cms'],
      ['Your own port and database', 'cms serve --port 3000 --db site.db'],
      [
        'Through the environment, for systemd and Docker',
        'PORT=80 CMS_DB=/var/lib/cms/site.db cms',
      ],
      [
        'HTTPS without nginx on your own server',
        'cms --domain example.com --email you@example.com',
      ],
    ],
  },
  {
    name: 'new',
    summary: 'A ready-made site from a scaffold: blog, portfolio, shop…',
    usage: ['cms new', 'cms new <scaffold> [--name <name>] [--db <file>]'],
    details: [
      'A scaffold is a ready site to start from: templates, components, fields, forms and pages with sample text. After that you edit everything in the manager as your own code.',
      `Scaffolds: ${SCAFFOLDS.map((_) => _.name).join(', ')}. Without a name, cms new lists them with descriptions. On an English system they come in English, on a Russian one in Russian.`,
      'A scaffold goes onto a new database or onto the untouched welcome page of the first run. Users stay. A site with your own work on it is left alone.',
      'Restart the server running on this database after the command.',
    ],
    options: [
      ['--name <name>', 'Site name; the scaffold’s own by default'],
      _DB_EN,
    ],
    examples: [
      ['Which scaffolds there are', 'cms new'],
      [
        'A blog in a new database, then run it',
        'cms new blog --db blog.db && cms --db blog.db',
      ],
      [
        'A shop with your own name',
        'cms new shop --name "Tea Corner" --db shop.db',
      ],
    ],
  },
  {
    name: 'info',
    summary: 'Database summary: pages, elements, files, users',
    usage: ['cms info [--db <file>]'],
    details: [
      'File size, schema version, how many pages are published and in the trash, and how many templates, components, plugins, fields, media files and users there are.',
      'The database opens the same way as when the server starts: if the binary is newer, migrations run first.',
    ],
    options: [_DB_EN],
    examples: [['What the site database holds', 'cms info --db site.db']],
  },
  {
    name: 'users',
    summary: 'Manager users: list, add, change a password',
    usage: [
      'cms users [--db <file>]',
      'cms users add <email> [--name <name>] [--role admin|editor]',
      'cms users password <email> [--password-stdin]',
    ],
    details: [
      'Without a subcommand: the list with id, email, name and role.',
      'add creates a user. The role is admin if there are no users yet, editor otherwise.',
      'password sets a new password and closes all sessions of that user. Use it when the administrator forgot the password. A lockout after five failed sign-ins clears when the server restarts.',
      'A password has at least 10 characters. In a terminal you type it hidden, twice; in scripts pass it with --password-stdin.',
    ],
    options: [
      [
        '--name <name>',
        'Name in the manager; the part of the email before @ by default',
      ],
      [
        '--role <role>',
        'admin can do everything, editor edits pages and media',
      ],
      ['--password-stdin', 'Read the password from stdin (for scripts)'],
      _DB_EN,
    ],
    examples: [
      ['Who can sign in to the manager', 'cms users --db site.db'],
      [
        'An administrator without a browser',
        'cms users add anna@example.com --name "Anna" --role admin',
      ],
      ['A forgotten password', 'cms users password anna@example.com'],
      [
        'Password from a variable in a script',
        'printf %s "$PASS" | cms users password a@b.com --password-stdin',
      ],
    ],
  },
  {
    name: 'backup',
    summary: 'A copy of the whole site in one file',
    usage: ['cms backup [<file>] [--db <file>]'],
    details: [
      'The database, templates, components and media in one SQLite file. Safe on a running site: the copy is consistent (VACUUM INTO).',
      'A name ending in .json writes the same records as text: you can open it, compare two copies, move it. Sign-in sessions are not copied.',
      'Without a file name: cms-YYYY-MM-DD.db in the current directory. An existing file is never overwritten.',
      'To restore, use cms restore or Backups in the manager.',
    ],
    options: [_DB_EN],
    examples: [
      ['A dated copy next to the database', 'cms backup --db site.db'],
      [
        'Into a backups directory',
        'cms backup /backups/site-$(date +%F).db --db site.db',
      ],
      ['Records as text', 'cms backup site.json --db site.db'],
    ],
  },
  {
    name: 'restore',
    summary: 'Restore the site from a .db or JSON copy',
    usage: ['cms restore <file> [--db <file>]'],
    details: [
      'The site in the database becomes what it was in the copy: pages, elements, media, settings, users. A copy from an older version is brought up to the current schema first.',
      'If the database exists, its previous state is saved next to it: site.before-restore-YYYYMMDD-HHMMSS.db. If there was no database, it is created: that is how a site moves to another server.',
      'Stop the server before restoring from the command line, or restore in the manager under Backups.',
    ],
    options: [_DB_EN],
    examples: [
      [
        'Bring back yesterday’s copy',
        'cms restore /backups/site-2026-10-29.db --db site.db',
      ],
      ['Move the site to a new server', 'cms restore site.json --db site.db'],
    ],
  },
  {
    name: 'import-evo',
    summary: 'Move an Evolution CMS site from a MySQL dump',
    usage: ['cms import-evo <dump.sql> [--db <file>]'],
    details: [
      'Reads a mysqldump of an Evo site and moves it into an empty database: the page tree with the same ids (links like [~5~] still lead to the same pages), TVs with their values as fields, templates and chunks as Svelte, and the site_name, site_start and error_page settings.',
      'PHP snippets do not move: their calls stay as comments, and their names go into the report. One broken record does not stop the import; it goes into the report too.',
    ],
    options: [_DB_EN],
    examples: [
      ['Dump the old site', 'mysqldump -u evo -p evo_db > evo.sql'],
      ['Move it into a new database', 'cms import-evo evo.sql --db site.db'],
      ['See what came out', 'cms --db site.db'],
    ],
  },
  {
    name: 'update',
    summary: 'Update cms to a new version with one command',
    usage: ['cms update [--check]'],
    details: [
      'Takes the new version from the releases page: the build for this system, checked against SHA256SUMS and test-run, then swaps the binary atomically. The previous one stays next to it as cms.old.',
      'A running server keeps the old version until you restart it. The site and the database do not change.',
      'From an alpha or beta, updates follow the next pre-releases too; from a stable version, only stable ones.',
      'In the manager the profile menu tells you about a new version; turn the check off in settings or with CMS_NO_UPDATE_CHECK=1.',
    ],
    options: [['--check', 'Only check whether there is a new version']],
    examples: [
      ['Is there a new version', 'cms update --check'],
      ['Update cms in /usr/local/bin', 'sudo cms update'],
    ],
  },
  {
    name: 'help',
    summary: 'This help; help <command> for details',
    usage: ['cms help [<command>]', 'cms <command> --help'],
    details: [
      'The command list, or full help for one command: what it does, its options and examples.',
    ],
    options: [],
    examples: [['All about users', 'cms help users']],
  },
  {
    name: 'version',
    summary: `${PRODUCT} version`,
    usage: ['cms version', 'cms --version'],
    details: ['Prints the version number, handy for a bug report.'],
    options: [],
    examples: [['Binary version', 'cms --version']],
  },
];

/** Справка команд на языке CLI; имена команд — одни на всех. */
export var COMMANDS: Readonly<Record<Language, readonly CommandHelp[]>> = {
  ru: _RU,
  en: _EN,
};

type _Pairs = readonly (readonly [string, string])[];

const _TEXT = {
  ru: {
    usage: 'Использование',
    commands: 'Команды',
    common: 'Общие параметры',
    examples: 'Примеры',
    environment: 'Окружение',
    details: 'Описание',
    options: 'Параметры',
    line: 'cms [команда] [параметры]',
    more: 'Подробнее о команде:',
    helpLine: 'cms help <команда>',
    commonOptions: [
      _DB,
      ['--port <порт>', 'Порт сервера: 8080 или $PORT'],
      ['-h, --help', 'Справка по команде'],
      ['-v, --version', 'Версия'],
    ] as _Pairs,
    overviewExamples: [
      ['Запустить сайт; менеджер — /manager', 'cms --db site.db'],
      ['Перенести сайт с Evo', 'cms import-evo evo.sql --db site.db'],
      ['Бэкап на работающем сайте', 'cms backup --db site.db'],
      ['Забыт пароль администратора', 'cms users password anna@example.com'],
    ] as _Pairs,
    portDb: 'Значения --port и --db по умолчанию',
    trustProxy: '1 — то же, что --trust-proxy',
    noColor: 'Без цвета; FORCE_COLOR=1 — с цветом и в трубе',
    unknown: (name: string) => `Нет команды «${name}».`,
    near: (name: string) => `Возможно, вы имели в виду: cms ${name}`,
    all: 'Все команды — cms help',
  },
  en: {
    usage: 'Usage',
    commands: 'Commands',
    common: 'Common options',
    examples: 'Examples',
    environment: 'Environment',
    details: 'Description',
    options: 'Options',
    line: 'cms [command] [options]',
    more: 'More about a command:',
    helpLine: 'cms help <command>',
    commonOptions: [
      _DB_EN,
      ['--port <port>', 'Server port: 8080 or $PORT'],
      ['-h, --help', 'Help for a command'],
      ['-v, --version', 'Version'],
    ] as _Pairs,
    overviewExamples: [
      ['Run the site; the manager is at /manager', 'cms --db site.db'],
      ['Move a site from Evo', 'cms import-evo evo.sql --db site.db'],
      ['Back up a running site', 'cms backup --db site.db'],
      [
        'Administrator password forgotten',
        'cms users password anna@example.com',
      ],
    ] as _Pairs,
    portDb: 'Defaults for --port and --db',
    trustProxy: '1 is the same as --trust-proxy',
    noColor: 'No color; FORCE_COLOR=1 keeps color in a pipe',
    unknown: (name: string) => `No command “${name}”.`,
    near: (name: string) => `Did you mean: cms ${name}`,
    all: 'All commands: cms help',
  },
} satisfies Record<Language, unknown>;

/** Нет такой команды: строка ошибки с ближайшей командой и путём к списку. */
export var unknownText = (name: string, language: Language): string =>
  ((text, near) =>
    [text.unknown(name), ...(near ? [text.near(near)] : []), text.all].join(
      '\n'
    ))(_TEXT[language], suggest(name));

// Колонка описаний: команды, параметры и окружение начинаются с одного отступа.
const _COLUMN = 20;

export var commandNames = (): string[] => _RU.map((_) => _.name);

// Строка вызова в цвете: cms — жирным, команда — своим цветом, параметры и <значения> — своими.
const _COMMAND = new RegExp(`\\bcms( (${commandNames().join('|')}))?\\b`);

export var paintLine =
  (paint: Paint) =>
  (line: string): string =>
    line
      .replace(/<[^>]+>/g, (_) => paint.dim(_))
      .replace(
        /(^|[\s[|])(--?[a-z][a-z-]*)/g,
        (_, before: string, flag: string) => `${before}${paint.flag(flag)}`
      )
      .replace(
        _COMMAND,
        (_, sub: string | undefined) =>
          `${paint.bold('cms')}${sub ? ` ${paint.command(sub.trim())}` : ''}`
      );

// Абзац — по словам в строки не длиннее width: справка читается в окне 80 колонок.
export var wrap = (text: string, width: number, indent = ''): string[] =>
  text
    .split(' ')
    .reduce<string[]>(
      (lines, word) =>
        lines.length > 0 &&
        `${lines.at(-1)!} ${word}`.length <= width - indent.length
          ? [...lines.slice(0, -1), `${lines.at(-1)!} ${word}`]
          : [...lines, word],
      []
    )
    .map((_) => `${indent}${_}`);

const _section = (paint: Paint, title: string, lines: readonly string[]) => [
  '',
  paint.bold(title),
  ...lines,
];

const _examples = (paint: Paint, examples: CommandHelp['examples']) =>
  examples.flatMap(({ 0: comment, 1: line }) => [
    paint.dim(`  # ${comment}`),
    `  ${paint.dim('$')} ${paintLine(paint)(line)}`,
  ]);

// Колонка описаний — не уже самого длинного флага с двумя пробелами: `--https-port <port>` не слипается.
const _options = (paint: Paint, options: CommandHelp['options']) =>
  ((column) =>
    options.flatMap(({ 0: flag, 1: about }) =>
      wrap(about, 80, ' '.repeat(column)).map((line, index) =>
        index === 0
          ? `${padEnd(`  ${paintLine(paint)(flag)}`, column)}${line.trimStart()}`
          : line
      )
    ))(Math.max(_COLUMN, ...options.map(({ 0: flag }) => flag.length + 4)));

/** Шапка справки: знак (ветка схемы сайта со статусами) и название. */
export var heading = (paint: Paint, language: Language): string =>
  `${paint.ok('●')}${paint.dim('─┬─')}${paint.warn('◐')} ${paint.accent(PRODUCT)} ${paint.dim(VERSION)} ${paint.dim('·')} ${tagline(language)}`;

/** `cms help`: команды, общие параметры, примеры и окружение. */
export var overview = (paint: Paint, language: Language): string =>
  ((text) =>
    [
      heading(paint, language),
      ..._section(paint, text.usage, [`  ${paintLine(paint)(text.line)}`]),
      ..._section(
        paint,
        text.commands,
        COMMANDS[language].map(
          (_) => `  ${padEnd(paint.command(_.name), _COLUMN - 2)}${_.summary}`
        )
      ),
      ..._section(paint, text.common, _options(paint, text.commonOptions)),
      ..._section(
        paint,
        text.examples,
        _examples(paint, text.overviewExamples)
      ),
      ..._section(paint, text.environment, [
        `  ${padEnd(paint.flag('PORT, CMS_DB'), _COLUMN - 2)}${text.portDb}`,
        `  ${padEnd(paint.flag('CMS_TRUST_PROXY'), _COLUMN - 2)}${text.trustProxy}`,
        `  ${padEnd(paint.flag('NO_COLOR'), _COLUMN - 2)}${text.noColor}`,
      ]),
      '',
      `${text.more} ${paintLine(paint)(text.helpLine)}`,
      '',
    ].join('\n'))(_TEXT[language]);

/** `cms help <команда>`: использование, описание, параметры, примеры. */
export var commandHelp = (
  paint: Paint,
  help: CommandHelp,
  language: Language
): string =>
  ((text) =>
    [
      `${paint.command(help.name)} ${paint.dim('—')} ${help.summary}`,
      ..._section(
        paint,
        text.usage,
        help.usage.map((_) => `  ${paintLine(paint)(_)}`)
      ),
      ..._section(paint, text.details, [
        ...help.details.flatMap((_, index) => [
          ...(index > 0 ? [''] : []),
          ...wrap(_, 80, '  ').map(paintLine(paint)),
        ]),
      ]),
      ...(help.options.length > 0
        ? _section(paint, text.options, _options(paint, help.options))
        : []),
      ..._section(paint, text.examples, _examples(paint, help.examples)),
      '',
    ].join('\n'))(_TEXT[language]);

// Расстояние Левенштейна: «возможно, вы имели в виду …» для опечатки в команде.
const _distance = (a: string, b: string): number =>
  [...b]
    .reduce<number[]>(
      (previous, char, j) =>
        [...a].reduce<number[]>(
          (row, other, i) => [
            ...row,
            Math.min(
              previous[i + 1]! + 1,
              row[i]! + 1,
              previous[i]! + (other === char ? 0 : 1)
            ),
          ],
          [j + 1]
        ),
      Array.from({ length: a.length + 1 }, (_, i) => i)
    )
    .at(-1)!;

/** Ближайшая команда к опечатке: начало слова или не больше двух правок; null — ничего похожего. */
export var suggest = (input: string): string | null =>
  commandNames()
    .map((name) => ({
      name,
      score:
        name.startsWith(input) && input.length >= 2
          ? 0
          : _distance(input, name),
    }))
    .filter((_) => _.score <= 2)
    .toSorted((a, b) => a.score - b.score)[0]?.name ?? null;

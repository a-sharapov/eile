import { PRODUCT } from '../product.ts';
import { SCAFFOLDS } from '../scaffolds/index.ts';
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

export var COMMANDS: readonly CommandHelp[] = [
  {
    name: 'serve',
    summary: 'Запустить сайт и менеджер (команда по умолчанию)',
    usage: ['cms [serve] [--port <порт>] [--db <файл>] [--trust-proxy]'],
    details: [
      'Сайт и менеджер (/manager) отдаются одним процессом. На пустой базе создаются страница приветствия и пустой шаблон Minimal; готовый сайт — cms new.',
      'Пока пользователей нет, при запуске печатается ссылка первичной настройки — по ней создаётся администратор.',
      'Остановить — Ctrl+C или SIGTERM: база закрывается аккуратно.',
      'За nginx или Caddy с HTTPS — --trust-proxy: протокол и адрес посетителя берутся из X-Forwarded-*, cookie входа получает Secure. Без прокси этот флаг не включайте: заголовки подделает любой.',
    ],
    options: [
      ['--port <порт>', 'Порт: 8080 или $PORT'],
      _DB,
      ['--trust-proxy', 'Доверять X-Forwarded-*: только за своим прокси'],
    ],
    examples: [
      ['Сайт на :8080 из site.db в текущем каталоге', 'cms'],
      ['Свой порт и база', 'cms serve --port 3000 --db site.db'],
      [
        'Через окружение — для systemd и Docker',
        'PORT=80 CMS_DB=/var/lib/cms/site.db cms',
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

// Колонка описаний: команды, параметры и окружение начинаются с одного отступа.
const _COLUMN = 20;

export var commandNames = (): string[] => COMMANDS.map((_) => _.name);

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

const _options = (paint: Paint, options: CommandHelp['options']) =>
  options.flatMap(({ 0: flag, 1: about }) =>
    ((head) =>
      wrap(about, 80, ' '.repeat(_COLUMN)).map((line, index) =>
        index === 0 ? `${padEnd(head, _COLUMN)}${line.trimStart()}` : line
      ))(`  ${paintLine(paint)(flag)}`)
  );

/** Шапка справки: знак (ветка схемы сайта со статусами) и название. */
export var heading = (paint: Paint): string =>
  `${paint.ok('●')}${paint.dim('─┬─')}${paint.warn('◐')} ${paint.accent(PRODUCT)} ${paint.dim(VERSION)} ${paint.dim('·')} сайт и менеджер в одном файле`;

/** `cms help`: команды, общие параметры, примеры и окружение. */
export var overview = (paint: Paint): string =>
  [
    heading(paint),
    ..._section(paint, 'Использование', [
      `  ${paintLine(paint)('cms [команда] [параметры]')}`,
    ]),
    ..._section(
      paint,
      'Команды',
      COMMANDS.map(
        (_) => `  ${padEnd(paint.command(_.name), _COLUMN - 2)}${_.summary}`
      )
    ),
    ..._section(
      paint,
      'Общие параметры',
      _options(paint, [
        _DB,
        ['--port <порт>', 'Порт сервера: 8080 или $PORT'],
        ['-h, --help', 'Справка по команде'],
        ['-v, --version', 'Версия'],
      ])
    ),
    ..._section(
      paint,
      'Примеры',
      _examples(paint, [
        ['Запустить сайт; менеджер — /manager', 'cms --db site.db'],
        ['Перенести сайт с Evo', 'cms import-evo evo.sql --db site.db'],
        ['Бэкап на работающем сайте', 'cms backup --db site.db'],
        ['Забыт пароль администратора', 'cms users password anna@example.com'],
      ])
    ),
    ..._section(paint, 'Окружение', [
      `  ${padEnd(paint.flag('PORT, CMS_DB'), _COLUMN - 2)}Значения --port и --db по умолчанию`,
      `  ${padEnd(paint.flag('CMS_TRUST_PROXY'), _COLUMN - 2)}1 — то же, что --trust-proxy`,
      `  ${padEnd(paint.flag('NO_COLOR'), _COLUMN - 2)}Без цвета; FORCE_COLOR=1 — с цветом и в трубе`,
    ]),
    '',
    `Подробнее о команде: ${paintLine(paint)('cms help <команда>')}`,
    '',
  ].join('\n');

/** `cms help <команда>`: использование, описание, параметры, примеры. */
export var commandHelp = (paint: Paint, help: CommandHelp): string =>
  [
    `${paint.command(help.name)} ${paint.dim('—')} ${help.summary}`,
    ..._section(
      paint,
      'Использование',
      help.usage.map((_) => `  ${paintLine(paint)(_)}`)
    ),
    ..._section(paint, 'Описание', [
      ...help.details.flatMap((_, index) => [
        ...(index > 0 ? [''] : []),
        ...wrap(_, 80, '  ').map(paintLine(paint)),
      ]),
    ]),
    ...(help.options.length > 0
      ? _section(paint, 'Параметры', _options(paint, help.options))
      : []),
    ..._section(paint, 'Примеры', _examples(paint, help.examples)),
    '',
  ].join('\n');

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

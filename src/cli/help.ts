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
const _MEDIA_CACHE = [
  '--media-cache <папка>',
  'Кэш медиатеки: site.media-cache рядом с базой или $CMS_MEDIA_CACHE',
] as const;
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
      'За nginx или Caddy с HTTPS — --trust-proxy: протокол и адрес посетителя берутся из X-Forwarded-*, cookie входа получает Secure. Без прокси этот флаг не включайте: заголовки подделает любой. Прокси на этой же машине — слушайте только её: --host 127.0.0.1.',
      "HTTPS без прокси — --domain: сервер сам получает сертификат Let's Encrypt и продлевает его за 30 дней до конца. HTTP (порт 80) отвечает на проверку домена и ведёт на HTTPS (443); пока сертификата нет, сайт открывается по HTTP. DNS доменов должен указывать на этот сервер.",
      'На своём сервере проще всего — службой systemd: sudo cms service install --domain example.com берёт на себя порты, пользователя и перезапуск после сбоя (cms help service). Без неё порты 80 и 443 даёт root или sudo setcap cap_net_bind_service=+ep $(which cms).',
      'Медиатека живёт в базе. Чтобы отдавать картинки и видео без копии в памяти, сервер при первом запросе файла кладёт его в кэш на диске — папку site.media-cache рядом с базой (--media-cache — другая папка). Кэш можно удалить: он наберётся заново. Папка не пишется — файлы идут прямо из базы.',
    ],
    options: [
      ['--port <порт>', 'Порт: 8080 или $PORT'],
      _DB,
      _MEDIA_CACHE,
      ['--trust-proxy', 'Доверять X-Forwarded-*: только за своим прокси'],
      ['--host <адрес>', 'Адрес, на котором слушать: все или $CMS_HOST'],
      ['--domain <домены>', 'HTTPS без прокси: example.com,www.example.com'],
      ['--email <почта>', "Почта для писем Let's Encrypt о сертификате"],
      ['--https-port <порт>', 'Порт HTTPS: 443 или $CMS_HTTPS_PORT'],
      ['--acme-staging', "Тестовый центр Let's Encrypt — для пробы"],
    ],
    examples: [
      ['Сайт на :8080 из site.db в текущем каталоге', 'cms'],
      ['Свой порт и база', 'cms serve --port 3000 --db site.db'],
      [
        'Через окружение — для Docker',
        'PORT=80 CMS_DB=/var/lib/cms/site.db cms',
      ],
      [
        'HTTPS без nginx на своём сервере',
        'cms --domain example.com --email you@example.com',
      ],
      [
        'То же службой systemd',
        'sudo cms service install --domain example.com',
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
      'Размер файла, версия схемы, сколько страниц опубликовано и лежит в корзине, сколько шаблонов, компонентов, скриптов, плагинов, полей, файлов медиатеки и пользователей.',
      'База открывается так же, как при запуске сервера: если бинарник новее, сначала применяются миграции.',
    ],
    options: [['--json', 'Сводка в JSON: для скриптов и агентов'], _DB],
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
      ['--json', 'Список в JSON'],
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
    name: 'elements',
    summary: 'Элементы сайта файлами: для редактора кода и ИИ-агентов',
    usage: [
      'cms elements pull [<папка>] [--db <файл>]',
      'cms elements check [<папка>] [--db <файл>] [--json]',
      'cms elements push [<папка>] [--prune] [--watch] [--json]',
    ],
    details: [
      'pull выкладывает шаблоны, компоненты, скрипты, плагины, формы и поля файлами: templates/, components/, scripts/, plugins/, forms/, fields.json. Рядом — AGENTS.md: правила CMS и что есть на сайте, для Claude Code, Codex, Cursor. Отличающиеся файлы переписываются — держите папку в git.',
      'check компилирует всё (скрипт scripts/имя.js — разбирает как ES-модуль) и печатает ошибки как файл:строка:столбец. Ничего не сохраняет.',
      'push сохраняет изменённые файлы в сайт — все или ни одного. Сервер на этой базе подхватывает правку сам, перезапуск не нужен.',
      '--prune удаляет из сайта то, чего нет в папке (поля — никогда), --watch отправляет каждый сохранённый файл. Папка по умолчанию — текущая.',
    ],
    options: [
      ['--prune', 'Удалить из сайта то, чего нет в папке'],
      ['--watch', 'Отправлять каждый сохранённый файл'],
      ['--json', 'Итог в JSON: для скриптов и агентов'],
      _DB,
    ],
    examples: [
      ['Элементы — в папку site', 'cms elements pull site --db site.db'],
      ['Проверить правки', 'cms elements check site --db site.db'],
      ['Отправить в сайт', 'cms elements push site --db site.db'],
    ],
  },
  {
    name: 'diagnose',
    summary: 'Диагностика сайта: ссылки, страницы, медиа, переадресации',
    usage: [
      'cms diagnose [--db <файл>] [--json]',
      'cms diagnose redirects [<список>|<sitemap>|-] [--db <файл>] [--json]',
      'cms diagnose redirects <список> --base <адрес сайта>',
    ],
    details: [
      'То же, что вкладка «Диагностика» в менеджере: битые ссылки, страницы без описания, пропавшие файлы медиатеки, настройки и сервер.',
      'Если есть ошибки, код выхода 1 — проверку можно поставить в cron или CI. --json — отчёт целиком, для скриптов и агентов.',
      'redirects проверяет старые адреса после переезда: каждый должен прийти одним переходом 301 или 308 на живую страницу (200) этого же сайта. Цепочки, петли, 302 и 307, 404, ответы с ошибкой и уход на другой хост — ошибки, код выхода 1.',
      'Список — файл текстом: по адресу в строке, путь или URL (хост старого сайта не в счёт, проверяются путь и query), # — комментарий. Второе слово строки — куда адрес должен вести: /uber-uns/ /ueber-uns. Подойдёт и sitemap.xml или индекс sitemap — файлом или по адресу, можно .gz. Без файла или с - список читается из stdin.',
      'Без --base проверка идёт прямо в процессе, без сети: на снимке базы --db во временной папке, поэтому счётчики переходов и статистика сайта не меняются. С --base — по сети, на живом сайте, например на новом сервере до переключения домена.',
      'В таблице видно, что стало со слэшем на конце и с query: /kontakt/ → 301 /kontakt. Адрес с query, на который сайт отвечает 200 сам (/?p=12 — главная), — тоже ошибка: страницу выбирает путь, а query она не видит.',
    ],
    options: [
      ['--json', 'Отчёт в JSON'],
      _DB,
      ['--base <адрес>', 'redirects: живой сайт по сети вместо базы'],
    ],
    examples: [
      ['Проверить сайт', 'cms diagnose --db site.db'],
      [
        'Каждую ночь, с письмом от cron',
        '0 3 * * * cms diagnose --db /srv/site.db',
      ],
      [
        'Старые адреса — на базу нового сайта',
        'cms diagnose redirects old-urls.txt --db site.db',
      ],
      [
        'Sitemap старого сайта — на новый сервер',
        'cms diagnose redirects old/sitemap.xml --base https://new.a.ru',
      ],
    ],
  },
  {
    name: 'mcp',
    summary: 'MCP-сервер для ИИ-агентов: Claude, Cursor, Codex',
    usage: ['cms mcp [--db <файл>] [--user <почта>]'],
    details: [
      'Говорит по протоколу MCP через stdin и stdout. Агент читает и правит страницы, элементы, формы, заявки и медиатеку инструментами — теми же маршрутами, что и менеджер: права роли, чистка HTML, история правок и журнал действий.',
      'Агент работает от имени пользователя: --user, иначе первого администратора. Нужен хотя бы один пользователь — cms users add.',
      'Claude Code: claude mcp add site -- cms mcp --db /srv/site.db. Claude Desktop, Cursor и другие: команда cms, аргументы mcp --db <файл>.',
      'Сервер сайта на той же базе видит правки агента сразу, перезапуск не нужен.',
    ],
    options: [['--user <почта>', 'От чьего имени и с какими правами'], _DB],
    examples: [
      [
        'Подключить к Claude Code',
        'claude mcp add site -- cms mcp --db site.db',
      ],
      [
        'Агент с правами редактора',
        'cms mcp --db site.db --user ed@example.com',
      ],
    ],
  },
  {
    name: 'backup',
    summary: 'Копия сайта в файл или в хранилище S3; файл настроек сервера',
    usage: [
      'cms backup [<файл>] [--db <файл>]',
      'cms backup --remote [--db <файл>]',
      'cms backup --server [<файл>] [--db <файл>]',
    ],
    details: [
      'База, шаблоны, компоненты и медиатека — в одном файле SQLite. Можно на работающем сайте: копия согласованная (VACUUM INTO). Кэш медиатеки (site.media-cache) в копию не входит: он берётся из базы.',
      'Имя с .json — те же записи текстом: можно открыть, сравнить две копии, перенести. Сеансов входа в копии нет.',
      'Без имени файла — cms-ГГГГ-ММ-ДД.db в текущем каталоге. Существующий файл не перезаписывается.',
      '--remote — копия сейчас, как кнопка «Сделать копию сейчас»: в каталог автокопий и в хранилище S3, настроенное в менеджере («Настройки» → «Копии и обновления»). В хранилище копия уходит зашифрованной ключом копий этого сервера.',
      '--server — файл настроек сервера, которых нет в копии сайта: почта, Telegram, почтовый шлюз с токенами, секрет печатей форм, расписание копий, хранилище с ключом копий, подключение ИИ, ключи API. Файл шифруется паролем (не короче 12 знаков): его спросят дважды, для скриптов — CMS_SETTINGS_PASSPHRASE. Без имени — cms-server-ГГГГ-ММ-ДД.enc. Сеансов, сертификатов HTTPS, очереди уведомлений и журнала сбоев в нём нет.',
      'Восстановление — cms restore или раздел «Копии» в менеджере.',
    ],
    options: [
      _DB,
      ['--remote', 'Копия сейчас и отправка в хранилище S3'],
      ['--server', 'Файл настроек сервера под паролем'],
    ],
    examples: [
      ['Копия рядом, с датой в имени', 'cms backup --db site.db'],
      [
        'В каталог бэкапов',
        'cms backup /backups/site-$(date +%F).db --db site.db',
      ],
      ['Записи текстом', 'cms backup site.json --db site.db'],
      [
        'Копию — в хранилище, по cron',
        '0 4 * * * cms backup --remote --db /srv/site.db',
      ],
      [
        'Настройки — на новый сервер',
        'cms backup --server server.enc --db site.db',
      ],
    ],
  },
  {
    name: 'restore',
    summary: 'Сайт из копии или хранилища S3; настройки сервера из файла',
    usage: [
      'cms restore <файл> [--db <файл>]',
      'cms restore --remote [<имя>|latest] [--db <файл>]',
      'cms restore --server <файл> [--db <файл>]',
    ],
    details: [
      'Сайт в базе становится таким, каким был в копии: страницы, элементы, медиатека, настройки, пользователи. Копия из более старой версии сначала доводится до текущей схемы.',
      'Если база уже есть, её прежнее состояние сохраняется рядом: site.before-restore-ГГГГММДД-ЧЧММСС.db. Новой базы не было — она создаётся: так сайт переезжает на другой сервер.',
      'Остановите сервер перед восстановлением из командной строки или восстанавливайте в менеджере: раздел «Копии».',
      'Кэш медиатеки стирается: файлы в копии другие, он наберётся заново из восстановленной базы.',
      '--remote — из хранилища S3: без имени — список копий, latest — последняя. Хранилище — из базы, если оно там настроено, поверх — --endpoint, --region, --bucket, --prefix, --access-key или S3_ENDPOINT, S3_REGION, S3_BUCKET, CMS_S3_PREFIX, S3_ACCESS_KEY_ID; секрет — S3_SECRET_ACCESS_KEY или ввод на терминале. Копию своим ключом база открывает сама; на новой машине нужен ключ восстановления, который менеджер показал при включении хранилища: CMS_RECOVERY_KEY или ввод на терминале.',
      '--server — применить файл настроек из cms backup --server к базе: что есть в файле, заменяет своё, чего нет — остаётся. Итоги копий, сеансы и сертификаты остаются свои; каталог копий с абсолютным путём другой машины сбрасывается на backups рядом с базой; ключ API достаётся пользователю с той же почтой. Пароль — CMS_SETTINGS_PASSPHRASE или ввод на терминале. Работающий сервер на этой базе подхватит настройки на следующем запросе; на базе службы — под root: sudo cms restore --server файл --db /var/lib/cms/site.db.',
    ],
    options: [
      _DB,
      _MEDIA_CACHE,
      ['--remote', 'Из хранилища S3: список, имя копии или latest'],
      ['--endpoint <адрес>', 'Хранилище: https://fra1.digitaloceanspaces.com'],
      ['--region <регион>', 'Регион подписи: fra1, eu-central-003'],
      ['--bucket <бакет>', 'Бакет с копиями'],
      ['--prefix <папка>', 'Папка в бакете'],
      ['--access-key <ключ>', 'Ключ доступа; секрет — S3_SECRET_ACCESS_KEY'],
      ['--server', 'Применить файл настроек сервера'],
    ],
    examples: [
      [
        'Вернуть вчерашнюю копию',
        'cms restore /backups/site-2026-10-29.db --db site.db',
      ],
      ['Перенести сайт на новый сервер', 'cms restore site.json --db site.db'],
      ['Копии в хранилище', 'cms restore --remote --db site.db'],
      [
        'Последнюю копию — на новую машину',
        'cms restore --remote latest --bucket copies --db site.db',
      ],
      [
        'Настройки — в базу службы',
        'sudo cms restore --server server.enc --db /var/lib/cms/site.db',
      ],
    ],
  },
  {
    name: 'compact',
    summary: 'Сжать базу: отдать диску свободные страницы',
    usage: ['cms compact [--db <файл>]'],
    details: [
      'Удалённые записи и файлы медиатеки оставляют в базе свободные страницы: SQLite не отдаёт их диску сам, файл не уменьшается. Сколько свободно, показывает cms info.',
      'VACUUM пересобирает базу без них. Можно на работающем сайте: читатели не ждут, запись сервера ждёт до конца сжатия (на базе в 63 МБ — около 0,5 с). На диске нужно ещё два размера данных базы: временная копия и журнал.',
      'Сервер и сам сжимает базу ночью (в 04:15), если свободно не меньше 8 МиБ и пятой части файла.',
    ],
    options: [_DB],
    examples: [
      ['Сколько свободно', 'cms info --db site.db'],
      ['Сжать', 'cms compact --db site.db'],
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
    name: 'service',
    summary: 'Сайт на сервере службой systemd: установка одной командой',
    usage: [
      'cms service install --domain <домены> [--email <почта>] [--from <файл>]',
      'cms service install --trust-proxy [--port <порт>] [--from <файл>]',
      'cms service status | logs [-f] | restart | uninstall [--name <имя>]',
    ],
    details: [
      'install ставит сайт службой systemd: пишет юнит /etc/systemd/system/cms.service, включает и запускает его, ждёт, пока сайт ответит, и печатает адреса сайта и менеджера, а на новой базе — ссылку для администратора. База — /var/lib/cms/site.db, кэш медиатеки — /var/cache/cms. Служба работает от своего временного пользователя (DynamicUser) в песочнице и после сбоя поднимается через секунду.',
      "Два режима. --domain: служба сама держит HTTPS на портах 80 и 443 с сертификатом Let's Encrypt (cms help serve). --trust-proxy: за nginx или Caddy на этой машине, на 127.0.0.1 и --port (8080).",
      '--from переносит готовый сайт: согласованная копия базы, как у cms backup, можно с работающего сервера. Своей базы службы --from не заменяет.',
      'Перед установкой команда проверяет: есть ли systemd, свободны ли порты (заняты nginx или Caddy — подскажет --trust-proxy), указывают ли домены на эту машину, хватает ли памяти (меньше 1 ГиБ без подкачки — команды для файла подкачки). Занятый порт останавливает установку, остальное — предупреждения.',
      'Повтор с тем же юнитом ничего не меняет. Другой юнит с этим именем заменяет только --force. --print печатает юнит и ничего не трогает: так его можно поставить и руками.',
      'Нужен root; без него команда напечатает строку для sudo.',
      'status — состояние, с какого времени, версия, адрес и память. logs — журнал службы, -f — следить за ним. restart — перезапуск с проверкой, что сайт ответил. uninstall — остановить и удалить юнит; база и копии остаются, команда скажет где.',
      'Что служба поднялась, install, restart и cms update узнают по /_cms/health на её HTTP-порту: 200 — сервер работает и читает базу, 503 — базу не прочесть. Ждут до 30 секунд. Версии до 0.1.0-alpha.9 этого адреса не знают — им, как раньше, хватает любого ответа.',
      'Тот же адрес — для мониторов вроде проверок DigitalOcean: https://example.com/_cms/health, без входа и кэша. Версию он называет только запросу с этой же машины.',
      'cms update перезапускает службу на новой версии и проверяет её; не поднялась — возвращает cms.old.',
    ],
    options: [
      ['--domain <домены>', 'HTTPS без прокси: example.com,www.example.com'],
      ['--email <почта>', "Почта для писем Let's Encrypt"],
      ['--https-port <порт>', 'Порт HTTPS с доменом: 443'],
      ['--acme-staging', "Тестовый центр Let's Encrypt — для пробы"],
      ['--trust-proxy', 'За nginx или Caddy на этой машине'],
      ['--port <порт>', 'Порт HTTP: 8080 за прокси, 80 с доменом'],
      ['--host <адрес>', 'За прокси — адрес, на котором слушать: 127.0.0.1'],
      ['--from <файл>', 'Перенести в службу сайт из этой базы'],
      ['--name <имя>', 'Имя службы, её базы и кэша: cms'],
      ['--print', 'Только показать юнит'],
      ['--force', 'Заменить другой юнит с этим именем'],
      ['-f, --follow', 'logs: следить за журналом'],
    ],
    examples: [
      ['HTTPS без nginx', 'sudo cms service install --domain example.com'],
      [
        'Перенести сайт, сделанный дома',
        'sudo cms service install --domain a.ru --from site.db',
      ],
      [
        'За nginx: proxy_pass http://127.0.0.1:8080',
        'sudo cms service install --trust-proxy',
      ],
      [
        'Посмотреть юнит, ничего не меняя',
        'cms service install --trust-proxy --print',
      ],
      ['Работает ли сайт', 'cms service status'],
      ['Журнал в реальном времени', 'cms service logs -f'],
    ],
  },
  {
    name: 'update',
    summary: 'Обновить cms до новой версии одной командой',
    usage: ['cms update [--check] [--no-restart]'],
    details: [
      'Берёт новую версию со страницы релизов: сборку под эту систему, сверяет её с SHA256SUMS, пробует запустить и атомарно заменяет бинарник. Прежний остаётся рядом: cms.old.',
      'Службу из cms service install команда под root перезапускает сама: ждёт, пока сайт ответит, и проверяет, что работает новая версия. Не вышло — возвращает cms.old, перезапускает службу снова и говорит об этом; --no-restart — службу не трогать. Сервер, запущенный иначе, работает на старой версии до перезапуска.',
      'Перед перезапуском команда снимает согласованную копию базы каждой службы рядом с ней: site.db.before-<прежняя версия>, остаётся одна, последняя. Копия не снялась (например, кончилось место) — ни одна служба не перезапускается, на место встаёт cms.old.',
      'Новая версия может перевести базу на свою схему. Если она при этом не поднялась, откат возвращает базу к копии, а базу, на которой она упала, со всем, что сайт записал после копии, кладёт рядом: site.db.failed-<версия>. Базу, которую новая версия не меняла, откат не трогает. Прежняя версия на базе, которую уже вела более новая, не запускается и говорит об этом.',
      'С альфы и беты обновление идёт и на следующие пре-релизы, со стабильной версии — только на стабильные.',
      'В менеджере о новой версии говорит меню профиля; проверку выключают в настройках или CMS_NO_UPDATE_CHECK=1.',
      'CMS_RELEASES_URL — свой адрес API релизов вместо https://api.github.com: зеркало, сеть без выхода наружу или проверка обновления и отката без пересборки. По нему cms update и проверка в менеджере спрашивают <адрес>/repos/<владелец>/<имя>/releases — ответ в формате GitHub. Адрес и файлы выпуска — только https; http — на этой машине (localhost, 127.0.0.1) или вместе с CMS_RELEASES_INSECURE=1 для своего зеркала в своей сети. Сумма SHA256SUMS сверяется так же. Файлы установщика берёт CMS_DOWNLOAD_URL.',
    ],
    options: [
      ['--check', 'Только проверить, есть ли новая версия'],
      ['--no-restart', 'Не перезапускать службу systemd и не снимать копию'],
    ],
    examples: [
      ['Есть ли новая версия', 'cms update --check'],
      ['Обновить cms и службу сайта', 'sudo cms update'],
      [
        'С зеркала релизов',
        'sudo CMS_RELEASES_URL=https://mirror.example/api cms update',
      ],
      [
        'Проба на своей ленте на этой машине',
        'CMS_RELEASES_URL=http://127.0.0.1:9000 cms update --check',
      ],
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
const _MEDIA_CACHE_EN = [
  '--media-cache <folder>',
  'Media cache: site.media-cache next to the database or $CMS_MEDIA_CACHE',
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
      'Behind nginx or Caddy with HTTPS, use --trust-proxy: the protocol and the visitor address come from X-Forwarded-*, and the sign-in cookie gets Secure. Do not turn it on without a proxy: anyone can forge those headers. With the proxy on the same machine, listen on it only: --host 127.0.0.1.',
      "HTTPS without a proxy: --domain. The server gets a Let's Encrypt certificate itself and renews it 30 days before it expires. HTTP (port 80) answers the domain check and redirects to HTTPS (443); until the certificate arrives, the site opens over HTTP. The DNS of the domains must point at this server.",
      'On your own server the easiest is a systemd service: sudo cms service install --domain example.com takes care of the ports, the user and restarts after a failure (cms help service). Without it, ports 80 and 443 need root or sudo setcap cap_net_bind_service=+ep $(which cms).',
      'The media library lives in the database. To serve images and video without a copy in memory, the server puts a file into a cache on disk the first time it is requested: the site.media-cache folder next to the database (--media-cache sets another one). The cache can be deleted: it fills up again. If the folder is not writable, files come straight from the database.',
    ],
    options: [
      ['--port <port>', 'Port: 8080 or $PORT'],
      _DB_EN,
      _MEDIA_CACHE_EN,
      ['--trust-proxy', 'Trust X-Forwarded-*: only behind your own proxy'],
      ['--host <address>', 'Address to listen on: all or $CMS_HOST'],
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
        'Through the environment, for Docker',
        'PORT=80 CMS_DB=/var/lib/cms/site.db cms',
      ],
      [
        'HTTPS without nginx on your own server',
        'cms --domain example.com --email you@example.com',
      ],
      [
        'The same as a systemd service',
        'sudo cms service install --domain example.com',
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
      'File size, schema version, how many pages are published and in the trash, and how many templates, components, scripts, plugins, fields, media files and users there are.',
      'The database opens the same way as when the server starts: if the binary is newer, migrations run first.',
    ],
    options: [
      ['--json', 'The summary as JSON: for scripts and agents'],
      _DB_EN,
    ],
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
      ['--json', 'The list as JSON'],
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
    name: 'elements',
    summary: 'Site elements as files: for code editors and AI agents',
    usage: [
      'cms elements pull [<folder>] [--db <file>]',
      'cms elements check [<folder>] [--db <file>] [--json]',
      'cms elements push [<folder>] [--prune] [--watch] [--json]',
    ],
    details: [
      'pull writes templates, components, scripts, plugins, forms and fields as files: templates/, components/, scripts/, plugins/, forms/, fields.json. Next to them goes AGENTS.md: the CMS rules and what the site has, for Claude Code, Codex and Cursor. Files that differ are overwritten, so keep the folder in git.',
      'check compiles everything (a script scripts/name.js is parsed as an ES module) and prints problems as file:line:column. Nothing is saved.',
      'push saves the changed files to the site, all of them or none. A server on this database picks the change up by itself, no restart needed.',
      '--prune deletes from the site what has no file (never fields), --watch sends every saved file. The folder is the current one by default.',
    ],
    options: [
      ['--prune', 'Delete from the site what has no file'],
      ['--watch', 'Send every saved file'],
      ['--json', 'The result as JSON: for scripts and agents'],
      _DB_EN,
    ],
    examples: [
      ['Elements into the folder site', 'cms elements pull site --db site.db'],
      ['Check the edits', 'cms elements check site --db site.db'],
      ['Send them to the site', 'cms elements push site --db site.db'],
    ],
  },
  {
    name: 'diagnose',
    summary: 'Site diagnostics: links, pages, media, redirects',
    usage: [
      'cms diagnose [--db <file>] [--json]',
      'cms diagnose redirects [<list>|<sitemap>|-] [--db <file>] [--json]',
      'cms diagnose redirects <list> --base <site address>',
    ],
    details: [
      'The same as the Diagnostics tab in the manager: broken links, pages without a description, missing media files, settings and the server.',
      'With errors, the exit code is 1, so the check can run from cron or CI. --json prints the whole report for scripts and agents.',
      'redirects checks old addresses after a move: each must reach a live page (200) on the same site in one 301 or 308 hop. Chains, loops, 302 and 307, 404, error answers and leaving for another host are problems, with exit code 1.',
      'The list is a text file: one address per line, a path or a URL (the old host does not count, the path and query are checked), # starts a comment. A second word on the line says where the address must lead: /about-us/ /about. A sitemap.xml or a sitemap index also works, as a file or an address, .gz too; no file or - reads stdin.',
      'Without --base the check runs in the process, with no network: on a snapshot of the --db database in a temporary folder, so redirect hit counters and site statistics stay as they are. With --base it goes over the network to a live site, for example the new server before the domain moves.',
      'The table shows what happened to a trailing slash and a query: /contact/ → 301 /contact. An address with a query that the site answers with 200 as is (/?p=12 is the home page) is a problem too: the path picks the page, and the page does not see the query.',
    ],
    options: [
      ['--json', 'The report as JSON'],
      _DB_EN,
      ['--base <address>', 'redirects: a live site over the network'],
    ],
    examples: [
      ['Check the site', 'cms diagnose --db site.db'],
      [
        'Every night, cron mails the output',
        '0 3 * * * cms diagnose --db /srv/site.db',
      ],
      [
        'Old addresses against the new site database',
        'cms diagnose redirects old-urls.txt --db site.db',
      ],
      [
        'The old sitemap against the new server',
        'cms diagnose redirects old/sitemap.xml --base https://new.a.com',
      ],
    ],
  },
  {
    name: 'mcp',
    summary: 'An MCP server for AI agents: Claude, Cursor, Codex',
    usage: ['cms mcp [--db <file>] [--user <email>]'],
    details: [
      'Speaks MCP over stdin and stdout. The agent reads and changes pages, elements, forms, submissions and the media library with tools, the same routes the manager uses: the role rights, HTML cleaning, page history and the activity log.',
      'The agent works as a user: --user, otherwise the first administrator. At least one user is needed: cms users add.',
      'Claude Code: claude mcp add site -- cms mcp --db /srv/site.db. Claude Desktop, Cursor and others: the command cms with the arguments mcp --db <file>.',
      'A site server on the same database sees the changes right away, no restart needed.',
    ],
    options: [
      ['--user <email>', 'Whose name and rights the agent uses'],
      _DB_EN,
    ],
    examples: [
      ['Connect to Claude Code', 'claude mcp add site -- cms mcp --db site.db'],
      [
        'An agent with editor rights',
        'cms mcp --db site.db --user ed@example.com',
      ],
    ],
  },
  {
    name: 'backup',
    summary: 'A site copy to a file or S3 storage; a server settings file',
    usage: [
      'cms backup [<file>] [--db <file>]',
      'cms backup --remote [--db <file>]',
      'cms backup --server [<file>] [--db <file>]',
    ],
    details: [
      'The database, templates, components and media in one SQLite file. Safe on a running site: the copy is consistent (VACUUM INTO). The media cache (site.media-cache) is not part of the copy: it comes from the database.',
      'A name ending in .json writes the same records as text: you can open it, compare two copies, move it. Sign-in sessions are not copied.',
      'Without a file name: cms-YYYY-MM-DD.db in the current directory. An existing file is never overwritten.',
      '--remote makes a copy now, like the “Back up now” button: into the backup folder and to the S3 storage set up in the manager (Settings → Backups and updates). The copy leaves encrypted with this server’s backup key.',
      '--server writes a file with the server settings a site copy does not have: email, Telegram, the mail gateway with its tokens, the form stamp secret, the backup schedule, the storage with the backup key, the AI connection, API tokens. The file is encrypted with a passphrase (at least 12 characters), asked twice; for scripts, CMS_SETTINGS_PASSPHRASE. Without a name: cms-server-YYYY-MM-DD.enc. Sessions, HTTPS certificates, the notification queue and the error log are not in it.',
      'To restore, use cms restore or Backups in the manager.',
    ],
    options: [
      _DB_EN,
      ['--remote', 'A copy now, sent to S3 storage'],
      ['--server', 'A passphrase-protected server settings file'],
    ],
    examples: [
      ['A dated copy next to the database', 'cms backup --db site.db'],
      [
        'Into a backups directory',
        'cms backup /backups/site-$(date +%F).db --db site.db',
      ],
      ['Records as text', 'cms backup site.json --db site.db'],
      [
        'A copy to storage, from cron',
        '0 4 * * * cms backup --remote --db /srv/site.db',
      ],
      [
        'Settings for a new server',
        'cms backup --server server.enc --db site.db',
      ],
    ],
  },
  {
    name: 'restore',
    summary: 'Restore the site from a copy or S3 storage; server settings',
    usage: [
      'cms restore <file> [--db <file>]',
      'cms restore --remote [<name>|latest] [--db <file>]',
      'cms restore --server <file> [--db <file>]',
    ],
    details: [
      'The site in the database becomes what it was in the copy: pages, elements, media, settings, users. A copy from an older version is brought up to the current schema first.',
      'If the database exists, its previous state is saved next to it: site.before-restore-YYYYMMDD-HHMMSS.db. If there was no database, it is created: that is how a site moves to another server.',
      'Stop the server before restoring from the command line, or restore in the manager under Backups.',
      'The media cache is cleared: the copy has other files, and the cache fills up again from the restored database.',
      '--remote restores from S3 storage: without a name it lists the copies, latest takes the newest. The storage comes from the database if it is set up there, overridden by --endpoint, --region, --bucket, --prefix, --access-key or S3_ENDPOINT, S3_REGION, S3_BUCKET, CMS_S3_PREFIX, S3_ACCESS_KEY_ID; the secret is S3_SECRET_ACCESS_KEY or typed in a terminal. A copy sealed with this database’s own key opens by itself; a new machine needs the recovery key the manager showed when the storage was turned on: CMS_RECOVERY_KEY or typed in a terminal.',
      '--server applies a settings file from cms backup --server to the database: what is in the file replaces the local value, what is not stays. Backup results, sessions and certificates stay local; a backup folder with an absolute path of the other machine goes back to backups next to the database; an API token goes to the user with the same email. The passphrase is CMS_SETTINGS_PASSPHRASE or typed in a terminal. A server running on this database picks the settings up on its next request; for a service database, run it as root: sudo cms restore --server file --db /var/lib/cms/site.db.',
    ],
    options: [
      _DB_EN,
      _MEDIA_CACHE_EN,
      ['--remote', 'From S3 storage: list, a copy name or latest'],
      ['--endpoint <url>', 'Storage: https://fra1.digitaloceanspaces.com'],
      ['--region <region>', 'Signing region: fra1, eu-central-003'],
      ['--bucket <bucket>', 'The bucket with the copies'],
      ['--prefix <folder>', 'The folder in the bucket'],
      ['--access-key <key>', 'Access key; the secret is S3_SECRET_ACCESS_KEY'],
      ['--server', 'Apply a server settings file'],
    ],
    examples: [
      [
        'Bring back yesterday’s copy',
        'cms restore /backups/site-2026-10-29.db --db site.db',
      ],
      ['Move the site to a new server', 'cms restore site.json --db site.db'],
      ['Copies in storage', 'cms restore --remote --db site.db'],
      [
        'The newest copy onto a new machine',
        'cms restore --remote latest --bucket copies --db site.db',
      ],
      [
        'Settings into a service database',
        'sudo cms restore --server server.enc --db /var/lib/cms/site.db',
      ],
    ],
  },
  {
    name: 'compact',
    summary: 'Compact the database: give its free pages back to the disk',
    usage: ['cms compact [--db <file>]'],
    details: [
      'Deleted records and media files leave free pages in the database: SQLite does not give them back to the disk by itself, and the file does not shrink. cms info shows how much is free.',
      'VACUUM rebuilds the database without them. Safe on a running site: readers do not wait, the server’s writes wait until it is done (about 0.5 s for a 63 MB database). The disk needs twice the size of the data on top: a temporary copy and the journal.',
      'The server also compacts the database at night (at 04:15) when at least 8 MiB and a fifth of the file are free.',
    ],
    options: [_DB_EN],
    examples: [
      ['How much is free', 'cms info --db site.db'],
      ['Compact', 'cms compact --db site.db'],
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
    name: 'service',
    summary: 'The site on a server as a systemd service, in one command',
    usage: [
      'cms service install --domain <domains> [--email <email>] [--from <file>]',
      'cms service install --trust-proxy [--port <port>] [--from <file>]',
      'cms service status | logs [-f] | restart | uninstall [--name <name>]',
    ],
    details: [
      'install sets the site up as a systemd service: it writes the unit /etc/systemd/system/cms.service, enables and starts it, waits until the site answers and prints the site and manager addresses, and on a new database the link for the administrator. The database is /var/lib/cms/site.db, the media cache /var/cache/cms. The service runs as a temporary user of its own (DynamicUser) in a sandbox and is back a second after a failure.',
      "Two modes. --domain: the service holds HTTPS itself on ports 80 and 443 with a Let's Encrypt certificate (cms help serve). --trust-proxy: behind nginx or Caddy on this machine, on 127.0.0.1 and --port (8080).",
      '--from moves a ready site in: a consistent copy of the database, as cms backup makes, fine on a running server. --from never replaces a database the service already has.',
      'Before installing, the command checks for systemd, free ports (taken by nginx or Caddy, it suggests --trust-proxy), domains pointing at this machine and memory (under 1 GiB without swap, it prints the commands for a swap file). A taken port stops the install, the rest are warnings.',
      'Running it again with the same unit changes nothing. Another unit with this name is replaced only with --force. --print prints the unit and touches nothing, so it can also be installed by hand.',
      'Root is needed; without it the command prints the line to run with sudo.',
      'status shows the state, since when, the version, the address and memory. logs shows the service log, -f follows it. restart restarts and checks that the site answered. uninstall stops the service and removes the unit; the database and backups stay, and the command says where.',
      'install, restart and cms update learn that the service is up from /_cms/health on its HTTP port: 200 means the server runs and reads its database, 503 means it cannot. They wait up to 30 seconds. Versions before 0.1.0-alpha.9 do not know this address, and any answer is enough for them, as before.',
      'Uptime monitors such as DigitalOcean checks can use the same address: https://example.com/_cms/health, no sign-in, no cache. It names the version only to a request from this machine.',
      'cms update restarts the service on the new version and checks it; if it does not come up, cms.old goes back.',
    ],
    options: [
      [
        '--domain <domains>',
        'HTTPS without a proxy: example.com,www.example.com',
      ],
      ['--email <email>', "Email for Let's Encrypt notices"],
      ['--https-port <port>', 'HTTPS port with a domain: 443'],
      ['--acme-staging', "Let's Encrypt staging CA, for a trial run"],
      ['--trust-proxy', 'Behind nginx or Caddy on this machine'],
      ['--port <port>', 'HTTP port: 8080 behind a proxy, 80 with a domain'],
      [
        '--host <address>',
        'Behind a proxy, the address to listen on: 127.0.0.1',
      ],
      ['--from <file>', 'Move the site from this database into the service'],
      ['--name <name>', 'Name of the service, its database and cache: cms'],
      ['--print', 'Only show the unit'],
      ['--force', 'Replace another unit with this name'],
      ['-f, --follow', 'logs: follow the log'],
    ],
    examples: [
      ['HTTPS without nginx', 'sudo cms service install --domain example.com'],
      [
        'Move a site made at home',
        'sudo cms service install --domain a.com --from site.db',
      ],
      [
        'Behind nginx: proxy_pass http://127.0.0.1:8080',
        'sudo cms service install --trust-proxy',
      ],
      [
        'See the unit without changing anything',
        'cms service install --trust-proxy --print',
      ],
      ['Is the site running', 'cms service status'],
      ['The log as it goes', 'cms service logs -f'],
    ],
  },
  {
    name: 'update',
    summary: 'Update cms to a new version with one command',
    usage: ['cms update [--check] [--no-restart]'],
    details: [
      'Takes the new version from the releases page: the build for this system, checked against SHA256SUMS and test-run, then swaps the binary atomically. The previous one stays next to it as cms.old.',
      'Run as root, the command restarts the service from cms service install itself: it waits until the site answers and checks that the new version runs. If not, cms.old goes back, the service restarts again and the command says so; --no-restart leaves the service alone. A server started some other way keeps the old version until a restart.',
      'Before the restart the command takes a consistent copy of each service database next to it: site.db.before-<previous version>, only the latest one stays. If the copy fails (for example, the disk is full), no service restarts and cms.old goes back in place.',
      'A new version may move the database to its own schema. If it then does not come up, the rollback puts the copy back and keeps the database it failed on, with everything the site wrote after the copy, next to it as site.db.failed-<version>. A database the new version did not change is left alone. An older version refuses to start on a database a newer one has run, and says so.',
      'From an alpha or beta, updates follow the next pre-releases too; from a stable version, only stable ones.',
      'In the manager the profile menu tells you about a new version; turn the check off in settings or with CMS_NO_UPDATE_CHECK=1.',
      'CMS_RELEASES_URL replaces https://api.github.com with your own releases API address: a mirror, a network without a way out, or a trial update and rollback without a rebuild. cms update and the manager check ask <address>/repos/<owner>/<name>/releases there, the answer in the GitHub format. The address and the release files are https only; http works on this machine (localhost, 127.0.0.1) or with CMS_RELEASES_INSECURE=1 for your own mirror on your own network. SHA256SUMS is checked the same way. The installer takes its files from CMS_DOWNLOAD_URL.',
    ],
    options: [
      ['--check', 'Only check whether there is a new version'],
      [
        '--no-restart',
        'Do not restart the systemd service or copy its database',
      ],
    ],
    examples: [
      ['Is there a new version', 'cms update --check'],
      ['Update cms and the site service', 'sudo cms update'],
      [
        'From a releases mirror',
        'sudo CMS_RELEASES_URL=https://mirror.example/api cms update',
      ],
      [
        'A trial with your own feed on this machine',
        'CMS_RELEASES_URL=http://127.0.0.1:9000 cms update --check',
      ],
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
    mediaCache: 'Папка кэша медиатеки, как --media-cache',
    host: 'Адрес, на котором слушать, как --host',
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
    mediaCache: 'Media cache folder, like --media-cache',
    host: 'Address to listen on, like --host',
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
        `  ${padEnd(paint.flag('CMS_MEDIA_CACHE'), _COLUMN - 2)}${text.mediaCache}`,
        `  ${padEnd(paint.flag('CMS_HOST'), _COLUMN - 2)}${text.host}`,
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

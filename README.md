<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
    <img src="docs/assets/logo-light.svg" alt="Eile" width="240">
  </picture>
</h1>

<p align="center"><strong>CMS в духе MODX Evo: просто, быстро, без лишнего.</strong></p>

<p align="center">
  <a href="https://github.com/a-sharapov/eile/releases"><img alt="Релиз" src="https://img.shields.io/github/v/release/a-sharapov/eile?include_prereleases&label=%D1%80%D0%B5%D0%BB%D0%B8%D0%B7"></a>
  <a href="https://github.com/a-sharapov/eile/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/a-sharapov/eile/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="Лицензия GPL-3.0-or-later" src="https://img.shields.io/badge/%D0%BB%D0%B8%D1%86%D0%B5%D0%BD%D0%B7%D0%B8%D1%8F-GPL--3.0--or--later-blue"></a>
  <img alt="Bun 1.4, Svelte 5, SQLite" src="https://img.shields.io/badge/Bun%201.4%20%C2%B7%20Svelte%205%20%C2%B7%20SQLite-%D0%BE%D0%B4%D0%B8%D0%BD%20%D1%84%D0%B0%D0%B9%D0%BB-2f5c96">
</p>

<p align="center">
  <a href="#установка">Установка</a> ·
  <a href="#быстрый-старт">Быстрый старт</a> ·
  <a href="#документация">Документация</a> ·
  <a href="docs/README.md">Всё о внутреннем устройстве</a> ·
  <a href="CONTRIBUTING.md">Участие</a>
</p>

Дерево страниц, шаблоны и компоненты на Svelte 5, которые правятся прямо в браузере, и готовый HTML из
кэша. Весь сайт — один исполняемый файл и одна база SQLite: без PHP, MySQL, Node и Docker.

_Eile_ — по-немецки «спешка»; «Eile mit Weile» — поспешай не торопясь: сайт отдаётся мгновенно, а менеджер
спокоен.

> **Альфа-версия.** Пробовать и делать сайты можно, но до 1.0 возможны несовместимые изменения. Перед
> обновлением делайте копию: `cms backup`.

```sh
curl -fsSL https://github.com/a-sharapov/eile/releases/latest/download/install.sh | bash
cms new blog --db site.db && cms --db site.db
```

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/manager-editor-dark.webp">
  <img src="docs/assets/manager-editor-light.webp" alt="Менеджер: дерево страниц слева, справа — редактор записи блога с заголовком, адресом, анонсом и текстом">
</picture>

## Возможности

- **Один файл.** Сервер, менеджер, компилятор Svelte, миграции и рантайм островов — в одном бинарнике.
  Страницы, элементы, медиа и пользователи — в одной базе: копия сайта — это копия файла.
- **Как в Evo.** Дерево страниц — главный инструмент, дополнительные поля назначаются на шаблоны, у каждой
  страницы id. Вместо чанков и сниппетов — компоненты Svelte: обычные импорты и выражения.
- **Быстро.** Двухфазный кэш готовых страниц сбрасывается точно по тому, что изменилось; ETag, br и gzip.
  JavaScript на странице — только в островах, которым он нужен.
- **Менеджер.** Текст страницы блоками, медиатека с уменьшенными копиями картинок, корзина, публикация по
  расписанию, переводы и свои настройки, ИИ-помощник у полей, тёмная тема.
- **Формы и заявки.** Форма — HTML5-разметка, тег `[#Form:имя]` в тексте, заявки в менеджере и уведомления
  в Telegram и на почту. Туда же приходят сообщения о сбоях сайта, а почтовый шлюз даёт другим сервисам
  слать письма почтой сайта по токену.
- **Находимость.** canonical, sitemap.xml, robots.txt, llms.txt, Markdown-версии страниц, постраничные
  списки с ЧПУ (`/blog/page-2`), старые адреса ведут на новые.
- **Статистика без cookie.** Посетители, просмотры, источники, UTM, страницы входа и цели с конверсией —
  считает сам сервер, без баннера согласия и чужих сервисов; маячок ссылок-целей — по желанию.
- **Поиск по сайту.** Из коробки: поле в шапке готовых сайтов, страница выдачи с отрывками, русские
  окончания учитываются («книги» находят «книгу»).
- **Спокойствие владельца.** История правок страниц с возвратом версии, автокопии сайта по расписанию
  и в хранилище S3 — зашифрованными, «Забыли пароль?» письмом, диагностика сайта (битые ссылки, страницы без описания, картинки без `alt`) и
  редиректы — всё в менеджере.
- **ИИ-агенты.** Ассистент в менеджере сам правит страницы по просьбе; `cms mcp` и ключи API подключают
  Claude, Cursor и Codex; `cms elements` выкладывает шаблоны и компоненты файлами с памяткой AGENTS.md.
- **HTTPS без прокси.** `cms --domain example.com` сам получает сертификат Let's Encrypt и продлевает его.
- **Обновления.** Менеджер сообщает о новой версии, `cms update` ставит её одной командой со сверкой
  контрольной суммы.
- **Готовые сайты.** `cms new` разворачивает блог, портфолио, сайт компании, витрину или магазин.
- **Переезд с Evo.** `cms import-evo` переносит сайт из дампа MySQL вместе с шаблонами.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/manager-overview-dark.webp">
  <img src="docs/assets/manager-overview-light.webp" alt="Обзор сайта: все страницы таблицей — адрес, шаблон, меню и публикация правятся прямо в строке">
</picture>

## Установка

```sh
curl -fsSL https://github.com/a-sharapov/eile/releases/latest/download/install.sh | bash
```

Установщик выбирает сборку под систему — Linux x64 и arm64 (glibc и musl) или macOS (Intel и Apple
Silicon), — проверяет SHA256 и кладёт `cms` в `~/.local/bin` (под root — в `/usr/local/bin`). Рядом
появляется `eile` — второе имя той же команды: `eile help` и `cms help` одно и то же. Если каталога нет в
`PATH`, установщик дописывает его в файл оболочки.

```sh
curl -fsSL …/install.sh | bash -s -- v0.2.0    # конкретная версия
CMS_INSTALL_DIR=/opt/bin bash install.sh       # свой каталог
CMS_NO_MODIFY_PATH=1 bash install.sh           # не трогать файлы оболочки
CMS_DOWNLOAD_URL=https://mirror.example/eile/v0.2.0 bash install.sh   # файлы релиза с зеркала
```

На Alpine сначала `apk add bash curl libgcc libstdc++`. Без установщика — скачайте
`cms-<система>-<процессор>.gz` со [страницы релизов](https://github.com/a-sharapov/eile/releases), сверьте
с `SHA256SUMS`, распакуйте `gunzip` и сделайте файл исполняемым. Второе имя — `ln -s cms eile` в том же
каталоге.

Обновление — `sudo cms update` или тот же установщик ещё раз. `cms update` сам перезапускает службу из
`cms service install`; сервер, запущенный иначе, перезапустите.

Установщику зеркало задаёт `CMS_DOWNLOAD_URL`, а `cms update` и проверке обновлений в менеджере —
`CMS_RELEASES_URL`: адрес API релизов в формате GitHub вместо `https://api.github.com`. Так обновляются в сети без
выхода наружу, а обновление и откат можно проверить на своей ленте, не пересобирая бинарник. Адрес и файлы
выпуска — только https; http — на этой машине или с `CMS_RELEASES_INSECURE=1`
([ADR 0048](docs/adr/0048-health-releases-url-redirect-check.md)).

```sh
sudo CMS_RELEASES_URL=https://mirror.example/api cms update
CMS_RELEASES_URL=http://127.0.0.1:9000 cms update --check   # проба на своей ленте
```

## Быстрый старт

```sh
cms new blog --db site.db   # готовый сайт: blog, portfolio, company, showcase или shop
cms --db site.db            # сайт и менеджер на http://localhost:8080
```

При первом запуске сервер печатает ссылку, по которой создаётся администратор. Менеджер — `/manager`.
Пустая база начинается со страницы приветствия и пустого шаблона `Minimal`, как в Evo.

`cms` и установщик говорят на языке системы: при русской локали (`LANG=ru_RU.UTF-8`) по-русски, при
любой другой по-английски. На том же языке новая база получает страницу приветствия и язык сайта.

```sh
cms backup copy.db --db site.db        # копия всего сайта одним файлом
cms restore copy.db --db site.db       # восстановить из копии
cms backup --server server.enc         # настройки сервера — на новую машину: cms restore --server
cms import-evo dump.sql --db site.db   # перенести сайт MODX Evo
cms users password eile@example.com    # новый пароль, если администратор забыл свой
cms diagnose redirects old.txt --db site.db   # старые адреса после переезда: один 301 и 200
cms help                               # все команды с примерами
```

## Шаблоны и компоненты

```svelte
<script>
  import Menu from '$components/Menu';
  let { page, site } = $props();
</script>

<svelte:head><title>{page.title} — {site.name}</title></svelte:head>
<Menu />
<main>{@html page.content}</main>
```

Шаблоны и компоненты хранятся в базе и компилируются при сохранении: ошибка в коде не роняет сайт, он
работает на прежней версии. Вместо тегов Evo (`{{chunk}}`, `[[snippet]]`, `[*field*]`, `[~id~]`) — импорты
и выражения Svelte, данные сайта — из модуля `$core`. В «Элементах» есть набор готовых компонентов: меню,
хлебные крошки, лента с пейджером, окна.

Свой JavaScript для браузера — сцена Three.js, виджет — это скрипт сайта: ES-модуль в «Элементах», зависимости
собраны в него. Шаблон подключает его в `<svelte:head>`:
`<script type="module" src={script('kitchen-stage')}></script>`. Адрес меняется с каждой правкой, браузер
кэширует его навсегда. Модели `.glb` для сцены лежат в медиатеке.

## С ИИ-агентом

```sh
cms elements pull site --db site.db               # элементы файлами и памятка AGENTS.md
cms elements check site --db site.db              # ошибки как файл:строка:столбец
cms elements push site --db site.db               # обратно в сайт: всё или ничего
claude mcp add site -- cms mcp --db /srv/site.db  # агент правит страницы, элементы, формы
```

Агент работает с правами пользователя: правки страниц попадают в их историю, редактору код недоступен.
Агенту на другом компьютере — ключ API из меню профиля и адрес `https://ваш-сайт/manager/mcp`. Подробнее —
[ADR 0034](docs/adr/0034-ai-agents.md).

## На сервере

Одна команда ставит сайт службой systemd: свой пользователь в песочнице, база в `/var/lib/cms`, перезапуск
после сбоя и HTTPS от Let's Encrypt без прокси ([ADR 0042](docs/adr/0042-service-install.md),
[ADR 0028](docs/adr/0028-https-without-proxy.md)).

```sh
sudo cms service install --domain example.com,www.example.com --email you@example.com
```

DNS домена должен указывать на сервер, порты 80 и 443 — быть открыты. Команда проверит порты, DNS и память,
включит службу, дождётся ответа сайта и напечатает адреса сайта и менеджера, а на новой базе — ссылку, по
которой создаётся администратор. Сайт, сделанный у себя, переезжает той же командой: `--from site.db` кладёт
в службу согласованную копию базы, можно и с работающего сервера. Попробовать без лимитов боевого центра —
`--acme-staging`: сертификат выпустится, но браузеры ему не поверят.

За своим nginx или Caddy — `--trust-proxy`: служба слушает только `127.0.0.1:8080` (`--port` — другой порт),
протокол, адрес сайта и посетителя берутся из `X-Forwarded-*`, cookie входа получает `Secure`. В «Настройках»
задайте адрес сайта: по нему строятся canonical, sitemap и проверка Origin.

```sh
sudo cms service install --trust-proxy   # в nginx: proxy_pass http://127.0.0.1:8080;
cms service status                       # работает ли, с какого времени, версия, адрес, память
cms service logs -f                      # журнал службы
sudo cms update                          # новая версия: копия базы, перезапуск, не поднялась — откат
sudo cms service uninstall               # остановить и удалить службу; база и копии остаются
```

Мониторам доступности (например, проверкам DigitalOcean) — адрес `https://example.com/_cms/health`: 200, если сервер
работает и читает базу, иначе 503, без входа и кэша. Тот же адрес проверяют `cms service` и `cms update` после
перезапуска. Номер версии он называет только запросу с этой же машины.

Перед переключением домена старые адреса проверяет `cms diagnose redirects`: список текстом или sitemap.xml
прежнего сайта, на базе (`--db`, без сети) или на новом сервере (`--base https://новый-адрес`). Каждый адрес должен
прийти одним 301 на живую страницу; цепочки, 302, 404 и уход на другой хост — ошибки, код выхода 1.

На машине меньше 1 ГиБ без подкачки команда предупредит и напечатает, как сделать файл подкачки: на дроплете в
512 МБ сайт без неё может не пережить загрузку большого файла под нагрузкой. Сама она подкачку не создаёт.

Юнит, который пишет команда, показывает `cms service install … --print` — ничего не меняя, без root. Его
можно поставить и руками: в `/etc/systemd/system/cms.service`, затем `sudo systemctl enable --now cms`. Без
systemd право на порты 80 и 443 даёт `sudo setcap cap_net_bind_service=+ep "$(command -v cms)"` — заново после
каждого обновления бинарника.

Уменьшенные копии картинок для `srcset` — 480, 960 и 1920 px в WebP — сервер делает сам, через секунду-другую
после загрузки, откуда бы картинка ни пришла: из менеджера, от агента по MCP или через API. Картинки, которые
уже лежали в медиатеке без копий, получают их после обновления. На PNG 6000×4000 задание берёт до 170 МБ памяти;
что больше при декодировании, остаётся без копий, а в сбоях появляется предупреждение
([ADR 0046](docs/adr/0046-server-image-variants.md)).

Медиатека хранится в базе, а отдаётся с диска: при первом запросе файл ложится в папку `site.media-cache`
рядом с базой, дальше картинки и видео уходят без копии в памяти. Это кэш: в копию сайта он не входит, удалить
его можно когда угодно, восстановление копии его стирает, а раз в сутки сервер убирает из него файлы, которых
больше нет. Служба держит его в `/var/cache/cms` (`CacheDirectory`), другая папка — `--media-cache` или
`CMS_MEDIA_CACHE`. Если папка не пишется (диск только для чтения, кончилось место), сайт работает и так: файлы
идут из базы, в журнале — одна строка ([ADR 0038](docs/adr/0038-media-cache.md)).

### Копии вне сервера и переезд

Автокопии лежат на том же диске, что и сайт. Чтобы они пережили сервер, включите «Копии вне сервера» в
«Настройках → Копии и обновления»: адрес хранилища S3 (DigitalOcean Spaces, Backblaze B2, Hetzner, MinIO,
AWS), бакет, папку и ключ доступа. Каждая копия шифруется на сервере кусками по 1 МиБ (AES-256-GCM) и уходит в
хранилище потоком, без файла в памяти; там остаются последние 14 копий этой базы, сбой отправки приходит
уведомлением. При первом включении менеджер **один раз** показывает ключ восстановления — сохраните его:
на новой машине копию открывают только им ([ADR 0045](docs/adr/0045-offsite-backups-and-server-settings.md)).

```sh
cms backup --remote --db site.db                       # копия сейчас — и в хранилище
cms restore --remote --db site.db                      # какие копии в хранилище
S3_ENDPOINT=https://fra1.digitaloceanspaces.com S3_BUCKET=copies \
  S3_ACCESS_KEY_ID=… S3_SECRET_ACCESS_KEY=… CMS_RECOVERY_KEY=… \
  cms restore --remote latest --db site.db             # сервера больше нет: сайт на чистой машине
```

Пароль почты, бот Telegram, почтовый шлюз, хранилище с ключом копий, ключ ИИ и ключи API — настройки сервера, в
копию сайта они не входят. На новую машину их переносит файл настроек под паролем:

```sh
cms backup --server server.enc --db site.db                     # дома: пароль спросят дважды
sudo cms service install --domain example.com --from site.db     # на сервере
sudo cms restore --server server.enc --db /var/lib/cms/site.db   # служба подхватит без перезапуска
```

Сеансов, сертификатов HTTPS, очереди уведомлений и журнала сбоев в файле нет. Каталог копий с путём другой
машины сбрасывается на `backups` рядом с базой, ключ API достаётся пользователю с той же почтой.

Удалённые записи и файлы оставляют в базе свободные страницы. Сколько их, показывает `cms info`; ночью сервер
сжимает базу сам, если свободно больше пятой части, а `cms compact` или «Сжать сейчас» в менеджере делают это сразу
— на базе в 63 МБ это полсекунды, и сайт при этом работает.

## Документация

**Владельцам сайтов**

- Справка в менеджере — раздел «Помощь» (`/manager/help`): страницы, текст, медиатека, формы и заявки,
  быстрые клавиши.
- `cms help` и `cms help <команда>` — все команды с примерами.
- [Переезд с MODX Evo](docs/adr/0009-evo-import.md) и [что взято из Evo, а что изменено](docs/evo-essence.md).
- [Резервные копии](docs/adr/0015-site-backups.md) ·
  [формы и заявки](docs/adr/0021-forms.md) ·
  [уведомления в Telegram и на почту](docs/adr/0020-notify.md) ·
  [готовые сайты](docs/adr/0022-scaffolds.md) ·
  [установка](docs/adr/0023-releases-and-installer.md) ·
  [автокопии](docs/adr/0024-scheduled-backups.md) ·
  [копии вне сервера и переезд настроек](docs/adr/0045-offsite-backups-and-server-settings.md) ·
  [обновления](docs/adr/0025-updates.md) ·
  [история правок](docs/adr/0026-page-revisions.md) ·
  [сброс пароля](docs/adr/0027-password-reset.md) ·
  [HTTPS без прокси](docs/adr/0028-https-without-proxy.md) ·
  [поиск по сайту](docs/adr/0030-site-search.md) ·
  [языки менеджера](docs/adr/0031-manager-languages.md) ·
  [правка прямо на сайте](docs/adr/0032-edit-bar.md) ·
  [переводы страниц и hreflang](docs/adr/0033-page-translations.md) ·
  [ИИ-агенты: папка элементов, MCP, ключи API](docs/adr/0034-ai-agents.md) ·
  [кэш медиатеки на диске](docs/adr/0038-media-cache.md) ·
  [почтовый шлюз для других сервисов](docs/adr/0040-mail-gateway.md) ·
  [мониторинг, зеркало релизов и проверка редиректов](docs/adr/0048-health-releases-url-redirect-check.md).

**Разработчикам шаблонов**

- [Шаблоны и компоненты из базы](docs/adr/0003-svelte-views-compiled-at-runtime.md) и
  [компоненты вместо чанков и сниппетов](docs/adr/0005-components-instead-of-chunks-and-snippets.md).
- [Глоссарий](docs/glossary.md): термины, API модуля `$core` и соответствие тегам Evo.
- [Кэш и некэшируемые регионы](docs/adr/0007-two-phase-cache.md) ·
  [острова](docs/adr/0008-islands.md) ·
  [скрипты сайта](docs/adr/0039-site-scripts.md) ·
  [контент из блоков](docs/adr/0010-content-from-components.md) ·
  [переводы и свои настройки](docs/adr/0013-translations-and-custom-settings.md) ·
  [страницы-файлы: CSS, RSS, robots.txt](docs/adr/0017-content-types.md) ·
  [набор компонентов и постраничные списки](docs/adr/0019-kit-and-paging.md) ·
  [находимость: SEO, sitemap, llms.txt](docs/adr/0012-discovery.md).

**Как устроено**

- [Видение](docs/vision.md) · [архитектура](docs/architecture.md) · [все решения (ADR)](docs/README.md#adr) ·
  [дорожная карта](docs/roadmap.md).

## Участие

Как собрать из исходников, запустить тесты и выпустить релиз — в [CONTRIBUTING.md](CONTRIBUTING.md).

## Лицензия

[GPL-3.0-or-later](LICENSE)

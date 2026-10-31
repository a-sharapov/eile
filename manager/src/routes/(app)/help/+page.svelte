<script lang="ts">
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { openPalette } from '#lib/palette.svelte.ts';
import { session } from '#lib/session.svelte.ts';
import PageHeader from '#lib/ui/PageHeader.svelte';
import { resolve } from '$app/paths';

type Chapter = {
  readonly id: string;
  readonly title: string;
  readonly admin?: boolean;
};

// Главы — по задачам, а не по экранам: «как сделать», а не «что где лежит».
const _CHAPTERS: readonly Chapter[] = [
  { id: 'start', title: 'С чего начать' },
  { id: 'pages', title: 'Страницы' },
  { id: 'text', title: 'Текст страницы' },
  { id: 'media', title: 'Медиатека' },
  { id: 'forms', title: 'Формы и заявки' },
  { id: 'speed', title: 'Быстрая работа' },
  { id: 'keys', title: 'Клавиши' },
  { id: 'account', title: 'Учётная запись' },
  { id: 'admin', title: 'Для администратора', admin: true },
  { id: 'trouble', title: 'Если что-то пошло не так' },
];

const admin = $derived(session.user?.role === 'admin');
const chapters = $derived(_CHAPTERS.filter((_) => admin || !_.admin));
const mac = /Mac|iPhone|iPad/.test(navigator.platform);
const mod = mac ? '⌘' : 'Ctrl';

// Поиск по помощи: тексты разделов собираются один раз, лишние разделы и главы прячутся.
let article = $state<HTMLElement>();
let query = $state('');
let texts = $state<ReadonlyMap<string, string>>(new Map());

$effect(
  () =>
    void (
      article &&
      (texts = new Map(
        [...article.querySelectorAll<HTMLElement>('[data-topic]')].map((_) => [
          _.id,
          (_.textContent ?? '').toLowerCase(),
        ])
      ))
    )
);

const needle = $derived(query.trim().toLowerCase());
const shown = (topic: string): boolean =>
  needle === '' || (texts.get(topic) ?? '').includes(needle);
const anyShown = $derived(
  needle === '' || [...texts.values()].some((_) => _.includes(needle))
);
const chapterShown = (chapter: string): boolean =>
  needle === '' ||
  [...texts.entries()].some(
    ([id, text]) => id.startsWith(`${chapter}-`) && text.includes(needle)
  );

// Оглавление подсвечивает главу, которую сейчас читают.
let active = $state('start');

$effect(() => {
  const observer = new IntersectionObserver(
    (entries) =>
      entries
        .filter((_) => _.isIntersecting)
        .forEach((_) => void (active = _.target.id)),
    { rootMargin: '-20% 0px -70% 0px' }
  );
  article
    ?.querySelectorAll('h2[id]:not(#thanks-title)')
    .forEach((_) => void observer.observe(_));
  return () => observer.disconnect();
});
</script>

<svelte:head><title>{t('nav.help')} — {t('app.name')}</title></svelte:head>

<PageHeader title={t('help.title')} crumbs={[{ label: t('nav.help') }]} />

<div class="help">
  <aside class="toc">
    <label class="find">
      <span class="sr-only">{t('help.search')}</span>
      {@html icons.search}
      <input type="search" bind:value={query} placeholder={t('help.search')} />
    </label>
    <nav aria-label={t('help.contents')}>
      <ol>
        {#each chapters as chapter (chapter.id)}
          {#if chapterShown(chapter.id)}
            <li><a href={`#${chapter.id}`} aria-current={active === chapter.id ? 'location' : undefined}>{chapter.title}</a></li>
          {/if}
        {/each}
      </ol>
    </nav>
  </aside>

  <article bind:this={article}>
    <!-- Благодарность — первой: идеи менеджера пришли отсюда. -->
    <aside class="thanks" aria-labelledby="thanks-title">
      <h2 id="thanks-title">Спасибо MODX</h2>
      <p>
        {t('app.name')} вдохновлён <a href="https://modx.com" target="_blank" rel="noopener">MODX</a> Evolution: дерево сайта как главный
        инструмент, шаблоны и чанки, дополнительные поля страниц, простота для тех, кто пишет тексты. Спасибо авторам и сообществу
        MODX за годы работы и идеи, которые продолжают жить здесь.
      </p>
    </aside>

    <p class="lead">
      Здесь — как вести сайт в менеджере: создавать и публиковать страницы, писать текст, работать с картинками и
      находить нужное за секунды. Читать подряд не обязательно — откройте главу в оглавлении или найдите слово в поиске по помощи.
    </p>

    {#if !anyShown}
      <p class="nothing">{t('help.nothing')}</p>
    {/if}

    <!-- С чего начать -->
    <h2 id="start" hidden={!chapterShown('start')}>С чего начать</h2>
    <section id="start-layout" data-topic hidden={!shown('start-layout')}>
      <h3>Как устроен менеджер</h3>
      <ul>
        <li><strong>Шапка</strong> — разделы, поле «Перейти» для быстрого перехода, ссылка на сайт и ваше меню справа.</li>
        <li><strong>Дерево страниц</strong> слева — весь сайт, как он вложен. Число справа от названия — номер страницы (id). Дерево можно скрыть кнопкой {@html icons.panelClose} и сделать шире, потянув за его край.</li>
        <li><strong>Холст</strong> справа — открытый экран: обзор, страница, медиатека. Сверху у него строка с путём, статусом и кнопками действий.</li>
      </ul>
      <p>На телефоне дерево открывается кнопкой {@html icons.menu} в шапке и закрывается само, когда вы выбрали страницу.</p>
    </section>
    <section id="start-overview" data-topic hidden={!shown('start-overview')}>
      <h3>Обзор сайта</h3>
      <p>
        Первый экран после входа — <a href={resolve('/(app)/pages')}>таблица страниц</a> в порядке дерева. Заголовок, адрес, заголовок
        в меню и шаблон правятся прямо в строке — сохраняется, когда уходите из поля; Enter ведёт к той же колонке ниже, Esc отменяет.
        Галочки «В меню» и «Опубликована» срабатывают сразу. Кнопки статусов сверху подсвечивают, например, только черновики.
      </p>
      <p>
        Переключатель «Карта» показывает сайт по разделам, а справа — последние изменения (что сделали, кто и когда) и то, что
        ждёт внимания: запланированные публикации и черновики.
      </p>
    </section>
    <section id="start-statuses" data-topic hidden={!shown('start-statuses')}>
      <h3>Что значат значки у страниц</h3>
      <p>Значок в дереве — тип страницы, точка на его углу — статус.</p>
      <ul class="legend">
        <li><span class="glyph" aria-hidden="true">{@html icons.file}</span><span><strong>Страница</strong> — обычная страница сайта, её собирает шаблон.</span></li>
        <li><span class="glyph" aria-hidden="true">{@html icons.fileCode}</span><span><strong>Файл</strong> — CSS, лента, SVG, robots.txt: сайт отдаёт его текст как есть. У каждого типа свой значок.</span></li>
        <li data-status="published"><i class="status-node" aria-hidden="true"></i><span><strong>Опубликована</strong> — её видят посетители.</span></li>
        <li data-status="draft"><i class="status-node" aria-hidden="true"></i><span><strong>Черновик</strong> — на сайте её нет; название в дереве написано наклонно.</span></li>
        <li data-status="scheduled"><i class="status-node" aria-hidden="true"></i><span><strong>Запланирована</strong> — выйдет сама в назначенное время.</span></li>
        <li data-status="trashed"><i class="status-node" aria-hidden="true"></i><span><strong>В корзине</strong> — убрана с сайта, её можно вернуть.</span></li>
        <li><span class="glyph" aria-hidden="true">{@html icons.eyeOff}</span><span><strong>Скрыта из меню</strong> — страница открывается по адресу, но в меню сайта её нет.</span></li>
        <li><span class="glyph" aria-hidden="true">{@html icons.link}</span><span><strong>Ссылка</strong> — не страница, а переход на другой адрес.</span></li>
      </ul>
    </section>

    <!-- Страницы -->
    <h2 id="pages" hidden={!chapterShown('pages')}>Страницы</h2>
    <section id="pages-create" data-topic hidden={!shown('pages-create')}>
      <h3>Создать страницу</h3>
      <ol>
        <li>Нажмите «Новая страница» на обзоре или значок {@html icons.filePlus} над деревом. Чтобы страница сразу оказалась внутри раздела, наведите на раздел в дереве и нажмите <strong>+</strong>.</li>
        <li>Напишите заголовок — адрес соберётся из него латиницей сам, пока вы не поменяете его вручную. Сменили заголовок у готовой страницы — старый адрес продолжит вести на неё.</li>
        <li>Напишите текст и нажмите «Сохранить» или <kbd>{mod}</kbd>+<kbd>S</kbd>. Страница сохранится черновиком — посетители её пока не видят.</li>
        <li>Когда всё готово, нажмите «Опубликовать».</li>
      </ol>
    </section>
    <section id="pages-editor" data-topic hidden={!shown('pages-editor')}>
      <h3>Вкладки страницы</h3>
      <dl>
        <dt>Документ</dt>
        <dd>Заголовок, адрес, анонс (короткий текст для списков) и текст. Справа — место на сайте (родитель и шаблон), публикация и меню: заголовок в меню и порядок среди соседей.</dd>
        <dt>Поля</dt>
        <dd>Дополнительные поля, которые выводит шаблон: цена, обложка, дата. Вкладка есть, только если у шаблона такие поля есть. Пустое поле с пометкой «возьмётся у…» получит значение от раздела выше.</dd>
        <dt>Поиск и соцсети</dt>
        <dd>Заголовок и описание для поисковиков, картинка для соцсетей и мессенджеров, превью того, как страницу увидят снаружи. Здесь же можно спрятать служебную страницу от поиска и посмотреть старые адреса.</dd>
        <dt>Настройки</dt>
        <dd>Кэширование, вид (страница или ссылка) и тип содержимого, язык ветки, публикация по расписанию. Обычно сюда заглядывают редко.</dd>
      </dl>
      <p>Точка на вкладке значит, что там есть несохранённые изменения. Уйти со страницы, не сохранив их, менеджер не даст без вопроса.</p>
    </section>
    <section id="pages-publish" data-topic hidden={!shown('pages-publish')}>
      <h3>Опубликовать сейчас или по расписанию</h3>
      <p>
        «Опубликовать» и «Снять с публикации» — в строке над страницей. Чтобы страница вышла сама, нажмите «Опубликовать по
        расписанию» в блоке «Публикация»: откроется вкладка «Настройки» с полями «Опубликовать в» и «Снять с публикации в».
        Сохраните — и в назначенный момент всё случится без вас. Если нажать «Опубликовать» у запланированной страницы,
        менеджер спросит, выпустить ли её раньше срока.
      </p>
      <p>Глаз {@html icons.eye} в строке страницы — предпросмотр: так страница выглядит на сайте, даже если ещё не опубликована. В предпросмотре — сохранённая версия.</p>
    </section>
    <section id="pages-menu" data-topic hidden={!shown('pages-menu')}>
      <h3>Меню сайта</h3>
      <p>
        В меню страница попадает с «Заголовком в меню» — его можно сделать короче основного. «Скрыть из меню» оставляет
        страницу доступной по адресу, но убирает её из меню. Порядок в меню — тот же, что в дереве.
      </p>
    </section>
    <section id="pages-move" data-topic hidden={!shown('pages-move')}>
      <h3>Переместить и упорядочить</h3>
      <ul>
        <li>Перетащите страницу в дереве: на строку — чтобы вложить, к краю строки — чтобы поставить рядом.</li>
        <li>Или откройте меню страницы (правый щелчок по строке или кнопка «…») → «Переместить в…».</li>
        <li>С клавиатуры: <kbd>Alt</kbd>+<kbd>↑</kbd> / <kbd>↓</kbd> переставляет страницу среди соседей.</li>
      </ul>
      <p>После переноса или смены адреса старый адрес продолжает вести на страницу — посетители и поисковики не попадут в пустоту. Эти адреса видны на вкладке «Поиск и соцсети».</p>
    </section>
    <section id="pages-link" data-topic hidden={!shown('pages-link')}>
      <h3>Ссылка вместо страницы</h3>
      <p>
        Если пункт меню должен вести на другой сайт или в другой раздел, создайте ссылку: значок {@html icons.link} над деревом.
        В поле «Куда ведёт ссылка» — адрес, путь вида <code>/kontakty</code> или номер страницы.
      </p>
    </section>
    <section id="pages-files" data-topic hidden={!shown('pages-files')}>
      <h3>Файлы: стили, ленты, robots.txt</h3>
      <p>
        Страница может отдаваться не как HTML, а как файл: CSS, JavaScript, JSON, XML, RSS-лента, SVG или простой текст.
        Тип выбирается в «Настройках» → «Тип содержимого», адрес пишется с расширением: <code>style.css</code>, <code>feed.xml</code>.
      </p>
      <p>
        Файл отдаётся без шаблона — ровно тем текстом, что написан в редакторе. В нём работают ссылки <code>[~5~]</code>, подстановки и
        компоненты <code>[[Имя]]</code>: так лента собирает свои записи. В меню, карте сайта и поиске файлов нет. Своя опубликованная
        страница <code>robots.txt</code> заменяет ту, что сайт собирает сам.
      </p>
      <p>
        SVG, XML, ленты и JavaScript браузер исполняет, поэтому их выбирает и правит только администратор. Редактору доступны
        HTML, текст, CSS, Markdown, CSV, календарь и JSON; скрипты и обработчики из HTML редактора сайт убирает при сохранении.
      </p>
    </section>
    <section id="pages-copy" data-topic hidden={!shown('pages-copy')}>
      <h3>Копия страницы</h3>
      <p>«Дублировать» {@html icons.copy} в строке страницы или в её меню создаёт копию рядом с оригиналом — неопубликованную, с «(копия)» в названии. Курсор сразу встанет в заголовок.</p>
    </section>
    <section id="pages-trash" data-topic hidden={!shown('pages-trash')}>
      <h3>Корзина</h3>
      <p>
        «В корзину» убирает страницу с сайта вместе со всеми вложенными. Передумали — нажмите «Вернуть» в уведомлении. Корзина
        — внизу дерева: откройте страницу оттуда и нажмите «Восстановить». «Очистить корзину» удаляет страницы навсегда.
      </p>
    </section>

    <!-- Текст -->
    <h2 id="text" hidden={!chapterShown('text')}>Текст страницы</h2>
    <section id="text-format" data-topic hidden={!shown('text-format')}>
      <h3>Оформление</h3>
      <p>Над текстом — панель: тип абзаца, жирный, курсив, ссылка, списки, цитата и картинка. Многое можно делать прямо при наборе:</p>
      <ul class="tricks">
        <li><kbd>##</kbd> и пробел в начале строки — заголовок (<kbd>###</kbd> — поменьше);</li>
        <li><kbd>-</kbd> и пробел — список, <kbd>1.</kbd> и пробел — нумерованный;</li>
        <li><kbd>&gt;</kbd> и пробел — цитата;</li>
        <li><kbd>{mod}</kbd>+<kbd>B</kbd> — жирный, <kbd>{mod}</kbd>+<kbd>I</kbd> — курсив, <kbd>{mod}</kbd>+<kbd>Z</kbd> — отменить.</li>
      </ul>
      <p>Кнопка «HTML» над текстом показывает разметку — для тех, кто пишет её сам.</p>
    </section>
    <section id="text-links" data-topic hidden={!shown('text-links')}>
      <h3>Ссылки</h3>
      <p>
        Выделите слова и нажмите <kbd>{mod}</kbd>+<kbd>K</kbd>. Начните вводить название страницы и выберите её из подсказок — такая
        ссылка не сломается, даже если страницу переименуют или перенесут. Можно ввести и адрес: <code>https://…</code>,
        <code>/путь</code>, <code>mailto:</code> или <code>tel:</code>. Пустой адрес убирает ссылку.
      </p>
    </section>
    <section id="text-images" data-topic hidden={!shown('text-images')}>
      <h3>Картинки</h3>
      <p>
        Значок {@html icons.image} на панели открывает медиатеку: выберите картинку или загрузите новую прямо оттуда. Описание
        картинки подставится из медиатеки — поправьте его, если нужно другое.
      </p>
    </section>
    <section id="text-blocks" data-topic hidden={!shown('text-blocks')}>
      <h3>Блоки и компоненты</h3>
      <p>
        Текст страницы состоит из блоков. Под ним — «Добавить блок: Текст / Компонент». Компонент — готовая часть оформления
        сайта, например врезка или баннер: выберите его и заполните поля. Блоки переставляются стрелками, удаляются крестиком —
        и удалённый можно вернуть из уведомления.
      </p>
    </section>
    <section id="text-keys" data-topic hidden={!shown('text-keys')}>
      <h3>Подстановки в тексте</h3>
      <dl>
        <dt><code>{'{i18n.ключ}'}</code></dt>
        <dd>Перевод: на сайте станет текстом на языке страницы. Сами тексты — в «Настройки» → «Переводы».</dd>
        <dt><code>[@ключ]</code></dt>
        <dd>Своя настройка сайта — например, телефон: поменяете в одном месте, обновится везде. Список — в «Настройки» → «Свои настройки».</dd>
        <dt><code>[~5~]</code></dt>
        <dd>Адрес страницы с номером 5 — так устроены ссылки на страницы.</dd>
      </dl>
    </section>

    <!-- Медиатека -->
    <h2 id="media" hidden={!chapterShown('media')}>Медиатека</h2>
    <section id="media-upload" data-topic hidden={!shown('media-upload')}>
      <h3>Загрузить файлы</h3>
      <p>
        Перетащите файлы в любое место <a href={resolve('/(app)/media')}>медиатеки</a> или нажмите на полосу загрузки. Папка — рядом
        с полосой; менеджер её запомнит. Для картинок сами создаются уменьшенные копии (480, 960 и 1920 пикселей): сайт отдаёт
        каждому экрану подходящую. Если файл с таким именем уже есть, менеджер спросит, заменить ли его.
      </p>
    </section>
    <section id="media-card" data-topic hidden={!shown('media-card')}>
      <h3>Карточка файла и описание картинки</h3>
      <p>
        Щёлкните по файлу — откроется карточка: превью, размер, размеры, где файл используется, кнопки «Скопировать адрес»,
        «Открыть» и «Удалить». У картинки там же — описание: одной фразой, что на ней изображено. Его читают незрячие посетители
        и поисковики, а при вставке картинки в текст оно подставится само. Плитки без описания помечены «без описания».
      </p>
    </section>
    <section id="media-remove" data-topic hidden={!shown('media-remove')}>
      <h3>Удалить файл</h3>
      <p>Перед удалением менеджер покажет, на каких страницах файл стоит, — чтобы картинка не пропала с сайта неожиданно. Уменьшенные копии удаляются вместе с файлом.</p>
    </section>

    <!-- Формы и заявки -->
    <h2 id="forms" hidden={!chapterShown('forms')}>Формы и заявки</h2>
    <section id="forms-place" data-topic hidden={!shown('forms-place')}>
      <h3>Поставить форму на страницу</h3>
      <p>
        В тексте страницы нажмите «Добавить блок → Форма» и выберите форму из списка. В тексте это тег вида
        <code>[#Form:callback]</code>: его можно вписать и вручную. Форма рисуется для каждого посетителя заново, а
        страница вокруг неё остаётся в кэше — сайт не замедляется.
      </p>
    </section>
    <section id="forms-inbox" data-topic hidden={!shown('forms-inbox')}>
      <h3>Разобрать заявки</h3>
      <p>
        Новые заявки видно на конверте в шапке: число — непрочитанные, по щелчку — сводка за день и неделю и последние заявки,
        «Все заявки» открывают <a href={`${resolve('/(app)/forms')}?tab=inbox`}>список</a>: фильтр по форме и статусу, поиск,
        клавиши j и k.
        У заявки — кнопки «Позвонить» и «Написать», откуда пришёл посетитель (страница, метки UTM), статус «В работе» или
        «Готово» и заметка для коллег. Похожие на спам заявки лежат в «Спам» и уведомлений не вызывают.
      </p>
    </section>
    <section id="forms-keep" data-topic hidden={!shown('forms-keep')}>
      <h3>Сколько хранятся заявки</h3>
      <p>
        Заявки — личные данные посетителей: они удаляются сами по сроку формы, по умолчанию через 30 дней. Нужное выгрузите
        кнопкой «Скачать CSV» — файл откроется в Excel.
      </p>
    </section>
    {#if admin}
      <section id="forms-build" data-topic hidden={!shown('forms-build')}>
        <h3>Собрать форму</h3>
        <p>
          <a href={resolve('/(app)/forms')}>«Формы»</a> в верхнем меню → «Новая форма» начинает с готового набора: имя, телефон, комментарий и согласие. Поля добавляются
          кнопками внизу, у каждого — подпись, вид, обязательность и правила: шаблон, длина, границы. Справа — форма так, как
          её увидит посетитель. Скрытое поле запоминает страницу, метки рекламы или параметр адреса — значения страницы сервер
          подставляет сам, подменить их нельзя. Удалить форму — корзина на её карточке или «Удалить» в редакторе:
          менеджер назовёт страницы, где она стоит, а её заявки останутся ещё на 30 дней.
        </p>
      </section>
      <section id="forms-notify" data-topic hidden={!shown('forms-notify')}>
        <h3>Уведомления в Telegram и на почту</h3>
        <p>
          В <a href={`${resolve('/(app)/settings')}?tab=notify`}>«Настройках → Уведомления»</a> подключите бота Telegram (токен
          от @BotFather, затем «Найти чаты») и почту (сервер SMTP). Туда же приходят сообщения о сбоях сайта — с порогом
          важности, повторы за 15 минут склеиваются. У формы можно выбрать свои каналы и тему письма.
        </p>
      </section>
    {/if}

    <!-- Быстрая работа -->
    <h2 id="speed" hidden={!chapterShown('speed')}>Быстрая работа</h2>
    <section id="speed-jump" data-topic hidden={!shown('speed-jump')}>
      <h3>Быстрый переход</h3>
      <p>
        <kbd>{mod}</kbd>+<kbd>K</kbd> из любого места или поле «Перейти» в шапке: начните вводить название страницы, её адрес или номер
        — и нажмите <kbd>Enter</kbd>. Там же — разделы и действия вроде «Новая страница»{#if admin}, а ещё шаблоны, компоненты,
        плагины и поля{/if}. Пустое окно показывает недавно открытые страницы.
      </p>
      <p><button type="button" onclick={openPalette}>{@html icons.search}{t('palette.title')}</button></p>
    </section>
    <section id="speed-ai" data-topic hidden={!shown('speed-ai')}>
      <h3>Сгенерировать с ИИ</h3>
      <p>
        Если администратор подключил ИИ в «Настройках» → «ИИ-ассистент», у полей появляется волшебная палочка {@html icons.wand}. Нажмите её
        (или <kbd>Alt</kbd>+<kbd>I</kbd> в поле), напишите коротко, что нужно, — например, «анонс в одно предложение» или
        «короче и живее», — посмотрите вариант и нажмите «Вставить». Не понравилось — «Ещё вариант». Вставку в поле отменяет
        «Вернуть» в уведомлении, в тексте страницы и коде — <kbd>{mod}</kbd>+<kbd>Z</kbd>.
      </p>
      <p>ИИ знает, какой это сайт, какое поле и где оно, поэтому запрос может быть совсем коротким. Перед публикацией текст стоит перечитать.</p>
    </section>
    <section id="speed-tree" data-topic hidden={!shown('speed-tree')}>
      <h3>Поиск в дереве</h3>
      <p>Клавиша <kbd>/</kbd> ставит курсор в поиск над деревом: страница найдётся по названию, адресу или номеру.</p>
    </section>
    <section id="speed-many" data-topic hidden={!shown('speed-many')}>
      <h3>Несколько страниц сразу</h3>
      <p>
        Выберите страницы в дереве: <kbd>{mod}</kbd>+щелчок добавляет страницу, <kbd>Shift</kbd>+щелчок — все между двумя, <kbd>Пробел</kbd>
        отмечает страницу под курсором. Над деревом появится полоса «Выбрано»: опубликовать, снять с публикации, перенести или
        убрать в корзину все разом. <kbd>Esc</kbd> снимает выбор.
      </p>
    </section>

    <!-- Клавиши -->
    <h2 id="keys" hidden={!chapterShown('keys')}>Клавиши</h2>
    <section id="keys-all" data-topic hidden={!shown('keys-all')}>
      <h3 class="sr-only">Все сочетания</h3>
      <table>
        <tbody>
          <tr><td><kbd>{mod}</kbd>+<kbd>S</kbd></td><td>Сохранить</td></tr>
          <tr><td><kbd>{mod}</kbd>+<kbd>K</kbd></td><td>Быстрый переход; в тексте — ссылка</td></tr>
          <tr><td><kbd>/</kbd></td><td>Поиск в дереве</td></tr>
          <tr><td><kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd></td><td>Ходить по дереву, раскрывать и сворачивать разделы</td></tr>
          <tr><td><kbd>Enter</kbd></td><td>Открыть страницу из дерева</td></tr>
          <tr><td><kbd>Пробел</kbd></td><td>Выбрать страницу в дереве</td></tr>
          <tr><td><kbd>Shift</kbd>+<kbd>F10</kbd></td><td>Меню страницы в дереве</td></tr>
          <tr><td><kbd>Alt</kbd>+<kbd>↑</kbd> / <kbd>↓</kbd></td><td>Переставить страницу среди соседей</td></tr>
          <tr><td><kbd>{mod}</kbd>+<kbd>B</kbd>, <kbd>{mod}</kbd>+<kbd>I</kbd></td><td>Жирный, курсив</td></tr>
          <tr><td><kbd>{mod}</kbd>+<kbd>Z</kbd></td><td>Отменить правку текста</td></tr>
          <tr><td><kbd>Alt</kbd>+<kbd>I</kbd></td><td>Сгенерировать с ИИ (в поле, тексте или коде)</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>Закрыть окно или меню, снять выбор</td></tr>
        </tbody>
      </table>
    </section>

    <!-- Учётная запись -->
    <h2 id="account" hidden={!chapterShown('account')}>Учётная запись</h2>
    <section id="account-menu" data-topic hidden={!shown('account-menu')}>
      <h3>Оформление, пароль, выход</h3>
      <p>
        Ваше имя справа в шапке открывает меню. «Оформление» — акцентный цвет и тема (светлая, тёмная или как в системе); у
        каждого пользователя своё. «Сменить пароль» просит текущий пароль и новый — не короче 10 символов. «Выйти» завершает
        работу на этом устройстве.
      </p>
    </section>

    <!-- Для администратора -->
    {#if admin}
      <h2 id="admin" hidden={!chapterShown('admin')}>Для администратора</h2>
      <section id="admin-users" data-topic hidden={!shown('admin-users')}>
        <h3>Пользователи и роли</h3>
        <p>
          <strong>Администратор</strong> может всё. <strong>Редактор</strong> работает со страницами и медиатекой. В разделе
          «<a href={resolve('/(app)/users')}>Пользователи</a>» — новый пользователь, задать пароль (передайте его лично), сменить
          роль или удалить. Страницы, которые правил удалённый пользователь, остаются.
        </p>
      </section>
      <section id="admin-settings" data-topic hidden={!shown('admin-settings')}>
        <h3>Настройки сайта</h3>
        <dl>
          <dt>Сайт</dt>
          <dd>Название, язык и другие языки, главная страница и страница «не найдено», адрес сайта, описание и картинка для соцсетей.</dd>
          <dt>Поиск и ИИ</dt>
          <dd>Свои правила robots.txt и ссылки, чтобы проверить, что видят поисковики и ИИ.</dd>
          <dt>Переводы</dt>
          <dd>Тексты на разных языках по ключам — для <code>{'{i18n.ключ}'}</code>. Правки в таблице сохраняются сразу.</dd>
          <dt>Свои настройки</dt>
          <dd>Значения вроде телефона или адреса — для <code>[@ключ]</code>.</dd>
          <dt>ИИ</dt>
          <dd>Адрес API, модель и ключ (DeepSeek, OpenAI и другие с таким же API) и указания для ИИ — тон и правила текстов. Ключ хранится только на сервере.</dd>
        </dl>
      </section>
      <section id="admin-elements" data-topic hidden={!shown('admin-elements')}>
        <h3>Элементы</h3>
        <dl>
          <dt>Шаблоны</dt>
          <dd>Решают, как выглядит страница. Над кодом шаблона видно, какие поля на него назначены и сколько страниц на нём живёт.</dd>
          <dt>Компоненты</dt>
          <dd>Части оформления, которые редакторы вставляют в текст блоками. Описание и параметры компонента становятся формой в редакторе.</dd>
          <dt>Плагины</dt>
          <dd>Меняют поведение сайта — например, переадресации. Включаются и выключаются кнопкой сразу.</dd>
          <dt>Поля страниц</dt>
          <dd>Дополнительные поля для шаблонов: строка, текст, число, да/нет, дата, выбор из списка, изображение; со значением по умолчанию и наследованием от разделов.</dd>
        </dl>
        <p>Если в коде ошибка, менеджер не сохранит его и покажет строку — «Строка N» переведёт к ней. Элемент, который где-то используется, удалить нельзя: менеджер покажет, где.</p>
      </section>
      <section id="admin-backup" data-topic hidden={!shown('admin-backup')}>
        <h3>Резервные копии</h3>
        <p>
          Раздел «<a href={resolve('/(app)/backups')}>Копии</a>» в шапке: скачать весь сайт одним файлом —
          <strong>файлом базы (.db)</strong> для точного восстановления или <strong>записями в JSON</strong>, которые можно
          открыть, сравнить и перенести на другой сервер. Там же — восстановить сайт из любого из двух видов: перед заменой
          менеджер сохранит прежнее состояние на сервере рядом с базой. Храните копии не на том же сервере.
        </p>
        <p>
          <strong>Автокопии</strong> включаются в «<a href={`${resolve('/(app)/settings')}?tab=upkeep`}>Настройках → Копии и
          обновления</a>»: раз в сутки, дважды, четыре раза или каждый час, в каталог на сервере; старые сверх заданного числа
          удаляются сами. Не сделалась копия — придёт уведомление о сбое.
        </p>
        <p>
          Там же — <strong>проверка обновлений</strong>: раз в сутки сервер спрашивает страницу релизов, нет ли новой версии, и
          она появляется в меню профиля. Обновить — командой <code>cms update</code> на сервере и перезапустить его.
        </p>
      </section>
      <section id="admin-cli" data-topic hidden={!shown('admin-cli')}>
        <h3>Командная строка</h3>
        <p>У программы сайта есть команды для сервера:</p>
        <ul>
          <li><code>cms help</code> — все команды с примерами;</li>
          <li><code>cms backup</code> — копия всего сайта одним файлом, <code>cms backup site.json</code> — записями в JSON;</li>
          <li><code>cms restore файл</code> — восстановить сайт из копии;</li>
          <li><code>cms update</code> — обновить программу до новой версии, <code>--check</code> — только проверить;</li>
          <li><code>cms users password почта</code> — новый пароль, если администратор забыл свой.</li>
        </ul>
      </section>
    {/if}

    <!-- Если что-то пошло не так -->
    <h2 id="trouble" hidden={!chapterShown('trouble')}>Если что-то пошло не так</h2>
    <section id="trouble-load" data-topic hidden={!shown('trouble-load')}>
      <h3>«Не загрузилось»</h3>
      <p>Сервер не ответил — проверьте интернет и нажмите «Повторить». Правки на открытой странице при этом не пропадают: сохраните их, когда связь вернётся.</p>
    </section>
    <section id="trouble-site" data-topic hidden={!shown('trouble-site')}>
      <h3>Страницы нет на сайте</h3>
      <ul>
        <li>Она опубликована? У черновика узел-кольцо и наклонное название.</li>
        <li>Не запланирована ли она на будущее?</li>
        <li>Не лежит ли в корзине раздел, в котором она находится?</li>
        <li>«Скрыть из меню» убирает страницу только из меню — по адресу она открывается.</li>
      </ul>
    </section>
    <section id="trouble-password" data-topic hidden={!shown('trouble-password')}>
      <h3>Забыли пароль или вход заблокирован</h3>
      <p>
        Попросите администратора задать вам новый пароль. После пяти неверных попыток с вашего компьютера вход с него закрывается на 15 минут (с других адресов — нет) — подождите и
        попробуйте снова. Если закончился сеанс, менеджер предложит войти заново прямо в уведомлении.
      </p>
    </section>
    <section id="trouble-save" data-topic hidden={!shown('trouble-save')}>
      <h3>Не сохраняется</h3>
      <p>Ошибка показана у поля, которое нужно поправить, и вкладка с ним откроется сама. Например, адрес — только латиница, цифры и дефисы, и у соседних страниц он должен быть разным.</p>
    </section>
  </article>
</div>

<style>
  /* Помощь читают: колонка текста ~65 знаков, оглавление справа и закреплено; узко — сверху. */
  .help {
    container: help / inline-size;
    display: grid;
    grid-template-columns: minmax(0, 42rem) minmax(13rem, 16rem);
    gap: 3rem;
    align-items: start;
    justify-content: space-between;
  }

  .toc {
    position: sticky;
    top: calc(var(--topbar, 0) + 5rem);
    order: 2;
    display: grid;
    gap: 1rem;
  }

  .find {
    position: relative;
    display: block;
  }

  .find :global(svg) {
    position: absolute;
    top: 50%;
    left: 0.75rem;
    width: 1rem;
    height: 1rem;
    color: var(--muted);
    transform: translateY(-50%);
  }

  .find input {
    width: 100%;
    padding-left: 2.25rem;
  }

  .toc ol {
    display: grid;
    gap: 0.125rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .toc a {
    display: block;
    padding: 0.35rem 0.75rem;
    border-radius: var(--radius);
    color: var(--muted);
    font-size: 0.875rem;
    text-decoration: none;
  }

  .toc a:hover {
    background: var(--hover);
    color: var(--text);
  }

  .toc a[aria-current] {
    background: var(--accent-soft);
    color: var(--text);
    font-weight: 600;
  }

  /* Узкая холстина: оглавление — над текстом строкой ссылок. Правило после базовых — перебивает их. */
  @container help (width < 52rem) {
    .toc {
      position: static;
      order: 0;
      grid-column: 1 / -1;
    }

    article {
      grid-column: 1 / -1;
    }

    .toc ol {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
    }

    .toc a {
      padding: 0.25rem 0.6rem;
      border: 0.0625rem solid var(--line);
      border-radius: 999px;
      font-size: 0.8125rem;
    }
  }

  article {
    font-size: 1rem;
    line-height: 1.65;
  }

  /* Тихий блок над текстом: не глава и не предупреждение — слово благодарности. */
  .thanks {
    margin: 0 0 1.5rem;
    padding: 1rem 1.25rem;
    border-radius: var(--radius-l);
    background: var(--sunken);
  }

  .thanks h2 {
    margin: 0 0 0.35rem;
    padding: 0;
    border: 0;
    font-size: 1rem;
    letter-spacing: 0;
  }

  .thanks p {
    margin: 0;
    color: var(--muted);
    font-size: 0.9375rem;
    line-height: 1.6;
  }

  .lead {
    margin: 0 0 1rem;
    color: var(--muted);
    font-size: 1.0625rem;
  }

  h2 {
    margin: 3rem 0 0.25rem;
    padding-top: 1.5rem;
    border-top: 0.0625rem solid var(--line);
    font-size: 1.375rem;
    letter-spacing: -0.02em;
    scroll-margin-top: calc(var(--topbar, 0) + 5rem);
  }

  h3 {
    margin: 1.75rem 0 0.5rem;
    font-size: 1.0625rem;
  }

  section p,
  section ul,
  section ol,
  section dl {
    margin: 0 0 0.75rem;
  }

  section ul,
  section ol {
    padding-left: 1.25rem;
  }

  li + li {
    margin-top: 0.35rem;
  }

  dl {
    display: grid;
    gap: 0.25rem 1.25rem;
    grid-template-columns: minmax(0, max-content) minmax(0, 1fr);
  }

  dt {
    font-weight: 600;
  }

  dd {
    margin: 0;
  }

  @container help (width < 36rem) {
    dl {
      grid-template-columns: minmax(0, 1fr);
    }

    dd {
      margin-bottom: 0.5rem;
    }
  }

  .legend {
    display: grid;
    gap: 0.5rem;
    padding: 0;
    list-style: none;
  }

  .legend li {
    display: grid;
    grid-template-columns: 1.25rem minmax(0, 1fr);
    gap: 0.6rem;
    align-items: baseline;
    margin: 0;
  }

  .legend .status-node {
    justify-self: center;
  }

  .glyph,
  section :global(svg) {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    color: var(--muted);
    vertical-align: -0.15em;
  }

  section button :global(svg) {
    color: inherit;
  }

  code {
    padding: 0 0.3em;
    border-radius: var(--radius-s);
    background: var(--sunken);
    font-family: var(--mono);
    font-size: 0.875em;
  }

  table {
    width: 100%;
    max-width: 36rem;
    background: transparent;
  }

  td {
    padding: 0.5rem 0.75rem 0.5rem 0;
    border-bottom: 0.0625rem solid var(--line);
    vertical-align: top;
  }

  td:first-child {
    width: 40%;
    white-space: nowrap;
  }

  .nothing {
    color: var(--muted);
  }
</style>

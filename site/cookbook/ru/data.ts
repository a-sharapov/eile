import {
  aside,
  type Chapter,
  c,
  code,
  h2,
  list,
  p,
  shot,
  steps,
  ui,
} from '../markup.ts';

const KITCHEN_1 = `<script>
  import Content from '$core/Content';
  import Layout from '$components/Layout';
  import { image } from '$core';

  let { page } = $props();

  const price = page.fields.price;
  const plan = page.fields.plan;
  const photo = page.fields.photo ? image(page.fields.photo) : null;
  const rub = new Intl.NumberFormat('ru');
</script>

<Layout {page}>
  {#if photo}
    <img
      class="photo"
      src={photo.src}
      srcset={photo.srcset}
      sizes="(min-width: 48rem) 45rem, 100vw"
      width={photo.width}
      height={photo.height}
      alt={photo.alt}
    />
  {/if}

  <h1>{page.title}</h1>

  <dl class="facts">
    {#if plan}
      <div><dt>Планировка</dt><dd>{plan}</dd></div>
    {/if}
    {#if price}
      <div><dt>Цена</dt><dd>от {rub.format(price)} ₽ за метр</dd></div>
    {/if}
  </dl>

  <Content of={page} />
</Layout>

<style>
  .photo {
    display: block;
    border-radius: 1.25rem;
  }

  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 2.5rem;
    margin: 0;
  }

  dt {
    color: #6b6862;
    font-size: 0.875rem;
  }

  dd {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 650;
  }
</style>`;

const _KITCHENS = [
  {
    title: 'Олива',
    price: 38000,
    plan: 'Прямая',
    photo: 'kuhni/oliva.webp',
    alt: 'Прямая кухня с оливковыми фасадами шейкер и светлой столешницей',
    text: 'Фасады шейкер оливкового цвета, столешница под светлый дуб и чёрные ручки-скобы. Хорошо садится на стену от трёх метров.',
  },
  {
    title: 'Кашемир',
    price: 46000,
    plan: 'Прямая',
    photo: 'kuhni/kashemir.webp',
    alt: 'Кухня цвета кашемира до потолка с латунными ручками и фартуком под мрамор',
    text: 'Гладкие фасады цвета кашемира до самого потолка, латунные ручки и фартук под мрамор. Подсветка под верхними шкафами входит в цену.',
  },
  {
    title: 'Шалфей',
    price: 52000,
    plan: 'Угловая',
    photo: 'kuhni/shalfey.webp',
    alt: 'Угловая кухня с матовыми фасадами цвета шалфея и полками из дуба',
    text: 'Угловая кухня с матовыми фасадами цвета шалфея и полками из дуба. Духовой шкаф стоит в колонне на уровне глаз.',
  },
] as const;

const fields: Chapter = {
  alias: 'polya',
  title: 'Поля: цена, планировка и фото кухни',
  menuTitle: 'Поля страниц',
  lead: 'У кухни есть цена за метр, планировка и фотография. В текст их писать неудобно: цену не отсортируешь и не поменяешь в одном месте. Для таких данных у страниц есть поля.',
  description:
    'Дополнительные поля страниц в Eile: создать поле, назначить его шаблону, заполнить и вывести в шаблоне; выбор из списка и картинки из медиатеки.',
  content: [
    aside(
      'goal',
      'В этой главе',
      list(
        'сделаем шаблон Kitchen для страниц кухонь;',
        'заведём поля «Цена за метр», «Планировка» и «Фото»;',
        'загрузим фотографии в медиатеку;',
        'создадим три кухни внутри «Каталога».'
      )
    ),
    h2('zachem', 'Зачем полям отдельное место'),
    p(
      'Можно было бы написать цену прямо в тексте: «Олива, 38 000 рублей за метр». Но тогда шаблон не знает, где в тексте цена. Он не сможет показать её крупно, вывести в каталоге или посчитать стоимость кухни длиной в три метра.',
      'Поле хранит одно значение определённого вида: число, строку, дату, вариант из списка, картинку. Шаблон знает его имя и выводит, где нужно.'
    ),
    h2('kitchen', 'Шаблон кухни'),
    p(
      'Начнём с шаблона, потому что поле привязывается к шаблонам. Создайте шаблон <code>Kitchen</code>:'
    ),
    code('svelte', KITCHEN_1, {
      file: 'Шаблон Kitchen',
      save: 'template:Kitchen',
    }),
    list(
      c('page.fields.price') +
        ': значение поля с именем <code>price</code>. Так же <code>plan</code> и <code>photo</code>. Если поле пустое, там <code>null</code>.',
      c("new Intl.NumberFormat('ru')") +
        ': форматирует число по-русски, с пробелом между разрядами: 38000 станет «38 000».',
      c('image(page.fields.photo)') +
        ': по пути картинки в медиатеке <code>image</code> возвращает всё, что нужно тегу ' +
        c('<img>') +
        ': адрес, уменьшенные копии для разных экранов, размеры и описание.',
      c('srcset') +
        ' и ' +
        c('sizes') +
        ': браузер телефона скачает маленькую копию картинки, а браузер большого экрана большую. Страница грузится быстрее.',
      c('<dl>') +
        ', ' +
        c('<dt>') +
        ', ' +
        c('<dd>') +
        ': список «название и значение». Для характеристик он подходит лучше абзацев.'
    ),
    h2('polya', 'Завести поля'),
    p(
      'На вкладке ' +
        ui('Элементы') +
        ' нажмите <b>+</b> рядом со словом «Поля страниц». Заполните форму для цены:'
    ),
    list(
      `${ui('Подпись')}: «Цена за метр, ₽». Так поле подписано в редакторе страницы.`,
      ui('Имя для шаблона') +
        ': <code>price</code>. Латиницей; именно это имя стоит в ' +
        c('page.fields.price') +
        '.',
      `${ui('Тип')}: ${ui('Число')}.`,
      `${ui('Шаблоны')}: отметьте <code>Kitchen</code>.`
    ),
    p(
      'Нажмите ' +
        ui('Сохранить поле') +
        '. Так же заведите ещё два поля, тоже для шаблона Kitchen:'
    ),
    list(
      '«Планировка», имя <code>plan</code>, тип ' +
        ui('Выбор из списка') +
        ', варианты через запятую: «Прямая, Угловая, П-образная»;',
      `«Фото», имя <code>photo</code>, тип ${ui('Изображение')}.`
    ),
    shot('field', 'Редактор поля «Цена за метр, ₽»'),
    aside(
      'tip',
      'Если поле пустое',
      p(
        'В форме поля есть блок ' +
          ui('Если поле пустое') +
          '. Там задают значение по умолчанию и наследование: пустое поле возьмёт значение у раздела выше. Например, поле «Срок изготовления» можно задать один раз у «Каталога», и все кухни его унаследуют.'
      )
    ),
    h2('media', 'Фотографии в медиатеку'),
    p(
      'Откройте ' +
        ui('Медиа') +
        ' и перетащите туда фотографии кухонь. Подойдут снимки из шоурума или визуализации из программы, в которой вы рисуете проекты. Папку назовите <code>kuhni</code>: в полосе загрузки есть поле папки, менеджер его запомнит.'
    ),
    p(
      'Щёлкните по загруженной картинке. В карточке файла напишите описание, одной фразой: «Прямая кухня с оливковыми фасадами шейкер и светлой столешницей». Его прочитает незрячий посетитель, а шаблон Kitchen выводит его в ' +
        c('alt') +
        '.'
    ),
    p(
      'Уменьшенные копии на 480, 960 и 1920 пикселей Eile сделает сам. Именно они попадают в ' +
        c('srcset') +
        '.'
    ),
    h2('kuhni', 'Кухни внутри «Каталога»'),
    p(
      'Наведите мышь на «Каталог» в дереве и нажмите <b>+</b>: новая страница сразу окажется внутри. Шаблон поменяйте на Kitchen, иначе вкладки с полями не будет.'
    ),
    steps(
      'Заголовок «Олива», адрес соберётся сам: <code>oliva</code>.',
      `В блоке ${ui('Место на сайте')} выберите шаблон <code>Kitchen</code>.`,
      'Напишите пару предложений о кухне.',
      'Откройте вкладку ' +
        ui('Поля') +
        ': цена 38000, планировка «Прямая», фото выберите из медиатеки.',
      'Сохраните и опубликуйте.'
    ),
    p(
      'Так же создайте «Кашемир» (прямая, 46 000 ₽ за метр) и «Шалфей» (угловая, 52 000 ₽ за метр). Вторая и третья кухни получат шаблон Kitchen сами: новая страница берёт шаблон у соседей.'
    ),
    shot('kitchen', 'Страница кухни «Олива»: фото, планировка и цена из полей'),
    aside(
      'trouble',
      'Нет вкладки «Поля»',
      p(
        'Вкладка появляется, когда у шаблона страницы есть поля. Проверьте, что у страницы выбран шаблон Kitchen и что в настройках каждого поля отмечен Kitchen.'
      )
    ),
    aside(
      'check',
      'Проверьте себя',
      list(
        '<code>/katalog/oliva</code> показывает фото, планировку и цену;',
        'вы поменяли цену в поле, и она поменялась на сайте;',
        'у фотографий есть описания.'
      )
    ),
  ].join('\n'),
  replay: (_) => {
    _.code();
    _.field({
      name: 'price',
      label: 'Цена за метр, ₽',
      type: 'number',
      templates: ['Kitchen'],
    });
    _.field({
      name: 'plan',
      label: 'Планировка',
      type: 'select',
      options: ['Прямая', 'Угловая', 'П-образная'],
      templates: ['Kitchen'],
    });
    _.field({
      name: 'photo',
      label: 'Фото',
      type: 'image',
      templates: ['Kitchen'],
    });
    _KITCHENS.forEach((kitchen) => {
      _.upload(kitchen.photo, kitchen.alt);
      _.page({
        title: kitchen.title,
        parent: 'Каталог',
        template: 'Kitchen',
        content: `<p>${kitchen.text}</p>`,
        fields: {
          price: kitchen.price,
          plan: kitchen.plan,
          photo: kitchen.photo,
        },
      });
    });
  },
  expect: [
    ['/katalog/oliva', 'от 38\u00a0000 ₽ за метр'],
    ['/katalog/oliva', '>Прямая</dd>'],
    ['/katalog/oliva', 'kuhni/oliva.webp'],
  ],
};

const CATALOG = `<script>
  import Content from '$core/Content';
  import Layout from '$components/Layout';
  import { children, image, link } from '$core';

  let { page } = $props();

  const kitchens = children(page.id);
  const rub = new Intl.NumberFormat('ru');
</script>

<Layout {page}>
  <h1>{page.title}</h1>
  <Content of={page} />

  <ul class="cards">
    {#each kitchens as kitchen (kitchen.id)}
      {@const photo = kitchen.fields.photo ? image(kitchen.fields.photo) : null}
      <li>
        <a href={link(kitchen.id)}>
          {#if photo}
            <img src={photo.src} width={photo.width} height={photo.height} alt="" />
          {/if}
          <span class="name">{kitchen.title}</span>
          <span class="meta">
            {kitchen.fields.plan} · от {rub.format(kitchen.fields.price)} ₽ за метр
          </span>
        </a>
      </li>
    {/each}
  </ul>
</Layout>

<style>
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
    gap: 1rem;
    padding: 0;
    list-style: none;
  }

  .cards a {
    display: grid;
    gap: 0.35rem;
    padding: 0.75rem 0.75rem 1rem;
    border-radius: 1.25rem;
    background: #fff;
    color: inherit;
    text-decoration: none;
  }

  .cards img {
    aspect-ratio: 4 / 3;
    object-fit: cover;
    border-radius: 0.9rem;
  }

  .name {
    font-weight: 700;
  }

  .meta {
    color: #6b6862;
    font-size: 0.9rem;
  }
</style>`;

const PROJECTS = `<script>
  import Layout from '$components/Layout';
  import Pagination from '$components/Pagination';
  import { link, listing } from '$core';

  let { page } = $props();

  const projects = listing(page.id, { perPage: 5 });
  const date = new Intl.DateTimeFormat('ru', {
    dateStyle: 'long',
    timeZone: 'UTC',
  });
</script>

<Layout {page}>
  <h1>{page.title}</h1>

  {#each projects.items as project (project.id)}
    <article class="project">
      <h2><a href={link(project.id)}>{project.title}</a></h2>
      <p class="date">{date.format(new Date(project.publishedAt))}</p>
      {#if project.introText}<p>{project.introText}</p>{/if}
    </article>
  {:else}
    <p>Проектов пока нет.</p>
  {/each}

  <Pagination
    items={projects.pager()}
    prev={projects.url(projects.number - 1)}
    next={projects.url(projects.number + 1)}
  />
</Layout>

<style>
  .project {
    padding: 1.25rem 0;
    border-bottom: 1px solid #e2dfd9;
  }

  .project h2 {
    margin: 0;
    font-size: 1.375rem;
  }

  .project a {
    color: inherit;
  }

  .date {
    margin: 0.25rem 0 0;
    color: #6b6862;
    font-size: 0.9rem;
  }
</style>`;

const HOME = `<script>
  import Content from '$core/Content';
  import Layout from '$components/Layout';
  import { children, image, link, listing } from '$core';

  let { page } = $props();

  // Разделы находим по адресу: так шаблону не нужны номера страниц.
  const top = children(null);
  const catalog = top.find((_) => _.path === '/katalog');
  const projects = top.find((_) => _.path === '/proekty');
  const contacts = top.find((_) => _.path === '/kontakty');

  const kitchens = catalog ? children(catalog.id).slice(0, 3) : [];
  const fresh = projects
    ? listing(projects.id, { perPage: 2, paged: false }).items
    : [];
  const cover = kitchens[0]?.fields.photo ? image(kitchens[0].fields.photo) : null;
  const rub = new Intl.NumberFormat('ru');
</script>

<Layout {page}>
  <section class="hero">
    <h1>{page.longTitle || page.title}</h1>
    <Content of={page} />
    <p class="actions">
      {#if catalog}<a class="button" href={link(catalog.id)}>Смотреть каталог</a>{/if}
      {#if contacts}<a href={link(contacts.id)}>Записаться на замер</a>{/if}
    </p>
    {#if cover}
      <img
        src={cover.src}
        srcset={cover.srcset}
        sizes="(min-width: 48rem) 45rem, 100vw"
        width={cover.width}
        height={cover.height}
        alt={cover.alt}
      />
    {/if}
  </section>

  {#if kitchens.length}
    <h2>Из каталога</h2>
    <ul class="kitchens">
      {#each kitchens as kitchen (kitchen.id)}
        <li>
          <a href={link(kitchen.id)}>{kitchen.title}</a>
          <span>от {rub.format(kitchen.fields.price)} ₽ за метр</span>
        </li>
      {/each}
    </ul>
  {/if}

  {#if fresh.length}
    <h2>Готовые проекты</h2>
    {#each fresh as project (project.id)}
      <p class="project"><a href={link(project.id)}>{project.title}</a></p>
    {/each}
  {/if}
</Layout>

<style>
  .hero img {
    margin-top: 1.5rem;
    border-radius: 1.5rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1.25rem;
  }

  .button {
    padding: 0.8rem 1.4rem;
    border-radius: 999px;
    background: #1f1e1c;
    color: #fff;
    text-decoration: none;
  }

  .actions a:not(.button) {
    color: inherit;
  }

  .kitchens {
    display: grid;
    gap: 0.5rem;
    padding: 0;
    list-style: none;
  }

  .kitchens li {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.25rem 1rem;
    padding: 0.9rem 1.1rem;
    border-radius: 1rem;
    background: #fff;
  }

  .kitchens span {
    color: #6b6862;
  }

  .kitchens a,
  .project a {
    color: inherit;
  }
</style>`;

const _PROJECTS = [
  {
    title: 'Кухня в сталинке на Соколе',
    intro:
      'Высокие потолки, шкафы до самого верха и встроенный холодильник в нише у окна.',
  },
  {
    title: 'Угловая кухня для студии 28 м²',
    intro:
      'Уместили посудомойку, духовой шкаф и барную стойку, которая заодно отделяет кухню от комнаты.',
  },
  {
    title: 'Кухня с островом в загородном доме',
    intro:
      'Остров с варочной панелью смотрит в гостиную, вытяжка спрятана в потолок.',
  },
] as const;

const lists: Chapter = {
  alias: 'spiski',
  title: 'Списки: каталог, проекты и главная',
  menuTitle: 'Списки страниц',
  lead: '«Каталог» сам соберёт карточки кухонь с ценами, «Проекты» покажут работы по пять на странице, а главная станет витриной с кухнями и свежими проектами.',
  description:
    'Списки страниц в Eile: дочерние страницы через children(), постраничная лента через listing() и компонент Pagination из набора.',
  content: [
    aside(
      'goal',
      'В этой главе',
      list(
        'выведем кухни карточками на странице «Каталог»;',
        'заведём раздел «Проекты» с готовыми работами;',
        'разобьём проекты на страницы и поставим пейджер;',
        'соберём главную из кухонь и проектов.'
      )
    ),
    h2('katalog', 'Карточки кухонь'),
    p(
      'Кухни лежат внутри «Каталога». Значит, шаблону страницы «Каталог» нужно взять её дочерние страницы и нарисовать по карточке на каждую. Создайте шаблон <code>Catalog</code>:'
    ),
    code('svelte', CATALOG, {
      file: 'Шаблон Catalog',
      save: 'template:Catalog',
    }),
    list(
      c('children(page.id)') +
        ': дочерние страницы текущей, в порядке дерева. В пятой главе мы звали ' +
        c('children(null)') +
        ' для верхнего уровня, здесь та же функция.',
      c('kitchen.fields.price') +
        ': у каждой страницы из списка есть её поля, как у ' +
        c('page') +
        ' в шаблоне кухни.',
      c('{@const photo = …}') +
        ': заводит значение прямо внутри ' +
        c('{#each}') +
        ', своё для каждой кухни.',
      c('aspect-ratio: 4 / 3') +
        ' и ' +
        c('object-fit: cover') +
        ': все фото в карточках одной высоты, даже если снимки разных пропорций.',
      c('grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr))') +
        ': карточки встанут в столько колонок, сколько поместится. На телефоне одна, на ноутбуке три.'
    ),
    p(
      'Откройте страницу «Каталог» в менеджере, выберите ей шаблон Catalog и сохраните. Порядок карточек тот же, что в дереве: перетащите кухни, чтобы поменять его.'
    ),
    shot('catalog', 'Каталог студии: карточки кухонь с планировкой и ценой'),
    aside(
      'tip',
      'Шаблон у кухонь не поменялся',
      p(
        'Новая страница берёт шаблон родителя. Если сейчас создать кухню внутри «Каталога», она получит Catalog, и её придётся переключить на Kitchen вручную. Это легко забыть, так что смотрите на шаблон в блоке ' +
          ui('Место на сайте') +
          '.'
      )
    ),
    h2('proekty', 'Раздел проектов'),
    p(
      'Создайте на верхнем уровне страницу «Проекты» (адрес <code>proekty</code>), а внутри неё три работы. У каждой заполните поле ' +
        ui('Анонс') +
        ': это одно-два предложения, которые попадут в список. Проектам оставьте шаблон Base.'
    ),
    p(
      'Для пейджера, ссылок «Назад» и «Вперёд» между страницами списка, возьмём готовый компонент. Щёлкните в шапке значок ' +
        ui('Элементы') +
        ', откройте вкладку ' +
        ui('Набор компонентов') +
        ' и нажмите ' +
        ui('Установить') +
        ' у компонента <code>Pagination</code>. Он появится среди компонентов сайта, и его можно будет править, как свой.'
    ),
    p('Теперь шаблон <code>Projects</code>:'),
    code('svelte', PROJECTS, {
      file: 'Шаблон Projects',
      save: 'template:Projects',
    }),
    list(
      c('listing(page.id, { perPage: 5 })') +
        ': дочерние страницы порциями по пять. Сначала новые: последняя опубликованная работа окажется сверху.',
      c('projects.items') +
        ': работы текущей порции. На втором экране списка это работы с шестой по десятую.',
      c('{:else}') +
        ' внутри ' +
        c('{#each}') +
        ': что показать, если список пуст.',
      c('projects.pager()') +
        ', ' +
        c('projects.url(…)') +
        ': номера страниц списка и адреса соседних. Компонент Pagination рисует из них пейджер, а при одной странице не рисует ничего.'
    ),
    p(
      'Выберите странице «Проекты» шаблон Projects. Вторая порция откроется по адресу <code>/proekty/page-2</code>, когда работ станет больше пяти: Eile сам понимает такие адреса.'
    ),
    h2('glavnaya', 'Главная: витрина студии'),
    p(
      'Список можно собрать и из другого раздела. Главная покажет крупный заголовок, кнопку в каталог, большое фото, три кухни с ценами и два свежих проекта. Создайте шаблон <code>Home</code>:'
    ),
    code('svelte', HOME, { file: 'Шаблон Home', save: 'template:Home' }),
    list(
      c("top.find((_) => _.path === '/katalog')") +
        ': ищем среди страниц верхнего уровня ту, у которой адрес <code>/katalog</code>. Знак ' +
        c('_') +
        ' здесь просто имя для «очередной страницы».',
      c('children(catalog.id).slice(0, 3)') +
        ': первые три кухни из «Каталога». Поменяете порядок в дереве, поменяются и они.',
      c('listing(projects.id, { perPage: 2, paged: false })') +
        ': два свежих проекта. ' +
        c('paged: false') +
        ' говорит, что этот список не постраничный: у главной не появятся адреса вида <code>/page-2</code>.',
      c('kitchens[0]?.fields.photo') +
        ': фото первой кухни для обложки. Знак ' +
        c('?.') +
        ' не даёт шаблону упасть, если кухонь в каталоге пока нет.'
    ),
    p(
      'Выберите главной шаблон Home. Крупный заголовок возьмите из поля ' +
        ui('Длинный заголовок') +
        ' на вкладке ' +
        ui('Поиск и соцсети') +
        ': напишите там «Кухни по вашим размерам». Он же попадёт в заголовок вкладки браузера, а в меню сайта останется короткое «Главная».'
    ),
    shot('home', 'Главная студии на шаблоне Home'),
    aside(
      'tip',
      'Готовая лента',
      p(
        'В наборе есть и PostList: лента с картинками, датами и пейджером в одну строку. Здесь мы собрали список проектов сами, чтобы было видно, как он устроен. Для блога студии PostList сэкономит время.'
      )
    ),
    aside(
      'check',
      'Проверьте себя',
      list(
        'на <code>/katalog</code> карточки всех кухонь с ценами;',
        'на <code>/proekty</code> три работы, сверху самая новая;',
        'на главной три кухни и два последних проекта.'
      )
    ),
  ].join('\n'),
  replay: (_) => {
    _.kit('Pagination');
    _.code();
    _.edit('Каталог', { template: 'Catalog' });
    _.page({ title: 'Проекты', alias: 'proekty', template: 'Projects' });
    _PROJECTS.forEach(
      (project) =>
        void _.page({
          title: project.title,
          parent: 'Проекты',
          template: 'Base',
          introText: project.intro,
          content: `<p>${project.intro}</p>`,
        })
    );
    _.edit('Главная', {
      template: 'Home',
      longTitle: 'Кухни по вашим размерам',
    });
  },
  expect: [
    ['/katalog', 'Шалфей'],
    ['/katalog', 'Угловая · от 52\u00a0000 ₽ за метр'],
    ['/proekty', 'Кухня с островом в загородном доме'],
    ['/proekty/kuhnya-v-stalinke-na-sokole', 'Высокие потолки'],
    ['/', 'Смотреть каталог'],
    ['/', 'от 46\u00a0000 ₽ за метр'],
  ],
};

const FOOTER_2 = `<!-- @component
Подвал: название, адрес, телефон, часы шоурума и год. Контакты берутся из своих настроек сайта.
-->
<script>
  import { site } from '$core';

  let {
    /** Строка рядом с названием */
    note = 'кухни на заказ',
  } = $props();

  const { name, custom } = site();
  const tel = custom.phone.replace(/[^+\\d]/g, '');
  const year = new Date().getFullYear();
</script>

<footer class="footer">
  <p><b>{name}</b> · {note}</p>
  <p>{custom.address} · <a href={\`tel:\${tel}\`}>{custom.phone}</a></p>
  <p>{custom.hours}</p>
  <p>© {year}</p>
</footer>

<style>
  .footer {
    max-width: 48rem;
    margin: 0 auto;
    padding: 1.5rem;
    color: #6b6862;
    font-size: 0.9rem;
  }

  .footer p {
    margin: 0.25rem 0;
  }

  .footer a {
    color: inherit;
  }
</style>`;

const settings: Chapter = {
  alias: 'nastroiki',
  title: 'Свои настройки: адрес и телефон в одном месте',
  menuTitle: 'Свои настройки',
  lead: 'Телефон студии нужен в подвале, на странице контактов и рядом с формой замера. Заведём его один раз в настройках, а шаблоны и тексты будут брать его оттуда.',
  description:
    'Свои настройки сайта в Eile: значения вроде телефона и адреса, их вывод в шаблоне через site().custom и в тексте страницы через [@ключ].',
  content: [
    aside(
      'goal',
      'В этой главе',
      list(
        'заведём настройки «телефон», «адрес» и «часы шоурума»;',
        'выведем их в подвале;',
        'подставим их в текст страницы «Контакты».'
      )
    ),
    h2('zachem', 'Одно значение на весь сайт'),
    p(
      'Телефон меняется редко, но если меняется, то везде сразу. Если он вписан в пять мест, одно обязательно забудется, и клиенты будут звонить по старому номеру. Поэтому такие значения держат в одном месте, а остальные места на него ссылаются.'
    ),
    h2('zavesti', 'Завести настройки'),
    p(
      'Откройте ' +
        ui('Настройки') +
        ' → ' +
        ui('Свои настройки') +
        ' и нажмите ' +
        ui('Добавить ключ') +
        '. Добавьте три настройки:'
    ),
    list(
      '<code>phone</code>: «+7 (900) 123-45-67»;',
      '<code>address</code>: «Москва, Садовая улица, 12»;',
      '<code>hours</code>: «Шоурум открыт каждый день с 10:00 до 20:00».'
    ),
    p(
      'Ключ пишется латиницей, по нему значение найдут шаблоны. Правки в таблице сохраняются сразу.'
    ),
    h2('podval', 'В подвале'),
    p('Замените код компонента Footer:'),
    code('svelte', FOOTER_2, {
      file: 'Компонент Footer',
      save: 'component:Footer',
    }),
    list(
      c('const { name, custom } = site();') +
        ': берём из настроек сайта название и свои настройки. В ' +
        c('custom') +
        ' лежит всё, что вы завели на вкладке ' +
        ui('Свои настройки') +
        ', по ключам.',
      c("custom.phone.replace(/[^+\\d]/g, '')") +
        ': из «+7 (900) 123-45-67» остаётся «+79001234567». Такой номер понимает ссылка ' +
        c('tel:') +
        ': на телефоне по ней можно сразу позвонить.'
    ),
    aside(
      'trouble',
      'В подвале написано [@phone]',
      p(
        'Так Eile показывает настройку, которой нет. Проверьте ключ: в коде <code>phone</code>, значит, и в настройках должно быть <code>phone</code>, строчными буквами.'
      )
    ),
    h2('tekst', 'В тексте страницы'),
    p(
      'В шаблоне настройки берут через ' +
        c('site().custom') +
        ', а в тексте страницы для этого есть короткая запись: ключ в квадратных скобках с собакой. Откройте «Контакты» и напишите:'
    ),
    code(
      'html',
      `Адрес шоурума: [@address]
Телефон: [@phone]
[@hours]`,
      { file: 'Текст страницы «Контакты»' }
    ),
    p(
      'На сайте вместо ' +
        c('[@phone]') +
        ' будет номер. Поменяете номер в настройках, и он поменяется и здесь, и в подвале.'
    ),
    shot(
      'contacts',
      'Страница «Контакты»: адрес и телефон подставлены из настроек'
    ),
    aside(
      'tip',
      'Для сайтов на нескольких языках',
      p(
        'Рядом со своими настройками есть вкладка ' +
          ui('Переводы') +
          ': там один ключ хранит текст на каждом языке сайта. В тексте страницы он пишется как ' +
          c('{i18n.ключ}') +
          ', в шаблоне как ' +
          c('site.i18n.ключ') +
          '. Сайт Eile, который вы сейчас читаете, так и сделан: все подписи в нём лежат в переводах.'
      )
    ),
    aside(
      'check',
      'Проверьте себя',
      list(
        'в подвале адрес, телефон и часы шоурума;',
        'телефон в подвале открывает звонок на мобильном;',
        'на «Контактах» значения подставились из настроек.'
      )
    ),
  ].join('\n'),
  replay: (_) => {
    _.setting('phone', '+7 (900) 123-45-67');
    _.setting('address', 'Москва, Садовая улица, 12');
    _.setting('hours', 'Шоурум открыт каждый день с 10:00 до 20:00');
    _.code();
    _.edit('Контакты', {
      content:
        '<p>Адрес шоурума: [@address]<br>Телефон: [@phone]<br>[@hours]</p>',
    });
  },
  expect: [
    ['/', 'href="tel:+79001234567"'],
    ['/kontakty', 'Москва, Садовая улица, 12'],
  ],
};

export var DATA: readonly Chapter[] = [fields, lists, settings];

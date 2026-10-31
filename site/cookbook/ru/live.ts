import {
  consent,
  formSource,
  input,
  textarea,
} from '../../../src/scaffolds/form-html.ts';
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

const LAYOUT_2 = `<!-- @component
Рамка сайта: заголовок вкладки, шапка, подвал и общие стили. Шаблон кладёт внутрь свою часть.
-->
<script>
  import Footer from '$components/Footer';
  import Header from '$components/Header';
  import { site } from '$core';

  let { page, children } = $props();
</script>

<svelte:head>
  <title>{page.longTitle || page.title} — {site().name}</title>
</svelte:head>

<Header />

<main>
  {@render children()}
</main>

<Footer note="кухни по вашим размерам" />

<style>
  :global(:root) {
    --t-accent: #1f1e1c;
    --t-radius: 0.75rem;
  }

  :global(body) {
    margin: 0;
    background: #f1efeb;
    color: #1f1e1c;
    font: 18px/1.6 system-ui, sans-serif;
  }

  :global(h1) {
    font-size: 2.75rem;
    line-height: 1.05;
    letter-spacing: -0.02em;
  }

  :global(img) {
    max-width: 100%;
    height: auto;
  }

  main {
    max-width: 48rem;
    margin: 0 auto;
    padding: 0 1.5rem 2rem;
  }
</style>`;

const form: Chapter = {
  alias: 'forma',
  title: 'Форма: заявка на замер',
  menuTitle: 'Заявка на замер',
  lead: 'Посетитель оставляет имя, телефон, адрес и удобную дату, а заявка приходит в менеджер и в Telegram. Соберём форму без строчки кода и поставим её на страницу контактов.',
  description:
    'Формы и заявки в Eile: собрать форму в менеджере, поставить её на страницу, принимать заявки и получать уведомления в Telegram.',
  content: [
    aside(
      'goal',
      'В этой главе',
      list(
        'соберём заявку на замер в редакторе форм;',
        'поставим её на страницу «Контакты»;',
        'отправим пробную заявку и найдём её в менеджере;',
        'подключим уведомления в Telegram.'
      )
    ),
    h2('sobrat', 'Собрать форму'),
    steps(
      'Откройте ' +
        ui('Формы') +
        ' в шапке менеджера и нажмите ' +
        ui('Новая форма') +
        '.',
      'Название: «Заявка на замер». Имя для вставки на страницу соберётся из него латиницей само.',
      `Нажмите ${ui('Создать')}.`
    ),
    p(
      'Форма начинается с готового набора полей: имя, телефон, комментарий и согласие на обработку данных. Справа видно, как её увидит посетитель.'
    ),
    p(
      'Под полями есть блок ' +
        ui('Добавить в форму') +
        ' с кнопками видов полей. Нажмите ' +
        ui('Строка') +
        ', а потом ' +
        ui('Дата') +
        '. Щёлкните по новому полю, чтобы раскрыть его настройки:'
    ),
    list(
      'у строки подпись «Адрес» и галочка «Обязательное»: замерщику нужно знать, куда ехать;',
      'у даты подпись «Удобная дата».'
    ),
    p(
      'Поля можно переставлять стрелками: поставьте адрес и дату сразу после телефона. Согласие оставьте: сайту, который собирает имена и телефоны, нужно согласие посетителя на обработку этих данных.'
    ),
    p(
      'На вкладке ' +
        ui('После отправки') +
        ' напишите, что увидит посетитель: «Спасибо! Перезвоним в течение часа и договоримся о времени замера». Сохраните форму.'
    ),
    shot('form', 'Редактор формы «Заявка на замер» и её предпросмотр'),
    h2('postavit', 'Поставить на страницу'),
    p(
      'Откройте страницу «Контакты». Под текстом нажмите ' +
        ui('Добавить блок') +
        ', выберите ' +
        ui('Форма') +
        ' и в списке «Заявка на замер». Сохраните.'
    ),
    p(
      'В HTML страницы блок формы выглядит как тег ' +
        c('[#Form:имя-формы]') +
        '. Его можно вписать и вручную: готовый тег виден в шапке редактора формы, рядом с кнопкой, которая его копирует.'
    ),
    p(
      'Форма возьмёт цвета сайта из CSS-переменных ' +
        c('--t-accent') +
        ' и ' +
        c('--t-radius') +
        '. Зададим их в рамке, чтобы кнопка стала графитовой, как остальные кнопки сайта. Замените код компонента Layout:'
    ),
    code('svelte', LAYOUT_2, {
      file: 'Компонент Layout',
      save: 'component:Layout',
    }),
    p(
      'Новое здесь только ' +
        c(':global(:root) { … }') +
        ' в начале стилей: переменные для всей страницы.'
    ),
    h2('zayavki', 'Заявки'),
    p(
      'Откройте «Контакты» на сайте, заполните форму и отправьте. Форма работает и без JavaScript, а если он есть, отправляет заявку без перезагрузки страницы.'
    ),
    p(
      'В менеджере на конверте в шапке появится цифра 1. Щёлкните по нему: там новая заявка. В ней всё, что заполнил посетитель, страница, с которой он пришёл, и кнопки ' +
        ui('Позвонить') +
        ' и ' +
        ui('Написать') +
        '. Отметьте заявку ' +
        ui('В работе') +
        ', когда перезвоните, и ' +
        ui('Готово') +
        ', когда замер назначен.'
    ),
    aside(
      'tip',
      'Спам',
      p(
        'Капча не нужна. Форма ставит невидимую ловушку для ботов, проверяет, сколько секунд её заполняли, и ограничивает число заявок с одного адреса. Подозрительные заявки ложатся в «Спам» и уведомлений не вызывают.'
      )
    ),
    h2('telegram', 'Уведомления в Telegram'),
    steps(
      'В Telegram напишите боту <a href="https://t.me/BotFather">@BotFather</a> команду <code>/newbot</code> и придумайте имя. Он пришлёт токен: длинную строку с двоеточием.',
      'Откройте своего нового бота и напишите ему что угодно, например «привет». Без этого бот не сможет писать вам первым.',
      'В менеджере откройте ' +
        ui('Настройки') +
        ' → ' +
        ui('Уведомления') +
        ', вставьте токен и нажмите «Найти чаты». Выберите свой чат и сохраните.'
    ),
    p(
      'Отправьте с сайта ещё одну заявку: она придёт в Telegram. Туда же сайт напишет, если у него что-то сломается.'
    ),
    aside(
      'trouble',
      'Формы нет на странице',
      list(
        'Шаблон выводит текст через ' +
          c('<Content of={page} />') +
          '? С ' +
          c('{@html page.content}') +
          ' тег формы останется тегом.',
        'Страницу сохранили после того, как добавили блок?'
      )
    ),
    aside(
      'check',
      'Проверьте себя',
      list(
        'на «Контактах» форма с адресом и удобной датой;',
        'пробная заявка видна в менеджере;',
        'кнопка формы графитовая.'
      )
    ),
  ].join('\n'),
  replay: (_) => {
    _.form('zayavka-na-zamer', {
      title: 'Заявка на замер',
      source: formSource(
        input('text', 'name', 'Имя', { required: true, maxLength: 100 }),
        input('tel', 'phone', 'Телефон', { required: true }),
        input('text', 'address', 'Адрес', { required: true, maxLength: 300 }),
        input('date', 'date', 'Удобная дата'),
        textarea('comment', 'Комментарий', { maxLength: 1000 }),
        consent('consent', 'Согласен на обработку персональных данных', '')
      ),
      submitLabel: 'Записаться на замер',
      successText:
        'Спасибо! Перезвоним в течение часа и договоримся о времени замера.',
    });
    _.code();
    _.edit('Контакты', {
      content:
        '<p>Адрес шоурума: [@address]<br>Телефон: [@phone]<br>[@hours]</p>[#Form:zayavka-na-zamer]',
    });
  },
  expect: [
    ['/kontakty', 'name="address"'],
    ['/', '--t-accent'],
  ],
};

const SHOWROOM = `<!-- @component
Открыт ли шоурум: считается заново на каждый запрос по московскому времени.
-->
<script>
  let {
    /** Открываемся, час */
    opens = 10,
    /** Закрываемся, час */
    closes = 20,
  } = $props();

  const hour = Number(
    new Intl.DateTimeFormat('ru', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: 'Europe/Moscow',
    }).format(new Date())
  );
  const open = hour >= opens && hour < closes;
</script>

<p class="now" class:open>
  {#if open}
    Шоурум открыт до {closes}:00, приходите посмотреть кухни вживую
  {:else}
    Шоурум закрыт, откроемся в {opens}:00
  {/if}
</p>

<style>
  .now {
    margin: 0;
    padding: 0.55rem 1.5rem;
    background: #1f1e1c;
    color: #f1efeb;
    font-size: 0.875rem;
    text-align: center;
  }

  .open {
    background: #3d4733;
  }
</style>`;

const HEADER_2 = `<!-- @component
Шапка: открыт ли шоурум, название сайта и меню.
-->
<script>
  import Nav from '$components/Nav';
  import { site } from '$core';
  import Uncached from '$core/Uncached';
</script>

<Uncached name="Showroom" props={{ opens: 10, closes: 20 }} />

<header class="header">
  <a class="logo" href="/">{site().name}</a>
  <Nav />
</header>

<style>
  .header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    max-width: 48rem;
    margin: 0 auto;
    padding: 1.5rem;
  }

  .logo {
    color: inherit;
    font-size: 1.25rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    text-decoration: none;
  }
</style>`;

const CALC = `<!-- @component
Калькулятор: длина кухни в метрах и примерная цена. Считает прямо в браузере.
-->
<script>
  let {
    /** Цена за погонный метр, ₽ */
    price = 0,
  } = $props();

  let length = $state(3);
  const rub = new Intl.NumberFormat('ru');
</script>

<div class="calc">
  <label for="length">Длина кухни: <b>{length.toLocaleString('ru')} м</b></label>
  <input id="length" type="range" min="1.5" max="6" step="0.1" bind:value={length} />
  <p>Примерно <b>{rub.format(Math.round(price * length))} ₽</b> без техники и сборки</p>
</div>

<style>
  .calc {
    display: grid;
    gap: 0.6rem;
    margin: 1.5rem 0;
    padding: 1.25rem 1.4rem;
    border-radius: 1.25rem;
    background: #fff;
  }

  input {
    width: 100%;
    accent-color: #1f1e1c;
  }

  p {
    margin: 0;
  }
</style>`;

const KITCHEN_2 = `<script>
  import Content from '$core/Content';
  import Island from '$core/Island';
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

  {#if price}
    <Island name="Calc" props={{ price }} />
  {/if}

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

const live: Chapter = {
  alias: 'zhivye-chasti',
  title: 'Живые части: «шоурум открыт» и калькулятор кухни',
  menuTitle: 'Живые части',
  lead: 'Страницы Eile готовятся один раз и отдаются из памяти мгновенно. Но кое-что должно меняться: открыт ли шоурум прямо сейчас, сколько будет стоить кухня длиной 3,4 метра. Для этого есть некэшируемые регионы и острова.',
  description:
    'Кэш страниц в Eile, некэшируемые регионы Uncached для того, что меняется на каждый запрос, и острова Island для интерактива в браузере.',
  content: [
    aside(
      'goal',
      'В этой главе',
      list(
        'разберёмся, как Eile ускоряет сайт кэшем;',
        'сделаем полоску «Шоурум открыт», которая считается заново на каждый запрос;',
        'сделаем калькулятор стоимости, который работает прямо в браузере.'
      )
    ),
    h2('kesh', 'Как работает кэш'),
    p(
      'Когда посетитель впервые открывает страницу, Eile собирает её по шаблону и запоминает готовый HTML. Следующие посетители получают его из памяти за доли миллисекунды. Как только вы поправите страницу или шаблон, запомненное сбрасывается, и страница соберётся заново.',
      'Это хорошо для всего, что меняется от правки к правке. А полоска «Шоурум открыт» меняется сама, по часам. Запомни её Eile в десять утра, она бы весь день показывала то, что было в десять.'
    ),
    h2('region', 'Некэшируемый регион'),
    p(
      'Для таких мест есть регион: кусок страницы, который собирается заново на каждый запрос, а всё вокруг него по-прежнему берётся из памяти. Сделаем компонент <code>Showroom</code>:'
    ),
    code('svelte', SHOWROOM, {
      file: 'Компонент Showroom',
      save: 'component:Showroom',
    }),
    list(
      c('new Date()') +
        ': текущий момент. ' +
        c('Intl.DateTimeFormat') +
        ' с ' +
        c("timeZone: 'Europe/Moscow'") +
        ' переводит его в час по Москве, где бы ни стоял сервер.',
      c('class:open') +
        ': добавляет класс <code>open</code>, когда шоурум открыт. Так у полоски меняется цвет.'
    ),
    p('Теперь поставим полоску в шапку как регион. Замените код Header:'),
    code('svelte', HEADER_2, {
      file: 'Компонент Header',
      save: 'component:Header',
    }),
    p(
      c('<Uncached name="Showroom" …/>') +
        ' говорит: «этот компонент не запоминай, рисуй каждый раз». Параметры передаются в ' +
        c('props') +
        '.'
    ),
    aside(
      'tip',
      'Как проверить',
      p(
        'Поменяйте в шапке ' +
          c('closes: 20') +
          ' на час, который уже прошёл, сохраните и обновите сайт. Полоска скажет, что шоурум закрыт. Верните как было.'
      )
    ),
    h2('ostrov', 'Остров: калькулятор кухни'),
    p(
      'Регион собирается на сервере. А калькулятор должен отзываться на ползунок без перезагрузки, то есть работать в браузере. Для этого есть острова: компонент, который сервер рисует как обычно, а браузер потом оживляет. JavaScript попадает только на те страницы, где остров есть. Остальной сайт остаётся без единого скрипта.'
    ),
    p('Компонент <code>Calc</code>:'),
    code('svelte', CALC, { file: 'Компонент Calc', save: 'component:Calc' }),
    list(
      c('let length = $state(3);') +
        ': состояние, число, которое может меняться. Сначала кухня длиной три метра.',
      c('bind:value={length}') +
        ': связывает ползунок и переменную в обе стороны. Двигаете ползунок, меняется <code>length</code>, а за ним всё, что от неё зависит.',
      c('{rub.format(Math.round(price * length))}') +
        ': цена пересчитывается при каждом движении ползунка.'
    ),
    p('Поставим остров на страницу кухни. Замените код шаблона Kitchen:'),
    code('svelte', KITCHEN_2, {
      file: 'Шаблон Kitchen',
      save: 'template:Kitchen',
    }),
    p(
      c('<Island name="Calc" props={{ price }} />') +
        ': цена уходит острову параметром. Острову недоступен ' +
        c('$core') +
        ': он живёт в браузере, где нет базы сайта. Всё нужное передавайте через ' +
        c('props') +
        '.'
    ),
    shot('calc', 'Страница кухни с калькулятором стоимости'),
    aside(
      'trouble',
      'Менеджер не сохраняет остров',
      p(
        'Скорее всего, в нём есть ' +
          c("import … from '$core'") +
          '. Уберите импорт и передайте данные параметром.'
      )
    ),
    aside(
      'check',
      'Проверьте себя',
      list(
        'над шапкой полоска «Шоурум открыт» или «Шоурум закрыт»;',
        'на странице кухни ползунок меняет длину и цену;',
        'на главной в коде страницы нет ни одного ' +
          c('<script>') +
          ' кроме разметки для поисковиков.'
      )
    ),
  ].join('\n'),
  expect: [
    ['/', 'Шоурум'],
    ['/katalog/kashemir', 'cms-island'],
  ],
};

export var LIVE: readonly Chapter[] = [form, live];

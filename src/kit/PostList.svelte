<!-- @component
Лента постов: дети раздела порциями — картинка, дата, заголовок и анонс, ниже пейджер. Порции живут по
адресам /раздел/page-2, /раздел/page-3.
-->
<script lang="ts">
import Pagination from '$components/Pagination';
import { current, image, link, listing, site } from '$core';

let {
  /** Раздел с постами: id страницы; пусто — текущая */
  parent = null,
  /** Постов в порции */
  perPage = 10,
  /** Порядок: published=Сначала новые, created=По дате создания, title=По алфавиту, menu=Как в меню */
  sort = 'published',
  /** Вид: list=Списком, grid=Плиткой */
  layout = 'list',
  /** Поле с картинкой поста; пусто или не задано — картинка для соцсетей */
  imageField = 'cover',
  /** Показывать анонс */
  intro = true,
  /** Текст, если постов нет */
  empty = 'Пока ничего нет.',
}: {
  parent?: number | null;
  perPage?: number;
  sort?: 'published' | 'created' | 'title' | 'menu';
  layout?: 'list' | 'grid';
  imageField?: string;
  intro?: boolean;
  empty?: string;
} = $props();

const here = current();
const list = $derived(listing(parent ?? here?.id ?? null, { perPage, sort }));
const language = here?.language || site().language;
// Дата в UTC: одна и та же на сервере в любом поясе.
const dates = new Intl.DateTimeFormat(language, {
  dateStyle: 'long',
  timeZone: 'UTC',
});

type Item = (typeof list.items)[number];

const cover = (item: Item) =>
  ((path) => (typeof path === 'string' && path ? image(path) : null))(
    item.fields[imageField] || item.socialImage
  );
const when = (item: Item): string | null => item.publishedAt ?? null;
</script>

{#if list.items.length === 0}
  <p class="empty">{empty}</p>
{:else}
  <div class="posts {layout}">
    {#each list.items as item (item.id)}
      {@const picture = cover(item)}
      {@const date = when(item)}
      <article class="post">
        {#if picture}
          <img
            src={picture.src}
            srcset={picture.srcset || undefined}
            sizes={layout === 'grid' ? '(min-width: 48rem) 33vw, 100vw' : '(min-width: 48rem) 16rem, 100vw'}
            width={picture.width}
            height={picture.height}
            alt={picture.alt}
            loading="lazy"
            decoding="async"
          />
        {/if}
        <div class="text">
          {#if date}<time datetime={date}>{dates.format(new Date(date))}</time>{/if}
          <h2><a href={link(item.id)}>{item.longTitle || item.title}</a></h2>
          {#if intro && (item.introText || item.description)}
            <p>{item.introText || item.description}</p>
          {/if}
        </div>
      </article>
    {/each}
  </div>
  <Pagination
    items={list.pager(1)}
    prev={list.number > 1 ? list.url(list.number - 1) : null}
    next={list.number < list.pages ? list.url(list.number + 1) : null}
  />
{/if}

<style>
  .posts {
    display: grid;
    gap: var(--t-gap, 1.5rem);
  }

  .grid {
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  }

  .post {
    position: relative;
    display: grid;
    gap: 1rem;
  }

  .list .post {
    grid-template-columns: minmax(0, 16rem) 1fr;
    align-items: start;
  }

  .list .post:not(:has(img)) {
    grid-template-columns: 1fr;
  }

  img {
    width: 100%;
    height: auto;
    aspect-ratio: 16 / 10;
    object-fit: cover;
    border-radius: var(--t-radius, 0.375rem);
    background: var(--t-hover, #f1f4f8);
  }

  time {
    color: var(--t-muted, #5b6472);
    font-size: 0.875em;
  }

  h2 {
    margin: 0.25rem 0 0.5rem;
    font-size: 1.25em;
    line-height: 1.3;
  }

  /* Одна ссылка на карточку, но кликается вся карточка. */
  h2 a {
    color: var(--t-text, #1d2430);
    text-decoration: none;
  }

  h2 a::after {
    content: '';
    position: absolute;
    inset: 0;
  }

  .post:hover h2 a {
    color: var(--t-accent, #2f6fde);
  }

  h2 a:focus-visible {
    outline: none;
  }

  .post:has(a:focus-visible) {
    outline: 0.125rem solid var(--t-accent, #2f6fde);
    outline-offset: 0.375rem;
    border-radius: var(--t-radius, 0.375rem);
  }

  p {
    margin: 0;
    color: var(--t-muted, #5b6472);
  }

  .empty {
    color: var(--t-muted, #5b6472);
  }

  @media (max-width: 40rem) {
    .list .post {
      grid-template-columns: 1fr;
    }
  }
</style>

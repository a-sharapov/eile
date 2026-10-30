<script>
import Cover from '$components/Cover';
import Layout from '$components/Layout';
import NextWork from '$components/NextWork';
import { link } from '$core';
import Content from '$core/Content';

let { page } = $props();

const facts = $derived(
  [
    ['Клиент', page.fields.client],
    ['Год', page.fields.year],
    ['Роль', page.fields.role],
  ].filter((_) => _[1])
);
const url = $derived(page.fields.url || '');
const host = $derived(
  url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
);
</script>

<Layout {page}>
  <article>
    <header>
      {#if page.parentId}
        <a class="back" href={link(page.parentId)}>← Все работы</a>
      {/if}
      <h1>{page.longTitle || page.title}</h1>
      {#if page.introText}<p class="lead">{page.introText}</p>{/if}
    </header>
    <Cover work={page} shape="wide" sizes="(min-width: 90rem) 90rem, 100vw" />
    <div class="body">
      {#if facts.length > 0 || url}
        <dl class="facts">
          {#each facts as fact (fact[0])}
            <div><dt>{fact[0]}</dt><dd>{fact[1]}</dd></div>
          {/each}
          {#if url}
            <div><dt>Ссылка</dt><dd><a href={url} rel="noopener">{host}</a></dd></div>
          {/if}
        </dl>
      {/if}
      <div class="prose"><Content of={page} /></div>
    </div>
    <NextWork />
  </article>
</Layout>

<style>
  .back {
    display: inline-block;
    margin-bottom: 1.5rem;
    color: var(--t-muted);
    font-size: 0.9375rem;
    text-decoration: none;
  }

  h1 {
    max-width: 18ch;
    margin: 0;
    font-size: clamp(2.5rem, 1.2rem + 5.4vw, 5.5rem);
    font-weight: 750;
    line-height: 0.98;
    letter-spacing: -0.04em;
    text-wrap: balance;
  }

  .lead {
    max-width: 36rem;
    margin: 1.5rem 0 0;
    font-size: clamp(1.125rem, 1rem + 0.5vw, 1.375rem);
    line-height: 1.45;
  }

  header {
    margin-bottom: clamp(2.5rem, 6vw, 4rem);
  }

  /* Справа текст, слева — факты о работе; на телефоне — друг под другом. */
  .body {
    display: grid;
    grid-template-columns: minmax(12rem, 1fr) minmax(0, 2.4fr);
    gap: 2rem clamp(2rem, 6vw, 6rem);
    margin-top: clamp(2.5rem, 6vw, 4.5rem);
  }

  .body .prose {
    font-size: 1.125rem;
  }

  .body .prose > :global(:first-child) {
    margin-top: 0;
  }

  .facts {
    display: grid;
    align-content: start;
    gap: 1.25rem;
    margin: 0;
  }

  dt {
    color: var(--t-muted);
    font-size: 0.875rem;
  }

  dd {
    margin: 0.125rem 0 0;
    font-weight: 600;
  }

  @media (max-width: 48rem) {
    .body {
      grid-template-columns: 1fr;
    }

    .facts {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>

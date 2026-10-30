<script>
import Layout from '$components/Layout';
import PostMeta from '$components/PostMeta';
import PostNav from '$components/PostNav';
import { image, link } from '$core';
import Content from '$core/Content';

let { page } = $props();

const cover = $derived(page.fields.cover ? image(page.fields.cover) : null);
</script>

<Layout {page}>
  <article>
    <header>
      {#if page.parentId}
        <a class="section" href={link(page.parentId)}>← Все записи</a>
      {/if}
      <h1>{page.longTitle || page.title}</h1>
      <PostMeta />
    </header>
    {#if cover}
      <img
        class="cover"
        src={cover.src}
        srcset={cover.srcset || undefined}
        sizes="(min-width: 42rem) 40rem, 100vw"
        width={cover.width}
        height={cover.height}
        alt={cover.alt}
      />
    {/if}
    <div class="prose"><Content of={page} /></div>
    <PostNav />
  </article>
</Layout>

<style>
  .section {
    display: inline-block;
    margin-bottom: 1.5rem;
    color: var(--t-muted);
    font: 0.875rem system-ui, sans-serif;
    text-decoration: none;
  }

  .section:hover {
    color: var(--t-accent);
  }

  h1 {
    margin: 0 0 0.75rem;
    font-size: clamp(2rem, 1.4rem + 2.4vw, 2.75rem);
    line-height: 1.12;
    letter-spacing: -0.02em;
    text-wrap: balance;
  }

  header {
    margin-bottom: 2rem;
  }

  header :global(.meta) {
    font-family: system-ui, sans-serif;
  }

  .cover {
    display: block;
    width: 100%;
    height: auto;
    margin: 0 0 2.5rem;
    border-radius: 0.25rem;
  }
</style>

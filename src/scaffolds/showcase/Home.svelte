<script>
import Layout from '$components/Layout';
import { link, site } from '$core';
import Content from '$core/Content';

let { page } = $props();

const catalog = link(Number(site().custom.catalog));
</script>

<Layout {page}>
  <section class="hero">
    <h1>{page.longTitle || page.title}</h1>
    {#if page.introText}<p class="lead">{page.introText}</p>{/if}
    {#if catalog}<a class="button" href={catalog}>Смотреть каталог</a>{/if}
  </section>
  <div class="blocks"><Content of={page} /></div>
</Layout>

<style>
  .hero {
    display: grid;
    justify-items: start;
    gap: 1.5rem;
    max-width: 52rem;
    padding: 2.5rem 0 5rem;
  }

  h1 {
    margin: 0;
    font-size: clamp(2.5rem, 1.6rem + 3.8vw, 4.5rem);
    line-height: 1.02;
    letter-spacing: -0.025em;
  }

  .lead {
    max-width: 36rem;
    margin: 0;
    color: var(--t-muted);
    font-size: 1.25rem;
    line-height: 1.5;
  }

  .button {
    display: inline-flex;
    align-items: center;
    min-height: 3rem;
    padding: 0 1.5rem;
    border-radius: 999rem;
    background: var(--t-accent);
    color: var(--t-on-accent);
    font-weight: 600;
    text-decoration: none;
    transition: background 160ms ease-out;
  }

  .button:hover {
    background: color-mix(in oklab, var(--t-accent) 85%, #000);
  }

  .blocks :global(.sections),
  .blocks :global(.products) {
    margin-bottom: 4.5rem;
  }

  .blocks > :global(p) {
    max-width: 40rem;
  }

  .blocks > :global(h2) {
    margin: 0 0 1rem;
    font-size: 1.5rem;
  }
</style>

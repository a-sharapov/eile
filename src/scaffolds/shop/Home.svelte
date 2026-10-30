<script>
import Layout from '$components/Layout';
import { link, site } from '$core';
import Content from '$core/Content';

let { page } = $props();

const catalog = link(Number(site().custom.catalog));
</script>

<Layout {page}>
  <section class="hero">
    <div class="text">
      <h1>{page.longTitle || page.title}</h1>
      {#if page.introText}<p class="lead">{page.introText}</p>{/if}
      {#if catalog}<a class="button" href={catalog}>Выбрать чай</a>{/if}
    </div>
  </section>
  <div class="blocks"><Content of={page} /></div>
</Layout>

<style>
  .hero {
    margin: 0 0 4rem;
    padding: clamp(2.5rem, 6vw, 5rem) clamp(1.5rem, 5vw, 4.5rem);
    border-radius: 0.75rem;
    background:
      radial-gradient(60rem 30rem at 100% 0%, #2d6a50 0%, transparent 60%),
      var(--green-deep, #133426);
    color: #ffffff;
  }

  .text {
    display: grid;
    justify-items: start;
    gap: 1.25rem;
    max-width: 40rem;
  }

  h1 {
    margin: 0;
    font-size: clamp(2.25rem, 1.5rem + 3.2vw, 4rem);
    line-height: 1.02;
    letter-spacing: -0.035em;
  }

  .lead {
    margin: 0;
    color: #d4e3da;
    font-size: 1.1875rem;
    line-height: 1.5;
  }

  .button {
    display: inline-flex;
    align-items: center;
    min-height: 3rem;
    margin-top: 0.5rem;
    padding: 0 1.5rem;
    border-radius: var(--t-radius);
    background: #f0e3c2;
    color: #2b230c;
    font-weight: 700;
    text-decoration: none;
    transition: background 160ms ease-out;
  }

  .button:hover {
    background: #f7eedb;
  }

  .button:focus-visible {
    outline-color: #ffffff;
  }

  .blocks :global(.sections),
  .blocks :global(.products) {
    margin-bottom: 4rem;
  }

  .blocks > :global(h2) {
    margin: 0 0 1rem;
    font-size: 1.5rem;
  }

  .blocks > :global(ol) {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 1.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
    counter-reset: step;
  }

  .blocks > :global(ol li) {
    counter-increment: step;
    padding-top: 1rem;
    border-top: 0.125rem solid var(--t-accent);
  }

  .blocks > :global(ol li::before) {
    content: counter(step);
    display: block;
    margin-bottom: 0.25rem;
    color: var(--t-accent);
    font-size: 1.75rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
</style>

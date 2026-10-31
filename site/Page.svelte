<!-- Обычная страница: заголовок и текст. На ней стоит и страница 404. -->
<script lang="ts">
import Layout from '$components/Layout';
import Content from '$core/Content';

let { page } = $props();
</script>

<Layout {page}>
  <article class="page">
    <h1>{page.longTitle || page.title}</h1>
    {#if page.introText}<p class="lead">{page.introText}</p>{/if}
    <div class="text"><Content of={page} /></div>
  </article>
</Layout>

<style>
  .page {
    width: min(100% - 2 * var(--gutter), 42rem);
    margin: 0 auto;
    padding: clamp(4rem, 2rem + 6vw, 7rem) 0 0;
  }

  h1 {
    margin: 0;
    font: 700 clamp(2.25rem, 1.5rem + 3vw, 3.75rem) / 1.04 var(--display);
    font-variation-settings: 'SHRP' 100;
    letter-spacing: -0.035em;
    text-wrap: balance;
  }

  .lead {
    margin: 1.25rem 0 0;
    color: var(--muted);
    font-size: 1.25rem;
  }

  .text {
    margin-top: 2rem;
  }

  .text :global(p) {
    margin: 0 0 1rem;
  }

  .text :global(a) {
    font-weight: 600;
  }
</style>

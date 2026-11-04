<script lang="ts">
import Layout from '$components/Layout';
import Content from '$core/Content';

let { page } = $props();
</script>

<Layout {page}>
  <!-- Rechtstexte und schlichte Seiten: keine Bühne, nur gut lesbarer Text. -->
  <article class="container text">
    <h1>{page.longTitle || page.title}</h1>
    <span class="rule" aria-hidden="true"></span>
    {#if page.introText}<p class="lead">{page.introText}</p>{/if}
    <div class="prose"><Content of={page} /></div>
  </article>
</Layout>

<style>
  .text {
    padding-top: clamp(3rem, 2rem + 3vw, 5rem);
  }

  h1 {
    max-width: 22ch;
    margin: 0;
    font-size: clamp(2.125rem, 1.6rem + 2vw, 3.25rem);
    line-height: 1.08;
  }

  .lead {
    max-width: 40rem;
    color: var(--ink-2);
    font-size: 1.1875rem;
  }

  .prose {
    max-width: 46rem;
  }

  .prose :global(> :first-child) {
    margin-top: 0;
  }

  .prose :global(h2) {
    font-size: clamp(1.5rem, 1.3rem + 0.8vw, 2rem);
  }
</style>

<script>
import Layout from '$components/Layout';
import Content from '$core/Content';

let { page } = $props();
</script>

<Layout {page}>
  <h1>{page.longTitle || page.title}</h1>
  <div class="prose"><Content of={page} /></div>
</Layout>

<style>
  h1 {
    max-width: 16ch;
    margin: 0 0 clamp(2rem, 5vw, 3.5rem);
    font-size: clamp(2.5rem, 1.1rem + 6vw, 6rem);
    font-weight: 750;
    line-height: 0.98;
    letter-spacing: -0.04em;
    text-wrap: balance;
  }

  .prose {
    font-size: clamp(1.0625rem, 0.95rem + 0.5vw, 1.25rem);
  }

  .prose > :global(p:last-of-type) {
    margin-bottom: clamp(3.5rem, 9vw, 7rem);
  }
</style>

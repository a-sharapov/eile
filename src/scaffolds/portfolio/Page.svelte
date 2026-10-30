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
    max-width: 18ch;
    margin: 0 0 clamp(2rem, 5vw, 3rem);
    font-size: clamp(2.5rem, 1.4rem + 4.6vw, 5rem);
    font-weight: 750;
    line-height: 1;
    letter-spacing: -0.04em;
    text-wrap: balance;
  }

  .prose {
    font-size: 1.125rem;
  }
</style>

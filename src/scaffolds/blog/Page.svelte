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
    margin: 0 0 1.5rem;
    font-size: clamp(2rem, 1.4rem + 2.4vw, 2.75rem);
    line-height: 1.12;
    letter-spacing: -0.02em;
    text-wrap: balance;
  }
</style>

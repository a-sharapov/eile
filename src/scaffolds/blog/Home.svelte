<script>
import Layout from '$components/Layout';
import Content from '$core/Content';

let { page } = $props();
</script>

<Layout {page}>
  <h1>{page.longTitle || page.title}</h1>
  <div class="prose lead"><Content of={page} /></div>
</Layout>

<style>
  h1 {
    margin: 0 0 1.5rem;
    font-size: clamp(2.25rem, 1.5rem + 3vw, 3.25rem);
    line-height: 1.08;
    letter-spacing: -0.025em;
    text-wrap: balance;
  }

  .lead {
    font-size: 1.25rem;
  }
</style>

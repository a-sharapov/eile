<script>
import Breadcrumbs from '$components/Breadcrumbs';
import Layout from '$components/Layout';
import Content from '$core/Content';

let { page } = $props();
</script>

<Layout {page}>
  <Breadcrumbs />
  <h1>{page.longTitle || page.title}</h1>
  <div class="prose"><Content of={page} /></div>
</Layout>

<style>
  h1 {
    margin: 1rem 0 1.5rem;
    font-size: clamp(2rem, 1.5rem + 2vw, 2.75rem);
    line-height: 1.1;
  }
</style>

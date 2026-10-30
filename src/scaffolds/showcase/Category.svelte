<script>
import Breadcrumbs from '$components/Breadcrumbs';
import Layout from '$components/Layout';
import ProductGrid from '$components/ProductGrid';
import Content from '$core/Content';

let { page } = $props();
</script>

<Layout {page}>
  <Breadcrumbs />
  <h1>{page.longTitle || page.title}</h1>
  <div class="prose intro"><Content of={page} /></div>
  <ProductGrid perPage={12} columns={3} unavailable="Под заказ" />
</Layout>

<style>
  h1 {
    margin: 1rem 0 0.75rem;
    font-size: clamp(2.125rem, 1.5rem + 2.4vw, 3.25rem);
    line-height: 1.08;
  }

  .intro {
    margin-bottom: 2.5rem;
    color: var(--t-muted);
  }
</style>

<script>
import Breadcrumbs from '$components/Breadcrumbs';
import CategoryList from '$components/CategoryList';
import Layout from '$components/Layout';
import ProductGrid from '$components/ProductGrid';
import Content from '$core/Content';

let { page } = $props();
</script>

<Layout {page}>
  <Breadcrumbs />
  <h1>{page.longTitle || page.title}</h1>
  <div class="prose intro"><Content of={page} /></div>
  <CategoryList />
  <ProductGrid depth={2} perPage={100} columns={4} title="Весь чай" />
</Layout>

<style>
  h1 {
    margin: 1rem 0 0.5rem;
    font-size: clamp(2rem, 1.5rem + 2vw, 2.75rem);
    line-height: 1.1;
  }

  .intro {
    margin-bottom: 2rem;
    color: var(--t-muted);
  }
</style>

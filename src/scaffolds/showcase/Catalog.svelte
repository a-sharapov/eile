<script>
import Breadcrumbs from '$components/Breadcrumbs';
import CategoryList from '$components/CategoryList';
import Layout from '$components/Layout';
import Content from '$core/Content';

let { page } = $props();
</script>

<Layout {page}>
  <Breadcrumbs />
  <h1>{page.longTitle || page.title}</h1>
  <div class="prose intro"><Content of={page} /></div>
  <CategoryList />
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

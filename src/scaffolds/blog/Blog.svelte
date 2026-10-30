<script>
import Layout from '$components/Layout';
import PostList from '$components/PostList';
import Content from '$core/Content';

let { page } = $props();
</script>

<Layout {page}>
  <h1>{page.longTitle || page.title}</h1>
  <div class="prose intro"><Content of={page} /></div>
  <PostList perPage={6} empty="Записей пока нет." />
</Layout>

<style>
  h1 {
    margin: 0 0 1rem;
    font-size: clamp(2rem, 1.4rem + 2.4vw, 2.75rem);
    line-height: 1.12;
    letter-spacing: -0.02em;
  }

  .intro {
    margin-bottom: 3rem;
    color: var(--t-muted);
  }
</style>

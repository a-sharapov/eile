<script>
import Layout from '$components/Layout';
import PageHead from '$components/PageHead';
import PostList from '$components/PostList';
import Content from '$core/Content';

let { page } = $props();
</script>

<Layout {page}>
  <PageHead title={page.longTitle || page.title} lead={page.introText} />
  <div class="wrap">
    <div class="prose"><Content of={page} /></div>
    <PostList perPage={6} empty="Новостей пока нет." />
  </div>
</Layout>

<style>
  .wrap {
    width: var(--page);
    margin: 3.5rem auto 0;
  }

  .wrap > :global(*) {
    max-width: 48rem;
  }

  .wrap :global(.posts h2) {
    font-size: 1.375rem;
    letter-spacing: -0.015em;
  }
</style>

<script>
import Layout from '$components/Layout';
import PageHead from '$components/PageHead';
import PostMeta from '$components/PostMeta';
import { link } from '$core';
import Content from '$core/Content';

let { page } = $props();
</script>

<Layout {page}>
  <PageHead title={page.longTitle || page.title} lead={page.introText} />
  <article class="wrap">
    <PostMeta />
    <div class="prose"><Content of={page} /></div>
    {#if page.parentId && link(page.parentId)}
      <a class="back" href={link(page.parentId)}>← Все новости</a>
    {/if}
  </article>
</Layout>

<style>
  .wrap {
    width: var(--page);
    margin: 2.5rem auto 0;
  }

  .wrap > :global(*) {
    max-width: 44rem;
  }

  .back {
    display: inline-block;
    margin-top: 2.5rem;
    font-weight: 600;
    text-decoration: none;
  }

  .back:hover {
    text-decoration: underline;
  }
</style>

<script>
import Layout from '$components/Layout';
import PageHead from '$components/PageHead';
import Content from '$core/Content';

let { page } = $props();
</script>

<Layout {page}>
  <PageHead title={page.longTitle || page.title} lead={page.introText} />
  <div class="wrap prose"><Content of={page} /></div>
</Layout>

<style>
  .wrap {
    width: var(--page);
    margin: 3.5rem auto 0;
  }
</style>

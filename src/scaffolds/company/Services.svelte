<script>
import Layout from '$components/Layout';
import PageHead from '$components/PageHead';
import ServiceRows from '$components/ServiceRows';
import Content from '$core/Content';

let { page } = $props();
</script>

<Layout {page}>
  <PageHead title={page.longTitle || page.title} lead={page.introText} />
  <div class="wrap">
    <ServiceRows />
    <div class="prose note"><Content of={page} /></div>
  </div>
</Layout>

<style>
  .wrap {
    width: var(--page);
    margin: 3.5rem auto 0;
  }

  .note {
    margin-top: 3rem;
  }
</style>

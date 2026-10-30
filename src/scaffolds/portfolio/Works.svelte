<script>
import Layout from '$components/Layout';
import WorkGrid from '$components/WorkGrid';
import Content from '$core/Content';

let { page } = $props();
</script>

<Layout {page}>
  <h1>{page.longTitle || page.title}</h1>
  <div class="prose intro"><Content of={page} /></div>
  <WorkGrid />
</Layout>

<style>
  h1 {
    margin: 0 0 1.25rem;
    font-size: clamp(2.5rem, 1.4rem + 4.6vw, 5rem);
    font-weight: 750;
    line-height: 1;
    letter-spacing: -0.04em;
  }

  .intro {
    margin-bottom: clamp(3rem, 7vw, 5rem);
    color: var(--t-muted);
    font-size: 1.125rem;
  }
</style>

<script lang="ts">
import KitchenGrid from '$components/KitchenGrid';
import Layout from '$components/Layout';
import PageHead from '$components/PageHead';
import VisitBand from '$components/VisitBand';
import Content from '$core/Content';

let { page } = $props();
</script>

<Layout {page}>
  <PageHead title={page.longTitle || page.title} lead={page.introText} />
  <div class="container body">
    <div class="prose"><Content of={page} /></div>
    <h2 class="grid-title">Beispiele aus der Ausstellung</h2>
    <span class="rule" aria-hidden="true"></span>
    <KitchenGrid parent={page.id} />
  </div>
  <VisitBand />
</Layout>

<style>
  .body {
    margin-top: clamp(3rem, 2rem + 3vw, 5rem);
  }

  .prose :global(> :first-child) {
    margin-top: 0;
  }

  .grid-title {
    margin: 4rem 0 0;
    font-size: clamp(1.75rem, 1.35rem + 1.4vw, 2.5rem);
  }
</style>

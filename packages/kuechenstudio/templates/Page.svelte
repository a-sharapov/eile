<script lang="ts">
import Layout from '$components/Layout';
import PageHead from '$components/PageHead';
import Picture from '$components/Picture';
import VisitBand from '$components/VisitBand';
import Content from '$core/Content';

let { page } = $props();

const MOTIFS = [
  'zeile',
  'grifflos',
  'landhaus',
  'insel',
  'kompakt',
  'laden',
  'luecke',
];
const photo = $derived(
  typeof page.fields.photo === 'string' ? page.fields.photo : ''
);
const motif = $derived(
  typeof page.fields.sketch === 'string' && MOTIFS.includes(page.fields.sketch)
    ? page.fields.sketch
    : ''
);
// Ein Foto oder eine bewusst gewählte Zeichnung; sonst bleibt der Platz für Besucher leer.
const pictured = $derived(photo !== '' || motif !== '');
</script>

<Layout {page}>
  <PageHead title={page.longTitle || page.title} lead={page.introText} />
  <div class="container body" class:pictured>
    <div class="prose"><Content of={page} /></div>
    <div class="aside">
      <Picture path={photo} focus={page.fields.photoFocus} motif={(motif || 'laden') as 'laden'} shape="tall" collapse={!pictured} sizes="(min-width: 60rem) 26rem, min(32rem, 100vw - 2.5rem)" />
    </div>
  </div>
  {#if page.fields.visitBand === true}<VisitBand />{/if}
</Layout>

<style>
  .body {
    margin-top: clamp(3rem, 2rem + 3vw, 5rem);
  }

  .pictured,
  :global(body:has(> script[data-eile-bar])) .body {
    display: grid;
    grid-template-columns: minmax(0, 42rem) minmax(0, 26rem);
    justify-content: space-between;
    align-items: start;
    gap: 2.5rem 4rem;
  }

  .aside {
    position: sticky;
    top: 7rem;
  }

  .body:not(.pictured) .aside {
    position: static;
  }

  .prose :global(> :first-child) {
    margin-top: 0;
  }

  @media (max-width: 60rem) {
    .pictured,
    :global(body:has(> script[data-eile-bar])) .body {
      grid-template-columns: minmax(0, 1fr);
    }

    .aside {
      position: static;
      order: -1;
      max-width: 32rem;
    }
  }
</style>

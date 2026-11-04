<script lang="ts">
import KitchenGrid from '$components/KitchenGrid';
import Layout from '$components/Layout';
import PageHead from '$components/PageHead';
import Picture from '$components/Picture';
import Studio, { filled, pageLink } from '$components/Studio';
import VisitBand from '$components/VisitBand';
import { link } from '$core';
import Content from '$core/Content';

let { page } = $props();

const MOTIFS = ['zeile', 'grifflos', 'landhaus', 'insel', 'kompakt'];
const text = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';
const motif = $derived(
  (MOTIFS.includes(text(page.fields.sketch))
    ? text(page.fields.sketch)
    : 'zeile') as 'zeile'
);
const more = $derived(
  [text(page.fields.photo2), text(page.fields.photo3)].filter(Boolean)
);
const parent = $derived(page.parentId ? link(page.parentId) : null);
const contact = pageLink('contactPage');
const front = $derived(text(page.fields.front));
const worktop = $derived(text(page.fields.worktop));
</script>

<Layout {page}>
  <PageHead title={page.longTitle || page.title} lead={page.introText}>
    {#if parent}<p class="back"><a href={parent}>Alle Küchen</a></p>{/if}
  </PageHead>
  <div class="container body">
    <div class="gallery" class:single={more.length === 0}>
      <Picture path={text(page.fields.photo)} focus={page.fields.photoFocus} {motif} shape={more.length === 0 ? 'wide' : 'photo'} sizes={more.length === 0 ? '(min-width: 75rem) 75rem, calc(100vw - 4rem)' : '(min-width: 75rem) 50rem, (min-width: 56rem) 66vw, calc(100vw - 2.5rem)'} first />
      {#each more as path (path)}
        <Picture {path} {motif} shape="photo" sizes="(min-width: 56rem) 24rem, 100vw" />
      {/each}
    </div>
    <div class="details">
      <div class="prose"><Content of={page} /></div>
      {#if front || worktop || contact}
        <aside class="spec" aria-label="Angaben zur Küche">
          <dl>
            {#if front}<div hidden={!filled(front)} data-owner={filled(front) ? undefined : ''}><dt>Front</dt><dd><Studio value={front} /></dd></div>{/if}
            {#if worktop}<div hidden={!filled(worktop)} data-owner={filled(worktop) ? undefined : ''}><dt>Arbeitsplatte</dt><dd><Studio value={worktop} /></dd></div>{/if}
          </dl>
          {#if contact}<a class="pill" href="{contact}#form-termin">Beratungstermin anfragen</a>{/if}
        </aside>
      {/if}
    </div>
  </div>
  {#if page.parentId}
    <section class="container more" aria-labelledby="more-title">
      <h2 id="more-title">Weitere Küchen</h2>
      <span class="rule" aria-hidden="true"></span>
      <KitchenGrid parent={page.parentId} except={page.id} count={3} layout="cards" />
    </section>
  {/if}
  <VisitBand />
</Layout>

<style>
  .back {
    margin: 1.25rem 0 0;
    font-weight: 600;
  }

  .body {
    margin-top: clamp(3rem, 2rem + 3vw, 5rem);
  }

  .gallery {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    gap: 1.25rem;
  }

  .gallery > :global(:first-child) {
    grid-row: span 2;
  }

  .single {
    grid-template-columns: minmax(0, 1fr);
  }

  .details {
    display: grid;
    grid-template-columns: minmax(0, 42rem) minmax(0, 21rem);
    justify-content: space-between;
    gap: 2rem 4rem;
    margin-top: 3.5rem;
  }

  .prose :global(> :first-child) {
    margin-top: 0;
  }

  .spec {
    align-self: start;
    padding: 1.75rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: #ffffff;
    box-shadow: var(--shadow);
  }

  dl {
    display: grid;
    margin: 0 0 1.5rem;
  }

  dl:not(:has(div:not([hidden]))) {
    display: none;
  }

  .more {
    margin-top: var(--section);
  }

  .more h2 {
    margin: 0;
    font-size: clamp(1.75rem, 1.35rem + 1.4vw, 2.5rem);
  }

  dl div {
    padding: 0.75rem 0;
  }

  dl div + div {
    border-top: 0.0625rem solid var(--line);
  }

  dt {
    color: var(--ink-2);
    font-size: 0.9375rem;
  }

  dd {
    margin: 0.125rem 0 0;
    font-weight: 600;
  }

  .spec .pill {
    width: 100%;
  }

  @media (max-width: 56rem) {
    .gallery,
    .details {
      grid-template-columns: minmax(0, 1fr);
    }

    .gallery > :global(:first-child) {
      grid-row: auto;
    }
  }
</style>

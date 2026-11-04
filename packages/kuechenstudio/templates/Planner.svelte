<script lang="ts">
import Layout from '$components/Layout';
import PageHead from '$components/PageHead';
import Sketch from '$components/Sketch';
import Studio, {
  facts,
  pageLink,
  scriptTag,
  widgets,
} from '$components/Studio';
import Content from '$core/Content';

let { page } = $props();

const embeds = widgets();
const planner = embeds.planner;
const contact = pageLink('contactPage');
const studio = facts();
// Viele Planer setzen ihr Fenster (iframe) direkt hinter das eigene Skript: deshalb steht es im Text der Seite.
const widget = scriptTag(planner);
</script>

<Layout {page}>
  {#if planner.ready}
    <PageHead title={page.longTitle || page.title} lead={page.introText} />
    <div class="container body">
      <div class="planner" style:min-height="{embeds.plannerHeight / 16}rem">
        <!-- Bis der Planer sein Fenster zeigt (oder wenn ein Blocker ihn aufhält), steht hier ein Weg weiter. -->
        <div class="wait">
          <p>Der Online-Planer wird geladen. Erscheint er nicht, planen wir Ihre Küche gern gemeinsam mit Ihnen.</p>
          <p class="wait-actions">
            {#if contact}<a class="pill" href="{contact}#form-termin">Beratungstermin anfragen</a>{/if}
            {#if studio.tel}<a href={studio.tel}>{studio.phone}</a>{/if}
          </p>
        </div>
        {@html widget}
        <noscript>
          <p class="noscript">Der Online-Planer braucht JavaScript. Gern planen wir Ihre Küche auch gemeinsam mit Ihnen{#if contact}: <a href="{contact}#form-termin">Beratungstermin anfragen</a>{/if}.</p>
        </noscript>
      </div>
      <div class="prose"><Content of={page} /></div>
    </div>
  {:else}
    <!-- Ohne Planer: ein neutraler Weg zur Planung im Gespräch, ohne Hinweis auf eine fehlende Funktion. -->
    <PageHead title="Ihre Küche planen wir gemeinsam" lead="Am besten in unserer Ausstellung: Dort sehen Sie Fronten und Arbeitsplatten im Original, und wir zeichnen Ihre Küche mit Ihnen." />
    <div class="container body offline">
      <div class="offer prose">
        <ul>
          <li>Bringen Sie Maße, einen Grundriss oder Fotos Ihres Raums mit, wenn Sie welche haben.</li>
          <li>Vor der Bestellung messen wir bei Ihnen zu Hause genau nach.</li>
        </ul>
        <div class="actions">
          {#if contact}<a class="pill" href="{contact}#form-termin">Beratungstermin anfragen</a>{/if}
          {#if studio.tel}<a class="phone" href={studio.tel}>{studio.phone}</a>{:else}<span class="phone"><Studio value={studio.phone} quiet /></span>{/if}
        </div>
      </div>
      <div class="drawing" aria-hidden="true"><Sketch motif="kompakt" plain /></div>
    </div>
  {/if}
</Layout>

<style>
  .body {
    margin-top: clamp(3rem, 2rem + 3vw, 5rem);
  }

  /* Platz für den Planer vorab freihalten (plannerHeight), damit die Seite beim Laden nicht springt. */
  .planner {
    margin-bottom: 3rem;
    overflow: hidden;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: #ffffff;
    box-shadow: var(--shadow);
  }

  .noscript {
    margin: 0;
    padding: 1.5rem;
  }

  .wait {
    padding: clamp(1.25rem, 1rem + 2vw, 2.5rem);
    color: var(--ink-2);
  }

  .wait p {
    max-width: 36rem;
    margin: 0 0 1rem;
  }

  .wait-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem 1.5rem;
  }

  .planner:has(:global(iframe)) .wait {
    display: none;
  }

  .offline {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: center;
    gap: 2.5rem 4rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem 1.75rem;
    margin-top: 2rem;
  }

  .phone {
    color: var(--ink);
    font-family: var(--display);
    font-size: 1.5rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    text-decoration: none;
  }

  a.phone:hover {
    text-decoration: underline;
  }

  .drawing {
    padding: 2rem;
    border-radius: var(--radius);
    background: var(--mist);
    color: rgb(38 43 49 / 0.4);
  }

  @media (max-width: 52rem) {
    .offline {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>

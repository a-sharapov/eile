<script lang="ts">
import Booking from '$components/Booking';
import Icon from '$components/Icon';
import Layout from '$components/Layout';
import Picture from '$components/Picture';
import Sketch from '$components/Sketch';
import Studio, {
  facts,
  filled,
  pageLink,
  plannerOn,
  trust,
} from '$components/Studio';
import Today from '$components/Today';
import Content from '$core/Content';

let { page } = $props();

const planner = plannerOn() ? pageLink('plannerPage') : null;
const kitchens = pageLink('kitchensPage');
const studio = facts();
const t = trust();
const photo = $derived(
  typeof page.fields.heroImage === 'string' ? page.fields.heroImage : ''
);
const eyebrow = filled(studio.city)
  ? `Küchenstudio in ${studio.city}`
  : 'Küchenstudio mit Ausstellung';
// Was die Beratung ist: öffentlich nur Ausgefülltes, der Inhaber sieht die Platzhalter.
const consult = [
  { icon: 'uhr', value: t.consult.duration },
  { icon: 'check', value: t.consult.terms },
];
</script>

<Layout {page} booking="#termin" home>
  <section class="hero dark" class:pictured={!!photo} aria-labelledby="hero-title">
    {#if photo}
      <div class="media">
        <Picture path={photo} focus={page.fields.heroFocus} shape="fill" sizes="100vw" first />
        <div class="shade" aria-hidden="true"></div>
      </div>
    {:else}
      <div class="lines" aria-hidden="true"><Sketch motif="zeile" plain /></div>
    {/if}
    <div class="container content">
      <p class="eyebrow">{eyebrow}</p>
      <h1 id="hero-title">{page.longTitle || page.title}</h1>
      <span class="rule" aria-hidden="true"></span>
      {#if page.introText}<p class="lead">{page.introText}</p>{/if}
      <div class="actions">
        <a class="pill" href="#termin">Beratungstermin anfragen</a>
        {#if kitchens}<a class="pill outline" href={kitchens}>Küchen ansehen</a>{/if}
      </div>
      <ul class="consult">
        {#each consult as item, index (index)}
          <li hidden={!filled(item.value)} data-owner={filled(item.value) ? undefined : ''}><Icon name={item.icon} /><Studio value={item.value} /></li>
        {/each}
        <li class="today-item"><Today /></li>
      </ul>
      {#if planner}<p class="planner">Lieber erst selbst ausprobieren? <a href={planner}>Küche online planen</a></p>{/if}
    </div>
  </section>

  <div class="home-content"><Content of={page} /></div>

  <Booking intro />
</Layout>

<style>
  .hero {
    position: relative;
    display: grid;
    align-items: center;
    min-height: clamp(34rem, 78vh, 46rem);
    overflow: hidden;
    background: var(--slate-deep);
    isolation: isolate;
  }

  .media {
    position: absolute;
    inset: 0;
    z-index: -1;
  }

  /* Abdunkeln nur dort, wo der Text steht, dazu unten ein leichter Verlauf: der Rest des Fotos bleibt Foto.
     Bemessen am ungünstigsten Fall (ganz weißes Foto): Schrift darüber hält mindestens 4,5:1. */
  .shade {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse 78% 105% at 16% 55%, rgb(30 34 40 / 0.88) 0%, rgb(30 34 40 / 0.82) 42%, rgb(30 34 40 / 0.4) 78%, rgb(30 34 40 / 0.12) 100%),
      linear-gradient(to top, rgb(30 34 40 / 0.45), rgb(30 34 40 / 0) 38%);
  }

  .lines {
    position: absolute;
    inset: 10% -4% auto 42%;
    z-index: -1;
    color: rgb(255 255 255 / 0.12);
  }

  .content {
    padding: clamp(3.5rem, 2rem + 5vw, 6rem) 0;
  }

  h1 {
    max-width: 16ch;
    margin: 0;
    font-size: clamp(2.5rem, 1.4rem + 3.6vw, 4.375rem);
    font-weight: 500;
    line-height: 1.04;
    letter-spacing: -0.01em;
  }

  .lead {
    max-width: 34rem;
    margin: 0;
    color: #e4e7eb;
    font-size: clamp(1.0625rem, 1rem + 0.35vw, 1.25rem);
    line-height: 1.55;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.875rem 1rem;
    margin-top: 2.25rem;
  }

  .consult {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1.75rem;
    margin: 1.75rem 0 0;
    padding: 0;
    list-style: none;
    font-size: 0.9375rem;
    font-weight: 600;
  }

  .consult li:not([hidden]) {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .consult :global(.icon) {
    color: var(--accent-line-dark);
  }

  .today-item:not(:has(:global(.today:not([hidden])))) {
    display: none;
  }

  :global(body:has(> script[data-eile-bar])) .consult li[hidden] {
    display: inline-flex;
  }

  .planner {
    margin: 1.25rem 0 0;
    color: var(--on-slate-2);
  }

  .home-content > :global(:where(p, h2, h3, ul, ol)) {
    width: var(--page);
    max-width: none;
    margin-inline: auto;
  }

  .home-content > :global(:where(.sample)) {
    margin-top: 2rem;
  }

  /* Bis Tablet-Breite: das Foto oben und frei, der Text darunter auf dem dunklen Grund — keine Schrift über dem Bild. */
  @media (max-width: 64rem) {
    .hero {
      display: block;
      min-height: 0;
    }

    .media {
      position: relative;
      aspect-ratio: 16 / 9;
      max-height: 60svh;
      width: 100%;
      z-index: 0;
    }

    .shade {
      background: linear-gradient(to bottom, rgb(43 48 55 / 0) 60%, var(--slate-deep));
    }

    .lines {
      inset: 4% -10% auto 30%;
    }

    .content {
      padding: 1.75rem 0 2.75rem;
    }
  }

  @media (max-width: 40rem) {
    .media {
      aspect-ratio: 16 / 10;
    }

    .content {
      padding: 1.5rem 0 2.5rem;
    }

    .lead {
      font-size: 1.0625rem;
    }

    .actions {
      margin-top: 1.5rem;
    }

    .actions .pill {
      flex: 1 1 100%;
    }
  }
</style>

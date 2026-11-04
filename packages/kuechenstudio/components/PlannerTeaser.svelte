<!-- @component
Hinweis auf die Online-Planung. Erscheint nur, wenn ein Planer eingebunden und eingeschaltet ist; sonst bleibt die Stelle leer.
-->
<script lang="ts">
import Icon from '$components/Icon';
import { pageLink, plannerOn } from '$components/Studio';

let {
  /** Überschrift */
  title = 'Erst einmal selbst planen?',
  /** Text */
  text = 'Mit unserem Online-Planer probieren Sie in Ruhe zu Hause aus, wie Ihre Küche aussehen könnte. Zum Termin bringen Sie Ihre Ideen einfach mit.',
  /** Text des Knopfs */
  button = 'Küche online planen',
}: { title?: string; text?: string; button?: string } = $props();

const url = pageLink('plannerPage');
const show = plannerOn() && url;
</script>

{#if show}
  <section class="teaser" aria-labelledby="teaser-title">
    <div class="container card">
      <span class="circle"><Icon name="planung" /></span>
      <div>
        <h2 id="teaser-title">{title}</h2>
        <p>{text}</p>
      </div>
      <a class="pill outline" href={url}>{button}</a>
    </div>
  </section>
{/if}

<style>
  .teaser {
    padding: var(--section) 0 0;
  }

  .card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 1.5rem 2.5rem;
    box-sizing: border-box;
    padding: 2.25rem 2.5rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: #ffffff;
    box-shadow: var(--shadow);
  }

  .circle {
    display: grid;
    place-items: center;
    width: 4.25rem;
    height: 4.25rem;
    border-radius: 50%;
    background: var(--slate);
    color: #ffffff;
  }

  .circle :global(.icon) {
    width: 2.25rem;
    height: 2.25rem;
    stroke-width: 1.6;
  }

  h2 {
    margin: 0 0 0.375rem;
    font-size: clamp(1.5rem, 1.25rem + 0.8vw, 1.875rem);
  }

  p {
    max-width: 38rem;
    margin: 0;
    color: var(--ink-2);
  }

  @media (max-width: 52rem) {
    .card {
      grid-template-columns: minmax(0, 1fr);
      padding: 1.75rem 1.5rem;
    }
  }
</style>

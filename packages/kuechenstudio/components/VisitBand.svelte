<!-- @component
Helles Band am Ende einer Seite: Einladung in die Ausstellung mit „Beratungstermin anfragen“ und Telefon, daneben Öffnungszeiten und Anschrift auf einer weißen Karte; im Hintergrund die Linien einer Küchenansicht. Der Fußbereich wiederholt Anschrift und Zeiten dann nicht.
-->
<script lang="ts">
import Hours from '$components/Hours';
import Icon from '$components/Icon';
import Sketch from '$components/Sketch';
import Studio, { facts, pageLink } from '$components/Studio';
import Today from '$components/Today';

let {
  /** Überschrift */
  title = 'Kommen Sie in unsere Ausstellung',
  /** Text */
  text = 'Fronten anfassen, Schubladen ausprobieren, Arbeitsplatten vergleichen: Mit Termin nehmen wir uns Zeit für Ihre Küche.',
}: { title?: string; text?: string } = $props();

const studio = facts();
const contact = pageLink('contactPage');
</script>

<section class="visit" aria-labelledby="visit-title" data-band>
  <div class="lines" aria-hidden="true"><Sketch motif="insel" plain /></div>
  <div class="container grid">
    <div class="copy">
      <h2 id="visit-title">{title}</h2>
      <span class="rule" aria-hidden="true"></span>
      <p>{text}</p>
      <div class="actions">
        {#if contact}<a class="pill" href="{contact}#form-termin">Beratungstermin anfragen</a>{/if}
        {#if studio.tel}<a class="call" href={studio.tel}><Icon name="telefon" />{studio.phone}</a>{/if}
      </div>
    </div>
    <div class="facts" hidden={!studio.open && !studio.located} data-owner={studio.open || studio.located ? undefined : ''}>
      <div class="hours-part" hidden={!studio.open} data-owner={studio.open ? undefined : ''}>
        <h3>Öffnungszeiten</h3>
        <Today />
        <Hours />
      </div>
      <p class="where" hidden={!studio.located} data-owner={studio.located ? undefined : ''}><Icon name="ort" /><span><Studio value={studio.street} />, <Studio value={studio.zip} />{' '}<Studio value={studio.city} />{#if studio.route}<br /><a href={studio.route} target="_blank" rel="noopener">Route planen<span class="sr-only"> (öffnet einen Kartendienst in neuem Fenster)</span></a>{/if}</span></p>
    </div>
  </div>
</section>

<style>
  .visit {
    position: relative;
    overflow: hidden;
    margin-top: var(--section);
    padding: var(--section) 0;
    background: var(--mist);
    isolation: isolate;
  }

  .lines {
    position: absolute;
    inset: auto -6% -10% 30%;
    z-index: -1;
    color: rgb(38 43 49 / 0.12);
    -webkit-mask-image: linear-gradient(to right, transparent, #000 40%);
    mask-image: linear-gradient(to right, transparent, #000 40%);
  }

  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    align-items: start;
    gap: 3rem clamp(3rem, 1rem + 5vw, 6rem);
  }

  h2 {
    max-width: 16ch;
    margin: 0;
    font-size: clamp(2rem, 1.5rem + 1.8vw, 3rem);
  }

  .copy p {
    max-width: 32rem;
    margin: 0;
    color: var(--ink-2);
    font-size: 1.125rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem 2rem;
    margin-top: 2rem;
  }

  .call {
    display: inline-flex;
    align-items: center;
    gap: 0.625rem;
    font-family: var(--display);
    font-size: 1.375rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    text-decoration: none;
  }

  .call:hover {
    text-decoration: underline;
    text-decoration-color: var(--accent-line);
  }

  .facts {
    padding: clamp(1.25rem, 1rem + 1.5vw, 2rem);
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: #ffffff;
    box-shadow: var(--shadow);
  }

  h3 {
    margin: 0 0 1rem;
    font-size: 1.25rem;
  }

  .facts :global(.today) {
    margin-bottom: 0.875rem;
  }

  .where:not([hidden]) {
    display: flex;
  }

  .where {
    gap: 0.75rem;
    min-width: 0;
    overflow-wrap: anywhere;
    margin: 1.25rem 0 0;
    color: var(--ink-2);
  }

  .hours-part[hidden] + .where {
    margin-top: 0;
  }

  .where :global(.icon),
  .call :global(.icon) {
    color: var(--accent-line);
  }

  @media (max-width: 56rem) {
    .grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>

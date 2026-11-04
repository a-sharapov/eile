<!-- @component
Küchen eines Bereichs als Karten: Foto in festem Format mit dunkler Leiste und Namen; ohne Foto die Strichzeichnung des Stils. layout=grid zeigt darunter Kurztext, Front und Arbeitsplatte; layout=cards nur die Karten, für das dunkle Band.
-->
<script lang="ts">
import Picture from '$components/Picture';
import Studio, { unfilled } from '$components/Studio';
import { children, current, link } from '$core';

let {
  /** Bereich mit den Küchen: ID der Seite; leer — die aktuelle Seite */
  parent = null,
  /** Wie viele Küchen; 0 — alle */
  count = 0,
  /** grid=mit Text, cards=nur Karten */
  layout = 'grid',
  /** Diese Küche auslassen (die Seite, auf der man gerade ist): ID */
  except = 0,
}: {
  parent?: number | null;
  count?: number;
  layout?: 'grid' | 'cards';
  except?: number;
} = $props();

const MOTIFS = ['zeile', 'grifflos', 'landhaus', 'insel', 'kompakt'];
const text = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';
const items = $derived(
  children(parent ?? current()?.id ?? null)
    .filter((_) => _.id !== except)
    .slice(0, count > 0 ? count : undefined)
    .map((_) => ({
      id: _.id,
      title: _.menuTitle || _.title,
      intro: _.introText,
      url: link(_.id),
      photo: text(_.fields.photo),
      focus: _.fields.photoFocus,
      motif: (MOTIFS.includes(text(_.fields.sketch))
        ? text(_.fields.sketch)
        : 'zeile') as 'zeile',
      front: text(_.fields.front),
      worktop: text(_.fields.worktop),
    }))
);
const cards = $derived(layout === 'cards');
// Ungerade Zahl: drei nebeneinander statt einer einsamen Karte am Ende; eine Küche allein — eine Spalte.
const columns = $derived(
  items.length === 1 ? 1 : items.length % 2 === 1 ? 3 : 2
);
const sizes = $derived(
  columns === 1
    ? '(min-width: 48rem) 44rem, calc(100vw - 2.5rem)'
    : columns === 3
      ? '(min-width: 75rem) 24rem, (min-width: 40rem) 31vw, 46vw'
      : cards
        ? '(min-width: 75rem) 24rem, (min-width: 64rem) 31vw, 46vw'
        : '(min-width: 75rem) 36rem, (min-width: 40rem) 46vw, calc(100vw - 2.5rem)'
);
</script>

{#if items.length > 0}
  <ul class="grid" class:cards class:single={columns === 1} class:triple={columns === 3}>
    {#each items as item (item.id)}
      <li>
        <div class="card">
          <Picture path={item.photo} focus={item.focus} motif={item.motif} tone="dark" shape="card" {sizes} />
          <h3 class="caption"><a href={item.url}>{item.title}</a></h3>
        </div>
        {#if !cards}
          {#if item.intro}<p>{item.intro}</p>{/if}
          {#if (item.front && !unfilled(item.front)) || (item.worktop && !unfilled(item.worktop))}
            <dl class="spec">
              {#if item.front && !unfilled(item.front)}<div><dt>Front</dt><dd><Studio value={item.front} /></dd></div>{/if}
              {#if item.worktop && !unfilled(item.worktop)}<div><dt>Arbeitsplatte</dt><dd><Studio value={item.worktop} /></dd></div>{/if}
            </dl>
          {/if}
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 3rem 2rem;
    max-width: none;
    margin: 2.25rem 0 0;
    padding: 0;
    list-style: none;
  }

  .grid > li::before {
    display: none;
  }

  li {
    margin: 0;
  }

  .cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.25rem;
    margin: 0;
  }

  .grid.single {
    grid-template-columns: minmax(0, 44rem);
  }

  @media (min-width: 40rem) {
    .grid.triple {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  /* Karte: das ganze Bild ist klickbar, der Name in der Leiste ist der Link. */
  .card {
    position: relative;
    overflow: hidden;
    border-radius: var(--radius);
  }

  .caption {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    margin: 0;
    padding: 0.875rem 1.125rem;
    background: rgb(43 48 55 / 0.92);
    font-size: 1.125rem;
    line-height: 1.25;
  }

  .caption a {
    color: #ffffff;
    text-decoration: none;
  }

  .caption a::after {
    content: '';
    position: absolute;
    inset: -100rem 0 0;
  }

  .caption a:hover {
    text-decoration: underline;
    text-decoration-color: var(--accent-line-dark);
    text-decoration-thickness: 0.125rem;
  }

  .caption a:focus-visible {
    outline: none;
  }

  .card:has(a:focus-visible) {
    outline: 0.1875rem solid var(--focus);
    outline-offset: 0.1875rem;
  }

  :global(.dark) .card:has(a:focus-visible) {
    outline-color: var(--focus-dark);
  }

  p {
    max-width: 34rem;
    margin: 1rem 0 0;
    color: var(--ink-2);
  }

  .spec {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1.5rem;
    margin: 0.75rem 0 0;
    font-size: 0.9375rem;
  }

  .spec div {
    display: flex;
    gap: 0.375rem;
  }

  dt {
    color: var(--ink-2);
  }

  dd {
    margin: 0;
    font-weight: 600;
  }

  @media (max-width: 40rem) {
    .grid:not(.cards) {
      grid-template-columns: minmax(0, 1fr);
    }

    .cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.875rem;
    }

    .cards .caption {
      padding: 0.625rem 0.75rem;
      font-size: 1rem;
    }
  }
</style>

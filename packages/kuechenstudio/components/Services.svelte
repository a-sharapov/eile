<!-- @component
Leistungen auf einen Blick: Symbol im dunklen Kreis, Titel und eine Zeile; jede Kachel führt zum Abschnitt mit diesem Titel weiter unten im Text (Anker aus dem Titel, z. B. #lieferung-und-montage).
-->
<script lang="ts">
import Icon from '$components/Icon';
import { anchor, iconFor } from '$components/Studio';

let {
  /** Leistungen: „Titel: eine Zeile“, getrennt durch | */
  items = '',
}: { items?: string } = $props();

const list = $derived(
  items
    .split('|')
    .map((_) => _.trim())
    .filter(Boolean)
    .map((_) =>
      ((at) =>
        at > 0
          ? { title: _.slice(0, at).trim(), text: _.slice(at + 1).trim() }
          : { title: _, text: '' })(_.indexOf(':'))
    )
);
</script>

{#if list.length > 0}
  <ul class="services">
    {#each list as item (item.title)}
      <li>
        <span class="circle"><Icon name={iconFor(item.title)} /></span>
        <div>
          <a href="#{anchor(item.title)}">{item.title}</a>
          {#if item.text}<p>{item.text}</p>{/if}
        </div>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .services {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 12.5rem), 1fr));
    gap: 1.25rem;
    max-width: none;
    margin: 0 0 4rem;
    padding: 0;
    list-style: none;
  }

  .services > li::before {
    display: none;
  }

  li {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    align-items: flex-start;
    margin: 0;
    padding: 1.25rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: #ffffff;
  }

  li:has(a:hover) {
    border-color: var(--accent-line);
  }

  .circle {
    display: grid;
    flex: none;
    place-items: center;
    width: 3.25rem;
    height: 3.25rem;
    border-radius: 50%;
    background: var(--slate);
    color: #ffffff;
  }

  .circle :global(.icon) {
    width: 2.125rem;
    height: 2.125rem;
    stroke-width: 1.6;
  }

  a {
    font-family: var(--display);
    font-size: 1.1875rem;
    font-weight: 600;
    text-decoration: none;
  }

  /* Die ganze Kachel ist klickbar; der Titel ist der Link. */
  a::after {
    content: '';
    position: absolute;
    inset: 0;
  }

  p {
    margin: 0.25rem 0 0;
    color: var(--ink-2);
    font-size: 0.9375rem;
  }
</style>

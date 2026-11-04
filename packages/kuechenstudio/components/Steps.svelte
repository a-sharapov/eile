<!-- @component
Ablauf in Schritten an einer Maßlinie wie auf einer Küchenzeichnung: Nummer 01, 02 … über der Linie, darunter das Symbol im dunklen Kreis, Titel und Text. Das Symbol folgt dem Titel (Beratung, Aufmaß, Planung, Lieferung und Montage, Geräte, Service).
-->
<script lang="ts">
import Icon from '$components/Icon';
import { iconFor } from '$components/Studio';

let {
  /** Überschrift des Abschnitts */
  title = '',
  /** Einleitung */
  lead = '',
  /** Schritte: „Titel: Text“, getrennt durch | */
  steps = '',
}: { title?: string; lead?: string; steps?: string } = $props();

const items = $derived(
  steps
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

{#if items.length > 0}
  <section class="steps" aria-labelledby={title ? 'steps-title' : undefined}>
    <div class="container">
      {#if title}
        <h2 id="steps-title">{title}</h2>
        <span class="rule" aria-hidden="true"></span>
      {/if}
      {#if lead}<p class="lead">{lead}</p>{/if}
      <ol style:--count={items.length}>
        {#each items as step, index (index)}
          <li>
            <span class="num" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <span class="circle"><Icon name={iconFor(step.title)} /></span>
            <h3>{step.title}</h3>
            {#if step.text}<p>{step.text}</p>{/if}
          </li>
        {/each}
      </ol>
    </div>
  </section>
{/if}

<style>
  .steps {
    padding: var(--section) 0;
    background: var(--mist);
  }

  h2 {
    margin: 0;
    font-size: clamp(2rem, 1.5rem + 1.8vw, 3rem);
  }

  .lead {
    max-width: 40rem;
    margin: 0 0 3rem;
    color: var(--ink-2);
    font-size: 1.125rem;
  }

  ol {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
    margin: 0;
    padding: 0 0 0 0.5rem;
    list-style: none;
  }

  h3,
  p {
    overflow-wrap: anywhere;
  }

  /* Telefon: die Maßlinie läuft senkrecht links an den Schritten entlang. */
  li {
    position: relative;
    padding: 0 0 2.5rem clamp(1.75rem, 10vw, 3.5rem);
    border-left: 0.09375rem solid var(--accent-line);
  }

  li:last-child {
    padding-bottom: 0.5rem;
  }

  li::before {
    content: '';
    position: absolute;
    top: 0;
    left: -0.4375rem;
    width: 0.75rem;
    height: 0.75rem;
    background: linear-gradient(45deg, transparent calc(50% - 0.06rem), var(--accent-line) calc(50% - 0.06rem) calc(50% + 0.06rem), transparent calc(50% + 0.06rem));
  }

  .num {
    display: block;
    margin: -0.25rem 0 0.75rem;
    color: var(--ink-2);
    font-family: var(--display);
    font-size: 0.9375rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.08em;
  }

  .circle {
    display: grid;
    place-items: center;
    width: 4.25rem;
    height: 4.25rem;
    margin-bottom: 1.25rem;
    border-radius: 50%;
    background: var(--slate);
    color: #ffffff;
  }

  .circle :global(.icon) {
    width: 2.25rem;
    height: 2.25rem;
    stroke-width: 1.6;
  }

  h3 {
    margin: 0 0 0.5rem;
    font-size: 1.3125rem;
  }

  p {
    max-width: 30ch;
    margin: 0;
    color: var(--ink-2);
  }

  /* Breit: eine waagerechte Maßlinie über alle Schritte, an jedem Schritt eine Begrenzung, die Nummer darüber. */
  @media (min-width: 48rem) {
    ol {
      position: relative;
      grid-template-columns: repeat(var(--count), minmax(0, 1fr));
      gap: 0;
    }

    ol::after {
      content: '';
      position: absolute;
      top: -0.4375rem;
      right: 0;
      width: 0.09375rem;
      height: 1rem;
      background: var(--accent-line);
    }

    ol {
      padding-left: 0;
    }

    li {
      margin: 0;
      padding: 2.25rem 2rem 0 0;
      border-left: 0;
      border-top: 0.09375rem solid var(--accent-line);
    }

    li::before {
      top: -0.4375rem;
      left: -0.375rem;
    }

    li::after {
      content: '';
      position: absolute;
      top: -0.5rem;
      left: 0;
      width: 0.09375rem;
      height: 1rem;
      background: var(--accent-line);
    }

    li:last-child {
      padding-right: 0;
    }

    .num {
      position: absolute;
      top: -2rem;
      left: 0.75rem;
      margin: 0;
    }
  }
</style>

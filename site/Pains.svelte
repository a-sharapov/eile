<!-- @component
Где обычно уходит время: шесть знакомых ситуаций и что Eile берёт на себя в каждой.
-->
<script lang="ts">
import Rich from '$components/Rich';
import { site } from '$core';

const t = site().i18n;
const pairs = [
  [t.pain1, t.relief1],
  [t.pain2, t.relief2],
  [t.pain3, t.relief3],
  [t.pain4, t.relief4],
  [t.pain5, t.relief5],
  [t.pain6, t.relief6],
];
</script>

<ul class="pains">
  {#each pairs as { 0: pain, 1: relief }}
    <li>
      <p class="pain">{pain}</p>
      <p class="relief"><Rich text={relief} /></p>
    </li>
  {/each}
</ul>

<style>
  .pains {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2.5rem 2.5rem;
    width: min(100% - 2 * var(--gutter), var(--wide));
    margin: 3rem auto 0;
    padding: 0;
    list-style: none;
  }

  li {
    padding-top: 1rem;
    border-top: 1px solid var(--line);
  }

  p {
    margin: 0;
  }

  .pain {
    color: var(--muted);
    font-size: 0.9375rem;
    line-height: 1.5;
  }

  .relief {
    position: relative;
    margin-top: 0.75rem;
    padding-left: 1.5rem;
    font: 550 1.0625rem/1.45 var(--sans);
  }

  .relief::before {
    content: '→';
    position: absolute;
    left: 0;
    color: var(--accent);
  }

  @media (max-width: 56rem) {
    .pains {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 34rem) {
    .pains {
      grid-template-columns: 1fr;
      gap: 1.75rem;
    }
  }
</style>

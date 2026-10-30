<!-- @component
Ссылка на следующую работу раздела крупным планом; после последней — снова первая.
-->
<script lang="ts">
import { current, link, listing } from '$core';

let {
  /** Подпись над названием */
  label = 'Следующая работа',
}: { label?: string } = $props();

const here = current();
const items = $derived(
  here?.parentId
    ? listing(here.parentId, { perPage: 100, sort: 'menu', paged: false }).items
    : []
);
const at = $derived(items.findIndex((_) => _.id === here?.id));
const next = $derived(
  at < 0 || items.length < 2 ? null : (items[(at + 1) % items.length] ?? null)
);
</script>

{#if next}
  <a class="next" href={link(next.id)}>
    <span>{label}</span>
    <strong>{next.longTitle || next.title} →</strong>
  </a>
{/if}

<style>
  .next {
    display: grid;
    gap: 0.5rem;
    margin-top: clamp(4rem, 10vw, 8rem);
    padding-top: 2rem;
    border-top: 0.0625rem solid var(--t-text, #131312);
    text-decoration: none;
  }

  span {
    color: var(--t-muted, #5b5852);
    font-size: 0.9375rem;
  }

  strong {
    font-size: clamp(2rem, 1.2rem + 3.6vw, 4.5rem);
    font-weight: 750;
    line-height: 1;
    letter-spacing: -0.035em;
    text-wrap: balance;
  }

  .next:hover strong {
    color: var(--t-accent, #c2370b);
  }
</style>

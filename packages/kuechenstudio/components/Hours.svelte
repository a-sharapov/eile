<!-- @component
Öffnungszeiten aus der Einstellung studioHours als ruhige Liste: Tage links, Zeiten rechts, feine Linien dazwischen. Auf hellem und dunklem Grund.
-->
<script lang="ts">
import Studio, { facts } from '$components/Studio';

const studio = facts();
const hours = studio.hours;
</script>

{#if hours.length > 0}
  <dl class="hours" hidden={!studio.open} data-owner={studio.open ? undefined : ''}>
    {#each hours as row, index (index)}
      <div class:text={row.times === ''}>
        {#if row.blank}
          <dt><Studio value="[{row.days}]" /></dt>
        {:else}
          <dt>{row.days}</dt>
          {#if row.times}<dd>{row.times}</dd>{/if}
        {/if}
      </div>
    {/each}
  </dl>
{/if}

<style>
  .hours:not([hidden]) {
    display: grid;
  }

  .hours {
    margin: 0;
    font-size: max(0.9375rem, 1em);
    font-variant-numeric: tabular-nums;
  }

  .hours div {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.125rem 1rem;
    padding: 0.5rem 0;
    border-bottom: 0.0625rem solid color-mix(in srgb, currentColor 16%, transparent);
  }

  .hours div:first-child {
    padding-top: 0;
  }

  dt {
    font-weight: 600;
  }

  .text dt {
    font-weight: 400;
  }

  dd {
    margin: 0;
  }
</style>

<!-- @component
Менеджер: «Обзор» сайта на скриншоте и шесть вещей, ради которых в нём спокойно работать.
-->
<script lang="ts">
import Shot from '$components/Shot';
import { current, site } from '$core';

const t = site().i18n;
const en = current()?.language === 'en';
const points = [
  [t.tourTree, t.tourTreeText],
  [t.tourBlocks, t.tourBlocksText],
  [t.tourSchedule, t.tourScheduleText],
  [t.tourHistory, t.tourHistoryText],
  [t.tourJump, t.tourJumpText],
  [t.tourMedia, t.tourMediaText],
];
</script>

<div class="tour">
  <Shot name={en ? 'overview-en' : 'overview'} alt={t.shotOverview} />
  <dl class="points">
    {#each points as { 0: term, 1: text }}
      <div>
        <dt>{term}</dt>
        <dd>{text}</dd>
      </div>
    {/each}
  </dl>
</div>

<style>
  .tour {
    width: min(100% - 2 * var(--gutter), var(--wide));
    margin: 3rem auto 0;
  }

  .points {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2.25rem 2.5rem;
    margin: 3rem 0 0;
  }

  .points div {
    padding-top: 1rem;
    border-top: 1px solid var(--line);
  }

  dt {
    font: 600 1.0625rem/1.35 var(--sans);
  }

  dd {
    margin: 0.4rem 0 0;
    color: var(--muted);
    font-size: 0.9375rem;
  }

  @media (max-width: 56rem) {
    .points {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 34rem) {
    .points {
      grid-template-columns: 1fr;
      gap: 1.5rem;
    }
  }
</style>

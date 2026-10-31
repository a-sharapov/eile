<!-- @component
Скорость на логарифмической шкале: замеры Eile рядом с привычными мерками времени, ниже — откуда
скорость берётся и живой замер этой страницы.
-->
<script lang="ts">
import { current, site as settings } from '$core';
import Island from '$core/Island';

const site = settings();
const t = site.i18n;
const c = site.custom;

// Шкала от 0,1 мс до 1 с: четыре порядка.
const _x = (ms: number): string => `${((Math.log10(ms) + 1) / 4) * 100}%`;

const ticks = [
  [0.1, t.speedTick01],
  [1, t.speedTick1],
  [10, t.speedTick10],
  [100, t.speedTick100],
  [1000, t.speedTick1000],
] as const;

const marks = [
  {
    ms: 0.23,
    value: t.speedHitValue,
    label: t.speedHit,
    side: 'up',
    tier: 1,
    lead: true,
  },
  {
    ms: 0.5,
    value: t.speedColdValue,
    label: t.speedCold,
    side: 'down',
    tier: 1,
    lead: false,
  },
  {
    ms: 16.7,
    value: t.speedFrameValue,
    label: t.speedFrame,
    side: 'down',
    tier: 1,
    lead: false,
  },
  {
    ms: 100,
    value: t.speedInstantValue,
    label: t.speedInstant,
    side: 'down',
    tier: 1,
    lead: false,
  },
];

const facts = [
  [t.speedFact1, t.speedFact1Text],
  [t.speedFact2, t.speedFact2Text],
  [t.speedFact3, t.speedFact3Text],
  [t.speedFact4, t.speedFact4Text],
];
</script>

<div class="speed">
  <figure class="scale">
    <div class="ruler" role="img" aria-label={t.speedAria}>
      <div class="line"></div>
      {#each ticks as { 0: ms, 1: label }}
        <span class="tick" style:--x={_x(ms)}><span>{label}</span></span>
      {/each}
      {#each marks as mark}
        <span
          class="mark {mark.side}"
          class:lead={mark.lead}
          style:--x={_x(mark.ms)}
          style:--tier={mark.tier}
        >
          <span class="text"><strong>{mark.value}</strong> {mark.label}</span>
        </span>
      {/each}
    </div>
    <figcaption>
      {t.speedNote}
      <a href={`${c.repo}/blob/main/docs/roadmap.md`}>{t.speedSource}</a>
    </figcaption>
  </figure>

  <Island
    name="PageProof"
    props={{
      lead: t.proofLead,
      note: t.proofNote,
      html: t.proofHtml,
      js: t.proofJs,
      reply: t.proofReply,
      kb: t.unitKb,
      ms: t.unitMs,
      locale: current()?.language || site.language,
    }}
  />

  <dl class="facts">
    {#each facts as { 0: term, 1: text }}
      <div>
        <dt>{term}</dt>
        <dd>{text}</dd>
      </div>
    {/each}
  </dl>

</div>

<style>
  .speed {
    width: min(100% - 2 * var(--gutter), var(--wide));
    margin: 3rem auto 0;
  }

  .scale {
    margin: 0;
    padding: clamp(1.5rem, 1rem + 2vw, 2.75rem) clamp(1.25rem, 0.5rem + 3vw, 3.5rem) 1.5rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-l);
    background: var(--bg);
  }

  .ruler {
    position: relative;
    height: 13rem;
  }

  .line {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 2px;
    border-radius: 1px;
    background: linear-gradient(to right, var(--fill) 0 17.5%, var(--line-strong) 17.5%);
  }

  .tick {
    position: absolute;
    left: var(--x);
    top: 50%;
    width: 1px;
    height: 0.75rem;
    translate: 0 -50%;
    background: var(--line-strong);
  }

  .tick span {
    position: absolute;
    bottom: 1.1rem;
    left: 0;
    translate: -50% 0;
    color: var(--faint);
    font: 500 0.75rem/1 var(--mono);
    white-space: nowrap;
  }

  .tick:first-of-type span {
    translate: 0 0;
  }

  .tick:last-of-type span {
    translate: -100% 0;
  }

  .mark {
    position: absolute;
    left: var(--x);
    width: 1px;
    background: var(--line-strong);
  }

  .mark::after {
    content: '';
    position: absolute;
    left: -0.35rem;
    width: 0.75rem;
    height: 0.75rem;
    border: 2px solid var(--muted);
    border-radius: 50%;
    background: var(--bg);
  }

  .up {
    bottom: 50%;
    height: calc(1.75rem + var(--tier) * 2.6rem);
  }

  .up::after {
    bottom: -0.35rem;
  }

  .down {
    top: 50%;
    height: calc(3.25rem + var(--tier) * 1rem);
  }

  .down::after {
    top: -0.35rem;
  }

  .lead {
    background: var(--fill);
  }

  .lead::after {
    border-color: var(--fill);
    background: var(--fill);
    box-shadow: 0 0 0 0.35rem color-mix(in oklab, var(--fill) 18%, transparent);
  }

  .text {
    position: absolute;
    left: 0.75rem;
    display: grid;
    width: max-content;
    max-width: 13rem;
    color: var(--muted);
    font-size: 0.875rem;
    line-height: 1.35;
  }

  .up .text {
    top: -0.25rem;
  }

  .down .text {
    bottom: -0.25rem;
  }

  .text strong {
    color: var(--text);
    font: 650 1.375rem/1.15 var(--display);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  .lead .text strong {
    color: var(--accent);
    font-size: 2rem;
  }

  figcaption {
    margin-top: 1.5rem;
    color: var(--faint);
    font-size: 0.8125rem;
  }

  figcaption a {
    color: inherit;
  }

  .facts {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 2rem;
    margin: 2.5rem 0 0;
  }

  .facts div {
    padding-top: 1rem;
    border-top: 1px solid var(--line);
  }

  dt {
    font-weight: 600;
  }

  dd {
    margin: 0.35rem 0 0;
    color: var(--muted);
    font-size: 0.9375rem;
  }

  /* На узком экране шкала встаёт вертикально: подписи справа, места хватает всем. */
  @media (max-width: 48rem) {
    .ruler {
      height: 34rem;
      margin-left: 0.5rem;
    }

    .line {
      left: 0;
      right: auto;
      top: 0;
      bottom: 0;
      width: 2px;
      height: auto;
      background: linear-gradient(to bottom, var(--fill) 0 17.5%, var(--line-strong) 17.5%);
    }

    .tick {
      left: 0;
      top: var(--x);
      width: 0.75rem;
      height: 1px;
      translate: -40% 0;
    }

    .tick span,
    .tick:first-of-type span,
    .tick:last-of-type span {
      top: 0;
      left: auto;
      right: 1.1rem;
      translate: 0 -50%;
      display: none;
    }

    .mark,
    .up,
    .down {
      left: 0;
      top: var(--x);
      bottom: auto;
      width: 2.5rem;
      height: 1px;
    }

    .mark::after,
    .up::after,
    .down::after {
      left: -0.3rem;
      top: -0.35rem;
      bottom: auto;
    }

    .text,
    .up .text,
    .down .text {
      top: 0;
      bottom: auto;
      left: 3.25rem;
      max-width: 15rem;
      translate: 0 -0.9rem;
    }

    /* Отметки 0,23 и 0,5 близко: верхняя подпись встаёт над своей чертой, нижняя — под своей. */
    .up .text {
      translate: 0 calc(-100% + 0.9rem);
    }

    .facts {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 30rem) {
    .facts {
      grid-template-columns: 1fr;
      gap: 1.25rem;
    }
  }
</style>

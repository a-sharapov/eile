<!-- @component
Скорость на логарифмической шкале: замеры Eile рядом с привычной меркой времени, сразу под ней — замер
нагрузки и памяти на одном ядре, ниже — живой замер этой страницы и откуда скорость берётся. Строки замера —
перевод `benchRows` через «|», в строке «что происходит :: результат :: подробности».
-->
<script lang="ts">
import Rich from '$components/Rich';
import { current, site as settings } from '$core';
import Island from '$core/Island';

const site = settings();
const t = site.i18n;
const c = site.custom;

const bench = t.benchRows
  .split('|')
  .map((_) => _.split('::').map((part) => part.trim()))
  .filter((_) => _.length === 3 && _[1]);

// Шкала от 0,1 мс до 1 с: четыре порядка.
const _x = (ms: number): string => `${((Math.log10(ms) + 1) / 4) * 100}%`;

const ticks = [
  [0.1, t.speedTick01],
  [1, t.speedTick1],
  [10, t.speedTick10],
  [100, t.speedTick100],
  [1000, t.speedTick1000],
] as const;

// Замер бинарника 0.1.0 на одном ядре (раздел «Сервер»): 0,53 мс — 1 с ядра на 1 900 ответов из кэша.
const marks = [
  {
    ms: 0.53,
    value: t.speedHitValue,
    label: t.speedHit,
    side: 'up',
    tier: 1.45,
    lead: true,
    end: false,
  },
  {
    ms: 3.1,
    value: t.speedColdValue,
    label: t.speedCold,
    side: 'down',
    tier: 1,
    lead: false,
    end: false,
  },
  {
    ms: 100,
    value: t.speedInstantValue,
    label: t.speedInstant,
    side: 'down',
    tier: 1,
    lead: false,
    end: false,
  },
  {
    ms: 660,
    value: t.speedBootValue,
    label: t.speedBoot,
    side: 'up',
    tier: 1.6,
    lead: false,
    end: true,
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
          class:end={mark.end}
          style:--x={_x(mark.ms)}
          style:--tier={mark.tier}
        >
          <span class="text"><strong>{mark.value}</strong> {mark.label}</span>
        </span>
      {/each}
    </div>
    <figcaption>{t.speedNote}</figcaption>
  </figure>

  <figure class="bench">
    <div class="table" role="table" aria-label={t.benchAria}>
      <div class="head" role="row">
        <span role="columnheader">{t.benchWhat}</span>
        <span role="columnheader">{t.benchResult}</span>
        <span class="hidden" role="columnheader">{t.benchDetails}</span>
      </div>
      {#each bench as { 0: what, 1: value, 2: note }}
        <div class="row" role="row">
          <span class="what" role="rowheader"><Rich text={what} /></span>
          <span class="value" role="cell">{value}</span>
          <span class="note" role="cell"><Rich text={note} /></span>
        </div>
      {/each}
    </div>
    <figcaption>
      {t.benchNote}
      <a href={`${c.repo}/blob/main/docs/adr/0043-large-bodies-memory.md`}>{t.benchHow}</a>
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
    container: scale / inline-size;
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
    background: linear-gradient(to right, var(--fill) 0 18.1%, var(--line-strong) 18.1%);
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

  .end .text {
    left: auto;
    right: 0.75rem;
    justify-items: end;
    text-align: right;
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
    max-width: 60ch;
    margin-top: 1.5rem;
    color: var(--faint);
    font-size: 0.8125rem;
    line-height: 1.55;
  }

  /* Замер нагрузки — та же утопленная панель, что у шкалы, прямо под ней. */
  .bench {
    margin: 1.25rem 0 0;
    padding: clamp(1.25rem, 0.75rem + 2vw, 2.5rem) clamp(1.25rem, 0.5rem + 3vw, 3.5rem) 1.5rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-l);
    background: var(--bg);
  }

  .bench .head,
  .bench .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr);
    gap: 0.3rem 2rem;
  }

  .bench .head {
    position: relative;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--line-strong);
    color: var(--muted);
    font-size: 0.8125rem;
    font-weight: 600;
  }

  .hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .bench .row {
    align-items: baseline;
    padding: 1.05rem 0;
  }

  .bench .row + .row {
    border-top: 1px solid var(--line-strong);
  }

  .what {
    grid-row: span 2;
    color: var(--text);
    font-size: 0.9375rem;
    line-height: 1.45;
  }

  .value {
    color: var(--text);
    font: 650 1.375rem/1.2 var(--display);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  .note {
    grid-column: 2;
    color: var(--muted);
    font-size: 0.875rem;
    line-height: 1.45;
  }

  .bench figcaption {
    margin-top: 1.25rem;
    color: var(--muted);
  }

  .bench figcaption a {
    color: inherit;
  }

  /* Принудительные цвета (Windows, высокий контраст): фон шкалы пропадает, поэтому ось, деления и
     отметки рисуются цветами системы, а ведущая — цветом выделения. */
  @media (forced-colors: active) {
    .line,
    .tick,
    .mark {
      forced-color-adjust: none;
      background: CanvasText;
    }

    .mark::after {
      forced-color-adjust: none;
      border-color: CanvasText;
      background: Canvas;
    }

    .lead,
    .lead::after {
      background: Highlight;
      border-color: Highlight;
    }

    /* Подписи — снова цветами системы: иначе в тёмной высококонтрастной теме тёмный текст лёг бы на чёрное. */
    .text,
    .tick span {
      forced-color-adjust: auto;
    }
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

  /* Узкая панель (телефон или крупный текст) — шкала встаёт вертикально: подписи справа, места хватает
     всем. Перелом считается от ширины самой панели в rem страницы. */
  @container scale (max-width: 44rem) {
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
      background: linear-gradient(to bottom, var(--fill) 0 18.1%, var(--line-strong) 18.1%);
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
    .down .text,
    .end .text {
      top: 0;
      bottom: auto;
      left: 3.25rem;
      right: auto;
      /* На 320 px подпись не шире, чем остаётся справа от шкалы в панели. */
      max-width: min(15rem, 100vw - 2 * var(--gutter) - 2 * clamp(1.25rem, 0.5rem + 3vw, 3.5rem) - 4rem);
      overflow-wrap: anywhere;
      justify-items: start;
      text-align: left;
      translate: 0 -0.9rem;
    }

    /* Отметки 0,23 и 0,5 близко: верхняя подпись встаёт над своей чертой, нижняя — под своей. */
    .up .text {
      translate: 0 calc(-100% + 0.9rem);
    }

  }
  @media (max-width: 48rem) {
    .facts {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
  }


  @media (max-width: 40rem) {
    .bench .head > :not(.hidden) {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .bench .head {
      padding: 0;
      border: 0;
    }

    .bench .row {
      grid-template-columns: minmax(0, 1fr);
    }

    .what {
      grid-row: auto;
      color: var(--muted);
      font-size: 0.875rem;
    }

    .note {
      grid-column: 1;
    }

    .bench .head + .row {
      padding-top: 0;
    }
  }

  @media (max-width: 30rem) {
    .facts {
      grid-template-columns: 1fr;
      gap: 1.25rem;
    }
  }
</style>

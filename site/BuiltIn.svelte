<!-- @component
Что обычно ставят отдельно, а в Eile уже есть: таблица «обычно → в Eile» по семи темам. Строки темы —
перевод через «|», в строке «обычно :: в Eile»; «обычно» может быть пустым.
-->
<script lang="ts">
import Icon from '$components/Icon';
import { site } from '$core';

const t = site().i18n;
const _rows = (raw: string): (readonly [string, string])[] =>
  raw
    .split('|')
    .map((_) => _.split('::').map((part) => part.trim()))
    .filter((_) => _.length === 2 && _[1])
    .map(({ 0: usual = '', 1: eile = '' }) => [usual, eile] as const);

const groups = [
  [t.inFind, t.inFindRows],
  [t.inForms, t.inFormsRows],
  [t.inStats, t.inStatsRows],
  [t.inSearch, t.inSearchRows],
  [t.inMedia, t.inMediaRows],
  [t.inCalm, t.inCalmRows],
  [t.inLang, t.inLangRows],
] as const;
</script>

<!-- Заголовок темы — в первой строке группы; в остальных строках тема есть только для читалки. -->
<div class="inside" role="table" aria-label={t.inAria}>
  <div class="head" role="row">
    <span role="columnheader"><span class="hidden">{t.vsTopic}</span></span>
    <span role="columnheader">{t.inUsual}</span>
    <span role="columnheader">{t.inEile}</span>
  </div>
  {#each groups as { 0: title, 1: rows }}
    <div class="group" role="rowgroup">
      {#each _rows(rows) as { 0: usual, 1: eile }, index}
        <div class="row" role="row">
          <div class="topic" role="rowheader">
            {#if index === 0}<h3>{title}</h3>{:else}<span class="hidden">{title}</span>{/if}
          </div>
          <span class="usual" class:none={!usual} role="cell">{usual || t.inNone}</span>
          <span class="eile" role="cell"><Icon name="check" />{eile}</span>
        </div>
      {/each}
    </div>
  {/each}
</div>

<style>
  .inside {
    width: min(100% - 2 * var(--gutter), var(--wide));
    margin: 3rem auto 0;
    border-top: 1px solid var(--line-strong);
  }

  .head,
  .row {
    display: grid;
    grid-template-columns: 14rem minmax(0, 1fr) minmax(0, 1.6fr);
    gap: 2rem;
  }

  .head {
    padding: 0.85rem 0;
    border-bottom: 1px solid var(--line);
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

  .group {
    border-bottom: 1px solid var(--line);
  }

  .row {
    position: relative;
    padding: 1.05rem 0;
    font-size: 0.9375rem;
    line-height: 1.5;
  }

  /* Волосок между строками темы — только под колонками «обычно» и «в Eile», как раньше. */
  .row + .row::before {
    content: '';
    position: absolute;
    top: 0;
    left: calc(14rem + 2rem);
    right: 0;
    border-top: 1px solid var(--line);
  }

  h3 {
    margin: 0;
    font: 650 1.125rem/1.3 var(--display);
    letter-spacing: -0.015em;
  }

  .usual {
    color: var(--muted);
    text-decoration: line-through;
    text-decoration-color: color-mix(in oklab, var(--muted) 45%, transparent);
  }

  .none {
    text-decoration: none;
  }

  .eile {
    display: flex;
    gap: 0.6rem;
    color: var(--text);
    overflow-wrap: anywhere;
  }

  .eile :global(.icon) {
    margin-top: 0.15em;
    color: var(--ok);
  }

  @media (max-width: 52rem) {
    .head {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .group {
      padding-bottom: 0.5rem;
    }

    .row {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.2rem;
      padding: 0.75rem 0;
    }

    .row:first-child {
      padding-top: 1.5rem;
    }

    .row:first-child .topic {
      padding-bottom: 0.25rem;
    }

    .row + .row::before {
      left: 0;
    }
  }
</style>

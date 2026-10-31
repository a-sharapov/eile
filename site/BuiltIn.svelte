<!-- @component
Что обычно ставят отдельно, а в Eile уже есть: таблица «обычно → в Eile» по шести темам. Строки темы —
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
  [t.inSearch, t.inSearchRows],
  [t.inCalm, t.inCalmRows],
  [t.inServer, t.inServerRows],
  [t.inLang, t.inLangRows],
] as const;
</script>

<div class="inside" role="table" aria-label={t.inAria}>
  <div class="head" role="row">
    <span role="columnheader"></span>
    <span role="columnheader">{t.inUsual}</span>
    <span role="columnheader">{t.inEile}</span>
  </div>
  {#each groups as { 0: title, 1: rows }}
    <div class="group" role="rowgroup">
      <h3 class="topic">{title}</h3>
      {#each _rows(rows) as { 0: usual, 1: eile }}
        <div class="row" role="row">
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
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr);
    gap: 2rem;
  }

  .head {
    grid-template-columns: 14rem minmax(0, 1fr) minmax(0, 1.6fr);
    padding: 0.85rem 0;
    border-bottom: 1px solid var(--line);
    color: var(--muted);
    font-size: 0.8125rem;
    font-weight: 600;
  }

  .group {
    display: grid;
    grid-template-columns: 14rem minmax(0, 1fr);
    column-gap: 2rem;
    border-bottom: 1px solid var(--line);
  }

  .topic {
    grid-row: span 8;
    margin: 0;
    padding: 1.1rem 0;
    font: 650 1.125rem/1.3 var(--display);
    letter-spacing: -0.015em;
  }

  .row {
    grid-column: 2;
    padding: 1.05rem 0;
    font-size: 0.9375rem;
    line-height: 1.5;
  }

  .row + .row {
    border-top: 1px solid var(--line);
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
  }

  .eile :global(.icon) {
    margin-top: 0.15em;
    color: var(--ok);
  }

  @media (max-width: 52rem) {
    .head {
      display: none;
    }

    .group {
      grid-template-columns: minmax(0, 1fr);
      padding-bottom: 0.5rem;
    }

    .topic {
      grid-row: auto;
      padding: 1.5rem 0 0.25rem;
    }

    .row {
      grid-column: 1;
      grid-template-columns: minmax(0, 1fr);
      gap: 0.2rem;
      padding: 0.75rem 0;
    }
  }
</style>

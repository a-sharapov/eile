<script lang="ts">
import { t } from '#lib/i18n.ts';
import type {
  CheckView,
  QualityCell,
  QualityRow,
  SetupView,
} from '#lib/types.ts';
import {
  cellState,
  checkName,
  dayText,
  rowDayText,
  ruleOf,
  STATE_MARKS,
  scopeName,
  type Tile,
  valueText,
  zoneText,
} from './quality.ts';
import StateSymbol from './StateSymbol.svelte';

// Плитки «Сводки»: по проверке — состояние последних наступивших суток значком и словом, главное число словами,
// последний успех, снятие с заметкой. У проверок отправителя — строка на отправителя. Строка — кнопка: открывает
// окно этих суток.
let {
  tiles,
  checks,
  setup,
  timeZone,
  onopen,
}: {
  tiles: readonly Tile[];
  checks: readonly CheckView[];
  setup: SetupView;
  timeZone: string;
  onopen: (row: QualityRow, cell: QualityCell) => void;
} = $props();
</script>

<ul class="tiles">
  {#each tiles as tile (tile.check)}
    <li class="tile {tile.state ?? 'none'}">
      <h3>{checkName(tile.check, checks)}</h3>
      <small class="zone">{zoneText(tile.zone, timeZone)}</small>
      <ul class="lines">
        {#each tile.lines as line (`${line.row.scope ?? ''}`)}
          <li>
            {#if line.cell}
              {@const state = cellState(line.cell)}
              <button type="button" class="line" onclick={() => onopen(line.row, line.cell!)}>
                <span class="state {state}"><span class="symbol"><StateSymbol {state} /></span>{t(STATE_MARKS[state].label)}</span>
                {#if line.row.scope !== null}<span class="who">{scopeName(setup, line.row.scope)}</span>{/if}
                <span class="value">{valueText(line.row.check, line.cell, { rule: ruleOf(line.row.check, checks) })}</span>
                <span class="meta">{[rowDayText(line.row.zone, line.cell.day), ...(line.row.lastOk && line.row.lastOk !== line.cell.day && line.cell.state !== 'ok' ? [t('quality.lastOk', { day: rowDayText(line.row.zone, line.row.lastOk) })] : [])].join(' · ')}</span>
                {#if line.cell.resolved}<span class="resolved">{t('quality.resolvedNote', { note: line.cell.resolved.note })}</span>{/if}
              </button>
            {:else}
              <p class="line empty">
                {#if line.row.scope !== null}<span class="who">{scopeName(setup, line.row.scope)}</span>{/if}
                <span class="meta">{line.row.day ? t('quality.noRowFor', { day: dayText(line.row.day) }) : t('quality.noRowYet')}</span>
              </p>
            {/if}
          </li>
        {/each}
      </ul>
    </li>
  {/each}
</ul>

<style>
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr));
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tile {
    display: grid;
    gap: 0.35rem;
    align-content: start;
    min-width: 0;
    padding: 0.85rem 0.9rem 0.6rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
  }

  /* Сбой и замечание — рамка тона: смысл несут значок и слово в строке. */
  .tile.failure {
    border-color: color-mix(in oklab, var(--danger) 45%, var(--line));
  }

  .tile.warning {
    border-color: color-mix(in oklab, var(--warn) 50%, var(--line));
  }

  h3 {
    margin: 0;
    font-size: 0.9375rem;
    overflow-wrap: break-word;
    hyphens: auto;
  }

  .zone {
    margin-top: -0.25rem;
    color: var(--muted);
    font-size: 0.75rem;
  }

  .lines {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .line {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.1rem;
    justify-content: stretch;
    justify-items: start;
    align-content: start;
    width: 100%;
    min-height: 0;
    margin: 0;
    padding: 0.45rem 0.4rem;
    border: 0;
    border-top: 0.0625rem solid var(--line);
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    color: var(--text);
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 400;
    text-align: left;
    white-space: normal;
  }

  li:first-child > .line {
    border-top: 0;
  }

  button.line:hover {
    background: var(--hover);
  }

  .state {
    display: inline-flex;
    gap: 0.3rem;
    align-items: center;
    font-weight: 650;
  }

  .symbol {
    display: inline-grid;
    place-items: center;
    width: 1.1rem;
    height: 1.1rem;
    border-radius: var(--radius-s);
    background: var(--sunken);
    font-size: 0.75rem;
  }

  .state.ok {
    color: color-mix(in oklch, var(--ok) 65%, var(--text));
  }

  .state.ok .symbol {
    background: var(--ok-soft);
  }

  .state.warning {
    color: var(--warn-text);
  }

  .state.warning .symbol {
    background: var(--warn-soft);
  }

  .state.failure {
    color: color-mix(in oklab, var(--danger) 75%, var(--text));
  }

  .state.failure .symbol {
    background: var(--danger-soft);
  }

  .state.no_data,
  .state.resolved {
    color: var(--muted);
  }

  .state.resolved .symbol {
    border: 0.0625rem dashed color-mix(in oklab, var(--muted) 75%, transparent);
    background: var(--surface);
    color: color-mix(in oklab, var(--text) 55%, var(--muted));
  }

  .who {
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .value {
    overflow-wrap: break-word;
  }

  .meta,
  .resolved {
    color: var(--muted);
    font-size: 0.75rem;
    overflow-wrap: anywhere;
  }

  .empty {
    color: var(--muted);
  }
</style>

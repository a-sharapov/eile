<script lang="ts">
import { tick } from 'svelte';
import { currentLanguage, t } from '#lib/i18n.ts';
import type {
  CheckView,
  QualityCell,
  QualityRow,
  SetupView,
} from '#lib/types.ts';
import Mark from '../Mark.svelte';
import ScrollTable from '../ScrollTable.svelte';
import {
  cellLabel,
  cellState,
  checkName,
  dayText,
  gridCells,
  scopeName,
  zoneText,
} from './quality.ts';
import StateSymbol from './StateSymbol.svelte';

// Сетка «проверка × сутки» (ADR 0072, «Экраны этапа 4»): настоящая таблица — строки проверок с заголовком строки,
// столбцы суток с заголовком, новые справа. Ячейка — кнопка со значком и подписью для читалки; по сетке ходят
// стрелками (одна ячейка в порядке Tab, как у сетки WAI-ARIA), Home и End — к краям строки.
let {
  rows,
  days,
  checks,
  setup,
  timeZone,
  picked,
  onopen,
}: {
  rows: readonly QualityRow[];
  days: readonly string[];
  checks: readonly CheckView[];
  setup: SetupView;
  timeZone: string;
  /** Выделенные сутки: из ссылки уведомления или открытого окна. */
  picked: string | null;
  onopen: (row: QualityRow, cell: QualityCell) => void;
} = $props();

let table = $state<HTMLTableElement>();
// Ячейка в порядке Tab: строка и сутки; по умолчанию — последние сутки первой строки.
let active = $state<string | null>(null);

const keyOf = (row: QualityRow): string =>
  `${row.check}/${row.scope ?? ''}/${Number(row.test)}`;

const lines = $derived(
  rows.map((row) => ({ row, key: keyOf(row), cells: gridCells(row, days) }))
);

const fallback = $derived(
  ((first) =>
    first
      ? `${first.key}@${first.cells.findLast((_) => _.cell !== null)?.day ?? ''}`
      : null)(lines.find((_) => _.cells.some((cell) => cell.cell !== null)))
);
const current = $derived(active ?? fallback);

const _buttons = (row: Element | null): HTMLButtonElement[] =>
  row ? [...row.querySelectorAll<HTMLButtonElement>('button[data-cell]')] : [];

const _centre = (element: Element): number =>
  ((box) => box.left + box.width / 2)(element.getBoundingClientRect());

// Соседняя строка: кнопка, ближайшая по горизонтали; месячная ячейка тянется на несколько суток.
const _nearest = (
  buttons: readonly HTMLButtonElement[],
  x: number
): HTMLButtonElement | undefined =>
  buttons.toSorted(
    (a, b) => Math.abs(_centre(a) - x) - Math.abs(_centre(b) - x)
  )[0];

// Строка выше или ниже с хотя бы одной кнопкой: пустые строки (проверка без строк в сетке) пропускаются.
const _verticalRow = (from: HTMLElement, step: -1 | 1): Element | null =>
  ((all, index) =>
    (step < 0 ? all.slice(0, index).toReversed() : all.slice(index + 1)).find(
      (_) => _buttons(_).length > 0
    ) ?? null)(
    [...(table?.tBodies[0]?.rows ?? [])],
    [...(table?.tBodies[0]?.rows ?? [])].indexOf(
      from.closest('tr') as HTMLTableRowElement
    )
  );

const _MOVES: Readonly<
  Record<string, (button: HTMLButtonElement) => HTMLButtonElement | undefined>
> = {
  ArrowLeft: (_) =>
    ((all) => all[all.indexOf(_) - 1])(_buttons(_.closest('tr'))),
  ArrowRight: (_) =>
    ((all) => all[all.indexOf(_) + 1])(_buttons(_.closest('tr'))),
  Home: (_) => _buttons(_.closest('tr'))[0],
  End: (_) => _buttons(_.closest('tr')).at(-1),
  ArrowUp: (_) => _nearest(_buttons(_verticalRow(_, -1)), _centre(_)),
  ArrowDown: (_) => _nearest(_buttons(_verticalRow(_, 1)), _centre(_)),
};

const focusCell = (next: HTMLButtonElement) => (
  (active = next.dataset.cell ?? null),
  tick().then(
    () => (
      next.focus(), next.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    )
  )
);

const onKey = (event: KeyboardEvent) =>
  ((button, move) =>
    void (
      button &&
      move &&
      (event.preventDefault(),
      ((next) => void (next && focusCell(next)))(move(button)))
    ))(
    (event.target as HTMLElement).closest<HTMLButtonElement>(
      'button[data-cell]'
    ),
    _MOVES[event.key]
  );

// Новые сутки — справа: узкая сетка сразу показывает последние дни, старые — прокруткой влево.
$effect(
  () =>
    void (
      days.length > 0 &&
      ((scroller) => scroller && (scroller.scrollLeft = scroller.scrollWidth))(
        table?.closest<HTMLElement>('.scroll')
      )
    )
);

const monthLabel = (day: string): string =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(currentLanguage(), {
    timeZone: 'UTC',
    month: 'short',
  });
</script>

<ScrollTable label={t('quality.gridLabel')}>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <table class="checks-grid" bind:this={table} onkeydown={onKey}>
    <caption class="sr-only">{t('quality.gridCaption', { from: dayText(days[0] ?? '', true), to: dayText(days.at(-1) ?? '', true) })}</caption>
    <thead>
      <tr>
        <th scope="col" class="check">{t('quality.gridCheck')}</th>
        {#each days as day, index (day)}
          <th scope="col" class="day" class:picked={day === picked} class:first={index === 0 || day.endsWith('-01')}>
            {#if index === 0 || day.endsWith('-01')}<span class="month" aria-hidden="true">{monthLabel(day)}</span>{/if}
            <span aria-hidden="true">{Number(day.slice(8))}</span>
            <span class="sr-only">{dayText(day)}</span>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each lines as line (line.key)}
        <tr>
          <th scope="row" class="check">
            <span class="name">{checkName(line.row.check, checks)}</span>
            <small><span class="scope">{scopeName(setup, line.row.scope)}</span> · {zoneText(line.row.zone, timeZone)}{#if line.row.test}{' '}<Mark>{t('analytics.testMark')}</Mark>{/if}</small>
          </th>
          {#each line.cells as cell (cell.day)}
            <td colspan={cell.span} class:picked={cell.span === 1 && cell.day === picked} class="slot">
              {#if cell.cell}
                {@const state = cellState(cell.cell)}
                {@const key = `${line.key}@${cell.day}`}
                <button type="button" data-cell={key} class="cell {state}" class:notified={cell.cell.notified} tabindex={current === key ? 0 : -1} aria-label={`${cellLabel(line.row, cell.cell, { checks, setup })}${cell.cell.notified ? `, ${t('quality.notified')}` : ''}`} title={cellLabel(line.row, cell.cell, { checks, setup })} onclick={() => ((active = key), onopen(line.row, cell.cell!))} onfocus={() => (active = key)}><StateSymbol {state} /></button>
              {:else}
                <span class="sr-only">{t('quality.noRow')}</span>
              {/if}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</ScrollTable>

<style>
  .checks-grid {
    width: auto;
    min-width: 100%;
    border-collapse: separate;
    border-spacing: 0;
  }

  th,
  td {
    padding: 0.2rem 0.1rem;
    border-bottom: 0.0625rem solid var(--line);
    text-align: center;
    vertical-align: middle;
  }

  /* Колонка проверки закреплена: сетка прокручивается вбок под ней. */
  .check {
    position: sticky;
    left: 0;
    z-index: 1;
    min-width: 11rem;
    max-width: 15rem;
    padding: 0.4rem 0.75rem;
    background: var(--surface);
    box-shadow: var(--pinned-shadow, none);
    text-align: left;
    overflow-wrap: break-word;
  }

  thead .check {
    background: var(--sunken);
  }

  tbody .check {
    font-weight: 400;
  }

  .check > span,
  .check > small {
    display: block;
  }

  .name {
    font-size: 0.8125rem;
    font-weight: 600;
    hyphens: auto;
  }

  .scope {
    color: var(--text);
  }

  .check small {
    color: var(--muted);
    font-size: 0.6875rem;
  }

  thead th.day {
    min-width: 1.75rem;
    padding: 0.35rem 0.1rem;
    color: var(--muted);
    font-size: 0.6875rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .month {
    display: block;
    color: var(--text);
    font-weight: 600;
  }

  .picked {
    background: var(--accent-soft);
  }

  thead th.picked {
    color: var(--text);
    font-weight: 700;
  }

  .cell {
    display: inline-grid;
    place-items: center;
    position: relative;
    width: 1.5rem;
    min-width: 1.5rem;
    height: 1.75rem;
    min-height: 0;
    padding: 0;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-s);
    background: var(--sunken);
    box-shadow: none;
    color: var(--muted);
    font-size: 0.8125rem;
    font-weight: 700;
    line-height: 1;
  }

  /* Фокус со стрелок не уходит под закреплённую колонку. */
  .cell {
    scroll-margin-inline: var(--pinned, 11.5rem) 0.5rem;
  }

  .cell:focus-visible {
    outline: 0.125rem solid var(--accent);
    outline-offset: 0.0625rem;
  }

  .cell.ok {
    border-color: color-mix(in oklch, var(--ok) 35%, var(--line));
    background: var(--ok-soft);
    color: color-mix(in oklch, var(--ok) 65%, var(--text));
  }

  .cell.warning {
    border-color: color-mix(in oklab, var(--warn) 45%, var(--line));
    background: var(--warn-soft);
    color: var(--warn-text);
  }

  .cell.failure {
    border-color: color-mix(in oklab, var(--danger) 45%, var(--line));
    background: var(--danger-soft);
    color: color-mix(in oklab, var(--danger) 75%, var(--text));
  }

  /* Снято вручную: галочка в круге в пустой ячейке с пунктирной рамкой — отличается от остальных формой, не цветом. */
  .cell.resolved {
    border-style: dashed;
    border-color: color-mix(in oklab, var(--muted) 75%, transparent);
    background: var(--surface);
    color: color-mix(in oklab, var(--text) 55%, var(--muted));
  }

  /* Ушло уведомление — точка в углу; словами — в подписи ячейки. */
  .cell.notified::after {
    content: '';
    position: absolute;
    top: 0.1rem;
    right: 0.1rem;
    width: 0.3rem;
    height: 0.3rem;
    border-radius: 50%;
    background: currentColor;
  }

  td[colspan] .cell {
    width: 100%;
  }

  /* Узко: колонка проверки уже, ячейки меньше — около девяти суток на экран; цель касания — не меньше 22 px с
     зазором, круг 24 px вокруг неё соседей не задевает. */
  @media (width < 48rem) {
    .checks-grid {
      --pinned: 7.5rem;
    }

    .check {
      min-width: 7.5rem;
      max-width: 7.5rem;
      padding: 0.35rem 0.5rem;
    }

    .name {
      font-size: 0.75rem;
    }

    .cell {
      width: 1.375rem;
      min-width: 1.375rem;
      height: 1.625rem;
    }

    thead th.day {
      min-width: 1.5rem;
    }
  }
</style>

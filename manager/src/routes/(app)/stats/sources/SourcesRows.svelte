<script lang="ts">
import {
  canFilter,
  filterKeyOf,
  nextGroupOf,
  type QueryParams,
  REPORT_LIMITS,
  reportSearch,
} from '#lib/analytics-reports.ts';
import { api } from '#lib/api.ts';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { describe } from '#lib/notices.svelte.ts';
import type {
  ReturnRow,
  SetupView,
  SourcesColumn,
  SourcesReport,
  SourcesRow,
} from '#lib/types.ts';
import Mark from '../Mark.svelte';
import { groupName, rowValueName } from '../names.ts';
import type { QueryPatch } from '../query.ts';
import { closeLevel, type Levels, pathKey } from './export.ts';
import SourcesCells from './SourcesCells.svelte';
import Self from './SourcesRows.svelte';

// Строки «Источников» одного уровня. Клик по значению ставит фильтр (у вложенной строки — весь её путь),
// стрелка раскрывает строку следующим уровнем: следующая часть схемы, у «не указано» — ответы опроса. Строки
// уровня грузятся по требованию тем же отчётом с фильтром по строке (без сравнения: оно — только у итога) и
// записываются в `levels` для выгрузки CSV.
let {
  rows,
  group,
  columns,
  setup,
  params,
  path = {},
  depth = 0,
  filters,
  levels,
  base = null,
  ratesHref = '',
  spendHref = '',
  customersHref = null,
  onfilter,
}: {
  rows: readonly (SourcesRow | ReturnRow)[];
  group: string;
  columns: readonly SourcesColumn[];
  setup: SetupView;
  /** Параметры отчёта из адреса: строки уровня запрашиваются с ними. */
  params: QueryParams;
  /** Фильтры строк выше: путь до этого уровня. */
  path?: QueryPatch;
  depth?: number;
  /** Фильтров в адресе: раскрытие не должно выйти за предел 10. */
  filters: number;
  /** Открытые уровни для выгрузки CSV. */
  levels: Levels;
  base?: string | null;
  ratesHref?: string;
  spendHref?: string;
  /** Новые клиенты строки — ссылкой на «Людей» с `by=payment` и путём фильтров строки. */
  customersHref?: ((path: QueryPatch) => string) | null;
  onfilter: (patch: QueryPatch) => void;
} = $props();

type Opened = {
  readonly group: string;
  readonly rows: readonly (SourcesRow | ReturnRow)[] | null;
  readonly error: string | null;
};

let opened = $state<Record<string, Opened>>({});

const keyOf = $derived(filterKeyOf(group));
const depthFilters = $derived(Object.keys(path).length);

const nextOf = (value: string): string | null =>
  filters + depthFilters + 1 <= REPORT_LIMITS.filters && canFilter(group, value)
    ? nextGroupOf(setup, group, value)
    : null;

const load = (value: string, next: string) =>
  api
    .get<SourcesReport>(
      `/analytics/sources${reportSearch(params, {
        ...path,
        [keyOf!]: value,
        group: next,
        limit: null,
        compare: null,
      })}`
    )
    .then(
      (report) =>
        void (
          opened[value] &&
          ((opened = {
            ...opened,
            [value]: { group: next, rows: report.rows, error: null },
          }),
          levels.set(pathKey({ ...path, [keyOf!]: value }), {
            path: { ...path, [keyOf!]: value },
            group: next,
            rows: report.rows,
          }))
        ),
      (error) =>
        void (
          opened[value] &&
          (opened = {
            ...opened,
            [value]: { group: next, rows: null, error: describe(error) },
          })
        )
    );

const toggle = (value: string, next: string) =>
  opened[value]
    ? void ((opened = Object.fromEntries(
        Object.entries(opened).filter(({ 0: key }) => key !== value)
      )),
      closeLevel(levels, pathKey({ ...path, [keyOf!]: value })))
    : ((opened = {
        ...opened,
        [value]: { group: next, rows: null, error: null },
      }),
      void load(value, next));

const lowKey = (row: SourcesRow | ReturnRow) =>
  row.lowData.people && row.lowData.customers
    ? 'report.lowData'
    : row.lowData.people
      ? 'report.lowPeople'
      : row.lowData.customers
        ? 'report.lowCustomers'
        : null;

const span = $derived(columns.length + 1);
</script>

{#each rows as row (row.value)}
  {@const name = rowValueName(setup, group, row.value, row.name)}
  {@const next = nextOf(row.value)}
  {@const low = lowKey(row)}
  {@const open = opened[row.value]}
  <tr class:low={row.lowData.people && row.lowData.customers} class:nested={depth > 0}>
    <th scope="row" class="value" style:--depth={depth}>
      <div class="head">
        {#if next !== null}
          <button type="button" class="ghost icon toggle" class:open={open !== undefined} aria-expanded={open !== undefined} aria-label={t(open ? 'sources.collapse' : 'sources.expand', { value: name, group: groupName(setup, next) })} title={t(open ? 'sources.collapse' : 'sources.expand', { value: name, group: groupName(setup, next) })} onclick={() => toggle(row.value, next)}>{@html icons.chevron}</button>
        {:else}
          <span class="spacer" aria-hidden="true"></span>
        {/if}
        <div class="name">
          {#if keyOf !== null && canFilter(group, row.value)}
            <button type="button" class="link value-button" title={t('sources.filterBy', { value: name })} onclick={() => onfilter({ ...path, [keyOf]: row.value })}>{name}</button>
          {:else}
            <span>{name}</span>
          {/if}
          {#if row.name !== null && row.name !== row.value}<code class="muted">{row.value}</code>{/if}
          {#if low}<span class="low-mark"><Mark>{t(low)}</Mark></span>{/if}
        </div>
      </div>
    </th>
    <SourcesCells {row} {columns} {base} {ratesHref} {spendHref} customersHref={customersHref && keyOf !== null && canFilter(group, row.value) ? customersHref({ ...path, [keyOf]: row.value }) : ''} />
  </tr>
  {#if open}
    {#if open.rows === null && open.error === null}
      <tr class="nested"><td colspan={span} class="pending" style:--depth={depth + 1}>{t('sources.loadingLevel')}</td></tr>
    {:else if open.error !== null}
      <tr class="nested"><td colspan={span} class="pending error" style:--depth={depth + 1}>{open.error} <button type="button" class="link" onclick={() => load(row.value, open.group)}>{t('common.retry')}</button></td></tr>
    {:else if open.rows !== null && open.rows.length === 0}
      <tr class="nested"><td colspan={span} class="pending" style:--depth={depth + 1}>{t('sources.levelEmpty')}</td></tr>
    {:else if open.rows !== null}
      <Self rows={open.rows} group={open.group} {columns} {setup} {params} path={{ ...path, [keyOf!]: row.value }} depth={depth + 1} {filters} {levels} {base} {ratesHref} {spendHref} {customersHref} {onfilter} />
    {/if}
  {/if}
{/each}

<style>
  th,
  td {
    padding: 0.55rem 0.6rem;
    font-size: 0.875rem;
    vertical-align: top;
  }

  /* Первая колонка закреплена: таблица прокручивается вбок, значение строки остаётся на месте. */
  .value {
    position: sticky;
    left: 0;
    z-index: 1;
    min-width: 12rem;
    max-width: 18rem;
    padding-left: calc(0.5rem + var(--depth, 0) * 1.25rem);
    background: var(--surface);
    color: var(--text);
    font-weight: 400;
    text-align: left;
  }

  /* Последняя строка таблицы — без нижней линии и у закреплённой ячейки, как у остальных. */
  tr:last-child > th {
    border-bottom: 0;
  }

  tr:hover .value {
    background: color-mix(in oklch, var(--surface), var(--sunken) 60%);
  }

  .nested .value {
    background: color-mix(in oklch, var(--surface), var(--sunken) 55%);
  }

  .nested :global(td) {
    background: color-mix(in oklch, var(--surface), var(--sunken) 55%);
  }

  .head {
    display: flex;
    gap: 0.25rem;
    align-items: flex-start;
  }

  .toggle,
  .spacer {
    flex: none;
    width: 1.5rem;
    min-width: 1.5rem;
    height: 1.5rem;
    min-height: 1.5rem;
    padding: 0;
  }

  .toggle :global(svg) {
    width: 1rem;
    height: 1rem;
    transition: transform 120ms var(--ease);
  }

  .toggle.open :global(svg) {
    transform: rotate(90deg);
  }

  .name {
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem 0.45rem;
    align-items: baseline;
    min-width: 0;
    padding-top: 0.1rem;
  }

  .name > :first-child {
    overflow-wrap: break-word;
  }

  /* Название — кнопкой фильтра, но переносится, как текст: узкая закреплённая колонка не раздувается. */
  .value-button {
    white-space: normal;
    text-align: left;
  }

  .name code {
    font-size: 0.75rem;
  }

  /* «Мало данных» — своей строкой под значением: первая колонка не раздувается. */
  .low-mark {
    flex-basis: 100%;
  }

  /* Мало данных у людей и у клиентов: строка приглушена целиком, подпись — словами рядом со значением. */
  .low .name > :first-child {
    opacity: 0.7;
  }

  /* Узкий экран: закреплённая колонка уже — числам остаётся место, остальное прокручивается вбок. */
  @media (max-width: 34rem) {
    .value {
      min-width: 9.5rem;
      max-width: 11rem;
    }
  }

  .pending {
    padding-left: calc(2.25rem + var(--depth, 0) * 1.25rem);
    color: var(--muted);
    font-size: 0.8125rem;
  }

  .pending.error {
    color: var(--danger);
  }
</style>
